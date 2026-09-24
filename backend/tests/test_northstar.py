from northstar.config import get_policy
from northstar.metrics.evaluate import evaluate
from northstar.models import Disruption, DisruptionType, MissionType, Scenario
from northstar.sim.simulator import run
from northstar.strategies.baseline import BaselineStrategy
from northstar.strategies.northstar import NorthstarStrategy


def pang_medical():
    return Scenario(id="pang", name="Pangnirtung medevac", disruptions=[
        Disruption(id="M1", type=DisruptionType.medical_emergency, target_ids=["COM-YXP"], start_min=120, params={"priority": 1})])


def kivalliq_multi():
    return Scenario(id="kiv", name="Kivalliq multi", disruptions=[
        Disruption(id="D1", type=DisruptionType.airport_closure, target_ids=["CYRT"], start_min=60, duration_min=480),
        Disruption(id="D2", type=DisruptionType.aircraft_failure, target_ids=["AC-05"], start_min=60, duration_min=600),
        Disruption(id="D3", type=DisruptionType.medical_emergency, target_ids=["COM-YCS"], start_min=90, params={"priority": 1}),
        Disruption(id="D4", type=DisruptionType.essential_cargo_request, target_ids=["COM-YZS"], start_min=90, params={"payload_kg": 800}),
    ])


def _closure_windows(scenario, network):
    from northstar.sim.disruptions import affected_airports
    out = {}
    for d in scenario.disruptions:
        if d.type in (DisruptionType.airport_closure,) or (d.type == DisruptionType.wildfire and d.severity >= 0.5) \
                or (d.type == DisruptionType.severe_weather and d.severity >= 0.8):
            for a in affected_airports(network, d):
                out.setdefault(a, []).append((d.start_min, d.end_min))
    return out


def assert_hard_constraints(trace, network, scenario):
    assert not any(e["type"] == "REJECTED_ASSIGNMENT" for e in trace.events), "strategy proposed an infeasible assignment"
    windows = _closure_windows(scenario, network)
    failures = {a: (d.start_min, d.end_min) for d in scenario.disruptions if d.type == DisruptionType.aircraft_failure for a in d.target_ids}
    for leg in trace.legs:
        ac = network.aircraft[leg.aircraft_id]
        for apt in (leg.from_airport, leg.to_airport):
            assert ac.can_use(network.airports[apt]), (leg, "runway")
        assert leg.distance_km <= ac.range_km + 1e-6, (leg, "range")
        for s, e in windows.get(leg.to_airport, []):
            assert not (s <= leg.depart_min < e), (leg, "departed towards a closed airport")
        for s, e in windows.get(leg.from_airport, []):
            assert not (s <= leg.depart_min < e), (leg, "departed from a closed airport")
        if leg.aircraft_id in failures:
            s, e = failures[leg.aircraft_id]
            assert not (s <= leg.depart_min < e), (leg, "failed aircraft flew")
    for o in trace.missions.values():
        if o.status == "completed":
            ac = network.aircraft[o.aircraft_id]
            m = o
            if m.type == MissionType.passenger:
                assert ac.capacity_people >= 1
            outcome_payload_people = getattr(m, "payload_people", None)


def test_northstar_reproducible(network):
    sc = kivalliq_multi()
    t1 = run(network, sc, NorthstarStrategy())
    t2 = run(network, sc, NorthstarStrategy())
    assert t1.hash() == t2.hash()


def test_northstar_respects_hard_constraints(network):
    for sc in (pang_medical(), kivalliq_multi()):
        trace = run(network, sc, NorthstarStrategy())
        assert_hard_constraints(trace, network, sc)
        # capacity: every completed mission flown by an aircraft with enough seats / payload
        from northstar.sim.simulator import initial_state
        st = initial_state(network, sc)
        for o in trace.missions.values():
            if o.status == "completed":
                m = st.missions[o.mission_id].mission
                ac = network.aircraft[o.aircraft_id]
                assert m.payload_people <= ac.capacity_people and m.payload_kg <= ac.cargo_capacity_kg


def test_baseline_respects_hard_constraints_too(network):
    for sc in (pang_medical(), kivalliq_multi()):
        assert_hard_constraints(run(network, sc, BaselineStrategy()), network, sc)


def test_no_feasible_solution_is_explicit(network):
    sc = Scenario(id="all", name="all closed", disruptions=[
        Disruption(id="D1", type=DisruptionType.airport_closure, target_ids=list(network.airports), start_min=0, duration_min=2000),
        Disruption(id="D3", type=DisruptionType.medical_emergency, target_ids=["COM-YCS"], start_min=90, params={"priority": 1}),
    ])
    trace = run(network, sc, NorthstarStrategy())
    assert trace.legs == []
    assert any(r["status"] == "NO_FEASIBLE_SOLUTION" for r in trace.replans)
    assert trace.status == "NO_FEASIBLE_SOLUTION"
    assert trace.missions["MED-01"].status == "unserved"


def test_northstar_improves_medical_response_on_pangnirtung_case(network):
    sc = pang_medical()
    b = evaluate(run(network, sc, BaselineStrategy()), network)
    n = evaluate(run(network, sc, NorthstarStrategy()), network)
    assert n.medical_unserved == 0
    assert n.medical_response_avg_min < b.medical_response_avg_min


def test_solver_calls_are_recorded_and_fast(network):
    trace = run(network, kivalliq_multi(), NorthstarStrategy())
    assert trace.solver_calls, "expected at least one CP-SAT call"
    assert all(c["status"] in ("OPTIMAL", "FEASIBLE") for c in trace.solver_calls), trace.solver_calls
    assert sum(c["wall_ms"] for c in trace.solver_calls) < 20_000


def test_policy_changes_objective(network):
    sc = kivalliq_multi()
    t1 = run(network, sc, NorthstarStrategy(policy=get_policy("balanced")))
    t2 = run(network, sc, NorthstarStrategy(policy=get_policy("cost_conscious")))
    assert t1.solver_calls[0]["objective"] != t2.solver_calls[0]["objective"]


def test_northstar_flies_the_schedule_on_a_healthy_day(network):
    """Sanity: with nothing wrong, the optimizer must not cancel or delay scheduled flights."""
    sc = Scenario(id="healthy", name="healthy")
    n = evaluate(run(network, sc, NorthstarStrategy()), network)
    b = evaluate(run(network, sc, BaselineStrategy()), network)
    assert n.cancelled_flights == 0 and n.passenger_delay_avg_min == 0 and n.reroutes == 0
    assert n.distance_flown_km == b.distance_flown_km


def test_generated_scenarios_never_produce_rejected_assignments(network):
    """The optimizer's view and the simulator's feasibility check must agree (defence in depth never fires)."""
    from northstar.scenarios.generator import generate_scenario
    for i in range(8):
        sc = generate_scenario(network, 7, i)
        for strat in (BaselineStrategy(), NorthstarStrategy()):
            trace = run(network, sc, strat)
            rejected = [e for e in trace.events if e["type"] == "REJECTED_ASSIGNMENT"]
            assert not rejected, (sc.id, strat.name, rejected[:3])


def test_regression_active_mission_availability(network):
    """gen-42-001 produced REJECTED_ASSIGNMENT events when a mid-mission aircraft was modelled at its
    current position instead of its mission destination; must be clean now."""
    from northstar.scenarios.generator import generate_scenario
    for i in (1, 3, 9):
        sc = generate_scenario(network, 42, i)
        trace = run(network, sc, NorthstarStrategy())
        assert not [e for e in trace.events if e["type"] == "REJECTED_ASSIGNMENT"], sc.id


def test_policy_profile_changes_the_recommendation(network):
    """Documented demo behaviour: on the Kitikmeot preset the balanced profile accepts a slower medevac to keep
    two communities connected; medical-first reverses that. Weights are real levers, not decoration."""
    from northstar.scenarios.presets import get_preset
    sc = get_preset("kitikmeot_medevac_failure")
    bal = evaluate(run(network, sc, NorthstarStrategy(policy=get_policy("balanced"))), network)
    med = evaluate(run(network, sc, NorthstarStrategy(policy=get_policy("medical_first"))), network)
    assert med.medical_response_avg_min < bal.medical_response_avg_min
    assert med.disconnected_community_hours > bal.disconnected_community_hours
