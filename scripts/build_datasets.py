#!/usr/bin/env python3
"""Build datasets/processed/ from datasets/raw/ plus declared synthetic definitions.

Real inputs (see datasets/raw/PROVENANCE.json):
  - OurAirports selected_airports.csv / selected_runways.csv  (coordinates, runways)
  - Statistics Canada population_2021.csv                      (population)
  - supplements/runway_supplement.csv                          (two runways missing from OurAirports; secondary source, flagged)
  - Natural Earth filtered GeoJSON                             (offline basemap)

Synthetic definitions live in this file and are written out with metadata that
says so. Re-running this script is deterministic and overwrites processed/.
"""
from __future__ import annotations

import csv
import json
import math
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "datasets" / "raw"
OUT = ROOT / "datasets" / "processed"
BUILD_VERSION = "2026-09-24.1"
FT_TO_M = 0.3048

# --------------------------------------------------------------------------
# Synthetic definitions (assumptions, not real operations data)
# --------------------------------------------------------------------------

REGION = {
    "CYFB": "Qikiqtaaluk", "CYXP": "Qikiqtaaluk", "CYVM": "Qikiqtaaluk", "CYCY": "Qikiqtaaluk",
    "CYIO": "Qikiqtaaluk", "CYAB": "Qikiqtaaluk", "CYGT": "Qikiqtaaluk", "CYUX": "Qikiqtaaluk",
    "CYTE": "Qikiqtaaluk", "CYLC": "Qikiqtaaluk", "CYRB": "Qikiqtaaluk", "CYGZ": "Qikiqtaaluk",
    "CYSK": "Qikiqtaaluk",
    "CYRT": "Kivalliq", "CYEK": "Kivalliq", "CYXN": "Kivalliq", "CYCS": "Kivalliq",
    "CYBK": "Kivalliq", "CYZS": "Kivalliq", "CYUT": "Kivalliq",
    "CYCB": "Kitikmeot", "CYCO": "Kitikmeot", "CYHK": "Kitikmeot", "CYYH": "Kitikmeot", "CYBB": "Kitikmeot",
    "CYZF": "South gateway", "CYWG": "South gateway", "CYOW": "South gateway",
}
# Preferred community display names (current official names; sources use legacy names for three)
DISPLAY_NAME = {"CYTE": "Kinngait", "CYUX": "Sanirajak", "CYUT": "Naujaat", "CYRB": "Resolute"}
# Hub roles: assumption informed by public knowledge of where regional hospitals/health centres,
# airline hubs and cargo gateways are. Not an official designation.
HUBS = {
    "CYFB": dict(medical=True, cargo=True, passenger=True, note="Qikiqtani General Hospital; Baffin airline hub"),
    "CYRT": dict(medical=True, cargo=True, passenger=True, note="Kivalliq regional health centre; airline hub"),
    "CYCB": dict(medical=True, cargo=True, passenger=True, note="Kitikmeot regional health centre; airline hub"),
    "CYZF": dict(medical=True, cargo=True, passenger=True, note="Stanton Territorial Hospital; southern gateway"),
    "CYWG": dict(medical=True, cargo=True, passenger=True, note="Tertiary hospitals; Kivalliq southern gateway"),
    "CYOW": dict(medical=True, cargo=True, passenger=True, note="Tertiary hospitals; Baffin southern gateway"),
}
# Route list: hub-and-spoke pattern plus a few cross-region alternates. Synthetic simplification.
ROUTES = [
    # Qikiqtaaluk (Baffin)
    ("CYFB", "CYXP", "baffin"), ("CYXP", "CYVM", "baffin"), ("CYFB", "CYCY", "baffin"),
    ("CYCY", "CYIO", "baffin"), ("CYFB", "CYIO", "baffin"), ("CYIO", "CYAB", "baffin"),
    ("CYFB", "CYGT", "baffin"), ("CYGT", "CYUX", "baffin"), ("CYFB", "CYTE", "baffin"),
    ("CYFB", "CYLC", "baffin"), ("CYFB", "CYRB", "baffin"), ("CYRB", "CYGZ", "baffin"),
    ("CYRB", "CYAB", "baffin"), ("CYFB", "CYOW", "south"), ("CYFB", "CYRT", "cross"),
    ("CYSK", "CYWG", "south"), ("CYSK", "CYRT", "cross"), ("CYFB", "CYVM", "baffin"),
    # Kivalliq
    ("CYRT", "CYEK", "kivalliq"), ("CYEK", "CYXN", "kivalliq"), ("CYXN", "CYRT", "kivalliq"),
    ("CYRT", "CYCS", "kivalliq"), ("CYRT", "CYBK", "kivalliq"), ("CYCS", "CYBK", "kivalliq"),
    ("CYRT", "CYZS", "kivalliq"), ("CYZS", "CYUT", "kivalliq"), ("CYRT", "CYUT", "kivalliq"),
    ("CYUT", "CYGT", "cross"), ("CYRT", "CYWG", "south"), ("CYEK", "CYWG", "south"),
    ("CYBK", "CYHK", "cross"),
    # Kitikmeot
    ("CYCB", "CYCO", "kitikmeot"), ("CYCB", "CYHK", "kitikmeot"), ("CYHK", "CYYH", "kitikmeot"),
    ("CYYH", "CYBB", "kitikmeot"), ("CYCB", "CYZF", "south"), ("CYCO", "CYZF", "south"),
    ("CYBB", "CYUT", "cross"), ("CYCB", "CYRB", "cross"), ("CYCB", "CYYH", "kitikmeot"),
    ("CYCB", "CYBB", "kitikmeot"),
]
# Fleet: real aircraft types with APPROXIMATE public specifications; composition, basing and
# availability are invented for the simulation.
AIRCRAFT = [
    # id, type, callsign, base, range_km, pax, cargo_kg, min_rwy_m, gravel, speed_kmh, cost_idx, role
    ("AC-01", "DHC-6 Twin Otter", "NST01", "CYFB", 1400, 19, 1500, 450, True, 280, 1.0, "utility"),
    ("AC-02", "DHC-6 Twin Otter", "NST02", "CYRT", 1400, 19, 1500, 450, True, 280, 1.0, "utility"),
    ("AC-03", "DHC-6 Twin Otter", "NST03", "CYCB", 1400, 19, 1500, 450, True, 280, 1.0, "utility"),
    ("AC-04", "ATR 42-500", "NST04", "CYFB", 1500, 46, 5000, 1100, True, 500, 2.2, "passenger"),
    ("AC-05", "ATR 42-500 combi", "NST05", "CYRT", 1500, 30, 5500, 1100, True, 500, 2.2, "combi"),
    ("AC-06", "Dash 8-300", "NST06", "CYCB", 1500, 50, 4000, 1050, True, 500, 2.4, "passenger"),
    ("AC-07", "King Air 350 medevac", "NST07", "CYRT", 2800, 6, 500, 1000, True, 560, 1.6, "medevac"),
    ("AC-08", "King Air 350 medevac", "NST08", "CYFB", 2800, 6, 500, 1000, True, 560, 1.6, "medevac"),
    ("AC-09", "Pilatus PC-12 medevac", "NST09", "CYCB", 2800, 6, 600, 850, True, 500, 1.4, "medevac"),
    ("AC-10", "Boeing 737-200 combi", "NST10", "CYFB", 3000, 100, 7000, 1800, True, 780, 6.0, "combi"),
]
# Daily schedule (synthetic): scheduled passenger legs, departure as HH:MM local, with the
# aircraft planned to fly them and the passengers booked. Communities not listed have no
# scheduled service on the simulated day (Northern schedules are typically 3-5 days/week).
SCHEDULE = [
    # id, aircraft, origin, dest, dep, pax
    ("SCH-01", "AC-01", "CYFB", "CYXP", "07:00", 12),
    ("SCH-02", "AC-01", "CYXP", "CYFB", "09:00", 11),
    ("SCH-03", "AC-01", "CYFB", "CYLC", "12:30", 9),
    ("SCH-04", "AC-01", "CYLC", "CYFB", "14:00", 8),
    ("SCH-05", "AC-04", "CYFB", "CYTE", "07:00", 34),
    ("SCH-06", "AC-04", "CYTE", "CYFB", "09:30", 30),
    ("SCH-07", "AC-04", "CYFB", "CYIO", "12:00", 38),
    ("SCH-08", "AC-04", "CYIO", "CYFB", "15:30", 36),
    ("SCH-09", "AC-10", "CYFB", "CYOW", "08:00", 82),
    ("SCH-10", "AC-10", "CYOW", "CYFB", "13:30", 78),
    ("SCH-11", "AC-05", "CYRT", "CYEK", "07:00", 26),
    ("SCH-12", "AC-05", "CYEK", "CYRT", "08:30", 24),
    ("SCH-13", "AC-05", "CYRT", "CYBK", "11:00", 28),
    ("SCH-14", "AC-05", "CYBK", "CYRT", "13:00", 27),
    ("SCH-15", "AC-02", "CYRT", "CYCS", "07:30", 10),
    ("SCH-16", "AC-02", "CYCS", "CYRT", "09:00", 9),
    ("SCH-17", "AC-02", "CYRT", "CYXN", "12:00", 12),
    ("SCH-18", "AC-02", "CYXN", "CYRT", "13:30", 11),
    ("SCH-19", "AC-06", "CYCB", "CYCO", "07:00", 31),
    ("SCH-20", "AC-06", "CYCO", "CYCB", "09:00", 29),
    ("SCH-21", "AC-06", "CYCB", "CYZF", "12:00", 44),
    ("SCH-22", "AC-06", "CYZF", "CYCB", "16:00", 41),
    ("SCH-23", "AC-03", "CYCB", "CYHK", "08:00", 14),
    ("SCH-24", "AC-03", "CYHK", "CYYH", "09:30", 12),
    ("SCH-25", "AC-03", "CYYH", "CYBB", "11:00", 10),
    ("SCH-26", "AC-03", "CYBB", "CYCB", "13:00", 13),
]
SCENARIO_START = "06:00"


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_csv(path, rows, fields):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fields})


def write_meta(path, **meta):
    meta.setdefault("build_version", BUILD_VERSION)
    meta.setdefault("built_utc", datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    meta.setdefault("disclaimer", "NORTHSTAR AI is a research simulation. Synthetic fields are not real Canadian aviation operations data.")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
        f.write("\n")


def hhmm_to_min(hhmm, start=SCENARIO_START):
    h, m = map(int, hhmm.split(":"))
    sh, sm = map(int, start.split(":"))
    return (h * 60 + m) - (sh * 60 + sm)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "basemap").mkdir(exist_ok=True)

    airports_raw = read_csv(RAW / "ourairports" / "selected_airports.csv")
    runways_raw = read_csv(RAW / "ourairports" / "selected_runways.csv")
    pop_raw = read_csv(RAW / "statcan" / "population_2021.csv")
    supp = read_csv(RAW / "supplements" / "runway_supplement.csv")

    # Longest OPEN runway per airport from OurAirports, surface normalised
    best = {}
    for r in runways_raw:
        if r["closed"] == "1" or not r["length_ft"]:
            continue
        ident = r["airport_ident"]
        length = int(float(r["length_ft"]))
        surface = r["surface"].strip().lower()
        if ident not in best or length > best[ident]["length_ft"]:
            best[ident] = {"length_ft": length, "surface": surface}
    # Supplement (secondary source), flagged per field
    supplement_flags = {}
    for s in supp:
        ident = s["airport_ident"]
        best.setdefault(ident, {"length_ft": None, "surface": None})
        if s["field"] == "runway_length_ft" and best[ident]["length_ft"] is None:
            best[ident]["length_ft"] = int(s["value"])
            supplement_flags.setdefault(ident, []).append("runway_length_from_secondary_source")
        if s["field"] == "runway_surface" and (best[ident]["surface"] in (None, "unk", "")):
            best[ident]["surface"] = s["value"].lower()
            supplement_flags.setdefault(ident, []).append("runway_surface_from_secondary_source")

    def norm_surface(s):
        if s is None:
            return "unknown"
        if s.startswith("asp") or s in ("con", "concrete", "paved", "pem"):
            return "paved"
        if s.startswith("gv") or s.startswith("grav"):
            return "gravel"
        return s

    pop_by_name = {}
    for p in pop_raw:
        pop_by_name[p["community_name"]] = int(p["population_2021"]) if p["population_2021"] else None

    airports, communities = [], []
    for a in sorted(airports_raw, key=lambda r: r["ident"]):
        ident = a["ident"]
        rw = best.get(ident, {"length_ft": None, "surface": None})
        if rw["length_ft"] is None:
            raise SystemExit(f"No runway length for {ident}; refusing to guess")
        community = DISPLAY_NAME.get(ident, a["municipality"])
        hub = HUBS.get(ident, {})
        airports.append({
            "id": ident,
            "iata": a["iata_code"],
            "name": a["name"],
            "community_name": community,
            "region": REGION[ident],
            "lat": round(float(a["latitude_deg"]), 5),
            "lon": round(float(a["longitude_deg"]), 5),
            "elevation_m": round(float(a["elevation_ft"]) * FT_TO_M) if a["elevation_ft"] else "",
            "runway_length_m": round(rw["length_ft"] * FT_TO_M),
            "runway_surface": norm_surface(rw["surface"]),
            "is_medical_hub": bool(hub.get("medical", False)),
            "is_cargo_hub": bool(hub.get("cargo", False)),
            "is_passenger_hub": bool(hub.get("passenger", False)),
            "hub_note": hub.get("note", ""),
            "base_weather_risk": 0.1,
            "base_wildfire_risk": 0.0,
            "data_flags": ";".join(supplement_flags.get(ident, [])),
        })
        if REGION[ident] != "South gateway":
            communities.append({
                "id": "COM-" + ident[1:],  # e.g. COM-YFB
                "name": community,
                "airport_id": ident,
                "region": REGION[ident],
                "lat": round(float(a["latitude_deg"]), 5),
                "lon": round(float(a["longitude_deg"]), 5),
                "population_2021": pop_by_name.get(community, ""),
                "priority_weight": 1.0,
            })
    apt = {a["id"]: a for a in airports}

    routes = []
    seen = set()
    for i, (o, d, corridor) in enumerate(ROUTES, start=1):
        key = tuple(sorted((o, d)))
        assert key not in seen, f"duplicate route {key}"
        seen.add(key)
        dist = haversine_km(apt[o]["lat"], apt[o]["lon"], apt[d]["lat"], apt[d]["lon"])
        routes.append({
            "id": f"R-{i:02d}", "origin_airport_id": o, "destination_airport_id": d,
            "distance_km": round(dist, 1), "corridor": corridor, "base_risk": 0.05,
        })

    aircraft = []
    for (aid, typ, cs, base, rng, pax, cargo, rwy, gravel, spd, cost, role) in AIRCRAFT:
        aircraft.append({
            "id": aid, "type": typ, "callsign": cs, "home_airport_id": base, "range_km": rng,
            "capacity_people": pax, "cargo_capacity_kg": cargo, "min_runway_length_m": rwy,
            "gravel_capable": gravel, "speed_kmh": spd, "cost_index_per_km": cost, "role": role,
        })
    ac = {a["id"]: a for a in aircraft}

    schedule = []
    route_set = {tuple(sorted((r["origin_airport_id"], r["destination_airport_id"]))) for r in routes}
    for (sid, aid, o, d, dep, pax) in SCHEDULE:
        assert tuple(sorted((o, d))) in route_set, f"{sid}: no route {o}-{d}"
        dist = haversine_km(apt[o]["lat"], apt[o]["lon"], apt[d]["lat"], apt[d]["lon"])
        block_min = math.ceil(dist / ac[aid]["speed_kmh"] * 60 / 30) * 30
        dep_min = hhmm_to_min(dep)
        schedule.append({
            "id": sid, "aircraft_id": aid, "origin_airport_id": o, "destination_airport_id": d,
            "departure_min": dep_min, "scheduled_arrival_min": dep_min + block_min,
            "departure_local": dep, "passengers": pax, "distance_km": round(dist, 1),
        })

    # ---- write ----
    write_csv(OUT / "airports.csv", airports, list(airports[0].keys()))
    write_meta(OUT / "airports.meta.json",
               dataset="airports", real_or_synthetic="mixed",
               real_fields={"id,iata,name,lat,lon,elevation_m": "OurAirports airports.csv (public domain)",
                            "runway_length_m,runway_surface": "OurAirports runways.csv (public domain); CYGZ and CYLC length and CYXN/CYCS surface from Wikipedia infoboxes citing the Canada Flight Supplement (secondary source, flagged in data_flags)"},
               synthetic_fields={"is_medical_hub,is_cargo_hub,is_passenger_hub,hub_note": "project assumption informed by public knowledge; not an official designation",
                                 "base_weather_risk,base_wildfire_risk": "constant placeholders used by the transparent risk score",
                                 "community_name": "current official community names substituted for legacy names in sources (Kinngait, Sanirajak, Naujaat, Resolute)"},
               source_urls=["https://davidmegginson.github.io/ourairports-data/airports.csv",
                            "https://davidmegginson.github.io/ourairports-data/runways.csv",
                            "https://ourairports.com/data/"],
               licence="OurAirports: public domain (Unlicense)",
               assumptions=["Longest open runway used", "runway surface normalised to paved|gravel"],
               provenance_record="datasets/raw/PROVENANCE.json")
    write_csv(OUT / "communities.csv", communities, list(communities[0].keys()))
    write_meta(OUT / "communities.meta.json",
               dataset="communities", real_or_synthetic="mixed",
               real_fields={"name,lat,lon": "OurAirports (community located at its airport coordinates)",
                            "population_2021": "Statistics Canada, 2021 Census of Population, table 98-10-0002-01 (Statistics Canada Open Licence)"},
               synthetic_fields={"priority_weight": "equal weighting by default (1.0); see RESPONSIBLE_AI.md",
                                 "region": "Nunavut administrative regions (public knowledge)"},
               source_urls=["https://www150.statcan.gc.ca/n1/tbl/csv/98100002-eng.zip", "https://www.statcan.gc.ca/en/reference/licence"],
               licence="Statistics Canada Open Licence",
               assumptions=["Community coordinates approximated by airport coordinates"])
    write_csv(OUT / "routes.csv", routes, list(routes[0].keys()))
    write_meta(OUT / "routes.meta.json",
               dataset="routes", real_or_synthetic="synthetic",
               real_fields={"distance_km": "great-circle distance derived from real coordinates"},
               synthetic_fields={"route list,corridor,base_risk": "hub-and-spoke simplification informed by publicly advertised Northern airline networks; not an official schedule or airway structure"},
               assumptions=["Undirected routes"])
    write_csv(OUT / "aircraft.csv", aircraft, list(aircraft[0].keys()))
    write_meta(OUT / "aircraft.meta.json",
               dataset="aircraft", real_or_synthetic="synthetic",
               synthetic_fields={"all": "Fleet composition, basing, availability and cost index are invented. Aircraft types are real; range, capacity, speed and minimum runway figures are rounded approximations of public manufacturer specifications and should not be used operationally."},
               assumptions=["cost_index_per_km is a relative index, not currency", "min_runway_length_m is a simulation threshold, not a certified figure"])
    write_csv(OUT / "schedule.csv", schedule, list(schedule[0].keys()))
    write_meta(OUT / "schedule.meta.json",
               dataset="schedule", real_or_synthetic="synthetic",
               synthetic_fields={"all": "Invented one-day passenger schedule; times are minutes from scenario start (06:00 local)"},
               assumptions=["Block time = great-circle distance / cruise speed rounded up to 30-minute steps"])

    for name in ("ne_50m_countries_northamerica.geojson", "ne_50m_canada_provinces.geojson", "ne_50m_lakes_canada.geojson"):
        shutil.copyfile(RAW / "natural_earth" / name, OUT / "basemap" / name)
    write_meta(OUT / "basemap" / "basemap.meta.json",
               dataset="basemap", real_or_synthetic="real",
               source_urls=["https://github.com/nvkelso/natural-earth-vector"],
               licence="Natural Earth: public domain",
               assumptions=["coordinates rounded to 3 decimal places", "filtered to North America / Canada"])

    # ---- validation ----
    problems = []
    for r in routes:
        for k in ("origin_airport_id", "destination_airport_id"):
            if r[k] not in apt:
                problems.append(f"route {r['id']} references unknown airport {r[k]}")
    for c in communities:
        if c["airport_id"] not in apt:
            problems.append(f"community {c['id']} has unknown airport")
    for a in airports:
        if not (40 <= a["lat"] <= 85 and -145 <= a["lon"] <= -50):
            problems.append(f"airport {a['id']} has out-of-range coordinates")
    # every community reachable by some aircraft type: runway threshold check only (graph check in tests)
    min_rwy_fleet = min(a["min_runway_length_m"] for a in aircraft)
    for c in communities:
        if apt[c["airport_id"]]["runway_length_m"] < min_rwy_fleet:
            problems.append(f"{c['name']} runway shorter than any aircraft can use")
    if problems:
        raise SystemExit("VALIDATION FAILED:\n  " + "\n  ".join(problems))

    print(f"airports={len(airports)} communities={len(communities)} routes={len(routes)} aircraft={len(aircraft)} schedule_legs={len(schedule)}")
    print("runway supplement applied:", supplement_flags)


if __name__ == "__main__":
    main()
