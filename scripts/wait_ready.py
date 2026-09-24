#!/usr/bin/env python3
"""Wait until a NORTHSTAR backend has loaded its datasets and finished precomputing the presets.

    uv run python scripts/wait_ready.py [--base http://localhost:8000] [--timeout 240]

Polls /api/health (read-only; it never changes the session) and prints the warm-up progress.
Exit 0 when warm-up is done, 1 on timeout or a dataset error, 2 if the backend never answered.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request


def health(base: str) -> dict | None:
    try:
        with urllib.request.urlopen(base + "/api/health", timeout=5) as r:
            return json.loads(r.read().decode())
    except (urllib.error.URLError, OSError, ValueError):
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--timeout", type=float, default=240)
    a = ap.parse_args()
    t0 = time.time()
    answered = False
    last = -1
    while time.time() - t0 < a.timeout:
        h = health(a.base)
        if h is None:
            time.sleep(0.5)
            continue
        answered = True
        if not h.get("datasets_loaded"):
            print(f"  datasets not loaded: {h.get('dataset_error')}")
            return 1
        w = h.get("warmup") or {}
        done, total, state = int(w.get("done", 0)), int(w.get("total", 0)), w.get("state")
        if state in (None, "off", "disabled"):
            print("  warm-up disabled; presets will be computed on first use")
            return 0
        if done != last:
            print(f"  precomputing presets: {done}/{total}", flush=True)
            last = done
        if state == "done":
            pols = w.get("policies") or ["balanced"]
            print(f"  ready in {time.time() - t0:.0f} s: {len(w.get('presets', []))} presets precomputed "
                  f"(do nothing, baseline, NORTHSTAR × {len(pols)} profile{'s' if len(pols) != 1 else ''} each) · "
                  f"OR-Tools {h.get('ortools_version')} · offline={h.get('offline')}")
            return 0
        time.sleep(1.0)
    print("  backend never answered" if not answered else "  warm-up did not finish in time; the demo still works, first runs will solve live")
    return 2 if not answered else 1


if __name__ == "__main__":
    sys.exit(main())
