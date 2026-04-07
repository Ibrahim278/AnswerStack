#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"

usage() {
    echo "Usage: $0 [dev|prod]"
    echo "  dev   — backend with hot reload + vite dev server"
    echo "  prod  — build frontend, serve everything from backend"
    exit 1
}

MODE="${1:-dev}"

CERT_FILE="$ROOT_DIR/certs/cert.pem"
KEY_FILE="$ROOT_DIR/certs/key.pem"
SSL_ARGS=()
PROTOCOL="http"

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    SSL_ARGS=(--ssl-certfile "$CERT_FILE" --ssl-keyfile "$KEY_FILE")
    PROTOCOL="https"
fi

EXIT_CODE=0

cleanup() {
    trap - EXIT INT TERM
    echo ""
    echo "Shutting down..."
    kill 0 2>/dev/null || true
    wait 2>/dev/null || true
    echo "Done."
    exit "$EXIT_CODE"
}
trap cleanup INT TERM
trap 'EXIT_CODE=$?; cleanup' EXIT

case "$MODE" in
    dev)
        echo "Starting backend (port 8000)..."
        (cd "$ROOT_DIR/backend" && exec uv run python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 "${SSL_ARGS[@]}") &

        echo "Starting frontend (port 8080)..."
        (cd "$ROOT_DIR/frontend" && exec bun run dev) &

        echo ""
        echo "Backend:  $PROTOCOL://localhost:8000"
        echo "Frontend: $PROTOCOL://localhost:8080"
        echo "Press Ctrl+C to stop both."
        echo ""

        wait -n 2>/dev/null
        EXIT_CODE=$?
        ;;
    prod)
        echo "Building frontend..."
        (cd "$ROOT_DIR/frontend" && bun run build)

        echo "Starting server (port 8000)..."
        (cd "$ROOT_DIR/backend" && exec uv run python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 "${SSL_ARGS[@]}") &

        echo ""
        echo "App: $PROTOCOL://localhost:8000"
        echo "Press Ctrl+C to stop."
        echo ""

        wait $!
        EXIT_CODE=$?
        ;;
    *)
        usage
        ;;
esac
