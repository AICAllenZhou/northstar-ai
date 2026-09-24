"""Mutable simulation state and read-only strategy view."""
from __future__ import annotations

import json
from dataclasses import dataclass, field

import networkx as nx

from northstar.config import STEP_MIN
from northstar.models import Leg, Mission, Network, Scenario
from northstar.network.graph import aircraft_graph, build_graph, open_graph, structurally_disconnected


@dataclass
class AircraftState:
    id: str
    airport_id: str | None
    free_at: int = 0
    failed_until: int | None = None
    pending_failure: bool = False
    current_leg: Leg | None = None
    itinerary: list[Leg] = field(default_factory=list)
    queue: list[str] = field(default_factory=list)
    active_mission: str | None = None
    flown_km: float = 0.0
    flying_min: int = 0

    def is_failed(self, t: int) -> bool:
        return self.failed_until is not None and t < self.failed_until

    @property
    def airborne(self) -> bool:
        return self.current_leg is not None

    def location(self) -> str:
        """Airport where the aircraft is or will next be on the ground."""
        return self.current_leg.to_airport if self.current_leg else self.airport_id  # type: ignore[return-value]


@dataclass
class MissionState:
    mission: Mission
    status: str = "pending"  # pending | assigned | active | completed | unserved
    aircraft_id: str | None = None
    origin: str | None = None
    dest: str | None = None
    path: list[str] | None = None
    depart_min: int | None = None
    response_min: int | None = None
    complete_min: int | None = None
    departed: bool = False
    assignments: list[tuple[str, tuple[str, ...]]] = field(default_factory=list)
    infeasible_reason: str | None = None
    planned: dict | None = None  # last Assignment dict, restated by strategies that keep queues


class SimulationState:
    def __init__(self, network: Network, scenario: Scenario, missions: list[Mission]) -> None:
        self.network = network
        self.scenario = scenario
        self.t = 0
        self.graph: nx.Graph = build_graph(network)
        self.missions: dict[str, MissionState] = {m.id: MissionState(m) for m in sorted(missions, key=lambda m: m.id)}
        self.aircraft: dict[str, AircraftState] = {
            a.id: AircraftState(a.id, a.home_airport_id) for a in network.aircraft.values()
        }
        self.airport_closures: dict[str, set[str]] = {}
        self.airport_weather: dict[str, dict[str, float]] = {}
        self.airport_wildfire: dict[str, dict[str, float]] = {}
        self.route_closures: dict[str, set[str]] = {}
        self.route_risk: dict[str, float] = {}
        self.active_disruptions: set[str] = set()
        self.legs: list[Leg] = []
        self.events: list[dict] = []
        self.snapshots: list = []
        self.replans: list[dict] = []
        self.solver_calls: list[dict] = []
        self.disconnected_since: dict[str, int] = {}
        self.disconnected_intervals: dict[str, list[list[int]]] = {}
        self.service_restored_at: dict[str, int] = {}
        self.structural_hours: float = 0.0
        self.warnings: list[str] = []
        self._cache_key: tuple | None = None
        self._og: nx.Graph | None = None
        self._ag: dict[str, nx.Graph] = {}
        self._structural: set[str] | None = None

    # ---- derived status -------------------------------------------------
    @property
    def closed_airports(self) -> set[str]:
        return {a for a, why in self.airport_closures.items() if why}

    @property
    def closed_routes(self) -> set[str]:
        return {r for r, why in self.route_closures.items() if why}

    def failed_aircraft(self, t: int | None = None) -> set[str]:
        t = self.t if t is None else t
        return {a.id for a in self.aircraft.values() if a.is_failed(t) or a.pending_failure}

    def _key(self) -> tuple:
        return (tuple(sorted(self.closed_airports)), tuple(sorted(self.closed_routes)),
                tuple(sorted(self.failed_aircraft())), tuple(sorted(self.route_risk.items())))

    def _refresh(self) -> None:
        k = self._key()
        if k != self._cache_key:
            self._cache_key = k
            self._og = open_graph(self.graph, self.closed_airports, self.closed_routes, self.route_risk)
            self._ag = {}
            self._structural = None

    def open_graph(self) -> nx.Graph:
        self._refresh()
        return self._og  # type: ignore[return-value]

    def aircraft_graph(self, aircraft_id: str) -> nx.Graph:
        self._refresh()
        if aircraft_id not in self._ag:
            self._ag[aircraft_id] = aircraft_graph(self.open_graph(), self.network.aircraft[aircraft_id], self.network)
        return self._ag[aircraft_id]

    def structural_disconnected(self) -> set[str]:
        self._refresh()
        if self._structural is None:
            self._structural = structurally_disconnected(
                self.graph, self.network, self.closed_airports, self.closed_routes, self.failed_aircraft(), self.route_risk)
        return self._structural

    def is_stranded(self, aircraft_id: str) -> bool:
        a = self.aircraft[aircraft_id]
        return (not a.airborne) and a.airport_id in self.closed_airports

    def event(self, event_type: str, **data) -> dict:
        e = {"t": self.t, "type": event_type, **data}
        self.events.append(e)
        return e

    def signature(self) -> str:
        """Canonical serialisation of the decision-relevant state (used by the reset test)."""
        return json.dumps({
            "t": self.t,
            "closed": sorted(self.closed_airports), "routes": sorted(self.closed_routes),
            "aircraft": {k: [v.airport_id, v.free_at, v.failed_until, list(v.queue)] for k, v in self.aircraft.items()},
            "missions": {k: [v.status, v.aircraft_id] for k, v in self.missions.items()},
        }, sort_keys=True)


class StrategyView:
    """What a strategy is allowed to see at replanning time t. No future information."""

    def __init__(self, state: SimulationState, t: int) -> None:
        self.state = state
        self.network = state.network
        self.t = t

    def visible_missions(self) -> list[MissionState]:
        return [m for m in self.state.missions.values()
                if m.mission.known_min <= self.t and m.status in ("pending", "assigned")]

    def pending_missions(self) -> list[MissionState]:
        return [m for m in self.visible_missions() if m.status == "pending"]

    def free_aircraft(self) -> list[str]:
        out = []
        for a in self.state.aircraft.values():
            if a.airborne or a.is_failed(self.t) or a.pending_failure or a.queue or a.free_at > self.t:
                continue
            if self.state.is_stranded(a.id):
                continue
            out.append(a.id)
        return sorted(out)

    def usable_aircraft(self) -> list[str]:
        out = []
        for a in self.state.aircraft.values():
            if a.is_failed(self.t) or a.pending_failure:
                continue
            if self.state.is_stranded(a.id):
                continue
            out.append(a.id)
        return sorted(out)

    def disconnected_now(self) -> set[str]:
        return set(self.state.disconnected_since)

    def candidate(self, aircraft_id: str, mission_id: str, risk_lambda: float = 0.0):
        from northstar.strategies.base import build_candidate
        return build_candidate(self.state, self.t, aircraft_id, mission_id, risk_lambda)

    def transition(self, aircraft_id: str, from_airport: str, to_airport: str, risk_lambda: float = 0.0):
        from northstar.strategies.base import transition
        return transition(self.state, aircraft_id, from_airport, to_airport, risk_lambda)

    def steps(self, minutes: int) -> int:
        return -(-minutes // STEP_MIN)
