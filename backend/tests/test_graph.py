import networkx as nx

from northstar.network.graph import (
    aircraft_graph,
    build_graph,
    open_graph,
    shortest_path,
    structurally_disconnected,
)


def test_build_graph(network):
    g = build_graph(network)
    assert g.number_of_nodes() == 28
    assert g.number_of_edges() == 41
    assert g["CYFB"]["CYXP"]["distance_km"] > 290


def test_closing_airport_changes_connectivity(network):
    g = build_graph(network)
    og = open_graph(g, closed_airports={"CYFB"}, closed_routes=set())
    assert "CYFB" not in og
    assert not nx.has_path(og, "CYLC", "CYOW")  # Kimmirut only connects through Iqaluit


def test_closing_route_changes_connectivity(network):
    g = build_graph(network)
    r = next(r for r in network.routes.values() if {r.origin_airport_id, r.destination_airport_id} == {"CYFB", "CYLC"})
    og = open_graph(g, closed_airports=set(), closed_routes={r.id})
    assert not og.has_edge("CYFB", "CYLC")


def test_aircraft_graph_respects_runway_and_range(network):
    g = build_graph(network)
    king = aircraft_graph(g, network.aircraft["AC-07"], network)
    assert "CYXP" not in king  # runway too short for King Air
    twin = aircraft_graph(g, network.aircraft["AC-01"], network)
    assert "CYXP" in twin
    assert not twin.has_edge("CYFB", "CYOW")  # 2,000+ km exceeds Twin Otter range


def test_shortest_path(network):
    g = build_graph(network)
    twin = aircraft_graph(g, network.aircraft["AC-01"], network)
    path, dist = shortest_path(twin, "CYFB", "CYVM")
    assert path[0] == "CYFB" and path[-1] == "CYVM"
    assert dist > 0
    assert shortest_path(twin, "CYFB", "CYOW") is None


def test_structurally_disconnected(network):
    g = build_graph(network)
    assert structurally_disconnected(g, network, closed_airports=set(), closed_routes=set(), failed_aircraft=set()) == set()
    dis = structurally_disconnected(g, network, closed_airports={"CYFB"}, closed_routes=set(), failed_aircraft=set())
    assert "COM-YFB" in dis and "COM-YLC" in dis  # Iqaluit itself and Kimmirut
    assert "COM-YRT" not in dis
