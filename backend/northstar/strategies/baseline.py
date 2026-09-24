"""Rule-based baseline dispatcher (non-AI).

Rules, applied at every replanning event, for each released pending mission in priority order
(medical, cargo, passenger; then priority; then release time; then id):

  Scheduled passenger flights
  1. fly with the scheduled aircraft when it is free right now (on the ground, no other work);
  2. if the scheduled aircraft is unserviceable or stranded at a closed airport, use the nearest
     free compatible aircraft instead;
  3. otherwise wait for the scheduled aircraft (the flight is delayed, not reassigned).

  Medical and cargo missions
  4. list aircraft that are free right now and pass the shared feasibility check
     (not failed, capacity, runway, range, open path);
  5. pick the one with the shortest repositioning flight (tie: aircraft id);

  Everything
  6. fly the shortest open path by distance;
  7. if no aircraft qualifies, leave the mission in the queue and try again at the next event.

The baseline never revisits an assignment once made. It is deliberately simple and is not tuned.
Version note: an earlier version reassigned scheduled flights to any free aircraft as soon as they
were released; that produced worse passenger metrics than flying the published schedule at all,
i.e. a strawman, and was replaced by rules 1-3 before any experiment result was recorded.
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
            candidates = free
            note = "nearest free compatible aircraft, shortest open route"
            if m.type == MissionType.passenger and m.scheduled_aircraft_id is not None:
                sched = m.scheduled_aircraft_id
                sched_state = view.state.aircraft[sched]
                sched_unusable = sched_state.is_failed(view.t) or sched_state.pending_failure or view.state.is_stranded(sched)
                if not sched_unusable:
                    candidates = [sched] if sched in free else []
                    note = "scheduled aircraft, shortest open route"
                    if not candidates:
                        unserved[m.id] = "WAITING_FOR_SCHEDULED_AIRCRAFT"
                        continue
                else:
                    note = "scheduled aircraft unavailable; nearest free compatible aircraft"
            best, best_key = None, None
            for aid in candidates:
                c = view.candidate(aid, m.id)
                if isinstance(c, Infeasible):
                    continue
                key = (c.repos_min, aid)
                if best_key is None or key < best_key:
                    best, best_key = c, key
            if best is None:
                unserved[m.id] = "NO_FREE_COMPATIBLE_AIRCRAFT" if candidates else "NO_FREE_AIRCRAFT"
                continue
            assignments.append(assignment_from_candidate(best, note))
            free.remove(best.aircraft_id)
        return Plan(strategy=self.name, status="OK", assignments=assignments, unserved=unserved)
