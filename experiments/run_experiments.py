#!/usr/bin/env python3
"""Reproducible paired experiment: baseline vs NORTHSTAR on N seeded scenarios.

Usage (from repo root):
    cd backend && uv run python ../experiments/run_experiments.py --n 100 --seed 42
    cd backend && uv run python ../experiments/run_experiments.py --verify      # re-run and compare with committed CSV

Outputs (experiments/results/): results.csv, scenarios.jsonl, summary.json, summary.md
See docs/DATA_AND_EXPERIMENT_METHODOLOGY.md for definitions. Nothing here filters or reorders scenarios after the fact.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import platform
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median, pstdev

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from northstar.config import POLICIES, get_policy  # noqa: E402
from northstar.data.loader import load_network  # noqa: E402
from northstar.metrics.evaluate import evaluate  # noqa: E402
from northstar.metrics.info import METRIC_INFO, PRIMARY_METRICS  # noqa: E402
from northstar.scenarios.generator import generate_scenario  # noqa: E402
from northstar.sim.simulator import run  # noqa: E402
from northstar.strategies.baseline import BaselineStrategy  # noqa: E402
from northstar.strategies.northstar import NorthstarStrategy  # noqa: E402
from northstar.strategies.schedule_only import ScheduleOnlyStrategy  # noqa: E402

RESULTS = REPO / "experiments" / "results"
TIE_TOL = {"min": 1.0, "h": 0.01, "km": 0.5, "%": 0.01}


def _row(scenario, strategy, policy, trace, metrics, wall):
    r = {"scenario_id": scenario.id, "scenario_index": int(scenario.id.split("-")[-1]), "seed": scenario.seed,
         "strategy": strategy, "policy": policy, "run_status": trace.status, "wall_s": round(wall, 3),
         "n_disruptions": len(scenario.disruptions), "scenario_description": scenario.description}
    r.update(metrics.model_dump())
    r.update(solver_counts(trace.solver_calls))
    r["rejected_assignments"] = sum(1 for e in trace.events if e["type"] == "REJECTED_ASSIGNMENT")
    r["trace_hash"] = trace.hash()
    return r


def solver_counts(calls: list[dict]) -> dict:
    """Bucket every replanning decision the optimizer recorded, so the buckets always sum to the total.

    `solver_calls` counts decision moments; only `solver_cpsat_calls` built and solved a CP-SAT model.
    A moment where no aircraft could reach any pending mission is reported as NO_FEASIBLE_SOLUTION
    without a solve (wall 0 ms) and is counted separately, not as a time-out or a failure."""
    optimal = sum(1 for c in calls if c["status"] == "OPTIMAL")
    feasible = sum(1 for c in calls if c["status"] == "FEASIBLE")
    no_feasible = sum(1 for c in calls if c["status"] == "NO_FEASIBLE_SOLUTION")
    timeout = len(calls) - optimal - feasible - no_feasible
    return {"solver_calls": len(calls), "solver_cpsat_calls": optimal + feasible + timeout,
            "solver_optimal_calls": optimal, "solver_feasible_calls": feasible,
            "solver_no_feasible_calls": no_feasible, "solver_timeout_calls": timeout,
            "solver_max_wall_ms": max((c["wall_ms"] for c in calls), default=0)}


def _one(args):
    seed, index, policies = args
    net = load_network()
    sc = generate_scenario(net, seed, index)
    rows = []
    for name, strat, pol in [("do_nothing", ScheduleOnlyStrategy(), "-"), ("baseline", BaselineStrategy(), "-")]:
        t0 = time.perf_counter(); tr = run(net, sc, strat); w = time.perf_counter() - t0
        rows.append(_row(sc, name, pol, tr, evaluate(tr, net), w))
    for pid in policies:
        t0 = time.perf_counter(); tr = run(net, sc, NorthstarStrategy(policy=get_policy(pid))); w = time.perf_counter() - t0
        rows.append(_row(sc, "northstar", pid, tr, evaluate(tr, net), w))
    return sc.model_dump(), rows


def sign_test_p(wins: int, losses: int) -> float | None:
    n = wins + losses
    if n == 0:
        return None
    k = min(wins, losses)
    p = sum(math.comb(n, i) for i in range(0, k + 1)) / 2 ** n * 2
    return min(1.0, p)


def _stats(vals):
    vals = [v for v in vals if v is not None]
    if not vals:
        return {"mean": None, "median": None, "std": None, "n": 0}
    return {"mean": round(mean(vals), 2), "median": round(median(vals), 2), "std": round(pstdev(vals), 2) if len(vals) > 1 else 0.0, "n": len(vals)}


def summarize(rows: list[dict], scenarios: list[dict], seed: int, policies: list[str], meta: dict) -> dict:
    by = {}
    for r in rows:
        by.setdefault((r["scenario_id"], r["strategy"], r["policy"]), r)
    sids = sorted({r["scenario_id"] for r in rows}, key=lambda s: int(s.split("-")[-1]))
    out = {"generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "n_scenarios": len(sids), "seed": seed,
           "policies": policies, "primary_policy": policies[0], "metric_info": METRIC_INFO, "primary_metrics": PRIMARY_METRICS,
           **meta, "comparisons": {}, "do_nothing": {}, "censored": {}, "solver": {}, "tradeoffs": {}, "per_scenario": {}}
    for k in METRIC_INFO:
        out["do_nothing"][k] = _stats([by[(s, "do_nothing", "-")].get(k) for s in sids if (s, "do_nothing", "-") in by])
    for pid in policies:
        comp, per = {}, []
        for k, info in METRIC_INFO.items():
            b = [by[(s, "baseline", "-")].get(k) for s in sids]
            n = [by[(s, "northstar", pid)].get(k) for s in sids]
            pairs = [(x, y) for x, y in zip(b, n) if x is not None and y is not None]
            tol = TIE_TOL.get(info["unit"], 0.0)
            wins = losses = ties = 0
            for x, y in pairs:
                d = y - x
                if abs(d) <= tol:
                    ties += 1
                elif (d < 0 and info["direction"] == "lower") or (d > 0 and info["direction"] == "higher"):
                    wins += 1
                elif info["direction"] == "info":
                    ties += 1
                else:
                    losses += 1
            bs, ns = _stats([x for x, _ in pairs]), _stats([y for _, y in pairs])
            diff = round(mean([y - x for x, y in pairs]), 2) if pairs else None
            imp = None
            if bs["mean"] not in (None, 0) and ns["mean"] is not None and info["direction"] in ("lower", "higher"):
                imp = round(100.0 * (bs["mean"] - ns["mean"]) / abs(bs["mean"]), 1)
                if info["direction"] == "higher":
                    imp = -imp
            comp[k] = {"label": info["label"], "unit": info["unit"], "direction": info["direction"], "baseline": bs, "northstar": ns,
                       "mean_diff": diff, "improvement_pct": imp, "wins": wins, "losses": losses, "ties": ties,
                       "p_value": sign_test_p(wins, losses), "significant": (sign_test_p(wins, losses) or 1.0) < 0.05,
                       "northstar_better_overall": wins > losses}
        out["comparisons"][pid] = comp
        out["tradeoffs"][pid] = [k for k, c in comp.items() if c["losses"] > c["wins"] and c["direction"] != "info"]
        out["censored"][pid] = {
            "medical_unserved_baseline": sum(by[(s, "baseline", "-")]["medical_unserved"] for s in sids),
            "medical_unserved_northstar": sum(by[(s, "northstar", pid)]["medical_unserved"] for s in sids),
            "cargo_unserved_baseline": sum(by[(s, "baseline", "-")]["cargo_unserved"] for s in sids),
            "cargo_unserved_northstar": sum(by[(s, "northstar", pid)]["cargo_unserved"] for s in sids),
            "cancelled_flights_baseline": sum(by[(s, "baseline", "-")]["cancelled_flights"] for s in sids),
            "cancelled_flights_northstar": sum(by[(s, "northstar", pid)]["cancelled_flights"] for s in sids),
            "medical_missions_total": sum(by[(s, "baseline", "-")]["medical_count"] for s in sids),
            "cargo_missions_total": sum(by[(s, "baseline", "-")]["cargo_count"] for s in sids),
        }
        ns_rows = [by[(s, "northstar", pid)] for s in sids]
        out["solver"][pid] = {"calls": sum(r["solver_calls"] for r in ns_rows),
                              "cpsat_calls": sum(r["solver_cpsat_calls"] for r in ns_rows),
                              "optimal_calls": sum(r["solver_optimal_calls"] for r in ns_rows),
                              "feasible_not_optimal_calls": sum(r["solver_feasible_calls"] for r in ns_rows),
                              "no_feasible_calls": sum(r["solver_no_feasible_calls"] for r in ns_rows),
                              "timeout_calls": sum(r["solver_timeout_calls"] for r in ns_rows),
                              "max_wall_ms": max(r["solver_max_wall_ms"] for r in ns_rows),
                              "mean_run_wall_s": round(mean(r["wall_s"] for r in ns_rows), 2),
                              "runs_not_ok": sum(1 for r in ns_rows if r["run_status"] != "OK"),
                              "rejected_assignments": sum(r["rejected_assignments"] for r in ns_rows)}
        for s in sids:
            per.append({"scenario_id": s, "description": by[(s, "baseline", "-")]["scenario_description"],
                        **{f"baseline_{k}": by[(s, "baseline", "-")].get(k) for k in PRIMARY_METRICS},
                        **{f"northstar_{k}": by[(s, "northstar", pid)].get(k) for k in PRIMARY_METRICS}})
        out["per_scenario"][pid] = per
    return out


def write_markdown(summary: dict, path: Path) -> None:
    pid = summary["primary_policy"]
    comp = summary["comparisons"][pid]
    lines = [f"# NORTHSTAR AI — Experiment summary", "",
             f"Generated {summary['generated_utc']} · {summary['n_scenarios']} paired scenarios · master seed {summary['seed']} · "
             f"policy `{pid}` · commit `{summary.get('git_commit')}`{' (uncommitted changes present)' if summary.get('git_dirty') else ''} · OR-Tools {summary.get('ortools_version')}", "",
             "Every scenario was run once with the rule-based baseline and once with NORTHSTAR from identical initial states, "
             "through the same simulator and the same metrics function. Unserved missions are censored at the horizon end (24 h) "
             "for both strategies. See `docs/DATA_AND_EXPERIMENT_METHODOLOGY.md`.", "",
             "## Primary comparison", "",
             "| Metric | Baseline mean (median) | NORTHSTAR mean (median) | Δ mean | Improvement | NORTHSTAR better / baseline better / tie | sign-test p |",
             "|---|---:|---:|---:|---:|:--:|---:|"]
    for k in summary["primary_metrics"]:
        c = comp[k]
        b, n = c["baseline"], c["northstar"]
        imp = f"{c['improvement_pct']:+.1f}%" if c["improvement_pct"] is not None else "—"
        p = f"{c['p_value']:.3g}" if c["p_value"] is not None else "—"
        lines.append(f"| {c['label']} ({c['unit']}) | {b['mean']} ({b['median']}) | {n['mean']} ({n['median']}) | {c['mean_diff']} | {imp} | {c['wins']} / {c['losses']} / {c['ties']} | {p} |")
    lines += ["", "Improvement % is relative to the baseline mean, signed so that positive is better for NORTHSTAR.", ""]
    tr = summary["tradeoffs"][pid]
    lines += ["## Tradeoffs (metrics where the baseline won more scenarios)", ""]
    lines += [f"- **{comp[k]['label']}**: baseline better in {comp[k]['losses']} scenarios, NORTHSTAR in {comp[k]['wins']}, tie in {comp[k]['ties']}." for k in tr] or ["- None."]
    cz = summary["censored"][pid]
    lines += ["", "## Censoring and completeness", "",
              f"- Medical missions: {cz['medical_missions_total']} total; unserved within 24 h: baseline {cz['medical_unserved_baseline']}, NORTHSTAR {cz['medical_unserved_northstar']}.",
              f"- Cargo missions: {cz['cargo_missions_total']} total; unserved: baseline {cz['cargo_unserved_baseline']}, NORTHSTAR {cz['cargo_unserved_northstar']}.",
              f"- Cancelled scheduled flights: baseline {cz['cancelled_flights_baseline']}, NORTHSTAR {cz['cancelled_flights_northstar']}.", ""]
    so = summary["solver"][pid]
    lines += ["## Solver", "",
              f"- Replanning decisions: {so['calls']}. CP-SAT models solved: {so['cpsat_calls']} (proven optimal {so['optimal_calls']}; "
              f"feasible-not-optimal {so['feasible_not_optimal_calls']}; time-outs {so['timeout_calls']}). "
              f"Decisions with no reachable aircraft for any pending mission, returned as NO FEASIBLE SOLUTION without a solve: {so['no_feasible_calls']}. "
              f"The four buckets sum to the total.",
              f"- Slowest solve {so['max_wall_ms']} ms; mean NORTHSTAR run {so['mean_run_wall_s']} s per scenario.",
              f"- Runs with a status other than OK: {so['runs_not_ok']}; assignments rejected by the simulator's feasibility check: {so['rejected_assignments']}.", ""]
    if len(summary["policies"]) > 1:
        lines += ["## Sensitivity to the policy profile", "", "| Metric | " + " | ".join(f"{p} improvement" for p in summary["policies"]) + " |",
                  "|---|" + "---:|" * len(summary["policies"])]
        for k in summary["primary_metrics"]:
            cells = []
            for p in summary["policies"]:
                c = summary["comparisons"][p][k]
                cells.append(f"{c['improvement_pct']:+.1f}% ({c['wins']}/{c['losses']}/{c['ties']})" if c["improvement_pct"] is not None else "—")
            lines.append(f"| {comp[k]['label']} | " + " | ".join(cells) + " |")
        lines.append("")
    lines += ["## Do-nothing reference (schedule only, no response)", ""]
    for k in ("medical_response_avg_min", "disconnected_community_hours", "cargo_delay_avg_min", "passenger_delay_avg_min"):
        d = summary["do_nothing"][k]
        lines.append(f"- {METRIC_INFO[k]['label']}: mean {d['mean']} {METRIC_INFO[k]['unit']}")
    lines += ["", "## Limitations", "", "Synthetic fleet, schedule and demand; one 28-airport network; deterministic execution; the baseline is one reasonable "
              "rule set, not an expert dispatcher. Results do not generalise to real operations. See `docs/RESPONSIBLE_AI.md`."]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _git_commit() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, text=True).strip()
    except Exception:  # noqa: BLE001
        return None


def _git_dirty() -> bool | None:
    try:
        out = subprocess.check_output(["git", "status", "--porcelain", "--", "backend", "datasets", "experiments/run_experiments.py"], cwd=REPO, text=True)
        return bool(out.strip())
    except Exception:  # noqa: BLE001
        return None


def run_experiment(n: int, seed: int, policies: list[str], out_dir: Path | None, progress=None, workers: int | None = None, network=None) -> dict:
    import ortools
    out_dir = Path(out_dir) if out_dir else None
    tasks = [(seed, i, policies) for i in range(n)]
    rows, scenarios = [], []
    workers = workers or max(1, (os.cpu_count() or 2) - 1)
    if workers > 1:
        with ProcessPoolExecutor(max_workers=workers) as ex:
            for i, (sc, rs) in enumerate(ex.map(_one, tasks, chunksize=1), start=1):
                scenarios.append(sc); rows.extend(rs)
                if progress:
                    progress(i)
    else:
        for i, task in enumerate(tasks, start=1):
            sc, rs = _one(task)
            scenarios.append(sc); rows.extend(rs)
            if progress:
                progress(i)
    meta = {"git_commit": _git_commit(), "git_dirty": _git_dirty(), "python": platform.python_version(), "ortools_version": ortools.__version__,
            "platform": platform.platform(), "horizon_min": scenarios[0]["horizon_min"] if scenarios else None,
            "policy_weights": {p: POLICIES[p].model_dump(exclude={"id", "name", "description"}) for p in policies}}
    summary = summarize(rows, scenarios, seed, policies, meta)
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)
        fields = list(rows[0].keys())
        with open(out_dir / "results.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(rows)
        with open(out_dir / "scenarios.jsonl", "w", encoding="utf-8") as f:
            for sc in scenarios:
                f.write(json.dumps(sc, sort_keys=True) + "\n")
        with open(out_dir / "summary.json", "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=1)
        write_markdown(summary, out_dir / "summary.md")
    return summary


def verify(n: int, seed: int, policies: list[str]) -> int:
    committed = RESULTS / "results.csv"
    if not committed.exists():
        print("no committed results.csv to verify against"); return 2
    with open(committed, newline="", encoding="utf-8") as f:
        old = {(r["scenario_id"], r["strategy"], r["policy"]): r["trace_hash"] for r in csv.DictReader(f)}
    tmp = RESULTS / "_verify"
    run_experiment(n, seed, policies, out_dir=tmp)
    with open(tmp / "results.csv", newline="", encoding="utf-8") as f:
        new = {(r["scenario_id"], r["strategy"], r["policy"]): r["trace_hash"] for r in csv.DictReader(f)}
    diff = [k for k in old if old[k] != new.get(k)]
    import shutil; shutil.rmtree(tmp, ignore_errors=True)
    if diff:
        print(f"VERIFY FAILED: {len(diff)} of {len(old)} runs differ, e.g. {diff[:3]}"); return 1
    print(f"VERIFY OK: {len(old)} runs reproduce the committed trace hashes"); return 0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--policies", default="balanced,medical_first,connectivity_first")
    ap.add_argument("--out", default=str(RESULTS))
    ap.add_argument("--workers", type=int, default=None)
    ap.add_argument("--verify", action="store_true")
    a = ap.parse_args()
    policies = [p.strip() for p in a.policies.split(",") if p.strip()]
    if a.verify:
        sys.exit(verify(a.n, a.seed, policies))
    t0 = time.time()
    summary = run_experiment(a.n, a.seed, policies, Path(a.out), progress=lambda i: print(f"\r  {i}/{a.n} scenarios", end="", flush=True), workers=a.workers)
    print(f"\ndone in {time.time() - t0:.0f}s -> {a.out}")
    c = summary["comparisons"][policies[0]]
    for k in PRIMARY_METRICS:
        x = c[k]
        print(f"  {x['label']:<48s} baseline {str(x['baseline']['mean']):>8s}  northstar {str(x['northstar']['mean']):>8s}  W/L/T {x['wins']}/{x['losses']}/{x['ties']}  p={x['p_value']}")


if __name__ == "__main__":
    main()
