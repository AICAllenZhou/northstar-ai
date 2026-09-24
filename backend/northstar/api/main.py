"""FastAPI application. One in-memory session; everything runs locally and offline."""
from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import ortools
from northstar.api.schemas import DisruptionIn, ExperimentRequest, LoadRequest, NorthstarRequest
from northstar.api.session import Session
from northstar.config import DISCLAIMER, POLICIES, PROCESSED_DIR, RESULTS_DIR, REPO_ROOT, STEP_MIN
from northstar.data.loader import DatasetError, load_metadata
from northstar.metrics.info import METRIC_INFO, PRIMARY_METRICS
from northstar.models import DisruptionType, MissionType
from northstar.scenarios.presets import list_presets
from northstar.sim.disruptions import affected_airports

VERSION = "0.1.0"

app = FastAPI(title="NORTHSTAR AI", version=VERSION, description="Northern aviation resilience simulation (research prototype)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_session: Session | None = None
_session_error: str | None = None


def session() -> Session:
    global _session, _session_error
    if _session is None:
        try:
            _session = Session()
        except DatasetError as e:
            _session_error = str(e)
            raise HTTPException(status_code=503, detail={"error": "datasets missing", "detail": str(e)})
    return _session


@app.exception_handler(KeyError)
async def key_error(_, exc: KeyError):
    return JSONResponse(status_code=404, content={"error": "not found", "detail": str(exc)})


@app.exception_handler(ValueError)
async def value_error(_, exc: ValueError):
    return JSONResponse(status_code=400, content={"error": "bad request", "detail": str(exc)})


# ---------------------------------------------------------------------------
@app.get("/api/health")
def health():
    try:
        s = session()
        ok = True
    except HTTPException:
        ok = False
    return {"status": "ok" if ok else "degraded", "version": VERSION, "datasets_loaded": ok,
            "ortools_version": ortools.__version__, "offline": True, "dataset_error": _session_error}


@app.get("/api/network")
def network():
    s = session()
    net = s.network
    return {
        "airports": [a.model_dump() for a in net.airports.values()],
        "communities": [c.model_dump() for c in net.communities.values()],
        "aircraft": [a.model_dump() for a in net.aircraft.values()],
        "routes": [r.model_dump() for r in net.routes.values()],
        "schedule": [l.model_dump() for l in net.schedule],
        "hubs": {"medical": net.hub_ids("medical"), "cargo": net.hub_ids("cargo"), "passenger": net.hub_ids("passenger")},
        "metadata": load_metadata(),
        "disclaimer": DISCLAIMER,
        "step_min": STEP_MIN,
        "clock_start": "06:00",
    }


@app.get("/api/basemap/{layer}")
def basemap(layer: str):
    names = {"countries": "ne_50m_countries_northamerica.geojson", "provinces": "ne_50m_canada_provinces.geojson",
             "lakes": "ne_50m_lakes_canada.geojson"}
    if layer not in names:
        raise HTTPException(404, detail={"error": "unknown layer", "detail": layer})
    p = PROCESSED_DIR / "basemap" / names[layer]
    if not p.exists():
        raise HTTPException(503, detail={"error": "basemap missing", "detail": str(p)})
    return FileResponse(p, media_type="application/geo+json")


@app.get("/api/presets")
def presets():
    return list_presets()


@app.get("/api/policies")
def policies():
    return [{"id": p.id, "name": p.name, "description": p.description, "weights": p.model_dump(exclude={"id", "name", "description"})}
            for p in POLICIES.values()]


@app.get("/api/metrics/info")
def metrics_info():
    return {"info": METRIC_INFO, "primary": PRIMARY_METRICS}


# ---------------------------------------------------------------------------
def _scenario_state(s: Session) -> dict:
    st = s.state_t0()
    net = s.network
    # status of every element over the horizon is derived by the simulator; here: at t=0 and the list of planned effects
    effects = []
    for d in s.scenario.disruptions:
        eff = {"id": d.id, "type": d.type.value, "label": d.label or d.type.value.replace("_", " "), "start_min": d.start_min,
               "end_min": d.end_min, "severity": d.severity, "target_ids": d.target_ids,
               "center": [d.center_lat, d.center_lon] if d.center_lat is not None else None, "radius_km": d.radius_km,
               "params": d.params}
        if d.type in (DisruptionType.airport_closure, DisruptionType.wildfire, DisruptionType.severe_weather):
            apts = affected_airports(net, d)
            closes = d.type == DisruptionType.airport_closure or (d.type == DisruptionType.wildfire and d.severity >= 0.5) \
                or (d.type == DisruptionType.severe_weather and d.severity >= 0.8)
            eff["affected_airports"] = apts
            eff["closes_airports"] = closes
        effects.append(eff)
    missions = []
    for ms in st.missions.values():
        m = ms.mission
        missions.append({**m.model_dump(), "origin": m.origin, "dest": m.dest, "is_critical": m.is_critical})
    return {
        "scenario": s.scenario.model_dump(),
        "disruption_effects": effects,
        "missions": missions,
        "network_status_t0": {"closed_airports": sorted(st.closed_airports), "closed_routes": sorted(st.closed_routes),
                              "failed_aircraft": sorted(st.failed_aircraft(0))},
        "structurally_disconnected_t0": sorted(st.structural_disconnected()),
        "has_do_nothing": "do_nothing" in s.results, "has_baseline": "baseline" in s.results, "has_northstar": "northstar" in s.results,
        "policy_id": s.policy_id,
    }


@app.get("/api/scenario")
def get_scenario():
    return _scenario_state(session())


@app.post("/api/scenario/load")
def load_scenario(req: LoadRequest):
    s = session()
    if req.preset_id:
        s.load_preset(req.preset_id)
    elif req.scenario:
        s.load_scenario(req.scenario)
    else:
        raise HTTPException(400, detail={"error": "bad request", "detail": "preset_id or scenario required"})
    return _scenario_state(s)


@app.post("/api/scenario/reset")
def reset_scenario():
    s = session()
    s.reset()
    return _scenario_state(s)


@app.post("/api/scenario/disruptions")
def add_disruption(d: DisruptionIn):
    s = session()
    net = s.network
    for t in d.target_ids:
        if d.type == DisruptionType.aircraft_failure:
            if t not in net.aircraft:
                raise HTTPException(400, detail={"error": "unknown aircraft", "detail": t})
        elif d.type in (DisruptionType.medical_emergency, DisruptionType.essential_cargo_request):
            if t not in net.communities and t not in net.airports:
                raise HTTPException(400, detail={"error": "unknown community", "detail": t})
        elif t not in net.airports:
            raise HTTPException(400, detail={"error": "unknown airport", "detail": t})
    if d.type == DisruptionType.wildfire and not d.target_ids and d.center_lat is None:
        raise HTTPException(400, detail={"error": "bad request", "detail": "wildfire needs target_ids or a center/radius"})
    if d.start_min % STEP_MIN or d.duration_min % STEP_MIN:
        d.start_min = (d.start_min // STEP_MIN) * STEP_MIN
        d.duration_min = max(STEP_MIN, -(-d.duration_min // STEP_MIN) * STEP_MIN)
    s.add_disruption(d)
    return _scenario_state(s)


@app.delete("/api/scenario/disruptions/{did}")
def remove_disruption(did: str):
    s = session()
    if not s.remove_disruption(did):
        raise HTTPException(404, detail={"error": "not found", "detail": did})
    return _scenario_state(s)


# ---------------------------------------------------------------------------
def _run_result(s: Session, name: str) -> dict:
    r = s.ensure(name)
    trace = r["trace"]
    m = r["metrics"]
    outcomes = trace.missions
    assignments = [o.model_dump() for o in outcomes.values()]
    solver = None
    if trace.solver_calls:
        calls = trace.solver_calls
        solver = {"calls": len(calls), "total_wall_ms": sum(c["wall_ms"] for c in calls),
                  "max_wall_ms": max(c["wall_ms"] for c in calls), "statuses": sorted({c["status"] for c in calls}),
                  "policy": r["policy"].id if r.get("policy") else None}
    return {
        "strategy": name, "status": trace.status, "metrics": m.model_dump(), "assignments": assignments,
        "trace": {"step_min": trace.step_min, "horizon_min": trace.horizon_min,
                  "snapshots": [sn.model_dump() for sn in trace.snapshots],
                  "legs": [l.model_dump() for l in trace.legs]},
        "replans": trace.replans, "solver": solver, "warnings": trace.warnings,
        "events": [e for e in trace.events if e["type"] in ("MISSION_DEPARTED", "MISSION_COMPLETED", "MISSION_RETURNED",
                                                             "DISRUPTION_START", "DISRUPTION_END", "AIRCRAFT_FAILED",
                                                             "REROUTED_EN_ROUTE", "ASSIGNMENT_INFEASIBLE")],
        "policy": r["policy"].model_dump() if r.get("policy") else None,
        "decisions": s.decisions if name == "northstar" else None,
    }


@app.get("/api/scenario/impact")
def impact():
    s = session()
    r = s.ensure("do_nothing")
    trace = r["trace"]
    # structural disconnection timeline and affected scheduled flights under "do nothing"
    timeline = [{"t": sn.t, "structural": sn.structural_disconnected, "service": sn.service_disconnected,
                 "closed_airports": sn.closed_airports, "failed_aircraft": sn.failed_aircraft} for sn in trace.snapshots]
    affected = [o.model_dump() for o in trace.missions.values() if o.status != "completed" or o.assignment_changes]
    peak_t = max(trace.snapshots, key=lambda sn: len(sn.disconnected)).t if trace.snapshots else 0
    return {"do_nothing": _run_result(s, "do_nothing"), "timeline": timeline, "affected_missions": affected,
            "peak_disconnected_t": peak_t,
            "new_missions": [o.model_dump() for o in trace.missions.values() if o.type != MissionType.passenger]}


@app.post("/api/run/baseline")
def run_baseline():
    s = session()
    s.run_strategy("baseline")
    return _run_result(s, "baseline")


@app.post("/api/run/northstar")
def run_northstar(req: NorthstarRequest | None = None):
    s = session()
    req = req or NorthstarRequest()
    s.run_strategy("northstar", req.policy_id, req.weights)
    return _run_result(s, "northstar")


@app.get("/api/compare")
def compare():
    s = session()
    out = {}
    for name in ("do_nothing", "baseline", "northstar"):
        if name in s.results:
            out[name] = s.results[name]["metrics"].model_dump()
    deltas = {}
    if "baseline" in out and "northstar" in out:
        for k in METRIC_INFO:
            b, n = out["baseline"].get(k), out["northstar"].get(k)
            if isinstance(b, (int, float)) and isinstance(n, (int, float)):
                direction = METRIC_INFO[k]["direction"]
                if n == b or direction == "info":
                    better = None  # tie (or informational metric): neither better nor worse
                else:
                    better = (n < b) if direction == "lower" else (n > b)
                deltas[k] = {"delta": round(n - b, 2), "direction": direction, "better": better}
    return {**out, "deltas": deltas, "metric_info": METRIC_INFO, "primary": PRIMARY_METRICS, "policy_id": s.policy_id}


@app.get("/api/decisions")
def decisions():
    s = session()
    if "northstar" not in s.results:
        raise HTTPException(409, detail={"error": "no NORTHSTAR run yet", "detail": "POST /api/run/northstar first"})
    return s.decisions


# ---------------------------------------------------------------------------
@app.get("/api/experiments/latest")
def experiments_latest():
    p = RESULTS_DIR / "summary.json"
    if not p.exists():
        raise HTTPException(404, detail={"error": "no experiment results", "detail": f"run experiments/run_experiments.py to create {p}"})
    with open(p, encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/experiments/results.csv")
def experiments_csv():
    p = RESULTS_DIR / "results.csv"
    if not p.exists():
        raise HTTPException(404, detail={"error": "no experiment results", "detail": str(p)})
    return FileResponse(p, media_type="text/csv", filename="results.csv")


@app.post("/api/experiments/run")
def experiments_run(req: ExperimentRequest):
    s = session()
    job_id = uuid.uuid4().hex[:8]
    job = {"id": job_id, "state": "running", "done": 0, "total": req.n, "summary": None, "error": None}
    s.jobs[job_id] = job

    def work():
        try:
            import sys
            if str(REPO_ROOT) not in sys.path:
                sys.path.insert(0, str(REPO_ROOT))
            from experiments.run_experiments import run_experiment  # type: ignore
            summary = run_experiment(n=req.n, seed=req.seed, policies=[req.policy_id], out_dir=None,
                                     progress=lambda i: job.__setitem__("done", i), workers=1, network=s.network)
            job["summary"], job["state"] = summary, "done"
        except Exception as e:  # noqa: BLE001
            job["state"], job["error"] = "error", repr(e)

    threading.Thread(target=work, daemon=True).start()
    return {"job_id": job_id}


@app.get("/api/experiments/jobs/{job_id}")
def experiments_job(job_id: str):
    s = session()
    if job_id not in s.jobs:
        raise HTTPException(404, detail={"error": "unknown job", "detail": job_id})
    return s.jobs[job_id]


# ---------------------------------------------------------------------------
_dist = REPO_ROOT / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")
