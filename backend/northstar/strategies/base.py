"""Strategy protocol and the shared feasibility helper used by every strategy AND the simulator."""
from __future__ import annotations

import math
from dataclasses import dataclass
from itertools import product
from typing import Protocol

from northstar.config import STEP_MIN, TURNAROUND_MIN
from northstar.models import Aircraft, MissionType, Plan
from northstar.network.graph import path_risk, shortest_path
from northstar.sim.state import SimulationState, StrategyView


@dataclass
class Candidate:
    aircraft_id: str
    mission_id: str
    origin: str
    dest: str
    repos_path: list[str]
    mission_path: list[str]
    repos_km: float
    mission_km: float
    repos_min: int
    mission_min: int
    est_depart: int
    est_response: int
    est_complete: int
    risk: float

    @property
    def total_km(self) -> float:
        return self.repos_km + self.mission_km


@dataclass
class Infeasible:
    aircraft_id: str
    mission_id: str
    code: str
    text: str


class Strategy(Protocol):
    name: str

    def plan(self, view: StrategyView) -> Plan: ...


def hop_minutes(aircraft: Aircraft, km: float) -> int:
    return int(math.ceil(aircraft.flight_min(km) / STEP_MIN)) * STEP_MIN


def path_minutes(aircraft: Aircraft, ag, path: list[str]) -> tuple[int, float]:
    """Minutes and km to fly a multi-hop path, including turnarounds at intermediate stops."""
    total_min, total_km = 0, 0.0
    hops = list(zip(path, path[1:]))
    for i, (a, b) in enumerate(hops):
        km = ag[a][b]["distance_km"]
        total_km += km
        total_min += hop_minutes(aircraft, km)
        if i < len(hops) - 1:
            total_min += TURNAROUND_MIN
    return total_min, total_km


def transition(state: SimulationState, aircraft_id: str, from_airport: str, to_airport: str,
               risk_lambda: float = 0.0) -> tuple[int, float, list[str]] | None:
    """Repositioning minutes/km/path for aircraft between two airports on the current open graph."""
    ac = state.network.aircraft[aircraft_id]
    ag = state.aircraft_graph(aircraft_id)
    if from_airport == to_airport:
        return 0, 0.0, [from_airport]
    sp = shortest_path(ag, from_airport, to_airport, risk_lambda)
    if sp is None:
        return None
    path, _ = sp
    mins, km = path_minutes(ac, ag, path)
    return mins, km, path


def build_candidate(state: SimulationState, t: int, aircraft_id: str, mission_id: str,
                    risk_lambda: float = 0.0, from_airport: str | None = None,
                    avail_at: int | None = None) -> Candidate | Infeasible:
    net = state.network
    ac = net.aircraft[aircraft_id]
    ast = state.aircraft[aircraft_id]
    ms = state.missions[mission_id]
    m = ms.mission

    if ast.is_failed(t) or ast.pending_failure:
        return Infeasible(aircraft_id, mission_id, "AIRCRAFT_FAILED", f"{aircraft_id} is unavailable (failure)")
    location = from_airport or ast.location()
    avail = avail_at if avail_at is not None else max(ast.free_at, t)
    if from_airport is None and location in state.closed_airports:
        return Infeasible(aircraft_id, mission_id, "AIRCRAFT_STRANDED", f"{aircraft_id} is on the ground at closed airport {location}")
    if m.type == MissionType.passenger or m.payload_people:
        if m.payload_people > ac.capacity_people:
            return Infeasible(aircraft_id, mission_id, "CAPACITY_PEOPLE",
                              f"{ac.type} seats {ac.capacity_people}, mission needs {m.payload_people}")
    if m.payload_kg > ac.cargo_capacity_kg:
        return Infeasible(aircraft_id, mission_id, "CAPACITY_KG",
                          f"{ac.type} carries {ac.cargo_capacity_kg} kg, mission needs {m.payload_kg} kg")

    ag = state.aircraft_graph(aircraft_id)
    closed = state.closed_airports
    best: Candidate | None = None
    fail_code, fail_text = None, None

    def note(code, text):
        nonlocal fail_code, fail_text
        if fail_code is None:
            fail_code, fail_text = code, text

    if location not in ag:
        # aircraft sits at an airport it cannot legally depart from in the open graph (should not happen unless closed)
        note("NO_PATH_TO_ORIGIN", f"{aircraft_id} cannot depart from {location}")
    for o, d in product(m.origin_options, m.dest_options):
        if o == d:
            continue
        if o in closed:
            note("ORIGIN_CLOSED", f"origin {o} is closed"); continue
        if d in closed:
            note("DEST_CLOSED", f"destination {d} is closed"); continue
        if o not in ag:
            note("RUNWAY_ORIGIN", f"{ac.type} cannot use runway at {o}"); continue
        if d not in ag:
            note("RUNWAY_DEST", f"{ac.type} cannot use runway at {d}"); continue
        sp = shortest_path(ag, o, d, risk_lambda)
        if sp is None:
            note("NO_PATH_MISSION", f"no open route within range from {o} to {d} for {ac.type}"); continue
        mpath, _ = sp
        if location == o:
            rpath, repos_min, repos_km = [o], 0, 0.0
        else:
            rp = shortest_path(ag, location, o, risk_lambda) if location in ag else None
            if rp is None:
                note("NO_PATH_TO_ORIGIN", f"no open route within range from {location} to {o} for {ac.type}"); continue
            rpath, _ = rp
            repos_min, repos_km = path_minutes(ac, ag, rpath)
        mission_min, mission_km = path_minutes(ac, ag, mpath)
        if repos_min:
            arrive_origin = avail + repos_min
            depart_origin = max(arrive_origin + TURNAROUND_MIN, m.release_min)
            response = arrive_origin if m.release_min <= arrive_origin else m.release_min
            est_depart = avail
        else:
            depart_origin = max(avail, m.release_min)
            response = depart_origin
            est_depart = depart_origin
        complete = depart_origin + mission_min
        cand = Candidate(aircraft_id, mission_id, o, d, rpath, mpath, repos_km, mission_km, repos_min, mission_min,
                         est_depart, response, complete, path_risk(ag, mpath))
        key = (cand.est_complete, cand.est_response, cand.total_km, o, d)
        if best is None or key < (best.est_complete, best.est_response, best.total_km, best.origin, best.dest):
            best = cand
    if best is not None:
        return best
    return Infeasible(aircraft_id, mission_id, fail_code or "NO_OPTION", fail_text or "no feasible origin/destination option")


def restate_queues(view: StrategyView) -> list:
    """Assignments for missions already queued but not departed (so a plan can keep them)."""
    from northstar.models import Assignment

    out = []
    for a in sorted(view.state.aircraft.values(), key=lambda x: x.id):
        for mid in a.queue:
            ms = view.state.missions[mid]
            if ms.departed or ms.planned is None:
                continue
            out.append(Assignment(**ms.planned))
    return out


def assignment_from_candidate(c: Candidate, note: str = ""):
    from northstar.models import Assignment

    return Assignment(mission_id=c.mission_id, aircraft_id=c.aircraft_id, origin=c.origin, dest=c.dest,
                      path=list(c.mission_path), repos_path=list(c.repos_path), est_depart_min=c.est_depart,
                      est_response_min=c.est_response, est_complete_min=c.est_complete, est_km=round(c.total_km, 1),
                      est_risk=round(c.risk, 3), note=note)
