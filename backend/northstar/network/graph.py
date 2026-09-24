"""NetworkX representation of the aviation network and connectivity queries."""
from __future__ import annotations

from collections.abc import Iterable

import networkx as nx

from northstar.models import Aircraft, Network


def build_graph(network: Network) -> nx.Graph:
    g = nx.Graph()
    for a in network.airports.values():
        g.add_node(a.id, lat=a.lat, lon=a.lon)
    for r in network.routes.values():
        g.add_edge(r.origin_airport_id, r.destination_airport_id, route_id=r.id,
                   distance_km=r.distance_km, risk=r.base_risk)
    return g


def open_graph(g: nx.Graph, closed_airports: Iterable[str], closed_routes: Iterable[str],
               risk: dict[str, float] | None = None) -> nx.Graph:
    """Subgraph of open airports and open routes. `risk` optionally overrides per-route risk."""
    closed_a, closed_r = set(closed_airports), set(closed_routes)
    og = nx.Graph()
    for n, data in g.nodes(data=True):
        if n not in closed_a:
            og.add_node(n, **data)
    for u, v, data in g.edges(data=True):
        if u in closed_a or v in closed_a or data["route_id"] in closed_r:
            continue
        d = dict(data)
        if risk is not None and data["route_id"] in risk:
            d["risk"] = risk[data["route_id"]]
        og.add_edge(u, v, **d)
    return og


def aircraft_graph(og: nx.Graph, aircraft: Aircraft, network: Network, range_factor: float = 1.0) -> nx.Graph:
    """Further restrict an open graph to airports and hops this aircraft can use."""
    usable = {n for n in og.nodes if aircraft.can_use(network.airports[n])}
    ag = nx.Graph()
    for n in usable:
        ag.add_node(n, **og.nodes[n])
    max_hop = aircraft.range_km * range_factor
    for u, v, data in og.edges(data=True):
        if u in usable and v in usable and data["distance_km"] <= max_hop:
            ag.add_edge(u, v, **data)
    return ag


def path_weight_fn(risk_lambda: float = 0.0):
    def w(u, v, data):
        return data["distance_km"] * (1.0 + risk_lambda * data.get("risk", 0.0))
    return w


def shortest_path(ag: nx.Graph, origin: str, dest: str, risk_lambda: float = 0.0) -> tuple[list[str], float] | None:
    """Shortest path by distance (optionally risk-weighted). Returns (path, distance_km) or None."""
    if origin not in ag or dest not in ag:
        return None
    if origin == dest:
        return [origin], 0.0
    try:
        path = nx.dijkstra_path(ag, origin, dest, weight=path_weight_fn(risk_lambda))
    except nx.NetworkXNoPath:
        return None
    dist = sum(ag[a][b]["distance_km"] for a, b in zip(path, path[1:]))
    return path, dist


def path_risk(ag: nx.Graph, path: list[str]) -> float:
    return sum(ag[a][b].get("risk", 0.0) for a, b in zip(path, path[1:]))


def structurally_disconnected(g: nx.Graph, network: Network, closed_airports: Iterable[str],
                              closed_routes: Iterable[str], failed_aircraft: Iterable[str],
                              risk: dict[str, float] | None = None) -> set[str]:
    """Communities whose airport is closed, or that no non-failed aircraft type can connect to any hub."""
    closed_a = set(closed_airports)
    og = open_graph(g, closed_a, closed_routes, risk)
    hubs = set(network.hub_ids("any"))
    failed = set(failed_aircraft)
    reachable: set[str] = set()
    for ac in network.aircraft.values():
        if ac.id in failed:
            continue
        ag = aircraft_graph(og, ac, network)
        for h in hubs:
            if h in ag:
                reachable |= nx.node_connected_component(ag, h)
    out = set()
    for c in network.communities.values():
        if c.airport_id in closed_a or c.airport_id not in reachable:
            out.add(c.id)
    return out
