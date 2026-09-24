#!/usr/bin/env bash
# Competition demo: build the frontend once, serve everything from one local process, fully offline.
#
#   scripts/demo.sh            # http://localhost:8000/
#   PORT=8010 scripts/demo.sh  # another port
#   REBUILD=1 scripts/demo.sh  # force a frontend rebuild
#   SMOKE=1 scripts/demo.sh    # also run scripts/smoke_test.py once the server is ready (it resets the session afterwards)
#
# The server precomputes every preset (do nothing, baseline, NORTHSTAR) at start-up with the same
# engine the RUN button uses; this script waits for that and prints "ready". It never loads a
# scenario into the session itself, so the first screen a presenter sees is the healthy network.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8000}"
BASE="http://localhost:$PORT"
cd "$ROOT/backend" && uv sync --extra dev -q
if [ ! -f "$ROOT/frontend/dist/index.html" ] || [ "${REBUILD:-0}" = "1" ]; then
  cd "$ROOT/frontend" && ([ -d node_modules ] || npm install --no-audit --no-fund) && npm run build
fi
cd "$ROOT/backend"
echo
echo "  NORTHSTAR AI demo:  $BASE/     (Ctrl-C to stop)"
uv run uvicorn northstar.api.main:app --port "$PORT" --log-level warning &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null || true' INT TERM EXIT
if uv run python "$ROOT/scripts/wait_ready.py" --base "$BASE"; then
  if [ "${SMOKE:-0}" = "1" ]; then
    uv run python "$ROOT/scripts/smoke_test.py" --base "$BASE" || echo "  smoke test failed; check the output above"
  fi
  echo "  open $BASE/ and press Launch NORTHSTAR, then Start guided demo."
else
  echo "  the server is up but warm-up did not complete; the demo still works (first runs solve live)."
fi
wait "$SERVER"
