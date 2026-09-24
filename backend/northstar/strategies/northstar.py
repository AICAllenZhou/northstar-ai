"""NORTHSTAR optimizer: aircraft-to-mission assignment and sequencing with OR-Tools CP-SAT.

At every replanning event the strategy builds one constraint model over the undeparted
missions inside a lookahead window and every usable aircraft:

  x[a,m]        aircraft a serves mission m (only created when the shared feasibility helper
                says the pair is feasible: availability, capacity, runway, range, open path)
  circuit(a)    per-aircraft Hamiltonian circuit over {depot} U missions -> mission order,
                with repositioning (transition) times on the arcs
  arr_o[m]      arrival of the aircraft at the mission origin (medical response)
  dep[m]        departure from the origin (>= release, >= arr_o + turnaround if repositioned)
  arr_d[m]      arrival at destination = dep + mission duration
  served[m]     sum_a x[a,m] (<= 1); unserved missions are censored at the horizon end,
                exactly as the metrics engine does
  late[m]       max(0, arr_d - due) for cargo (deadline) and passenger (scheduled arrival)
  changed[m]    1 if the mission is flown by a different aircraft than currently planned/scheduled

Objective (weights from the policy profile, all declared assumptions):
  sum medical w_med[p] * (arr_o - release)
  + w_cargo * late + w_pax * late (+ w_conn * late for inbound community flights)
  + w_conn * (arr_d - now) for missions that would restore a currently disconnected community
  + unserved penalties + distance * cost index + path risk + reroute penalty + tiny id tie-breaker

Solver: single worker, fixed seed, hard time limit. Status is reported, never hidden.
"""
from __future__ import annotations

import time

from ortools.sat.python import cp_model

from northstar.config import SOLVER_LOOKAHEAD_MIN, SOLVER_SEED, SOLVER_TIME_LIMIT_S, TURNAROUND_MIN, Policy, get_policy
from northstar.models import Assignment, MissionType, Plan
from northstar.sim.state import StrategyView
from northstar.strategies.base import Candidate, Infeasible, restate_queues, transition

SCALE = 10  # weights are multiplied by this and rounded to integers for CP-SAT


class NorthstarStrategy:
    name = "northstar"

    def __init__(self, policy: Policy | None = None, time_limit_s: float = SOLVER_TIME_LIMIT_S,
                 lookahead_min: int = SOLVER_LOOKAHEAD_MIN, workers: int = 1, seed: int = SOLVER_SEED) -> None:
        self.policy = policy or get_policy("balanced")
        self.time_limit_s = time_limit_s
        self.lookahead_min = lookahead_min
        self.workers = workers
        self.seed = seed
        self._last_sig: tuple | None = None
        self.contexts: list[dict] = []  # decision context per solve, consumed by the explainer

    # ------------------------------------------------------------------
    def plan(self, view: StrategyView) -> Plan:
        st, t, net = view.state, view.t, view.network
        pol = self.policy
        missions = [ms for ms in view.visible_missions()
                    if ms.mission.is_critical or ms.mission.release_min <= t + self.lookahead_min]
        missions.sort(key=lambda ms: ms.mission.id)
        aircraft = view.usable_aircraft()
        sig = (
            tuple((ms.mission.id, ms.status, ms.aircraft_id) for ms in missions),
            tuple(sorted(st.closed_airports)), tuple(sorted(st.closed_routes)),
            tuple(sorted(st.failed_aircraft(t))), tuple(aircraft),
            tuple(sorted(mid for a in st.aircraft.values() for mid in a.queue)),
        )
        if sig == self._last_sig:
            return Plan(strategy=self.name, status="UNCHANGED")
        self._last_sig = sig
        if not missions:
            return Plan(strategy=self.name, status="OK", assignments=restate_queues(view))

        # ---- candidate table (shared feasibility helper) ----
        cands: dict[tuple[str, str], Candidate] = {}
        infeasible: dict[str, dict[str, str]] = {m.mission.id: {} for m in missions}
        avail_at: dict[str, int] = {}
        for aid in aircraft:
            ast = st.aircraft[aid]
            avail_at[aid] = max(ast.free_at, t)
            for ms in missions:
                c = view.candidate(aid, ms.mission.id, pol.risk_path_lambda)
                if isinstance(c, Candidate):
                    cands[(aid, ms.mission.id)] = c
                else:
                    infeasible[ms.mission.id][aid] = c.code
        feasible_missions = {m for (_, m) in cands}
        if not feasible_missions:
            reasons = {mid: _dominant_reason(codes) for mid, codes in infeasible.items()}
            self.contexts.append({"t": t, "status": "NO_FEASIBLE_SOLUTION", "missions": [m.mission.id for m in missions],
                                  "aircraft": aircraft, "candidates": {}, "infeasible": infeasible, "chosen": {}})
            return Plan(strategy=self.name, status="NO_FEASIBLE_SOLUTION", assignments=restate_queues(view),
                        unserved=reasons, solver={"status": "NO_FEASIBLE_SOLUTION", "wall_ms": 0, "objective": None,
                                                  "n_missions": len(missions), "n_aircraft": len(aircraft), "n_pairs": 0})

        # ---- model ----
        H = st.scenario.horizon_min
        mdl = cp_model.CpModel()
        mids = [ms.mission.id for ms in missions]
        by_id = {ms.mission.id: ms for ms in missions}
        arr_o = {m: mdl.NewIntVar(0, H, f"arr_o[{m}]") for m in mids}
        dep = {m: mdl.NewIntVar(0, H, f"dep[{m}]") for m in mids}
        arr_d = {m: mdl.NewIntVar(0, H, f"arr_d[{m}]") for m in mids}
        served = {m: mdl.NewBoolVar(f"served[{m}]") for m in mids}
        x: dict[tuple[str, str], cp_model.IntVar] = {}
        arc_cost_terms = []
        disconnected_now = view.disconnected_now()
        trans_cache: dict[tuple[str, str, str], tuple[int, float, list[str]] | None] = {}

        for aid in aircraft:
            nodes = [m for m in mids if (aid, m) in cands]
            if not nodes:
                continue
            ac = net.aircraft[aid]
            idx = {None: 0, **{m: i + 1 for i, m in enumerate(nodes)}}
            arcs = []
            # depot self-loop: aircraft idle
            idle = mdl.NewBoolVar(f"idle[{aid}]")
            arcs.append((0, 0, idle))
            for m in nodes:
                c = cands[(aid, m)]
                xv = mdl.NewBoolVar(f"x[{aid},{m}]")
                x[(aid, m)] = xv
                arcs.append((idx[m], idx[m], xv.Not()))  # self-loop == not served by this aircraft
                # depot -> m
                lit = mdl.NewBoolVar(f"arc[{aid},depot,{m}]")
                arcs.append((0, idx[m], lit))
                mdl.AddImplication(lit, xv)
                if c.repos_min > 0:
                    mdl.Add(arr_o[m] >= avail_at[aid] + c.repos_min).OnlyEnforceIf(lit)
                    mdl.Add(dep[m] >= arr_o[m] + TURNAROUND_MIN).OnlyEnforceIf(lit)
                else:
                    mdl.Add(arr_o[m] >= avail_at[aid]).OnlyEnforceIf(lit)
                km = c.repos_km + c.mission_km
                arc_cost_terms.append(lit * int(round(SCALE * pol.w_distance_per_km_index * ac.cost_index_per_km * km)))
                # m -> depot (end of route)
                back = mdl.NewBoolVar(f"arc[{aid},{m},depot]")
                arcs.append((idx[m], 0, back))
                mdl.AddImplication(back, xv)
                # m1 -> m2
                for m2 in nodes:
                    if m2 == m:
                        continue
                    c2 = cands[(aid, m2)]
                    key = (aid, c.dest, c2.origin)
                    if key not in trans_cache:
                        trans_cache[key] = transition(st, aid, c.dest, c2.origin, pol.risk_path_lambda)
                    tr = trans_cache[key]
                    if tr is None:
                        continue
                    tmin, tkm, _ = tr
                    lit2 = mdl.NewBoolVar(f"arc[{aid},{m},{m2}]")
                    arcs.append((idx[m], idx[m2], lit2))
                    mdl.AddImplication(lit2, xv)  # (circuit semantics already force x[a,m2]; kept for propagation)
                    if tmin > 0:
                        mdl.Add(arr_o[m2] >= arr_d[m] + TURNAROUND_MIN + tmin).OnlyEnforceIf(lit2)
                        mdl.Add(dep[m2] >= arr_o[m2] + TURNAROUND_MIN).OnlyEnforceIf(lit2)
                    else:
                        mdl.Add(arr_o[m2] >= arr_d[m] + TURNAROUND_MIN).OnlyEnforceIf(lit2)
                    arc_cost_terms.append(lit2 * int(round(SCALE * pol.w_distance_per_km_index * ac.cost_index_per_km * (tkm + c2.mission_km))))
            mdl.AddCircuit(arcs)

        # served / time linkage
        obj_terms = list(arc_cost_terms)
        for m in mids:
            ms = by_id[m]
            mm = ms.mission
            xs = [x[(a, m)] for a in aircraft if (a, m) in x]
            if xs:
                mdl.Add(sum(xs) == served[m])
            else:
                mdl.Add(served[m] == 0)
            # unserved -> censored at horizon end
            mdl.Add(arr_o[m] >= H).OnlyEnforceIf(served[m].Not())
            mdl.Add(dep[m] >= H).OnlyEnforceIf(served[m].Not())
            mdl.Add(arr_d[m] == dep[m] + sum(x[(a, m)] * cands[(a, m)].mission_min for a in aircraft if (a, m) in x)).OnlyEnforceIf(served[m])
            mdl.Add(arr_d[m] == H).OnlyEnforceIf(served[m].Not())
            mdl.Add(dep[m] >= arr_o[m])
            mdl.Add(arr_o[m] >= mm.release_min)
            mdl.Add(dep[m] >= mm.release_min)
            # objective pieces
            if mm.type == MissionType.medical:
                w = int(round(SCALE * pol.w_medical_per_min.get(mm.priority, pol.w_medical_per_min[3])))
                obj_terms.append(w * (arr_o[m] - mm.release_min))
            if mm.type == MissionType.cargo:
                obj_terms.append(int(round(SCALE * pol.w_cargo_time_per_min)) * (arr_d[m] - mm.release_min))
            due = mm.deadline_min if mm.type == MissionType.cargo else mm.scheduled_arrival_min
            if due is not None:
                late = mdl.NewIntVar(0, H, f"late[{m}]")
                mdl.Add(late >= arr_d[m] - due)
                w_late = pol.w_cargo_late_per_min if mm.type == MissionType.cargo else pol.w_passenger_late_per_min
                inbound = mm.community_id is not None and mm.dest == net.communities[mm.community_id].airport_id
                if mm.type == MissionType.passenger and inbound:
                    w_late += pol.w_connectivity_per_min
                obj_terms.append(int(round(SCALE * w_late)) * late)
            if mm.community_id in disconnected_now and mm.type in (MissionType.passenger, MissionType.cargo) \
                    and mm.dest == net.communities[mm.community_id].airport_id:
                obj_terms.append(int(round(SCALE * pol.w_connectivity_per_min)) * (arr_d[m] - t))
            obj_terms.append(int(round(SCALE * pol.pen_unserved[mm.type.value])) * (1 - served[m]))
            for a in aircraft:
                if (a, m) in x:
                    c = cands[(a, m)]
                    obj_terms.append(x[(a, m)] * int(round(SCALE * pol.w_risk * c.risk)))
                    obj_terms.append(x[(a, m)] * (aircraft.index(a) + 1))  # deterministic tie-breaker
            # reroute penalty relative to the current / scheduled aircraft
            ref = ms.aircraft_id if ms.status == "assigned" else mm.scheduled_aircraft_id
            if ref is not None:
                changed = mdl.NewBoolVar(f"changed[{m}]")
                if (ref, m) in x:
                    path_differs = mm.scheduled_path is not None and cands[(ref, m)].mission_path != mm.scheduled_path
                    if path_differs:
                        mdl.Add(changed >= served[m])
                    else:
                        mdl.Add(changed >= served[m] - x[(ref, m)])
                    mdl.AddHint(x[(ref, m)], 1)
                else:
                    mdl.Add(changed >= served[m])
                obj_terms.append(int(round(SCALE * pol.w_reroute)) * changed)
        mdl.Minimize(sum(obj_terms))

        # ---- solve ----
        solver = cp_model.CpSolver()
        solver.parameters.num_workers = self.workers
        solver.parameters.random_seed = self.seed
        solver.parameters.max_time_in_seconds = self.time_limit_s
        t0 = time.perf_counter()
        status = solver.Solve(mdl)
        wall_ms = int((time.perf_counter() - t0) * 1000)
        name = solver.StatusName(status)
        info = {"status": name, "wall_ms": wall_ms, "objective": solver.ObjectiveValue() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
                "n_missions": len(mids), "n_aircraft": len(aircraft), "n_pairs": len(x), "policy": pol.id,
                "workers": self.workers, "lookahead_min": self.lookahead_min}
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            plan_status = "NO_FEASIBLE_SOLUTION" if status == cp_model.INFEASIBLE else "TIMEOUT"
            self.contexts.append({"t": t, "status": plan_status, "missions": mids, "aircraft": aircraft,
                                  "candidates": _serialize_cands(cands), "infeasible": infeasible, "chosen": {}})
            return Plan(strategy=self.name, status=plan_status, assignments=restate_queues(view),
                        unserved={m: "SOLVER_" + plan_status for m in mids if by_id[m].status == "pending"}, solver=info)

        # ---- extract per-aircraft sequences ----
        assignments: list[Assignment] = []
        chosen: dict[str, str] = {}
        for aid in aircraft:
            mine = [m for m in mids if (aid, m) in x and solver.Value(x[(aid, m)])]
            mine.sort(key=lambda m: (solver.Value(arr_o[m]), solver.Value(dep[m]), m))
            prev_dest = None
            for m in mine:
                c = cands[(aid, m)]
                repos_path = list(c.repos_path)
                if prev_dest is not None:
                    tr = trans_cache.get((aid, prev_dest, c.origin)) or transition(st, aid, prev_dest, c.origin, pol.risk_path_lambda)
                    repos_path = list(tr[2]) if tr else [c.origin]
                assignments.append(Assignment(
                    mission_id=m, aircraft_id=aid, origin=c.origin, dest=c.dest, path=list(c.mission_path),
                    repos_path=repos_path, est_depart_min=solver.Value(dep[m]) if len(repos_path) <= 1 else max(avail_at[aid], t),
                    est_response_min=solver.Value(arr_o[m]), est_complete_min=solver.Value(arr_d[m]),
                    est_km=round(c.total_km, 1), est_risk=round(c.risk, 3), note="CP-SAT assignment"))
                chosen[m] = aid
                prev_dest = c.dest
        unserved = {}
        for m in mids:
            if m in chosen or by_id[m].status != "pending":
                continue
            unserved[m] = _dominant_reason(infeasible[m]) if m not in feasible_missions else "DEFERRED_BY_OPTIMIZER"
        # keep queued assignments for missions outside the window
        in_window = set(mids)
        for asg in restate_queues(view):
            if asg.mission_id not in in_window:
                assignments.append(asg)
        self.contexts.append({"t": t, "status": name, "missions": mids, "aircraft": aircraft,
                              "candidates": _serialize_cands(cands), "infeasible": infeasible, "chosen": chosen,
                              "avail_at": avail_at, "objective": info["objective"],
                              "est": {m: {"arr_o": solver.Value(arr_o[m]), "dep": solver.Value(dep[m]), "arr_d": solver.Value(arr_d[m])} for m in mids}})
        return Plan(strategy=self.name, status="OK" if status == cp_model.OPTIMAL else "PARTIAL",
                    assignments=assignments, unserved=unserved, solver=info)


def _dominant_reason(codes: dict[str, str]) -> str:
    if not codes:
        return "NO_USABLE_AIRCRAFT"
    priority = ["ORIGIN_CLOSED", "DEST_CLOSED", "NO_PATH_MISSION", "NO_PATH_TO_ORIGIN", "RUNWAY_DEST", "RUNWAY_ORIGIN",
                "CAPACITY_KG", "CAPACITY_PEOPLE", "AIRCRAFT_STRANDED", "AIRCRAFT_FAILED"]
    counts: dict[str, int] = {}
    for c in codes.values():
        counts[c] = counts.get(c, 0) + 1
    return max(counts, key=lambda k: (counts[k], -priority.index(k) if k in priority else -99))


def _serialize_cands(cands: dict[tuple[str, str], Candidate]) -> dict[str, dict[str, dict]]:
    out: dict[str, dict[str, dict]] = {}
    for (a, m), c in cands.items():
        out.setdefault(m, {})[a] = {
            "origin": c.origin, "dest": c.dest, "repos_min": c.repos_min, "mission_min": c.mission_min,
            "repos_km": round(c.repos_km, 1), "mission_km": round(c.mission_km, 1), "est_response": c.est_response,
            "est_complete": c.est_complete, "risk": round(c.risk, 3), "path": list(c.mission_path), "repos_path": list(c.repos_path),
        }
    return out
