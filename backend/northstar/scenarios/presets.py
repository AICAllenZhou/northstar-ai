"""Preset scenarios for the demo. All disruptions are synthetic. Times are minutes after 06:00."""
from __future__ import annotations

from northstar.models import Disruption, DisruptionType as D, Scenario

PRESETS: dict[str, Scenario] = {}


def _add(s: Scenario) -> Scenario:
    PRESETS[s.id] = s
    return s


_add(Scenario(
    id="kivalliq_wildfire",
    name="Kivalliq wildfire smoke + medevac + cargo",
    description="Wildfire smoke from the tundra south of Rankin Inlet closes the Kivalliq hub and Whale Cove for the "
                "morning. A priority-1 medevac is requested from Chesterfield Inlet and Coral Harbour needs "
                "essential medical supplies. The hub's ATR is grounded for maintenance.",
    tags=["primary-demo", "wildfire", "closure", "medical", "cargo", "aircraft_failure"],
    disruptions=[
        Disruption(id="WF-1", type=D.wildfire, center_lat=62.6, center_lon=-92.4, radius_km=90, severity=0.9,
                   start_min=60, duration_min=600, label="Tundra wildfire smoke, Rankin Inlet area"),
        Disruption(id="AF-1", type=D.aircraft_failure, target_ids=["AC-05"], start_min=0, duration_min=720,
                   label="ATR 42 combi unserviceable"),
        Disruption(id="ME-1", type=D.medical_emergency, target_ids=["COM-YCS"], start_min=120,
                   params={"priority": 1, "patients": 1}, label="Priority-1 medevac, Chesterfield Inlet"),
        Disruption(id="CG-1", type=D.essential_cargo_request, target_ids=["COM-YZS"], start_min=150,
                   params={"payload_kg": 900, "deadline_min": 480, "cargo": "medical supplies"},
                   label="Essential medical supplies, Coral Harbour"),
    ],
))

_add(Scenario(
    id="baffin_blizzard",
    name="Severe Arctic weather over Baffin",
    description="A blizzard closes Iqaluit for six hours and degrades every route on the east Baffin coast. "
                "Clyde River requests a medevac; Pond Inlet is short of essential cargo.",
    tags=["backup-demo", "weather", "closure", "medical", "cargo"],
    disruptions=[
        Disruption(id="WX-1", type=D.severe_weather, target_ids=["CYFB", "CYLC"], severity=0.9, start_min=90, duration_min=360,
                   label="Blizzard closes Iqaluit and Kimmirut"),
        Disruption(id="WX-2", type=D.severe_weather, target_ids=["CYXP", "CYVM", "CYCY"], severity=0.6, start_min=60, duration_min=540,
                   label="Strong winds and low visibility, east Baffin coast"),
        Disruption(id="ME-1", type=D.medical_emergency, target_ids=["COM-YCY"], start_min=180, params={"priority": 1},
                   label="Priority-1 medevac, Clyde River"),
        Disruption(id="CG-1", type=D.essential_cargo_request, target_ids=["COM-YIO"], start_min=120,
                   params={"payload_kg": 1200, "deadline_min": 600, "cargo": "food and fuel"},
                   label="Essential cargo, Pond Inlet"),
    ],
))

_add(Scenario(
    id="kitikmeot_medevac_failure",
    name="Medical emergency + aircraft failure in the Kitikmeot",
    description="The Cambridge Bay medevac aircraft goes unserviceable minutes before two medevac calls: a priority-1 "
                "from Kugaaruk and a priority-2 from Gjoa Haven. Weather raises risk on the Taloyoak corridor.",
    tags=["backup-demo", "medical", "aircraft_failure", "weather"],
    disruptions=[
        Disruption(id="AF-1", type=D.aircraft_failure, target_ids=["AC-09"], start_min=150, duration_min=900,
                   label="PC-12 medevac unserviceable"),
        Disruption(id="ME-1", type=D.medical_emergency, target_ids=["COM-YBB"], start_min=180, params={"priority": 1},
                   label="Priority-1 medevac, Kugaaruk"),
        Disruption(id="ME-2", type=D.medical_emergency, target_ids=["COM-YHK"], start_min=240, params={"priority": 2},
                   label="Priority-2 medevac, Gjoa Haven"),
        Disruption(id="WX-1", type=D.severe_weather, target_ids=["CYYH"], severity=0.6, start_min=120, duration_min=480,
                   label="Low ceilings, Taloyoak"),
    ],
))

_add(Scenario(
    id="cargo_shortage",
    name="Multi-community essential cargo shortage",
    description="Four communities report essential shortages on the same day while a Twin Otter is unserviceable and "
                "Sanikiluaq's only route is closed by weather until noon.",
    tags=["backup-demo", "cargo", "aircraft_failure", "weather"],
    disruptions=[
        Disruption(id="AF-1", type=D.aircraft_failure, target_ids=["AC-01"], start_min=0, duration_min=600,
                   label="Twin Otter unserviceable, Iqaluit"),
        Disruption(id="WX-1", type=D.severe_weather, target_ids=["CYSK"], severity=0.85, start_min=0, duration_min=360,
                   label="Freezing rain, Sanikiluaq"),
        Disruption(id="CG-1", type=D.essential_cargo_request, target_ids=["COM-YSK"], start_min=60,
                   params={"payload_kg": 1500, "deadline_min": 540, "cargo": "food"}),
        Disruption(id="CG-2", type=D.essential_cargo_request, target_ids=["COM-YGZ"], start_min=90,
                   params={"payload_kg": 600, "deadline_min": 600, "cargo": "medical supplies"}),
        Disruption(id="CG-3", type=D.essential_cargo_request, target_ids=["COM-YUT"], start_min=120,
                   params={"payload_kg": 1000, "deadline_min": 480, "cargo": "fuel"}),
        Disruption(id="CG-4", type=D.essential_cargo_request, target_ids=["COM-YLC"], start_min=150,
                   params={"payload_kg": 500, "deadline_min": 420, "cargo": "medical supplies"}),
    ],
))

_add(Scenario(
    id="cascading_failure",
    name="Cascading network failure",
    description="Iqaluit closes for a runway incident, then wildfire smoke reaches Rankin Inlet while the 737 combi is "
                "grounded. Two medevacs and a cargo request arrive during the overlap.",
    tags=["backup-demo", "closure", "wildfire", "medical", "cargo", "aircraft_failure"],
    disruptions=[
        Disruption(id="CL-1", type=D.airport_closure, target_ids=["CYFB"], start_min=120, duration_min=300,
                   label="Runway incident closes Iqaluit"),
        Disruption(id="WF-1", type=D.wildfire, center_lat=62.8, center_lon=-92.1, radius_km=60, severity=0.7,
                   start_min=300, duration_min=360, label="Wildfire smoke, Rankin Inlet"),
        Disruption(id="AF-1", type=D.aircraft_failure, target_ids=["AC-10"], start_min=0, duration_min=1440,
                   label="737 combi grounded"),
        Disruption(id="ME-1", type=D.medical_emergency, target_ids=["COM-YXP"], start_min=180, params={"priority": 1}),
        Disruption(id="ME-2", type=D.medical_emergency, target_ids=["COM-YEK"], start_min=330, params={"priority": 2}),
        Disruption(id="CG-1", type=D.essential_cargo_request, target_ids=["COM-YTE"], start_min=200,
                   params={"payload_kg": 800, "deadline_min": 480, "cargo": "medical supplies"}),
    ],
))

_add(Scenario(id="healthy", name="Healthy network (no disruption)", description="The published schedule on a normal day.",
              tags=["reference"], disruptions=[]))


def get_preset(preset_id: str) -> Scenario:
    if preset_id not in PRESETS:
        raise KeyError(f"unknown preset '{preset_id}'; known: {sorted(PRESETS)}")
    return PRESETS[preset_id].model_copy(deep=True)


def list_presets() -> list[dict]:
    return [{"id": s.id, "name": s.name, "description": s.description, "disruption_count": len(s.disruptions),
             "tags": s.tags} for s in PRESETS.values()]
