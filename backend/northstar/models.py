"""Domain entities. Units: km, minutes, kg, people. Times are minutes since scenario start."""
from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class MissionType(str, Enum):
    medical = "medical"
    cargo = "cargo"
    passenger = "passenger"


class DisruptionType(str, Enum):
    airport_closure = "airport_closure"
    wildfire = "wildfire"
    severe_weather = "severe_weather"
    aircraft_failure = "aircraft_failure"
    medical_emergency = "medical_emergency"
    essential_cargo_request = "essential_cargo_request"


class Airport(BaseModel):
    id: str
    iata: str = ""
    name: str
    community_name: str
    region: str
    lat: float
    lon: float
    elevation_m: float | None = None
    runway_length_m: int
    runway_surface: Literal["paved", "gravel", "unknown"] = "unknown"
    is_medical_hub: bool = False
    is_cargo_hub: bool = False
    is_passenger_hub: bool = False
    hub_note: str = ""
    base_weather_risk: float = 0.1
    base_wildfire_risk: float = 0.0
    data_flags: list[str] = Field(default_factory=list)

    @property
    def is_hub(self) -> bool:
        return self.is_medical_hub or self.is_cargo_hub or self.is_passenger_hub


class Community(BaseModel):
    id: str
    name: str
    airport_id: str
    region: str
    lat: float
    lon: float
    population_2021: int | None = None
    priority_weight: float = 1.0


class Aircraft(BaseModel):
    id: str
    type: str
    callsign: str = ""
    home_airport_id: str
    range_km: float
    capacity_people: int
    cargo_capacity_kg: int
    min_runway_length_m: int
    gravel_capable: bool = True
    speed_kmh: float
    cost_index_per_km: float = 1.0
    role: str = "utility"

    def can_use(self, airport: Airport) -> bool:
        if airport.runway_length_m < self.min_runway_length_m:
            return False
        if airport.runway_surface == "gravel" and not self.gravel_capable:
            return False
        return True

    def flight_min(self, distance_km: float) -> float:
        return distance_km / self.speed_kmh * 60.0


class Route(BaseModel):
    id: str
    origin_airport_id: str
    destination_airport_id: str
    distance_km: float
    corridor: str = ""
    base_risk: float = 0.05

    @property
    def key(self) -> tuple[str, str]:
        return tuple(sorted((self.origin_airport_id, self.destination_airport_id)))  # type: ignore[return-value]


class ScheduleLeg(BaseModel):
    id: str
    aircraft_id: str
    origin_airport_id: str
    destination_airport_id: str
    departure_min: int
    scheduled_arrival_min: int
    departure_local: str = ""
    passengers: int
    distance_km: float


class Mission(BaseModel):
    id: str
    type: MissionType
    priority: int = 2  # 1 = highest
    origin_options: list[str]  # preferred first
    dest_options: list[str]
    release_min: int = 0
    known_min: int = 0  # when the mission becomes visible to strategies (0 for the schedule)
    deadline_min: int | None = None
    scheduled_arrival_min: int | None = None
    payload_people: int = 0
    payload_kg: int = 0
    community_id: str | None = None
    scheduled_aircraft_id: str | None = None
    scheduled_path: list[str] | None = None
    source: str = "schedule"
    label: str = ""

    @property
    def origin(self) -> str:
        return self.origin_options[0]

    @property
    def dest(self) -> str:
        return self.dest_options[0]

    @property
    def is_critical(self) -> bool:
        return self.type in (MissionType.medical, MissionType.cargo)


class Disruption(BaseModel):
    id: str = ""
    type: DisruptionType
    target_ids: list[str] = Field(default_factory=list)
    center_lat: float | None = None
    center_lon: float | None = None
    radius_km: float | None = None
    severity: float = 1.0
    start_min: int = 0
    duration_min: int = 360
    params: dict = Field(default_factory=dict)
    label: str = ""

    @property
    def end_min(self) -> int:
        return self.start_min + self.duration_min


class Scenario(BaseModel):
    id: str
    name: str
    description: str = ""
    seed: int | None = None
    horizon_min: int = 1440
    step_min: int = 30
    disruptions: list[Disruption] = Field(default_factory=list)
    policy_id: str = "balanced"
    tags: list[str] = Field(default_factory=list)


class Network:
    """Immutable container for the loaded datasets."""

    def __init__(
        self,
        airports: dict[str, Airport],
        communities: dict[str, Community],
        aircraft: dict[str, Aircraft],
        routes: dict[str, Route],
        schedule: list[ScheduleLeg],
    ) -> None:
        self.airports = dict(sorted(airports.items()))
        self.communities = dict(sorted(communities.items()))
        self.aircraft = dict(sorted(aircraft.items()))
        self.routes = dict(sorted(routes.items()))
        self.schedule = sorted(schedule, key=lambda s: s.id)
        self._community_by_airport = {c.airport_id: c for c in self.communities.values()}
        self._route_by_key = {r.key: r for r in self.routes.values()}

    def community_for_airport(self, airport_id: str) -> Community | None:
        return self._community_by_airport.get(airport_id)

    def route_between(self, a: str, b: str) -> Route | None:
        return self._route_by_key.get(tuple(sorted((a, b))))  # type: ignore[arg-type]

    def hub_ids(self, role: Literal["medical", "cargo", "passenger", "any"] = "any") -> list[str]:
        out = []
        for a in self.airports.values():
            if role == "medical" and a.is_medical_hub or role == "cargo" and a.is_cargo_hub \
                    or role == "passenger" and a.is_passenger_hub or role == "any" and a.is_hub:
                out.append(a.id)
        return out

    def scheduled_missions(self) -> list[Mission]:
        missions = []
        for leg in self.schedule:
            o, d = leg.origin_airport_id, leg.destination_airport_id
            # the served community is the non-hub end (or the destination if both are non-hubs)
            served_apt = d if not self.airports[d].is_hub else (o if not self.airports[o].is_hub else d)
            com = self.community_for_airport(served_apt)
            missions.append(Mission(
                id=leg.id, type=MissionType.passenger, priority=3,
                origin_options=[o], dest_options=[d],
                release_min=leg.departure_min, scheduled_arrival_min=leg.scheduled_arrival_min,
                payload_people=leg.passengers, community_id=com.id if com else None,
                scheduled_aircraft_id=leg.aircraft_id, scheduled_path=[o, d], source="schedule",
                label=f"Scheduled {self.airports[o].community_name} → {self.airports[d].community_name} ({leg.passengers} pax)",
            ))
        return missions


# ---------------------------------------------------------------------------
# Runtime / output models (shared by simulator, metrics, API)
# ---------------------------------------------------------------------------

class Leg(BaseModel):
    aircraft_id: str
    mission_id: str | None
    purpose: Literal["reposition", "mission"]
    from_airport: str
    to_airport: str
    depart_min: int
    arrive_min: int
    distance_km: float


class MissionOutcome(BaseModel):
    mission_id: str
    type: MissionType
    priority: int
    label: str
    community_id: str | None
    status: str
    aircraft_id: str | None = None
    origin: str | None = None
    dest: str | None = None
    path: list[str] | None = None
    release_min: int
    deadline_min: int | None = None
    scheduled_arrival_min: int | None = None
    scheduled_aircraft_id: str | None = None
    scheduled_path: list[str] | None = None
    depart_min: int | None = None
    response_min: int | None = None
    complete_min: int | None = None
    assignment_changes: int = 0
    infeasible_reason: str | None = None


class AircraftSnapshot(BaseModel):
    id: str
    lat: float
    lon: float
    airport_id: str | None
    status: Literal["ground", "flying", "failed", "stranded"]
    mission_id: str | None = None
    leg_from: str | None = None
    leg_to: str | None = None
    progress: float = 0.0


class Snapshot(BaseModel):
    t: int
    aircraft: list[AircraftSnapshot]
    closed_airports: list[str]
    closed_routes: list[str]
    failed_aircraft: list[str]
    structural_disconnected: list[str]
    service_disconnected: list[str]
    disconnected: list[str]
    mission_status: dict[str, str]
    critical_pending: int
    route_risk: dict[str, float] = Field(default_factory=dict)


class Trace(BaseModel):
    scenario_id: str
    strategy: str
    step_min: int
    horizon_min: int
    first_disruption_min: int | None
    last_disruption_start_min: int | None
    snapshots: list[Snapshot]
    legs: list[Leg]
    missions: dict[str, MissionOutcome]
    disconnected_intervals: dict[str, list[list[int]]]
    aircraft_flying_min: dict[str, int]
    aircraft_flown_km: dict[str, float]
    events: list[dict]
    replans: list[dict]
    solver_calls: list[dict] = Field(default_factory=list)
    status: str = "OK"
    warnings: list[str] = Field(default_factory=list)

    def hash(self) -> str:
        import hashlib
        import json

        payload = {
            "legs": [leg.model_dump() for leg in self.legs],
            "missions": {k: v.model_dump() for k, v in sorted(self.missions.items())},
            "intervals": self.disconnected_intervals,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


class Metrics(BaseModel):
    horizon_min: int
    disconnected_communities_end: int
    disconnected_communities_peak: int
    disconnected_community_hours: float
    structural_disconnected_hours: float
    medical_count: int
    medical_unserved: int
    medical_response_avg_min: float | None
    medical_response_max_min: float | None
    medical_within_target_pct: float | None
    critical_missions_total: int
    critical_missions_completed_pct: float | None
    cargo_count: int
    cargo_unserved: int
    cargo_delay_avg_min: float | None
    cargo_completion_rate: float | None
    passenger_count: int
    cancelled_flights: int
    passenger_delay_avg_min: float | None
    passenger_delay_total_min: float
    reroutes: int
    aircraft_utilization_pct: float
    distance_flown_km: float
    operating_cost_index: float
    recovery_time_min: float | None
    recovered: bool
    missions_total: int
    missions_completed: int


class Assignment(BaseModel):
    mission_id: str
    aircraft_id: str
    origin: str
    dest: str
    path: list[str]
    repos_path: list[str]
    est_depart_min: int
    est_response_min: int
    est_complete_min: int
    est_km: float
    est_risk: float = 0.0
    note: str = ""


class Plan(BaseModel):
    strategy: str
    status: Literal["OK", "NO_FEASIBLE_SOLUTION", "TIMEOUT", "PARTIAL", "UNCHANGED"] = "OK"
    assignments: list[Assignment] = Field(default_factory=list)
    unserved: dict[str, str] = Field(default_factory=dict)  # mission_id -> reason code
    solver: dict | None = None
