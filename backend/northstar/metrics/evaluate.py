"""The single metrics engine. Every strategy's trace is scored by this function and nothing else."""
from __future__ import annotations

from statistics import mean

from northstar.config import MEDICAL_TARGET_MIN
from northstar.models import Metrics, MissionType, Network, Trace


def evaluate(trace: Trace, network: Network | None = None) -> Metrics:
    H = trace.horizon_min
    outcomes = list(trace.missions.values())

    # --- connectivity ---
    hours = sum((b - a) for ivs in trace.disconnected_intervals.values() for a, b in ivs) / 60.0
    end_dis = len(trace.snapshots[-1].disconnected) if trace.snapshots else 0
    peak = max((len(s.disconnected) for s in trace.snapshots), default=0)
    structural_hours = sum(len(s.structural_disconnected) for s in trace.snapshots[:-1]) * trace.step_min / 60.0

    # --- medical ---
    med = [o for o in outcomes if o.type == MissionType.medical]
    med_resp = []
    med_unserved = 0
    for o in med:
        if o.response_min is not None and o.status == "completed":
            med_resp.append(o.response_min - o.release_min)
        else:
            med_unserved += 1
            med_resp.append(H - o.release_min)  # censored at horizon end
    within = [r <= MEDICAL_TARGET_MIN for r, o in zip(med_resp, med) if o.status == "completed"]

    # --- cargo ---
    cargo = [o for o in outcomes if o.type == MissionType.cargo]
    cargo_delay, cargo_unserved = [], 0
    for o in cargo:
        dl = o.deadline_min if o.deadline_min is not None else o.release_min
        if o.status == "completed" and o.complete_min is not None:
            cargo_delay.append(max(0, o.complete_min - dl))
        else:
            cargo_unserved += 1
            cargo_delay.append(max(0, H - dl))

    # --- passengers ---
    pax = [o for o in outcomes if o.type == MissionType.passenger]
    pax_delay, cancelled = [], 0
    for o in pax:
        sa = o.scheduled_arrival_min if o.scheduled_arrival_min is not None else o.release_min
        if o.status == "completed" and o.complete_min is not None:
            pax_delay.append(max(0, o.complete_min - sa))
        else:
            cancelled += 1
            pax_delay.append(max(0, H - sa))

    # --- reroutes: scheduled flights flown differently than scheduled + any later reassignment ---
    reroutes = 0
    for o in outcomes:
        reroutes += o.assignment_changes
        if o.scheduled_aircraft_id and o.status == "completed":
            if o.aircraft_id != o.scheduled_aircraft_id or (o.scheduled_path and o.path != o.scheduled_path):
                reroutes += 1

    # --- operations ---
    n_ac = max(1, len(trace.aircraft_flying_min))
    utilization = 100.0 * sum(trace.aircraft_flying_min.values()) / (n_ac * H)
    distance = sum(trace.aircraft_flown_km.values())
    cost = 0.0
    if network is not None:
        cost = sum(km * network.aircraft[a].cost_index_per_km for a, km in trace.aircraft_flown_km.items() if a in network.aircraft)
    else:
        cost = distance

    # --- recovery ---
    recovery, recovered = None, True
    if trace.first_disruption_min is not None:
        recovered = False
        for s in trace.snapshots:
            if s.t < (trace.last_disruption_start_min or 0):
                continue
            if not s.service_disconnected and s.critical_pending == 0:
                recovery, recovered = float(s.t - trace.first_disruption_min), True
                break
        if not recovered:
            recovery = float(H - trace.first_disruption_min)

    critical = med + cargo
    completed = sum(1 for o in outcomes if o.status == "completed")
    return Metrics(
        horizon_min=H,
        disconnected_communities_end=end_dis,
        disconnected_communities_peak=peak,
        disconnected_community_hours=round(hours, 2),
        structural_disconnected_hours=round(structural_hours, 2),
        medical_count=len(med), medical_unserved=med_unserved,
        medical_response_avg_min=round(mean(med_resp), 1) if med_resp else None,
        medical_response_max_min=float(max(med_resp)) if med_resp else None,
        medical_within_target_pct=round(100.0 * sum(within) / len(med), 1) if med else None,
        critical_missions_total=len(critical),
        critical_missions_completed_pct=round(100.0 * sum(1 for o in critical if o.status == "completed") / len(critical), 1) if critical else None,
        cargo_count=len(cargo), cargo_unserved=cargo_unserved,
        cargo_delay_avg_min=round(mean(cargo_delay), 1) if cargo_delay else None,
        cargo_completion_rate=round(100.0 * (len(cargo) - cargo_unserved) / len(cargo), 1) if cargo else None,
        passenger_count=len(pax), cancelled_flights=cancelled,
        passenger_delay_avg_min=round(mean(pax_delay), 1) if pax_delay else None,
        passenger_delay_total_min=float(sum(pax_delay)),
        reroutes=reroutes,
        aircraft_utilization_pct=round(utilization, 1),
        distance_flown_km=round(distance, 1),
        operating_cost_index=round(cost, 1),
        recovery_time_min=recovery, recovered=recovered,
        missions_total=len(outcomes), missions_completed=completed,
    )
