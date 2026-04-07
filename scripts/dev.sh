#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"

BACKEND_PID=
FRONTEND_PID=

cleanup() {
    trap - EXIT INT TERM
    echo ""
    echo "Shutting down..."
    [ -n "$BACKEND_PID" ]  && kill "$BACKEND_PID"  2>/dev/null
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
    wait 2>/dev/null
    echo "Done."
}
trap cleanup EXIT INT TERM

echo "Starting backend (port 8000)..."
(cd "$ROOT_DIR/backend" && uv run python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &
BACKEND_PID=$!

echo "Starting frontend (port 8080)..."
(cd "$ROOT_DIR/frontend" && bun run dev) &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:8080"
echo "Press Ctrl+C to stop both."
echo ""

# Exit if either process dies
wait -n "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
cleanup
