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
