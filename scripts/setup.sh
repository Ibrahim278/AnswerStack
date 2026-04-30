#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OS="$(uname -s)"

info()  { printf '\033[1;34m[INFO]\033[0m  %s\n' "$*"; }
ok()    { printf '\033[1;32m[OK]\033[0m    %s\n' "$*"; }
warn()  { printf '\033[1;33m[WARN]\033[0m  %s\n' "$*"; }
error() { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*"; exit 1; }

command_exists() { command -v "$1" &>/dev/null; }

# Ensure common paths are available
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"

# ---------------------------------------------------------------------------
# System packages
# ---------------------------------------------------------------------------
info "Installing system dependencies..."
case "$OS" in
    Darwin)
        if ! command_exists brew; then
            error "Homebrew is required. Install it first: https://brew.sh"
        fi
        brew install curl git openssl libffi 2>/dev/null || true
        ;;
    Linux)
        sudo apt-get update -qq
        sudo apt-get install -y -qq \
            build-essential \
            curl \
            git \
            libssl-dev \
            libffi-dev \
            > /dev/null
        ;;
    *)
        error "Unsupported OS: $OS"
        ;;
esac
ok "System packages installed"

# ---------------------------------------------------------------------------
# uv (Python package manager)
# ---------------------------------------------------------------------------
if command_exists uv; then
    ok "uv already installed ($(uv --version))"
else
    info "Installing uv..."
    curl -fsSL https://astral.sh/uv/install.sh | sh
    ok "uv installed ($(uv --version))"
fi

# ---------------------------------------------------------------------------
# Python (managed by uv)
# ---------------------------------------------------------------------------
info "Ensuring Python 3.12..."
uv python install 3.12
ok "Python 3.12 ready"

# ---------------------------------------------------------------------------
# bun (JS runtime / package manager)
# ---------------------------------------------------------------------------
if command_exists bun; then
    ok "bun already installed ($(bun --version))"
else
    info "Installing bun..."
    curl -fsSL https://bun.sh/install | bash
    ok "bun installed ($(bun --version))"
fi

# ---------------------------------------------------------------------------
# Python dependencies (backend + core)
# ---------------------------------------------------------------------------
info "Installing Python dependencies..."
cd "$ROOT_DIR"
uv sync
ok "Python dependencies installed"

# ---------------------------------------------------------------------------
# Frontend dependencies
# ---------------------------------------------------------------------------
info "Installing frontend dependencies..."
cd "$ROOT_DIR/frontend"
bun install
ok "Frontend dependencies installed"

# ---------------------------------------------------------------------------
# Database migrations
# ---------------------------------------------------------------------------
info "Running database migrations..."
cd "$ROOT_DIR/backend"
uv run alembic upgrade head
ok "Database migrations applied"

# ---------------------------------------------------------------------------
# Environment file
# ---------------------------------------------------------------------------
if [ ! -f "$ROOT_DIR/.env" ]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    warn "Created .env from .env.example — edit it with your provider settings"
else
    ok ".env already exists"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
ok "Setup complete! Run ./scripts/run.sh to start the app."
warn "If this is a new shell, restart it or run: source ~/.bashrc"
echo ""
