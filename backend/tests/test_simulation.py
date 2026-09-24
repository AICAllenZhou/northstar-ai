from northstar.models import Disruption, DisruptionType, MissionType, Scenario
from northstar.sim.simulator import initial_state, run
from northstar.strategies.baseline import BaselineStrategy
from northstar.strategies.schedule_only import ScheduleOnlyStrategy
from northstar.metrics.evaluate import evaluate


def empty_scenario():
    return Scenario(id="empty", name="No disruption")


def test_schedule_only_undisrupted_day_is_clean(network):
    trace = run(network, empty_scenario(), ScheduleOnlyStrategy())
    m = evaluate(trace)
    assert m.cancelled_flights == 0
    assert m.passenger_delay_avg_min == 0
    assert m.disconnected_community_hours == 0
    assert m.reroutes == 0
    assert all(o.status == "completed" for o in trace.missions.values())


def test_baseline_undisrupted_day_keeps_schedule(network):
    trace = run(network, empty_scenario(), BaselineStrategy())
    m = evaluate(trace)
    assert m.cancelled_flights == 0 and m.passenger_delay_avg_min == 0 and m.reroutes == 0
    for o in trace.missions.values():
        assert o.aircraft_id == network.schedule[[s.id for s in network.schedule].index(o.mission_id)].aircraft_id


def test_closed_airport_is_never_used(network):
    sc = Scenario(id="c", name="closure", disruptions=[
        Disruption(id="D1", type=DisruptionType.airport_closure, target_ids=["CYXP"], start_min=0, duration_min=600)])
    trace = run(network, sc, BaselineStrategy())
    for leg in trace.legs:
        if "CYXP" in (leg.from_airport, leg.to_airport):
            assert leg.depart_min >= 600 and leg.arrive_min >= 600, leg
    m = evaluate(trace)
    assert m.disconnected_community_hours > 0
    assert "COM-YXP" in trace.disconnected_intervals


def test_failed_aircraft_is_never_assigned(network):
    sc = Scenario(id="f", name="failure", disruptions=[
        Disruption(id="D1", type=DisruptionType.aircraft_failure, target_ids=["AC-01"], start_min=0, duration_min=1440)])
    trace = run(network, sc, BaselineStrategy())
    assert not any(leg.aircraft_id == "AC-01" for leg in trace.legs)
    assert all(o.aircraft_id != "AC-01" for o in trace.missions.values())


def test_runway_and_capacity_constraints(network):
    sc = Scenario(id="rc", name="runway+capacity", disruptions=[
        Disruption(id="M1", type=DisruptionType.medical_emergency, target_ids=["COM-YXP"], start_min=120, params={"priority": 1}),
        Disruption(id="C1", type=DisruptionType.essential_cargo_request, target_ids=["COM-YTE"], start_min=120, params={"payload_kg": 3000}),
    ])
    trace = run(network, sc, BaselineStrategy())
    med = next(o for o in trace.missions.values() if o.type == MissionType.medical)
    assert med.status == "completed"
    assert network.aircraft[med.aircraft_id].min_runway_length_m <= 890, med  # Pangnirtung runway is 890 m
    cargo = next(o for o in trace.missions.values() if o.type == MissionType.cargo)
    assert cargo.status == "completed"
    assert network.aircraft[cargo.aircraft_id].cargo_capacity_kg >= 3000


def test_simultaneous_disruptions_all_take_effect(network):
    sc = Scenario(id="multi", name="multi", disruptions=[
        Disruption(id="D1", type=DisruptionType.airport_closure, target_ids=["CYRT"], start_min=60, duration_min=480),
        Disruption(id="D2", type=DisruptionType.aircraft_failure, target_ids=["AC-05"], start_min=60, duration_min=600),
        Disruption(id="D3", type=DisruptionType.medical_emergency, target_ids=["COM-YCS"], start_min=90, params={"priority": 1}),
        Disruption(id="D4", type=DisruptionType.essential_cargo_request, target_ids=["COM-YZS"], start_min=90, params={"payload_kg": 800}),
        Disruption(id="D5", type=DisruptionType.wildfire, target_ids=[], center_lat=62.8, center_lon=-92.1, radius_km=120, severity=0.9, start_min=60, duration_min=480),
    ])
    st = initial_state(network, sc)
    types = {m.mission.type for m in st.missions.values()}
    assert types == {MissionType.passenger, MissionType.medical, MissionType.cargo}
    trace = run(network, sc, BaselineStrategy())
    snap = next(s for s in trace.snapshots if s.t == 120)
    assert "CYRT" in snap.closed_airports and "CYXN" in snap.closed_airports  # wildfire radius covers Whale Cove
    assert "AC-05" in snap.failed_aircraft
    assert len([o for o in trace.missions.values() if o.type != MissionType.passenger]) == 2


def test_reset_gives_identical_initial_state(network):
    sc = Scenario(id="r", name="r", disruptions=[
        Disruption(id="D1", type=DisruptionType.airport_closure, target_ids=["CYFB"], start_min=0, duration_min=120)])
    a, b = initial_state(network, sc), initial_state(network, sc)
    assert a.signature() == b.signature()
    run(network, sc, BaselineStrategy())
    assert initial_state(network, sc).signature() == a.signature()


def test_baseline_reproducible(network):
    sc = Scenario(id="rep", name="rep", disruptions=[
        Disruption(id="D1", type=DisruptionType.airport_closure, target_ids=["CYRT"], start_min=60, duration_min=480),
        Disruption(id="D3", type=DisruptionType.medical_emergency, target_ids=["COM-YCS"], start_min=90, params={"priority": 1}),
    ])
    t1, t2 = run(network, sc, BaselineStrategy()), run(network, sc, BaselineStrategy())
    assert t1.hash() == t2.hash()


def test_metrics_deterministic_and_do_nothing_worse(network):
    sc = Scenario(id="m", name="m", disruptions=[
        Disruption(id="D3", type=DisruptionType.medical_emergency, target_ids=["COM-YCS"], start_min=90, params={"priority": 1})])
    tb = run(network, sc, BaselineStrategy())
    assert evaluate(tb).model_dump() == evaluate(tb).model_dump()
    tn = run(network, sc, ScheduleOnlyStrategy())
    mb, mn = evaluate(tb), evaluate(tn)
    assert mn.medical_unserved == 1 and mb.medical_unserved == 0
    assert mb.medical_response_avg_min < mn.medical_response_avg_min


def test_all_airports_closed_is_handled(network):
    sc = Scenario(id="all", name="all closed", disruptions=[
        Disruption(id="D1", type=DisruptionType.airport_closure, target_ids=list(network.airports), start_min=0, duration_min=2000),
        Disruption(id="D3", type=DisruptionType.medical_emergency, target_ids=["COM-YCS"], start_min=90, params={"priority": 1}),
    ])
    trace = run(network, sc, BaselineStrategy())
    assert trace.legs == []
    assert all(o.status == "unserved" for o in trace.missions.values())
    m = evaluate(trace)
    assert m.disconnected_communities_end == 25
