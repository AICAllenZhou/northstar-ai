"""Structured explanations for NORTHSTAR decisions.

Every field is derived from (a) the candidate table the optimizer saw when it made the
decision, (b) the solver's chosen values and (c) the executed baseline and NORTHSTAR traces.
Text is produced only by string templates over those fields. No language model is involved.
"""
from __future__ import annotations

from northstar.config import MEDICAL_TARGET_MIN
from northstar.models import MissionType, Network, Trace

REASON_TEXT = {
    "AIRCRAFT_FAILED": "unserviceable",
    "AIRCRAFT_STRANDED": "on the ground at a closed airport",
    "CAPACITY_PEOPLE": "not enough seats",
    "CAPACITY_KG": "not enough cargo capacity",
    "RUNWAY_ORIGIN": "cannot use the origin runway",
    "RUNWAY_DEST": "cannot use the destination runway",
    "NO_PATH_MISSION": "no open route within range between origin and destination",
    "NO_PATH_TO_ORIGIN": "no open route within range to reach the origin",
    "ORIGIN_CLOSED": "origin airport closed",
    "DEST_CLOSED": "destination airport closed",
    "DEFERRED_BY_OPTIMIZER": "left unserved by the optimizer because every option cost more than the penalty",
    "NO_USABLE_AIRCRAFT": "no usable aircraft",
}


def _fmt_min(m: float | int | None) -> str:
    if m is None:
        return "n/a"
    m = int(m)
    return f"{m // 60}h{m % 60:02d}" if m >= 60 else f"{m} min"


def _clock(m: int | None) -> str:
    if m is None:
        return "—"
    total = 6 * 60 + int(m)
    return f"{(total // 60) % 24:02d}:{total % 60:02d}"


def explain(network: Network, northstar_trace: Trace, baseline_trace: Trace | None, contexts: list[dict]) -> list[dict]:
    """One DecisionRecord per NORTHSTAR-served (or explicitly unserved) medical/cargo mission and per rerouted flight."""
    records = []
    n_out = northstar_trace.missions
    b_out = baseline_trace.missions if baseline_trace else {}
    # which aircraft did the baseline use for each mission
    for mid in sorted(n_out, key=lambda k: (0 if n_out[k].type == MissionType.medical else 1 if n_out[k].type == MissionType.cargo else 2, k)):
        o = n_out[mid]
        rerouted = o.status == "completed" and (o.aircraft_id != o.scheduled_aircraft_id
                                                 or (o.scheduled_path is not None and o.path != o.scheduled_path))
        important = o.type != MissionType.passenger or rerouted or o.status != "completed"
        if not important:
            continue
        ctx = _context_for(contexts, mid, o.aircraft_id)
        rec = {
            "mission_id": mid, "mission_type": o.type.value, "priority": o.priority, "label": o.label,
            "community_id": o.community_id, "status": o.status,
            "aircraft_id": o.aircraft_id, "aircraft_type": network.aircraft[o.aircraft_id].type if o.aircraft_id else None,
            # Clock times are minutes since 06:00; response_min is the pick-up time, not a duration.
            # response_after_request_min is the duration a reader usually wants (pick-up minus request).
            "path": o.path, "depart_min": o.depart_min, "response_min": o.response_min, "complete_min": o.complete_min,
            "release_min": o.release_min,
            "response_after_request_min": (o.response_min - o.release_min) if o.response_min is not None else None,
            "decided_at_min": ctx["t"] if ctx else None,
            "reasons": [], "alternatives": [], "vs_baseline": None, "tradeoffs": [], "summary": "",
        }
        # --- reasons ---
        if o.type == MissionType.medical:
            rec["reasons"].append({"code": "PRIORITY", "text": f"Medical priority {o.priority}; target response {MEDICAL_TARGET_MIN} min",
                                   "data": {"priority": o.priority}})
        elif o.type == MissionType.cargo:
            rec["reasons"].append({"code": "PRIORITY", "text": f"Essential cargo, deadline {_clock(o.deadline_min)}", "data": {"deadline_min": o.deadline_min}})
        if o.status == "completed" and o.aircraft_id and ctx:
            cands = ctx["candidates"].get(mid, {})
            infeas = ctx["infeasible"].get(mid, {})
            chosen = cands.get(o.aircraft_id)
            ac = network.aircraft[o.aircraft_id]
            if chosen:
                key = "est_response" if o.type == MissionType.medical else "est_complete"
                what = "response" if o.type == MissionType.medical else "completion"
                ranked = sorted(cands.items(), key=lambda kv: (kv[1][key], kv[1]["repos_min"], kv[0]))
                rank = [a for a, _ in ranked].index(o.aircraft_id) + 1
                nearest_id = ranked[0][0]
                if rank == 1:
                    rec["reasons"].append({"code": "NEAREST_RANK", "text": f"Earliest-{what} compatible aircraft available",
                                           "data": {"rank": 1, "est_min": chosen[key] - o.release_min, "what": what}})
                else:
                    why = _why_not(ctx, nearest_id, mid, n_out)
                    rec["reasons"].append({"code": "NEAREST_RANK", "data": {"rank": rank, "nearest_id": nearest_id, "what": what},
                                           "text": f"Ranked #{rank} by {what} time; the earliest option ({nearest_id}) was {why}"})
                if o.type == MissionType.passenger and rerouted:
                    if o.aircraft_id != o.scheduled_aircraft_id:
                        rec["reasons"].append({"code": "REASSIGNED", "data": {"scheduled_aircraft_id": o.scheduled_aircraft_id},
                                               "text": f"Scheduled aircraft {o.scheduled_aircraft_id} replaced by {o.aircraft_id}"})
                    if o.scheduled_path is not None and o.path != o.scheduled_path:
                        rec["reasons"].append({"code": "PATH_CHANGED", "data": {"scheduled_path": o.scheduled_path},
                                               "text": "Flown on a different path than scheduled (closure or alternate hub)"})
                rec["reasons"].append({"code": "RUNWAY_OK", "text": f"{ac.type} can use the {network.airports[chosen['dest']].runway_length_m} m "
                                                                     f"{network.airports[chosen['dest']].runway_surface} runway at {network.airports[chosen['dest']].community_name}",
                                       "data": {"min_runway_m": ac.min_runway_length_m}})
                rec["reasons"].append({"code": "RANGE_OK", "text": f"Every hop within the {int(ac.range_km)} km range",
                                       "data": {"range_km": ac.range_km, "mission_km": chosen["mission_km"]}})
                if len(chosen["path"]) > 2:
                    via = ", ".join(network.airports[p].community_name for p in chosen["path"][1:-1])
                    rec["reasons"].append({"code": "MULTI_HOP", "text": f"Routed via {via}", "data": {"path": chosen["path"]}})
                if o.origin and o.origin != _preferred_origin(mid, contexts) or (o.dest and o.dest != _preferred_dest(mid, contexts)):
                    rec["reasons"].append({"code": "ALTERNATE_HUB", "text": f"Alternate hub used: {network.airports[o.origin].community_name} → {network.airports[o.dest].community_name}",
                                           "data": {"origin": o.origin, "dest": o.dest}})
                if chosen["risk"] > 0.3:
                    rec["reasons"].append({"code": "RISK", "text": f"Path risk {chosen['risk']:.2f} accepted (weighted in the objective)", "data": {"risk": chosen["risk"]}})
                if o.response_min is not None and o.depart_min is not None and o.response_min < o.release_min + 1 and o.type != MissionType.passenger:
                    rec["reasons"].append({"code": "PREPOSITIONED", "text": "Aircraft was already at the origin", "data": {}})
            # alternatives
            for aid in sorted(set(cands) | set(infeas)):
                if aid == o.aircraft_id:
                    continue
                if aid in infeas:
                    rec["alternatives"].append({"aircraft_id": aid, "verdict": "rejected", "reason_code": infeas[aid],
                                                "text": f"{aid} ({network.aircraft[aid].type}): {REASON_TEXT.get(infeas[aid], infeas[aid])}", "reposition_min": None})
                else:
                    c = cands[aid]
                    used_for = ctx["chosen_by_aircraft"].get(aid)
                    verdict = "busy" if used_for and used_for != mid else "worse"
                    k2 = "est_response" if o.type == MissionType.medical else "est_complete"
                    txt = f"{aid} ({network.aircraft[aid].type}): feasible, {'response' if o.type == MissionType.medical else 'completion'} {_fmt_min(c[k2] - o.release_min)} after request"
                    if verdict == "busy":
                        txt += f"; assigned to {used_for} instead"
                    rec["alternatives"].append({"aircraft_id": aid, "verdict": verdict, "reason_code": None, "text": txt,
                                                "reposition_min": c["repos_min"]})
        elif o.status != "completed":
            code = o.infeasible_reason or "NOT_SERVED_WITHIN_HORIZON"
            rec["reasons"].append({"code": "UNSERVED_BECAUSE", "text": f"Not served: {REASON_TEXT.get(code, code)}", "data": {"code": code}})
            if ctx:
                for aid, c in sorted(ctx["infeasible"].get(mid, {}).items()):
                    rec["alternatives"].append({"aircraft_id": aid, "verdict": "rejected", "reason_code": c,
                                                "text": f"{aid} ({network.aircraft[aid].type}): {REASON_TEXT.get(c, c)}", "reposition_min": None})
        # --- versus baseline ---
        if mid in b_out:
            b = b_out[mid]
            if o.type == MissionType.medical:
                nv = (o.response_min - o.release_min) if o.response_min is not None and o.status == "completed" else None
                bv = (b.response_min - b.release_min) if b.response_min is not None and b.status == "completed" else None
                metric = "response_min"
            else:
                nv = o.complete_min if o.status == "completed" else None
                bv = b.complete_min if b.status == "completed" else None
                metric = "complete_min"
            delta = (nv - bv) if (nv is not None and bv is not None) else None
            rec["vs_baseline"] = {"baseline_aircraft_id": b.aircraft_id, "baseline_status": b.status, "metric": metric,
                                  "baseline_value": bv, "northstar_value": nv, "delta_min": delta}
        # --- tradeoffs: missions the baseline flew with this aircraft that NORTHSTAR finished later ---
        if o.aircraft_id and baseline_trace:
            for mid2, b2 in b_out.items():
                if mid2 == mid or b2.aircraft_id != o.aircraft_id or b2.status != "completed":
                    continue
                n2 = n_out.get(mid2)
                if n2 is None:
                    continue
                if n2.status != "completed":
                    rec["tradeoffs"].append({"mission_id": mid2, "delta_min": None,
                                             "text": f"{mid2} ({n2.label}) was flown by {o.aircraft_id} in the baseline and is unserved under NORTHSTAR"})
                elif n2.complete_min is not None and b2.complete_min is not None and n2.complete_min > b2.complete_min:
                    d = n2.complete_min - b2.complete_min
                    rec["tradeoffs"].append({"mission_id": mid2, "delta_min": d,
                                             "text": f"{mid2} ({n2.label}) arrives {_fmt_min(d)} later than in the baseline"})
        rec["summary"] = _summary(network, rec)
        records.append(rec)
    return records


def _context_for(contexts: list[dict], mid: str, aircraft_id: str | None) -> dict | None:
    best = None
    for ctx in contexts:
        if mid not in ctx.get("missions", []):
            continue
        if aircraft_id is None or ctx.get("chosen", {}).get(mid) == aircraft_id:
            best = ctx
    if best is None:
        for ctx in contexts:
            if mid in ctx.get("missions", []):
                best = ctx
    if best is not None and "chosen_by_aircraft" not in best:
        best["chosen_by_aircraft"] = {a: m for m, a in best.get("chosen", {}).items()}
    return best


def _why_not(ctx: dict, aircraft_id: str, mid: str, outcomes) -> str:
    used_for = ctx["chosen_by_aircraft"].get(aircraft_id)
    if used_for and used_for != mid:
        lab = outcomes[used_for].label if used_for in outcomes else used_for
        return f"assigned to {used_for} ({lab})"
    return "not selected because the overall plan cost was lower without it"


def _preferred_origin(mid: str, contexts: list[dict]) -> str | None:
    for ctx in contexts:
        for a, c in ctx.get("candidates", {}).get(mid, {}).items():
            return c["origin"]
    return None


def _preferred_dest(mid: str, contexts: list[dict]) -> str | None:
    for ctx in contexts:
        for a, c in ctx.get("candidates", {}).get(mid, {}).items():
            return c["dest"]
    return None


def _summary(network: Network, rec: dict) -> str:
    if rec["status"] != "completed":
        r = rec["reasons"][-1]["text"] if rec["reasons"] else "not served"
        return f"{rec['mission_id']} could not be served: {r}."
    ac = rec["aircraft_id"]
    parts = [f"{ac} ({rec['aircraft_type']}) was selected for {rec['mission_id']}"]
    rk = next((x for x in rec["reasons"] if x["code"] == "NEAREST_RANK"), None)
    if rk:
        what = rk["data"].get("what", "response")
        if rk["data"].get("rank") == 1:
            parts.append(f"because it was the earliest-{what} compatible aircraft")
        else:
            parts.append(f"because although it ranked #{rk['data']['rank']} by {what} time, the earliest option ({rk['data']['nearest_id']}) was "
                         + rk["text"].split(") was ", 1)[1])
    vb = rec.get("vs_baseline")
    if vb and vb.get("delta_min") is not None and vb["delta_min"] != 0:
        what = "medical response" if rec["mission_type"] == "medical" else "completion"
        parts.append(("cutting" if vb["delta_min"] < 0 else "adding") + f" {_fmt_min(abs(vb['delta_min']))} of {what} time versus the baseline")
    elif vb and vb.get("baseline_status") != "completed":
        parts.append("which the baseline left unserved")
    s = ", ".join(parts) + "."
    if rec["tradeoffs"]:
        t = rec["tradeoffs"][0]
        s += f" Trade-off: {t['text']}."
    return s
