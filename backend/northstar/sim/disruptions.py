"""Disruption effects on the simulation state, and mission generation from disruptions."""
from __future__ import annotations

from northstar.config import (
    CARGO_DEFAULT_DEADLINE_MIN,
    MEDICAL_TARGET_MIN,
    ROUTE_CLOSE_RISK,
    WEATHER_CLOSE_SEVERITY,
    WILDFIRE_CLOSE_SEVERITY,
)
from northstar.geo import haversine_km
from northstar.models import Disruption, DisruptionType, Mission, MissionType, Network, Scenario
from northstar.sim.state import SimulationState


def airports_in_radius(network: Network, lat: float, lon: float, radius_km: float) -> list[str]:
    return sorted(a.id for a in network.airports.values() if haversine_km(lat, lon, a.lat, a.lon) <= radius_km)


def _resolve_community_airport(network: Network, target: str) -> tuple[str, str | None]:
    """Accept a community id or an airport id; return (airport_id, community_id)."""
    if target in network.communities:
        c = network.communities[target]
        return c.airport_id, c.id
    if target in network.airports:
        c = network.community_for_airport(target)
        return target, (c.id if c else None)
    raise ValueError(f"unknown community/airport '{target}'")


def _hubs_by_distance(network: Network, role: str, from_airport: str) -> list[str]:
    a0 = network.airports[from_airport]
    hubs = [h for h in network.hub_ids(role) if h != from_airport]  # type: ignore[arg-type]
    return sorted(hubs, key=lambda h: (haversine_km(a0.lat, a0.lon, network.airports[h].lat, network.airports[h].lon), h))


def generate_missions(network: Network, scenario: Scenario) -> list[Mission]:
    """Medical and cargo missions implied by the scenario's disruptions (deterministic ids)."""
    missions: list[Mission] = []
    n_med = n_cgo = 0
    for d in sorted(scenario.disruptions, key=lambda x: (x.start_min, x.id)):
        if d.type == DisruptionType.medical_emergency:
            for target in d.target_ids:
                n_med += 1
                apt, com = _resolve_community_airport(network, target)
                prio = int(d.params.get("priority", 1))
                name = network.airports[apt].community_name
                missions.append(Mission(
                    id=f"MED-{n_med:02d}", type=MissionType.medical, priority=prio,
                    origin_options=[apt], dest_options=_hubs_by_distance(network, "medical", apt),
                    release_min=d.start_min, known_min=d.start_min,
                    deadline_min=d.start_min + int(d.params.get("target_min", MEDICAL_TARGET_MIN)),
                    payload_people=int(d.params.get("patients", 1)) + 1, payload_kg=0,
                    community_id=com, source=f"disruption:{d.id}",
                    label=f"Medevac from {name} (priority {prio})",
                ))
        elif d.type == DisruptionType.essential_cargo_request:
            for target in d.target_ids:
                n_cgo += 1
                apt, com = _resolve_community_airport(network, target)
                kg = int(d.params.get("payload_kg", 800))
                name = network.airports[apt].community_name
                missions.append(Mission(
                    id=f"CGO-{n_cgo:02d}", type=MissionType.cargo, priority=int(d.params.get("priority", 2)),
                    origin_options=_hubs_by_distance(network, "cargo", apt), dest_options=[apt],
                    release_min=d.start_min, known_min=d.start_min,
                    deadline_min=d.start_min + int(d.params.get("deadline_min", CARGO_DEFAULT_DEADLINE_MIN)),
                    payload_kg=kg, community_id=com, source=f"disruption:{d.id}",
                    label=f"Essential cargo to {name} ({kg} kg, {d.params.get('cargo', 'supplies')})",
                ))
    return missions


def affected_airports(network: Network, d: Disruption) -> list[str]:
    ids = set(d.target_ids)
    if d.center_lat is not None and d.center_lon is not None and d.radius_km:
        ids |= set(airports_in_radius(network, d.center_lat, d.center_lon, d.radius_km))
    return sorted(a for a in ids if a in network.airports)


def route_risk_value(state: SimulationState, route_id: str) -> float:
    r = state.network.routes[route_id]
    o, d = r.origin_airport_id, r.destination_airport_id

    def wx(a):
        return max([state.network.airports[a].base_weather_risk] + list(state.airport_weather.get(a, {}).values()))

    def wf(a):
        return max([state.network.airports[a].base_wildfire_risk] + list(state.airport_wildfire.get(a, {}).values()))

    risk = 0.5 * max(wx(o), wx(d)) + 0.4 * max(wf(o), wf(d)) + 0.1 * min(1.0, r.distance_km / 1500.0)
    return round(min(1.0, max(0.0, risk)), 3)


def recompute_routes(state: SimulationState) -> None:
    for rid in state.network.routes:
        risk = route_risk_value(state, rid)
        state.route_risk[rid] = risk
        why = state.route_closures.setdefault(rid, set())
        if risk >= ROUTE_CLOSE_RISK:
            why.add("risk")
        else:
            why.discard("risk")


def apply_start(state: SimulationState, d: Disruption) -> None:
    net = state.network
    state.active_disruptions.add(d.id)
    if d.type == DisruptionType.airport_closure:
        for a in affected_airports(net, d):
            state.airport_closures.setdefault(a, set()).add(d.id)
    elif d.type == DisruptionType.wildfire:
        for a in affected_airports(net, d):
            state.airport_wildfire.setdefault(a, {})[d.id] = d.severity
            if d.severity >= WILDFIRE_CLOSE_SEVERITY:
                state.airport_closures.setdefault(a, set()).add(d.id)
    elif d.type == DisruptionType.severe_weather:
        for a in affected_airports(net, d):
            state.airport_weather.setdefault(a, {})[d.id] = d.severity
            if d.severity >= WEATHER_CLOSE_SEVERITY:
                state.airport_closures.setdefault(a, set()).add(d.id)
    elif d.type == DisruptionType.aircraft_failure:
        for aid in d.target_ids:
            if aid not in state.aircraft:
                continue
            ast = state.aircraft[aid]
            ast.failed_until = max(ast.failed_until or 0, d.end_min)
            if ast.airborne:
                ast.pending_failure = True
            else:
                ground_failure(state, aid)
    # medical_emergency / essential_cargo_request: missions were generated up front; release handled by clock
    recompute_routes(state)


def apply_end(state: SimulationState, d: Disruption) -> None:
    net = state.network
    state.active_disruptions.discard(d.id)
    if d.type in (DisruptionType.airport_closure, DisruptionType.wildfire, DisruptionType.severe_weather):
        for a in affected_airports(net, d):
            state.airport_closures.get(a, set()).discard(d.id)
            state.airport_weather.get(a, {}).pop(d.id, None)
            state.airport_wildfire.get(a, {}).pop(d.id, None)
    # aircraft failures end by the clock (failed_until)
    recompute_routes(state)


def ground_failure(state: SimulationState, aircraft_id: str) -> None:
    """Aircraft is on the ground and now failed: release all its undeparted / active work."""
    ast = state.aircraft[aircraft_id]
    ast.pending_failure = False
    released = []
    for mid in list(ast.queue):
        ms = state.missions[mid]
        if ms.status != "completed":
            ms.status = "pending"
            ms.aircraft_id = None
            ms.departed = False
            ms.depart_min = ms.response_min = None
            ms.origin = ms.dest = ms.path = None
            ms.planned = None
            released.append(mid)
    ast.queue = []
    ast.itinerary = []
    ast.active_mission = None
    if released:
        state.event("MISSIONS_RETURNED", aircraft_id=aircraft_id, missions=released, reason="aircraft failure")
