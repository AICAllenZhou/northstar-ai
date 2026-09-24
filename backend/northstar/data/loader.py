"""Load datasets/processed/*.csv into a Network, validating references."""
from __future__ import annotations

import csv
import json
from pathlib import Path

from northstar.config import PROCESSED_DIR
from northstar.models import Aircraft, Airport, Community, Network, Route, ScheduleLeg


class DatasetError(RuntimeError):
    pass


def _rows(path: Path) -> list[dict]:
    if not path.exists():
        raise DatasetError(f"missing dataset file: {path}")
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _bool(v: str) -> bool:
    return str(v).strip().lower() in ("1", "true", "yes")


def load_network(processed_dir: Path | None = None) -> Network:
    d = Path(processed_dir or PROCESSED_DIR)
    airports = {}
    for r in _rows(d / "airports.csv"):
        airports[r["id"]] = Airport(
            id=r["id"], iata=r.get("iata", ""), name=r["name"], community_name=r["community_name"],
            region=r["region"], lat=float(r["lat"]), lon=float(r["lon"]),
            elevation_m=float(r["elevation_m"]) if r.get("elevation_m") else None,
            runway_length_m=int(float(r["runway_length_m"])), runway_surface=r["runway_surface"],
            is_medical_hub=_bool(r["is_medical_hub"]), is_cargo_hub=_bool(r["is_cargo_hub"]),
            is_passenger_hub=_bool(r["is_passenger_hub"]), hub_note=r.get("hub_note", ""),
            base_weather_risk=float(r.get("base_weather_risk") or 0.1),
            base_wildfire_risk=float(r.get("base_wildfire_risk") or 0.0),
            data_flags=[f for f in (r.get("data_flags") or "").split(";") if f],
        )
    communities = {}
    for r in _rows(d / "communities.csv"):
        if r["airport_id"] not in airports:
            raise DatasetError(f"community {r['id']} references unknown airport {r['airport_id']}")
        communities[r["id"]] = Community(
            id=r["id"], name=r["name"], airport_id=r["airport_id"], region=r["region"],
            lat=float(r["lat"]), lon=float(r["lon"]),
            population_2021=int(r["population_2021"]) if r.get("population_2021") else None,
            priority_weight=float(r.get("priority_weight") or 1.0),
        )
    aircraft = {}
    for r in _rows(d / "aircraft.csv"):
        if r["home_airport_id"] not in airports:
            raise DatasetError(f"aircraft {r['id']} based at unknown airport {r['home_airport_id']}")
        aircraft[r["id"]] = Aircraft(
            id=r["id"], type=r["type"], callsign=r.get("callsign", ""), home_airport_id=r["home_airport_id"],
            range_km=float(r["range_km"]), capacity_people=int(r["capacity_people"]),
            cargo_capacity_kg=int(r["cargo_capacity_kg"]), min_runway_length_m=int(r["min_runway_length_m"]),
            gravel_capable=_bool(r["gravel_capable"]), speed_kmh=float(r["speed_kmh"]),
            cost_index_per_km=float(r["cost_index_per_km"]), role=r.get("role", "utility"),
        )
    routes = {}
    for r in _rows(d / "routes.csv"):
        for k in ("origin_airport_id", "destination_airport_id"):
            if r[k] not in airports:
                raise DatasetError(f"route {r['id']} references unknown airport {r[k]}")
        routes[r["id"]] = Route(
            id=r["id"], origin_airport_id=r["origin_airport_id"], destination_airport_id=r["destination_airport_id"],
            distance_km=float(r["distance_km"]), corridor=r.get("corridor", ""), base_risk=float(r.get("base_risk") or 0.05),
        )
    schedule = []
    for r in _rows(d / "schedule.csv"):
        if r["aircraft_id"] not in aircraft:
            raise DatasetError(f"schedule leg {r['id']} uses unknown aircraft {r['aircraft_id']}")
        schedule.append(ScheduleLeg(
            id=r["id"], aircraft_id=r["aircraft_id"], origin_airport_id=r["origin_airport_id"],
            destination_airport_id=r["destination_airport_id"], departure_min=int(r["departure_min"]),
            scheduled_arrival_min=int(r["scheduled_arrival_min"]), departure_local=r.get("departure_local", ""),
            passengers=int(r["passengers"]), distance_km=float(r["distance_km"]),
        ))
    return Network(airports, communities, aircraft, routes, schedule)


def load_metadata(processed_dir: Path | None = None) -> dict[str, dict]:
    d = Path(processed_dir or PROCESSED_DIR)
    out = {}
    for p in sorted(d.glob("*.meta.json")) + sorted((d / "basemap").glob("*.meta.json")):
        with open(p, encoding="utf-8") as f:
            out[p.stem.replace(".meta", "")] = json.load(f)
    return out
