"""'Do nothing' strategy: fly the published schedule with the scheduled aircraft when possible; respond to nothing."""
from __future__ import annotations

from northstar.models import Plan
from northstar.sim.state import StrategyView
from northstar.strategies.base import Candidate, assignment_from_candidate, restate_queues


class ScheduleOnlyStrategy:
    name = "do_nothing"

    def plan(self, view: StrategyView) -> Plan:
        assignments = restate_queues(view)
        busy = {a.aircraft_id for a in assignments}
        unserved = {}
        for ms in sorted(view.pending_missions(), key=lambda x: (x.mission.release_min, x.mission.id)):
            m = ms.mission
            if m.source != "schedule":
                unserved[m.id] = "NO_RESPONSE_POLICY"
                continue
            if m.release_min > view.t:
                continue
            aid = m.scheduled_aircraft_id
            if aid is None or aid in busy or aid not in view.free_aircraft():
                continue
            c = view.candidate(aid, m.id)
            if isinstance(c, Candidate) and c.mission_path == m.scheduled_path and len(c.repos_path) == 1:
                assignments.append(assignment_from_candidate(c, "scheduled aircraft, scheduled route"))
                busy.add(aid)
        return Plan(strategy=self.name, status="OK", assignments=assignments, unserved=unserved)
