"""Seeded random scenario generator for the experiment framework (see DATA_AND_EXPERIMENT_METHODOLOGY.md §6)."""
from __future__ import annotations

import numpy as np

from northstar.models import Disruption, DisruptionType as D, Network, Scenario

STEP = 30


def _snap(minutes: float) -> int:
    return int(round(minutes / STEP)) * STEP


def generate_scenario(network: Network, master_seed: int, index: int) -> Scenario:
    rng = np.random.default_rng(master_seed * 1000 + index)
    hubs = sorted(network.hub_ids("any"))
    northern = sorted(a.id for a in network.airports.values() if a.region != "South gateway")
    non_hub = sorted(a for a in northern if a not in hubs)
    communities = sorted(network.communities)
    aircraft = sorted(network.aircraft)
    ds: list[Disruption] = []

    n_close = int(rng.integers(1, 4))
    for i in range(n_close):
        pool = hubs if rng.random() < 0.35 else non_hub
        apt = str(rng.choice(pool))
        ds.append(Disruption(id=f"CL-{i+1}", type=D.airport_closure, target_ids=[apt],
                             start_min=_snap(rng.uniform(0, 720)), duration_min=max(STEP, _snap(rng.uniform(120, 720))),
                             label=f"Airport closure {network.airports[apt].community_name}"))
    n_wx = int(rng.integers(0, 3))
    for i in range(n_wx):
        hub = str(rng.choice([h for h in hubs if network.airports[h].region != "South gateway"]))
        spokes = sorted({r.origin_airport_id if r.destination_airport_id == hub else r.destination_airport_id
                         for r in network.routes.values() if hub in (r.origin_airport_id, r.destination_airport_id)})
        k = int(rng.integers(1, min(4, len(spokes)) + 1))
        targets = [hub] + [str(s) for s in rng.choice(spokes, size=k, replace=False)]
        ds.append(Disruption(id=f"WX-{i+1}", type=D.severe_weather, target_ids=sorted(targets),
                             severity=float(round(rng.uniform(0.4, 1.0), 2)), start_min=_snap(rng.uniform(0, 720)),
                             duration_min=max(STEP, _snap(rng.uniform(120, 600))), label="Severe weather"))
    if rng.random() < 0.5:
        center = network.airports[str(rng.choice(non_hub))]
        ds.append(Disruption(id="WF-1", type=D.wildfire, center_lat=center.lat, center_lon=center.lon,
                             radius_km=float(round(rng.uniform(60, 250))), severity=float(round(rng.uniform(0.5, 1.0), 2)),
                             start_min=_snap(rng.uniform(0, 480)), duration_min=max(STEP, _snap(rng.uniform(240, 840))),
                             label=f"Wildfire near {center.community_name}"))
    n_af = int(rng.integers(0, 3))
    for i, aid in enumerate(rng.choice(aircraft, size=n_af, replace=False) if n_af else []):
        ds.append(Disruption(id=f"AF-{i+1}", type=D.aircraft_failure, target_ids=[str(aid)],
                             start_min=_snap(rng.uniform(0, 720)), duration_min=max(STEP, _snap(rng.uniform(240, 1440)))))
    n_med = int(rng.integers(1, 4))
    for i, cid in enumerate(rng.choice(communities, size=n_med, replace=False)):
        prio = int(rng.choice([1, 2, 3], p=[0.5, 0.3, 0.2]))
        ds.append(Disruption(id=f"ME-{i+1}", type=D.medical_emergency, target_ids=[str(cid)],
                             start_min=_snap(rng.uniform(0, 960)), params={"priority": prio}))
    n_cgo = int(rng.integers(1, 4))
    for i, cid in enumerate(rng.choice(communities, size=n_cgo, replace=False)):
        ds.append(Disruption(id=f"CG-{i+1}", type=D.essential_cargo_request, target_ids=[str(cid)],
                             start_min=_snap(rng.uniform(0, 720)),
                             params={"payload_kg": int(rng.integers(300, 2501)), "deadline_min": _snap(rng.uniform(240, 720))}))
    return Scenario(id=f"gen-{master_seed}-{index:03d}", name=f"Generated scenario {index}", seed=master_seed * 1000 + index,
                    disruptions=ds, tags=["generated"],
                    description=f"{n_close} closure(s), {n_wx} weather event(s), {n_af} aircraft failure(s), {n_med} medevac(s), {n_cgo} cargo request(s)")
