"""Deterministic 30-minute simulation loop with event-driven replanning."""
from __future__ import annotations

from northstar.config import STEP_MIN, TURNAROUND_MIN
from northstar.geo import interpolate
from northstar.models import (
    AircraftSnapshot,
    Assignment,
    Leg,
    MissionOutcome,
    MissionType,
    Network,
    Plan,
    Scenario,
    Snapshot,
    Trace,
)
from northstar.sim.disruptions import apply_end, apply_start, generate_missions, ground_failure, recompute_routes
from northstar.sim.state import SimulationState, StrategyView
from northstar.strategies.base import Infeasible, build_candidate, hop_minutes, queue_position, transition

REPLAN_EVENTS = {
    "MISSION_KNOWN", "MISSION_RELEASED", "DISRUPTION_START", "DISRUPTION_END", "AIRCRAFT_FAILED", "AIRCRAFT_FREE",
    "MISSIONS_RETURNED", "MISSION_RETURNED", "ASSIGNMENT_INFEASIBLE", "AIRCRAFT_RECOVERED",
}


def initial_state(network: Network, scenario: Scenario) -> SimulationState:
    missions = network.scheduled_missions() + generate_missions(network, scenario)
    st = SimulationState(network, scenario, missions)
    recompute_routes(st)
    return st


def run(network: Network, scenario: Scenario, strategy) -> Trace:
    st = initial_state(network, scenario)
    horizon, step = scenario.horizon_min, scenario.step_min
    prev_failed: set[str] = set()
    for t in range(0, horizon + 1, step):
        st.t = t
        n_before = len(st.events)
        # 1. disruption transitions
        for d in sorted(scenario.disruptions, key=lambda x: x.id):
            if d.start_min == t:
                apply_start(st, d)
                st.event("DISRUPTION_START", disruption_id=d.id, kind=d.type.value)
            if d.end_min == t and d.start_min < t:
                apply_end(st, d)
                st.event("DISRUPTION_END", disruption_id=d.id, kind=d.type.value)
        failed_now = st.failed_aircraft(t)
        for a in sorted(failed_now - prev_failed):
            st.event("AIRCRAFT_FAILED", aircraft_id=a)
        for a in sorted(prev_failed - failed_now):
            st.event("AIRCRAFT_RECOVERED", aircraft_id=a)
        prev_failed = failed_now
        # 2. missions becoming known
        for ms in st.missions.values():
            if ms.mission.known_min == t and ms.mission.source != "schedule":
                st.event("MISSION_KNOWN", mission_id=ms.mission.id, kind=ms.mission.type.value)
            if ms.mission.release_min == t and ms.status in ("pending", "assigned"):
                st.event("MISSION_RELEASED", mission_id=ms.mission.id, kind=ms.mission.type.value)
        # 3. landings
        _land_arrivals(st, t)
        # 4. replanning
        triggers = [e["type"] for e in st.events[n_before:] if e["type"] in REPLAN_EVENTS]
        if t == 0 or triggers:
            view = StrategyView(st, t)
            plan = strategy.plan(view)
            _apply_plan(st, plan, t, triggers)
        # 5. departures
        _depart_ready(st, t)
        # 6. connectivity bookkeeping + snapshot
        _update_disconnection(st, t)
        st.snapshots.append(_snapshot(st, t))
    return _finalize(st, strategy.name)


# ----------------------------------------------------------------------------
def _apply_plan(st: SimulationState, plan: Plan, t: int, triggers: list[str]) -> None:
    st.replans.append({"t": t, "triggers": sorted(set(triggers)), "status": plan.status,
                       "assignments": len(plan.assignments), "unserved": len(plan.unserved),
                       "solver": plan.solver})
    if plan.solver:
        st.solver_calls.append({"t": t, **plan.solver})
    if plan.status == "UNCHANGED":
        return
    by_aircraft: dict[str, list[Assignment]] = {a: [] for a in st.aircraft}
    rejected = 0
    seen: set[str] = set()
    chain_pos: dict[str, tuple[str, int]] = {}  # aircraft -> (airport, time) after its last accepted queued mission
    for asg in plan.assignments:
        if asg.mission_id in seen:
            continue
        ms = st.missions.get(asg.mission_id)
        if ms is None or ms.status in ("completed", "unserved") or ms.departed:
            continue
        # defence in depth: every assignment is re-validated with the shared helper, from where the
        # aircraft will be after the missions queued before it (its current location for the first one)
        ast = st.aircraft.get(asg.aircraft_id)
        if ast is None:
            rejected += 1
            st.event("REJECTED_ASSIGNMENT", mission_id=asg.mission_id, aircraft_id=asg.aircraft_id, reason="UNKNOWN_AIRCRAFT")
            continue
        if asg.aircraft_id in chain_pos:
            from_apt, avail = chain_pos[asg.aircraft_id]
        else:
            from_apt, avail = queue_position(st, asg.aircraft_id, t)
        c = build_candidate(st, t, asg.aircraft_id, asg.mission_id, from_airport=from_apt, avail_at=avail)
        if isinstance(c, Infeasible):
            rejected += 1
            st.event("REJECTED_ASSIGNMENT", mission_id=asg.mission_id, aircraft_id=asg.aircraft_id, reason=c.code)
            continue
        seen.add(asg.mission_id)
        by_aircraft.setdefault(asg.aircraft_id, []).append(asg)
        chain_pos[asg.aircraft_id] = (c.dest, c.est_complete + TURNAROUND_MIN)
    if rejected:
        st.warnings.append(f"t={t}: {rejected} assignment(s) rejected by feasibility validation")
    # rebuild queues; anything queued (undeparted) that is not in the plan returns to pending
    for aid, ast in st.aircraft.items():
        head = [ast.active_mission] if ast.active_mission else []
        new_ids = [a.mission_id for a in by_aircraft.get(aid, [])]
        for mid in ast.queue:
            if mid in head or mid in new_ids:
                continue
            ms = st.missions[mid]
            if not ms.departed and ms.status == "assigned":
                ms.status, ms.aircraft_id, ms.planned = "pending", None, None
        ast.queue = head + [m for m in new_ids if m not in head]
        for asg in by_aircraft.get(aid, []):
            ms = st.missions[asg.mission_id]
            sig = (asg.aircraft_id, tuple(asg.path))
            if not ms.assignments or ms.assignments[-1] != sig:
                ms.assignments.append(sig)
            ms.status = "assigned"
            ms.aircraft_id = aid
            ms.planned = asg.model_dump()
    for mid, reason in plan.unserved.items():
        ms = st.missions.get(mid)
        if ms and ms.status == "pending":
            ms.infeasible_reason = reason


def _start_leg(st: SimulationState, ast, leg: Leg) -> None:
    ast.current_leg = leg
    ast.free_at = leg.arrive_min + TURNAROUND_MIN
    st.legs.append(leg)


def _build_legs(st: SimulationState, aircraft_id: str, mission_id: str, path: list[str], purpose: str, t0: int) -> list[Leg]:
    ac = st.network.aircraft[aircraft_id]
    og = st.open_graph()
    legs, t = [], t0
    for a, b in zip(path, path[1:]):
        km = og[a][b]["distance_km"] if og.has_edge(a, b) else st.graph[a][b]["distance_km"]
        arrive = t + hop_minutes(ac, km)
        legs.append(Leg(aircraft_id=aircraft_id, mission_id=mission_id, purpose=purpose, from_airport=a,
                        to_airport=b, depart_min=t, arrive_min=arrive, distance_km=round(km, 1)))
        t = arrive + TURNAROUND_MIN
    return legs


def _return_mission(st: SimulationState, ast, mid: str, reason: str) -> None:
    ms = st.missions[mid]
    ms.status, ms.aircraft_id, ms.departed, ms.planned = "pending", None, False, None
    ms.depart_min = ms.response_min = None
    ms.origin = ms.dest = ms.path = None
    ms.infeasible_reason = reason
    if mid in ast.queue:
        ast.queue.remove(mid)
    ast.itinerary = []
    ast.active_mission = None
    st.event("MISSION_RETURNED", mission_id=mid, aircraft_id=ast.id, reason=reason)


def _depart_ready(st: SimulationState, t: int) -> None:
    if t >= st.scenario.horizon_min:
        return  # no departures at the end of the horizon
    for aid in sorted(st.aircraft):
        ast = st.aircraft[aid]
        if ast.airborne or ast.is_failed(t) or ast.free_at > t or not ast.queue:
            continue
        if st.is_stranded(aid):
            continue
        mid = ast.queue[0]
        ms = st.missions[mid]
        if ast.itinerary:
            leg = ast.itinerary[0]
            if leg.purpose == "mission" and leg.from_airport == ms.origin and ms.response_min is not None and t < ms.mission.release_min:
                continue  # pre-positioned, waiting for release
            if leg.to_airport in st.closed_airports or not st.open_graph().has_edge(leg.from_airport, leg.to_airport):
                target = ms.dest if (ms.response_min is not None and leg.purpose == "mission") else ms.origin
                tr = transition(st, aid, ast.airport_id, target)  # type: ignore[arg-type]
                if tr is None:
                    _return_mission(st, ast, mid, "route closed en route")
                    continue
                _, _, path = tr
                purpose = "mission" if target == ms.dest else "reposition"
                new_legs = _build_legs(st, aid, mid, path, purpose, t)
                if purpose == "reposition":
                    new_legs += _build_legs(st, aid, mid, ms.path or [ms.origin, ms.dest], "mission",
                                            new_legs[-1].arrive_min + TURNAROUND_MIN if new_legs else t)
                ast.itinerary = new_legs
                leg = ast.itinerary[0]
                st.event("REROUTED_EN_ROUTE", mission_id=mid, aircraft_id=aid)
            if leg.purpose == "mission" and leg.from_airport == ms.origin and ms.response_min is None:
                ms.response_min = t
            leg = leg.model_copy(update={"depart_min": t, "arrive_min": t + (leg.arrive_min - leg.depart_min)})
            ast.itinerary.pop(0)
            _start_leg(st, ast, leg)
            continue
        # not yet departed on this mission
        if not ms.departed and ast.airport_id == ms.mission.origin_options[0] and t < ms.mission.release_min:
            continue
        c = build_candidate(st, t, aid, mid)
        if isinstance(c, Infeasible):
            if ms.status == "assigned":
                _return_mission(st, ast, mid, c.code)
                st.event("ASSIGNMENT_INFEASIBLE", mission_id=mid, aircraft_id=aid, reason=c.code)
            continue
        if not c.repos_path or len(c.repos_path) == 1:
            if t < ms.mission.release_min:
                continue  # already at origin, wait for release
        ms.status, ms.departed, ms.depart_min = "active", True, t
        ms.origin, ms.dest, ms.path = c.origin, c.dest, list(c.mission_path)
        ms.aircraft_id = aid
        ast.active_mission = mid
        legs = []
        if len(c.repos_path) > 1:
            legs += _build_legs(st, aid, mid, c.repos_path, "reposition", t)
            legs += _build_legs(st, aid, mid, c.mission_path, "mission", legs[-1].arrive_min + TURNAROUND_MIN)
        else:
            ms.response_min = t
            legs += _build_legs(st, aid, mid, c.mission_path, "mission", t)
        ast.itinerary = legs
        first = ast.itinerary.pop(0)
        _start_leg(st, ast, first)
        st.event("MISSION_DEPARTED", mission_id=mid, aircraft_id=aid, origin=c.origin, dest=c.dest, path=c.mission_path)


def _land_arrivals(st: SimulationState, t: int) -> None:
    for aid in sorted(st.aircraft):
        ast = st.aircraft[aid]
        leg = ast.current_leg
        if leg is None or leg.arrive_min != t:
            continue
        ast.airport_id = leg.to_airport
        ast.flown_km += leg.distance_km
        ast.flying_min += leg.arrive_min - leg.depart_min
        ast.current_leg = None
        ast.free_at = t + TURNAROUND_MIN
        mid = ast.active_mission
        ms = st.missions[mid] if mid else None
        if ms is not None:
            if leg.purpose == "reposition" and leg.to_airport == ms.origin and ms.response_min is None:
                ms.response_min = t
            if leg.purpose == "mission" and leg.to_airport == ms.dest:
                ms.status, ms.complete_min = "completed", t
                if mid in ast.queue:
                    ast.queue.remove(mid)
                ast.active_mission, ast.itinerary = None, []
                st.event("MISSION_COMPLETED", mission_id=mid, aircraft_id=aid, at=leg.to_airport)
                if ms.mission.type in (MissionType.passenger, MissionType.cargo) and ms.mission.community_id:
                    com = st.network.communities[ms.mission.community_id]
                    if com.airport_id == leg.to_airport:
                        st.service_restored_at[com.id] = t
                if not ast.queue:
                    st.event("AIRCRAFT_FREE", aircraft_id=aid, at=leg.to_airport)
        if ast.pending_failure:
            ground_failure(st, aid)
            st.event("AIRCRAFT_GROUNDED", aircraft_id=aid, at=leg.to_airport)


def _service_disconnected(st: SimulationState, t: int) -> set[str]:
    out = set()
    for c in st.network.communities.values():
        restored = st.service_restored_at.get(c.id, -1)
        for ms in st.missions.values():
            m = ms.mission
            if m.type != MissionType.passenger or m.community_id != c.id or m.dest != c.airport_id:
                continue
            if m.scheduled_arrival_min is not None and m.scheduled_arrival_min <= t \
                    and ms.status != "completed" and m.scheduled_arrival_min > restored:
                out.add(c.id)
                break
    return out


def _update_disconnection(st: SimulationState, t: int) -> None:
    structural = st.structural_disconnected()
    service = _service_disconnected(st, t)
    now = structural | service
    st._last_structural, st._last_service = structural, service  # type: ignore[attr-defined]
    st.structural_hours += len(structural) * STEP_MIN / 60.0 if t < st.scenario.horizon_min else 0
    for cid in sorted(now):
        st.disconnected_since.setdefault(cid, t)
    for cid in sorted(set(st.disconnected_since) - now):
        st.disconnected_intervals.setdefault(cid, []).append([st.disconnected_since.pop(cid), t])


def _snapshot(st: SimulationState, t: int) -> Snapshot:
    net = st.network
    acs = []
    for aid in sorted(st.aircraft):
        a = st.aircraft[aid]
        if a.current_leg:
            leg = a.current_leg
            f = (t - leg.depart_min) / max(1, leg.arrive_min - leg.depart_min)
            o, d = net.airports[leg.from_airport], net.airports[leg.to_airport]
            lat, lon = interpolate(o.lat, o.lon, d.lat, d.lon, f)
            acs.append(AircraftSnapshot(id=aid, lat=round(lat, 4), lon=round(lon, 4), airport_id=None, status="flying",
                                        mission_id=leg.mission_id, leg_from=leg.from_airport, leg_to=leg.to_airport,
                                        progress=round(f, 3)))
        else:
            apt = net.airports[a.airport_id]  # type: ignore[index]
            status = "failed" if a.is_failed(t) else ("stranded" if st.is_stranded(aid) else "ground")
            acs.append(AircraftSnapshot(id=aid, lat=apt.lat, lon=apt.lon, airport_id=a.airport_id, status=status,
                                        mission_id=a.active_mission or (a.queue[0] if a.queue else None)))
    structural = getattr(st, "_last_structural", set())
    service = getattr(st, "_last_service", set())
    critical_pending = sum(1 for ms in st.missions.values()
                           if ms.mission.is_critical and ms.mission.release_min <= t and ms.status != "completed")
    return Snapshot(
        t=t, aircraft=acs, closed_airports=sorted(st.closed_airports), closed_routes=sorted(st.closed_routes),
        failed_aircraft=sorted(st.failed_aircraft(t)), structural_disconnected=sorted(structural),
        service_disconnected=sorted(service), disconnected=sorted(structural | service),
        mission_status={k: v.status for k, v in st.missions.items()}, critical_pending=critical_pending,
        route_risk={k: v for k, v in st.route_risk.items() if v > 0.2},
    )


def _finalize(st: SimulationState, strategy_name: str) -> Trace:
    horizon = st.scenario.horizon_min
    for cid in sorted(st.disconnected_since):
        st.disconnected_intervals.setdefault(cid, []).append([st.disconnected_since[cid], horizon])
    st.disconnected_since.clear()
    outcomes = {}
    for mid, ms in st.missions.items():
        m = ms.mission
        status = ms.status if ms.status == "completed" else "unserved"
        changes = max(0, len(ms.assignments) - 1)
        outcomes[mid] = MissionOutcome(
            mission_id=mid, type=m.type, priority=m.priority, label=m.label, community_id=m.community_id,
            status=status, aircraft_id=ms.aircraft_id if status == "completed" else None,
            origin=ms.origin, dest=ms.dest, path=ms.path, release_min=m.release_min, deadline_min=m.deadline_min,
            scheduled_arrival_min=m.scheduled_arrival_min, scheduled_aircraft_id=m.scheduled_aircraft_id,
            scheduled_path=m.scheduled_path, depart_min=ms.depart_min, response_min=ms.response_min,
            complete_min=ms.complete_min, assignment_changes=changes, infeasible_reason=ms.infeasible_reason,
        )
    starts = [d.start_min for d in st.scenario.disruptions]
    statuses = [r["status"] for r in st.replans]
    completed_any = any(o.status == "completed" for o in outcomes.values())
    if "NO_FEASIBLE_SOLUTION" in statuses and not completed_any:
        status = "NO_FEASIBLE_SOLUTION"
    elif "TIMEOUT" in statuses:
        status = "TIMEOUT"
    elif "PARTIAL" in statuses:
        status = "PARTIAL"
    else:
        status = "OK"
    return Trace(
        scenario_id=st.scenario.id, strategy=strategy_name, step_min=st.scenario.step_min, horizon_min=horizon,
        first_disruption_min=min(starts) if starts else None, last_disruption_start_min=max(starts) if starts else None,
        snapshots=st.snapshots, legs=st.legs, missions=outcomes, disconnected_intervals=st.disconnected_intervals,
        aircraft_flying_min={k: v.flying_min for k, v in st.aircraft.items()},
        aircraft_flown_km={k: round(v.flown_km, 1) for k, v in st.aircraft.items()},
        events=st.events, replans=st.replans, solver_calls=st.solver_calls, warnings=st.warnings, status=status,
    )
