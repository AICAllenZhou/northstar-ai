"""End-to-end demo smoke test through the HTTP API (the exact sequence the live demo uses)."""
import pytest
from fastapi.testclient import TestClient

from northstar.api.main import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_demo_sequence(client):
    r = client.get("/api/health"); assert r.status_code == 200 and r.json()["datasets_loaded"]
    r = client.get("/api/network"); assert r.status_code == 200
    net = r.json(); assert len(net["airports"]) == 28 and len(net["communities"]) == 25 and "disclaimer" in net
    for layer in ("countries", "provinces", "lakes"):
        assert client.get(f"/api/basemap/{layer}").status_code == 200
    presets = client.get("/api/presets").json(); assert any(p["id"] == "kivalliq_wildfire" for p in presets)
    # 1. healthy network
    r = client.post("/api/scenario/reset"); assert r.status_code == 200 and r.json()["scenario"]["id"] == "healthy"
    # 2. trigger disruption (preset)
    r = client.post("/api/scenario/load", json={"preset_id": "kivalliq_wildfire"}); assert r.status_code == 200
    st = r.json(); assert len(st["disruption_effects"]) == 4 and any(m["type"] == "medical" for m in st["missions"])
    # 3. network impact before intervention
    r = client.get("/api/scenario/impact"); assert r.status_code == 200
    imp = r.json(); assert imp["do_nothing"]["strategy"] == "do_nothing" and imp["timeline"]
    # 4. baseline
    r = client.post("/api/run/baseline"); assert r.status_code == 200
    b = r.json(); assert b["status"] == "OK" and b["metrics"]["medical_count"] == 1
    # 5. NORTHSTAR
    r = client.post("/api/run/northstar", json={"policy_id": "balanced"}); assert r.status_code == 200
    n = r.json(); assert n["status"] in ("OK", "PARTIAL") and n["solver"]["calls"] > 0 and n["decisions"]
    assert n["trace"]["snapshots"] and n["trace"]["legs"]
    # 6/7. compare
    r = client.get("/api/compare"); assert r.status_code == 200
    c = r.json(); assert "baseline" in c and "northstar" in c and "deltas" in c
    # 8. explain one decision
    d = client.get("/api/decisions").json(); assert d and d[0]["reasons"] and "summary" in d[0]
    med = next(x for x in d if x["mission_type"] == "medical"); assert med["aircraft_id"] and med["alternatives"]
    # 9. research results (may not exist before the experiment has been run)
    r = client.get("/api/experiments/latest"); assert r.status_code in (200, 404)
    # 10. reset works without refresh
    r = client.post("/api/scenario/reset"); assert r.json()["has_northstar"] is False


def test_custom_disruptions_and_validation(client):
    client.post("/api/scenario/reset")
    r = client.post("/api/scenario/disruptions", json={"type": "airport_closure", "target_ids": ["CYFB"], "start_min": 60, "duration_min": 240})
    assert r.status_code == 200 and r.json()["scenario"]["disruptions"][0]["id"] == "CL-1"
    r = client.post("/api/scenario/disruptions", json={"type": "medical_emergency", "target_ids": ["COM-YLC"], "start_min": 90, "params": {"priority": 1}})
    assert r.status_code == 200 and len(r.json()["missions"]) == 27
    r = client.post("/api/scenario/disruptions", json={"type": "airport_closure", "target_ids": ["NOPE"], "start_min": 0, "duration_min": 60})
    assert r.status_code == 400
    r = client.delete("/api/scenario/disruptions/CL-1"); assert r.status_code == 200 and len(r.json()["scenario"]["disruptions"]) == 1
    r = client.delete("/api/scenario/disruptions/CL-9"); assert r.status_code == 404
    r = client.get("/api/decisions"); assert r.status_code == 409  # no NORTHSTAR run yet: explicit, not silent


def test_no_feasible_solution_surfaces(client):
    client.post("/api/scenario/reset")
    net = client.get("/api/network").json()
    client.post("/api/scenario/disruptions", json={"type": "airport_closure", "target_ids": [a["id"] for a in net["airports"]], "start_min": 0, "duration_min": 2000})
    client.post("/api/scenario/disruptions", json={"type": "medical_emergency", "target_ids": ["COM-YCS"], "start_min": 90})
    n = client.post("/api/run/northstar").json()
    assert n["status"] == "NO_FEASIBLE_SOLUTION"
    d = client.get("/api/decisions").json()
    assert any(r["status"] == "unserved" and r["reasons"] for r in d)
    client.post("/api/scenario/reset")


def test_preset_detail_and_experiment_scenario_loading(client):
    r = client.get("/api/presets/kivalliq_wildfire"); assert r.status_code == 200
    d = r.json(); assert [x["id"] for x in d["disruptions"]] == ["AF-1", "WF-1", "ME-1", "CG-1"]  # start order
    assert client.get("/api/presets/nope").status_code == 404
    r = client.get("/api/experiments/scenarios/gen-42-001")
    if r.status_code == 200:
        sc = r.json(); assert sc["id"] == "gen-42-001"
        r2 = client.post("/api/scenario/load", json={"scenario": sc}); assert r2.status_code == 200
        assert r2.json()["scenario"]["id"] == "gen-42-001"
    else:
        assert r.status_code == 404
    client.post("/api/scenario/reset")


def test_result_cache_is_transparent_and_identical(client):
    client.post("/api/scenario/load", json={"preset_id": "baffin_blizzard"})
    a = client.post("/api/run/northstar", json={"policy_id": "balanced"}).json()
    assert a["cached"] is False and a["compute_ms"] is not None
    client.post("/api/scenario/load", json={"preset_id": "healthy"})
    client.post("/api/scenario/load", json={"preset_id": "baffin_blizzard"})
    b = client.post("/api/run/northstar", json={"policy_id": "balanced"}).json()
    assert b["cached"] is True
    assert b["metrics"] == a["metrics"] and b["assignments"] == a["assignments"]
    h = client.get("/api/health").json(); assert "warmup" in h
    client.post("/api/scenario/reset")


def test_decision_record_response_fields_are_consistent(client):
    """response_min is a clock time (minutes since 06:00); response_after_request_min is the duration and must equal
    the vs_baseline NORTHSTAR value for completed medevacs. Guards the why-card against reading a clock time as a
    duration (found in the overnight sprint: the Chesterfield Inlet medevac showed "6h after request" for a 4h response)."""
    client.post("/api/scenario/load", json={"preset_id": "kivalliq_wildfire"})
    client.post("/api/run/baseline")
    client.post("/api/run/northstar", json={"policy_id": "balanced"})
    recs = client.get("/api/decisions").json()
    meds = [r for r in recs if r["mission_type"] == "medical" and r["status"] == "completed"]
    assert meds
    for r in meds:
        assert r["release_min"] is not None and r["response_min"] is not None
        assert r["response_after_request_min"] == r["response_min"] - r["release_min"] >= 0
        vb = r["vs_baseline"]
        if vb and vb["metric"] == "response_min" and vb["northstar_value"] is not None:
            assert vb["northstar_value"] == r["response_after_request_min"]


def test_warm_up_precomputes_every_policy_profile():
    """The start-up warm-up must cover do-nothing, baseline and NORTHSTAR for every policy profile, balanced first,
    so that a live profile switch on stage is served from the same cache as the guided demo (V6)."""
    import time
    from northstar.api.session import Session
    from northstar.config import POLICIES, get_policy
    from northstar.scenarios.presets import get_preset

    s = Session()
    s.warm_up(preset_ids=["baffin_blizzard"])
    assert s.warmup["total"] == 2 + len(POLICIES)
    assert s.warmup["policies"][0] == "balanced"
    t0 = time.time()
    while s.warmup["state"] == "running" and time.time() - t0 < 120:
        time.sleep(0.2)
    assert s.warmup["state"] == "done", s.warmup
    assert s.warmup["done"] == s.warmup["total"]
    sc = get_preset("baffin_blizzard")
    for pid in POLICIES:
        r = s.compute(sc, "northstar", get_policy(pid))
        assert r["cached"] is True and "metrics" in r, pid
