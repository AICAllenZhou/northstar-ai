#!/usr/bin/env bash
# Start backend (uvicorn, port 8000) and frontend dev server (Vite, port 5173) together.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend" && uv sync --extra dev -q
cd "$ROOT/frontend" && [ -d node_modules ] || npm install --no-audit --no-fund
trap 'kill 0' EXIT
(cd "$ROOT/backend" && uv run uvicorn northstar.api.main:app --port 8000 --reload) &
(cd "$ROOT/frontend" && npm run dev -- --port 5173) &
echo
echo "  NORTHSTAR AI dev:  http://localhost:5173   (API: http://localhost:8000/api/health)"
echo
wait
