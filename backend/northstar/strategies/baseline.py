"""Rule-based baseline dispatcher (non-AI).

Rules, applied at every replanning event, for each released pending mission,
in priority order (medical, cargo, passenger; then priority; then release time; then id):
  1. list aircraft that are free right now and pass the shared feasibility check
     (not failed, capacity, runway, range, open path);
  2. pick the one with the shortest repositioning flight (tie: the scheduled aircraft, then id);
  3. fly the shortest open path by distance;
  4. otherwise leave the mission in the queue and try again at the next event.
The baseline never revisits an assignment once made. It is deliberately simple and is not tuned.
"""
from __future__ import annotations

from northstar.models import MissionType, Plan
from northstar.sim.state import StrategyView
from northstar.strategies.base import Candidate, Infeasible, assignment_from_candidate, restate_queues

PRIORITY_ORDER = {MissionType.medical: 0, MissionType.cargo: 1, MissionType.passenger: 2}


class BaselineStrategy:
    name = "baseline"

    def plan(self, view: StrategyView) -> Plan:
        assignments = restate_queues(view)
        free = view.free_aircraft()
        unserved: dict[str, str] = {}
        pending = sorted(view.pending_missions(),
                         key=lambda x: (PRIORITY_ORDER[x.mission.type], x.mission.priority, x.mission.release_min, x.mission.id))
        for ms in pending:
            m = ms.mission
            if m.release_min > view.t:
                continue  # dispatch when due, not before
            best, best_key, reasons = None, None, {}
            for aid in free:
                c = view.candidate(aid, m.id)
                if isinstance(c, Infeasible):
                    reasons[c.code] = reasons.get(c.code, 0) + 1
                    continue
                key = (c.repos_min, 0 if aid == m.scheduled_aircraft_id else 1, aid)
                if best_key is None or key < best_key:
                    best, best_key = c, key
            if best is None:
                unserved[m.id] = "NO_FREE_COMPATIBLE_AIRCRAFT" if free else "NO_FREE_AIRCRAFT"
                continue
            assignments.append(assignment_from_candidate(best, "nearest free compatible aircraft, shortest open route"))
            free.remove(best.aircraft_id)
        return Plan(strategy=self.name, status="OK", assignments=assignments, unserved=unserved)
