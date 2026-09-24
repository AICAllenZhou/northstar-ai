from northstar.models import MissionType


def test_counts(network):
    assert len(network.airports) == 28
    assert len(network.communities) == 25
    assert len(network.aircraft) == 10
    assert len(network.routes) == 41
    assert len(network.schedule) == 26


def test_hubs_and_runways(network):
    fb = network.airports["CYFB"]
    assert fb.is_medical_hub and fb.is_cargo_hub and fb.is_passenger_hub
    assert fb.runway_surface == "paved" and fb.runway_length_m == 2623
    gz = network.airports["CYGZ"]
    assert gz.runway_length_m == 511 and "runway_length_from_secondary_source" in gz.data_flags
    assert sorted(network.hub_ids("medical")) == ["CYCB", "CYFB", "CYOW", "CYRT", "CYWG", "CYZF"]


def test_community_links(network):
    kim = network.community_for_airport("CYLC")
    assert kim is not None and kim.name == "Kimmirut" and kim.population_2021 == 426
    assert network.community_for_airport("CYOW") is None


def test_scheduled_missions(network):
    missions = network.scheduled_missions()
    assert len(missions) == 26
    m = missions[0]
    assert m.id == "SCH-01" and m.type == MissionType.passenger
    assert m.origin == "CYFB" and m.dest == "CYXP"
    assert m.release_min == 60 and m.scheduled_arrival_min == 150
    assert m.scheduled_aircraft_id == "AC-01" and m.payload_people == 12
    assert m.community_id == "COM-YXP"  # the served community is the non-hub end


def test_aircraft_runway_compatibility(network):
    twin = network.aircraft["AC-01"]
    king = network.aircraft["AC-07"]
    b737 = network.aircraft["AC-10"]
    pang = network.airports["CYXP"]  # 890 m gravel
    assert twin.can_use(pang)
    assert not king.can_use(pang)
    assert not b737.can_use(pang)
    assert b737.can_use(network.airports["CYFB"])


def test_every_community_usable_by_some_aircraft(network):
    for c in network.communities.values():
        apt = network.airports[c.airport_id]
        assert any(a.can_use(apt) for a in network.aircraft.values()), c.name
