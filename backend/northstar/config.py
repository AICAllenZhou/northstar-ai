"""Simulation constants and policy weight profiles.

Every value here is a declared assumption of the research simulation. None of
them is claimed to be operationally correct. Weights are exposed through the
API so that different priorities can be demonstrated.
"""
from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field

STEP_MIN = 30
HORIZON_MIN = 24 * 60
TURNAROUND_MIN = 30
MEDICAL_TARGET_MIN = 240
CARGO_DEFAULT_DEADLINE_MIN = 8 * 60
ROUTE_CLOSE_RISK = 0.85
WILDFIRE_CLOSE_SEVERITY = 0.5
WEATHER_CLOSE_SEVERITY = 0.8
SOLVER_TIME_LIMIT_S = 10.0
SOLVER_SEED = 42
RANGE_RESERVE_FACTOR = 1.0  # usable range = range_km * factor

REPO_ROOT = Path(__file__).resolve().parents[2]
PROCESSED_DIR = REPO_ROOT / "datasets" / "processed"
RESULTS_DIR = REPO_ROOT / "experiments" / "results"

DISCLAIMER = (
    "NORTHSTAR AI is a research simulation and decision-support prototype. "
    "It is not approved for real-world flight operations, medical decisions, or aviation dispatch."
)


class Policy(BaseModel):
    """Objective weights. Units: cost points per unit named in the field."""

    id: str
    name: str
    description: str
    # per minute of medical response, by priority
    w_medical_per_min: dict[int, float] = Field(default_factory=lambda: {1: 20.0, 2: 12.0, 3: 6.0})
    w_cargo_late_per_min: float = 8.0  # per minute past the cargo deadline
    w_cargo_time_per_min: float = 1.0  # per minute from request to delivery (so cargo is not parked until its deadline)
    w_passenger_late_per_min: float = 1.0
    w_connectivity_per_min: float = 4.0  # per minute a disconnected community waits for the restoring flight
    pen_unserved: dict[str, float] = Field(
        default_factory=lambda: {"medical": 200_000.0, "cargo": 40_000.0, "passenger": 20_000.0}
    )
    w_distance_per_km_index: float = 0.3  # per km x aircraft cost index; low enough that no scheduled flight is ever worth cancelling to save fuel
    w_risk: float = 3_000.0  # per unit of summed path risk
    w_reroute: float = 600.0
    risk_path_lambda: float = 2.0  # path weight = distance * (1 + lambda * risk)

    def scaled(self, **factors: float) -> "Policy":
        p = self.model_copy(deep=True)
        for k, f in factors.items():
            v = getattr(p, k)
            if isinstance(v, dict):
                setattr(p, k, {kk: vv * f for kk, vv in v.items()})
            else:
                setattr(p, k, v * f)
        return p


_BALANCED = Policy(
    id="balanced",
    name="Balanced",
    description="Medical response weighted highest, then community connectivity and essential cargo, then passengers, then cost.",
)

POLICIES: dict[str, Policy] = {
    "balanced": _BALANCED,
    "medical_first": _BALANCED.scaled(w_medical_per_min=3.0).model_copy(
        update={"id": "medical_first", "name": "Medical first",
                "description": "Triples the weight on medical response time; everything else unchanged."}
    ),
    "connectivity_first": _BALANCED.scaled(w_connectivity_per_min=3.0, w_passenger_late_per_min=2.0).model_copy(
        update={"id": "connectivity_first", "name": "Connectivity first",
                "description": "Triples the weight on disconnected-community time and doubles passenger delay weight."}
    ),
    "cost_conscious": _BALANCED.scaled(w_distance_per_km_index=5.0, w_reroute=2.0).model_copy(
        update={"id": "cost_conscious", "name": "Cost conscious",
                "description": "Raises the cost of distance flown and of changing existing assignments."}
    ),
}


def get_policy(policy_id: str | None) -> Policy:
    if policy_id is None:
        return POLICIES["balanced"]
    if policy_id not in POLICIES:
        raise KeyError(f"unknown policy '{policy_id}'; known: {sorted(POLICIES)}")
    return POLICIES[policy_id]
