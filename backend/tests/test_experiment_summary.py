"""Regression: the experiment summary must account for every replanning decision the optimizer recorded.

Found during the overnight sprint: summary.md reported "CP-SAT calls: 2438; proven optimal: 2284" and left 154
decisions unexplained. Those were moments where no aircraft could reach any pending mission; the optimizer
returned NO_FEASIBLE_SOLUTION without building a model. They must be counted in their own bucket so that
optimal + feasible + time-out + no-feasible == total, and only real solves are called CP-SAT calls.
"""
from __future__ import annotations

import importlib.util
import pathlib

REPO = pathlib.Path(__file__).resolve().parents[2]


def _runner():
    spec = importlib.util.spec_from_file_location("run_experiments", REPO / "experiments" / "run_experiments.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def test_solver_buckets_sum_to_total_and_only_solves_count_as_cpsat():
    rx = _runner()
    calls = [
        {"status": "OPTIMAL", "wall_ms": 12},
        {"status": "OPTIMAL", "wall_ms": 30},
        {"status": "NO_FEASIBLE_SOLUTION", "wall_ms": 0},
        {"status": "FEASIBLE", "wall_ms": 9800},
        {"status": "UNKNOWN", "wall_ms": 10000},
    ]
    c = rx.solver_counts(calls)
    assert c["solver_calls"] == 5
    assert c["solver_optimal_calls"] == 2
    assert c["solver_feasible_calls"] == 1
    assert c["solver_no_feasible_calls"] == 1
    assert c["solver_timeout_calls"] == 1
    assert c["solver_cpsat_calls"] == 4
    assert c["solver_optimal_calls"] + c["solver_feasible_calls"] + c["solver_no_feasible_calls"] + c["solver_timeout_calls"] == c["solver_calls"]
    assert c["solver_max_wall_ms"] == 10000
    assert rx.solver_counts([]) == {"solver_calls": 0, "solver_cpsat_calls": 0, "solver_optimal_calls": 0, "solver_feasible_calls": 0,
                                    "solver_no_feasible_calls": 0, "solver_timeout_calls": 0, "solver_max_wall_ms": 0}


def test_committed_summary_accounts_for_every_decision():
    """The committed results must satisfy the invariant too (guards against a stale summary.json)."""
    import json
    p = REPO / "experiments" / "results" / "summary.json"
    if not p.exists():
        return
    s = json.loads(p.read_text())
    for pid, so in s["solver"].items():
        assert "no_feasible_calls" in so, f"summary.json for {pid} predates the solver-bucket fix; re-run the experiment"
        assert so["optimal_calls"] + so["feasible_not_optimal_calls"] + so["timeout_calls"] + so["no_feasible_calls"] == so["calls"], pid
        assert so["cpsat_calls"] == so["calls"] - so["no_feasible_calls"], pid
