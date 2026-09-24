"""Request/response shapes for the API (pydantic)."""
from __future__ import annotations

from pydantic import BaseModel, Field

from northstar.models import Disruption, Scenario


class LoadRequest(BaseModel):
    preset_id: str | None = None
    scenario: Scenario | None = None


class NorthstarRequest(BaseModel):
    policy_id: str | None = None
    weights: dict | None = None


class ExperimentRequest(BaseModel):
    n: int = Field(default=20, ge=1, le=500)
    seed: int = 42
    policy_id: str = "balanced"


class DisruptionIn(Disruption):
    pass
