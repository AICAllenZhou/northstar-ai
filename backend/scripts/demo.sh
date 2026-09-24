#!/usr/bin/env bash
# Competition demo: build the frontend once, serve everything from one local process, fully offline.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8000}"
cd "$ROOT/backend" && uv sync --extra dev -q
if [ ! -f "$ROOT/frontend/dist/index.html" ] || [ "${REBUILD:-0}" = "1" ]; then
  cd "$ROOT/frontend" && ([ -d node_modules ] || npm install --no-audit --no-fund) && npm run build
fi
cd "$ROOT/backend"
echo
echo "  NORTHSTAR AI demo:  http://localhost:$PORT/     (Ctrl-C to stop)"
echo "  Pre-warming the optimizer..."
(sleep 2 && uv run python "$ROOT/scripts/smoke_test.py" --quiet --base "http://localhost:$PORT" || echo "  warm-up failed; check the terminal above") &
exec uv run uvicorn northstar.api.main:app --port "$PORT" --log-level warning
