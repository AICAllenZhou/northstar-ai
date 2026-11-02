#!/usr/bin/env python3
"""Drive the ten-step demo sequence against a running backend and print each step's headline numbers.

    uv run python scripts/smoke_test.py [--base http://localhost:8000] [--preset kivalliq_wildfire] [--quiet]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request


def call(base: str, method: str, path: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--preset", default="kivalliq_wildfire")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()
    say = (lambda *x: None) if a.quiet else print
    for attempt in range(30):
        try:
            h = call(a.base, "GET", "/api/health"); break
        except Exception:  # noqa: BLE001
            time.sleep(1)
    else:
        print("backend not reachable at", a.base); return 1
    if not h["datasets_loaded"]:
        print("datasets not loaded:", h.get("dataset_error")); return 1
    say("1. healthy network:", call(a.base, "POST", "/api/scenario/reset")["scenario"]["name"])
    st = call(a.base, "POST", "/api/scenario/load", {"preset_id": a.preset})
    say(f"2. disruption: {st['scenario']['name']} ({len(st['disruption_effects'])} disruptions, {len(st['missions'])} missions)")
    imp = call(a.base, "GET", "/api/scenario/impact")
    m0 = imp["do_nothing"]["metrics"]
    say(f"3. impact (do nothing): peak disconnected {m0['disconnected_communities_peak']}, medical unserved {m0['medical_unserved']}, cancelled {m0['cancelled_flights']}")
    t0 = time.time(); b = call(a.base, "POST", "/api/run/baseline"); mb = b["metrics"]
    say(f"4. baseline ({time.time()-t0:.1f}s): disconnected-h {mb['disconnected_community_hours']}, medical {mb['medical_response_avg_min']} min, cargo delay {mb['cargo_delay_avg_min']}, pax delay {mb['passenger_delay_avg_min']}")
    t0 = time.time(); n = call(a.base, "POST", "/api/run/northstar", {"policy_id": "balanced"}); mn = n["metrics"]
    say(f"5. NORTHSTAR ({time.time()-t0:.1f}s, status {n['status']}, {n['solver']['calls']} solver calls, max {n['solver']['max_wall_ms']} ms): "
        f"disconnected-h {mn['disconnected_community_hours']}, medical {mn['medical_response_avg_min']} min, cargo delay {mn['cargo_delay_avg_min']}, pax delay {mn['passenger_delay_avg_min']}")
    c = call(a.base, "GET", "/api/compare")
    better = sum(1 for d in c["deltas"].values() if d["better"]); worse = sum(1 for d in c["deltas"].values() if d["better"] is False)
    say(f"7. compare: NORTHSTAR better on {better} metrics, worse on {worse}")
    d = call(a.base, "GET", "/api/decisions")
    med = next((x for x in d if x["mission_type"] == "medical"), d[0] if d else None)
    say("8. decision:", med["summary"] if med else "none")
    try:
        e = call(a.base, "GET", "/api/experiments/latest")
        say(f"9. research: {e['n_scenarios']} scenarios, seed {e['seed']}")
    except Exception:  # noqa: BLE001
        say("9. research: no experiment results yet")
    say("10. responsible AI disclaimer present:", "disclaimer" in call(a.base, "GET", "/api/network"))
    # Leave the shared session as we found it: a healthy network. (The demo launcher relies on this.)
    call(a.base, "POST", "/api/scenario/reset")
    say("session reset to the healthy network")
    if not a.quiet:
        print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
