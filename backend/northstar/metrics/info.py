"""Display metadata for metrics (labels, units, direction). Shared by the experiment runner and the API."""

METRIC_INFO = {
    "disconnected_communities_end": {"label": "Communities still disconnected at end of day", "unit": "communities", "direction": "lower"},
    "disconnected_communities_peak": {"label": "Peak disconnected communities", "unit": "communities", "direction": "lower"},
    "disconnected_community_hours": {"label": "Disconnected-community hours", "unit": "h", "direction": "lower"},
    "medical_response_avg_min": {"label": "Mean medical response time", "unit": "min", "direction": "lower"},
    "medical_within_target_pct": {"label": "Medevacs within 240-min target", "unit": "%", "direction": "higher"},
    "critical_missions_completed_pct": {"label": "Critical missions completed", "unit": "%", "direction": "higher"},
    "cargo_delay_avg_min": {"label": "Mean essential-cargo delay past deadline", "unit": "min", "direction": "lower"},
    "cargo_completion_rate": {"label": "Cargo delivered", "unit": "%", "direction": "higher"},
    "passenger_delay_avg_min": {"label": "Mean passenger flight delay", "unit": "min", "direction": "lower"},
    "cancelled_flights": {"label": "Cancelled scheduled flights", "unit": "flights", "direction": "lower"},
    "reroutes": {"label": "Reroutes / reassignments", "unit": "count", "direction": "lower"},
    "aircraft_utilization_pct": {"label": "Aircraft utilization", "unit": "%", "direction": "info"},
    "distance_flown_km": {"label": "Distance flown", "unit": "km", "direction": "lower"},
    "operating_cost_index": {"label": "Operating cost index (fuel proxy)", "unit": "index", "direction": "lower"},
    "recovery_time_min": {"label": "Network recovery time", "unit": "min", "direction": "lower"},
}
PRIMARY_METRICS = ["medical_response_avg_min", "disconnected_community_hours", "cargo_delay_avg_min",
                   "passenger_delay_avg_min", "recovery_time_min", "distance_flown_km", "reroutes",
                   "disconnected_communities_end", "cancelled_flights", "critical_missions_completed_pct"]
