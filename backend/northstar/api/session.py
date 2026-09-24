"""One in-memory demo session: the loaded network, the active scenario and the latest runs."""
from __future__ import annotations

import hashlib
import json
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from northstar.config import POLICIES, SOLVER_WORKERS_API, Policy, get_policy
from northstar.data.loader import load_network
from northstar.explain.explain import explain
from northstar.metrics.evaluate import evaluate
from northstar.models import Disruption, Metrics, Network, Scenario, Trace
from northstar.scenarios.presets import get_preset
from northstar.sim.simulator import initial_state, run
from northstar.strategies.baseline import BaselineStrategy
from northstar.strategies.northstar import NorthstarStrategy
from northstar.strategies.schedule_only import ScheduleOnlyStrategy


class Session:
    def __init__(self, processed_dir: Path | None = None) -> None:
        self.network: Network = load_network(processed_dir)
        self.scenario: Scenario = get_preset("healthy")
        self.lock = threading.Lock()
        self.results: dict[str, dict] = {}
        self.decisions: list[dict] = []
        self.policy_id = "balanced"
        self.jobs: dict[str, dict] = {}
        # Result cache: identical scenario content + strategy + policy -> identical result (the engine is
        # deterministic), so a repeated run is served instantly. Entries record when and how long the real
        # computation took; nothing is ever synthesised.
        self.cache: dict[str, dict] = {}
        self.cache_lock = threading.Lock()
        self.warmup: dict = {"state": "idle", "done": 0, "total": 0, "presets": []}

    # ---- scenario -------------------------------------------------------
    def load_preset(self, preset_id: str) -> None:
        with self.lock:
            self.scenario = get_preset(preset_id)
            self._invalidate()

    def load_scenario(self, scenario: Scenario) -> None:
        with self.lock:
            self.scenario = scenario
            self._invalidate()

    def reset(self) -> None:
        with self.lock:
            self.scenario = get_preset("healthy")
            self._invalidate()

    def add_disruption(self, d: Disruption) -> Disruption:
        with self.lock:
            if not d.id:
                prefix = {"airport_closure": "CL", "wildfire": "WF", "severe_weather": "WX", "aircraft_failure": "AF",
                          "medical_emergency": "ME", "essential_cargo_request": "CG"}[d.type.value]
                existing = {x.id for x in self.scenario.disruptions}
                n = 1
                while f"{prefix}-{n}" in existing:
                    n += 1
                d.id = f"{prefix}-{n}"
            sc = self.scenario.model_copy(deep=True)
            sc.disruptions.append(d)
            if sc.id == "healthy" or "custom" not in sc.tags:
                sc = sc.model_copy(update={"id": f"custom-{uuid.uuid4().hex[:6]}" if sc.id == "healthy" else sc.id,
                                           "name": sc.name if sc.id != "healthy" else "Custom scenario",
                                           "tags": sorted(set(sc.tags) | {"custom"})})
            self.scenario = sc
            self._invalidate()
            return d

    def remove_disruption(self, did: str) -> bool:
        with self.lock:
            before = len(self.scenario.disruptions)
            self.scenario.disruptions = [d for d in self.scenario.disruptions if d.id != did]
            self._invalidate()
            return len(self.scenario.disruptions) < before

    def _invalidate(self) -> None:
        self.results = {}
        self.decisions = []

    # ---- runs -----------------------------------------------------------
    def state_t0(self):
        return initial_state(self.network, self.scenario)

    @staticmethod
    def cache_key(scenario: Scenario, name: str, policy: Policy | None) -> str:
        payload = {
            "horizon": scenario.horizon_min, "step": scenario.step_min,
            "disruptions": sorted((d.model_dump() for d in scenario.disruptions), key=lambda d: (d["start_min"], d["id"])),
            "strategy": name, "policy": policy.model_dump() if policy else None,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()

    def _policy_for(self, policy_id: str | None, weights: dict | None) -> Policy:
        pol = get_policy(policy_id or self.policy_id)
        if weights:
            clean = {}
            for k, v in weights.items():
                if k not in Policy.model_fields or k in ("id", "name", "description"):
                    continue
                if isinstance(v, dict):
                    current = getattr(pol, k)
                    cast = {(int(kk) if isinstance(next(iter(current)), int) else str(kk)): float(vv) for kk, vv in v.items()}
                    clean[k] = {**current, **cast}
                else:
                    clean[k] = float(v)
            pol = pol.model_copy(update={**clean, "id": "custom", "name": "Custom weights",
                                         "description": f"Based on {pol.name} with overrides: {sorted(clean)}"})
        return pol

    def compute(self, scenario: Scenario, name: str, policy: Policy | None) -> dict:
        """Run (or fetch from cache) one strategy on one scenario. Pure: does not touch session state."""
        key = self.cache_key(scenario, name, policy)
        with self.cache_lock:
            hit = self.cache.get(key)
        if hit is not None:
            return {**hit, "cached": True}
        if name == "do_nothing":
            strat = ScheduleOnlyStrategy()
        elif name == "baseline":
            strat = BaselineStrategy()
        elif name == "northstar":
            strat = NorthstarStrategy(policy=policy, workers=SOLVER_WORKERS_API)
        else:
            raise KeyError(name)
        t0 = time.perf_counter()
        trace = run(self.network, scenario, strat)
        metrics = evaluate(trace, self.network)
        result = {"strategy": name, "trace": trace, "metrics": metrics,
                  "contexts": getattr(strat, "contexts", []), "policy": getattr(strat, "policy", None),
                  "compute_ms": int((time.perf_counter() - t0) * 1000),
                  "computed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "cached": False}
        with self.cache_lock:
            self.cache[key] = result
        return result

    def warm_up(self, preset_ids: list[str] | None = None) -> None:
        """Compute do-nothing, baseline and NORTHSTAR for the presets in a background thread so that the first
        click during a demo is served from cache. Same engine, same code path as a live run. Two passes: the
        balanced profile for every preset first (the guided demo's path), then the other policy profiles, so a
        live profile switch on stage is also instant. Custom scenarios are never precomputed."""
        from northstar.scenarios.presets import PRESETS
        ids = preset_ids or [p for p in PRESETS if p != "healthy"]
        others = [pid for pid in POLICIES if pid != "balanced"]
        self.warmup = {"state": "running", "done": 0, "total": len(ids) * (3 + len(others)), "presets": ids,
                       "policies": ["balanced", *others]}

        def work():
            try:
                for pid in ids:
                    sc = get_preset(pid)
                    for name, pol in (("do_nothing", None), ("baseline", None), ("northstar", get_policy("balanced"))):
                        self.compute(sc, name, pol)
                        self.warmup["done"] += 1
                for pid in ids:
                    sc = get_preset(pid)
                    for pol_id in others:
                        self.compute(sc, "northstar", get_policy(pol_id))
                        self.warmup["done"] += 1
                self.warmup["state"] = "done"
            except Exception as e:  # noqa: BLE001
                self.warmup["state"] = "error"
                self.warmup["error"] = repr(e)

        threading.Thread(target=work, daemon=True, name="northstar-warmup").start()

    def run_strategy(self, name: str, policy_id: str | None = None, weights: dict | None = None) -> dict:
        policy = self._policy_for(policy_id, weights) if name == "northstar" else None
        if policy is not None:
            self.policy_id = policy.id
        result = self.compute(self.scenario, name, policy)
        with self.lock:
            self.results[name] = result
            if name == "northstar" or (name == "baseline" and "northstar" in self.results):
                self._explain()
        return result

    def _explain(self) -> None:
        n = self.results.get("northstar")
        b = self.results.get("baseline")
        if n is None:
            return
        self.decisions = explain(self.network, n["trace"], b["trace"] if b else None, n["contexts"])

    def ensure(self, name: str) -> dict:
        if name not in self.results:
            self.run_strategy(name)
        return self.results[name]
