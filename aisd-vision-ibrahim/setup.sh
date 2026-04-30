#!/bin/bash
#
# Fresh-machine setup for aisd-vision-rwadud + AnswerStack RAG integration.
#
# Assumes:
#   - ROS 2 is already installed and sourced (e.g. /opt/ros/<distro>/setup.bash)
#   - This repo lives at ~/create3_ws/src/aisd-vision-rwadud
#
# Usage: bash ./setup.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
WS_DIR="$(cd "$REPO_DIR/../.." && pwd)"
ANSWERSTACK_DIR="$REPO_DIR/AnswerStack"
CORE_DIR="$ANSWERSTACK_DIR/core"
ENV_FILE="$ANSWERSTACK_DIR/.env"

echo "==> Repo:      $REPO_DIR"
echo "==> Workspace: $WS_DIR"

if ! command -v ros2 >/dev/null 2>&1; then
    echo "ERROR: ros2 not found on PATH. Source /opt/ros/<distro>/setup.bash first." >&2
    exit 1
fi

PIP_FLAGS=()
if python3 -c 'import sys; exit(0 if sys.version_info >= (3, 11) else 1)'; then
    PIP_FLAGS+=(--break-system-packages)
fi

echo "==> Installing system packages (apt)"
sudo apt-get update
sudo apt-get install -y \
    python3-pip \
    python3-colcon-common-extensions \
    python3-rosdep \
    alsa-utils \
    ffmpeg \
    libsndfile1 \
    portaudio19-dev

echo "==> Running rosdep"
if [ ! -f /etc/ros/rosdep/sources.list.d/20-default.list ]; then
    sudo rosdep init || true
fi
rosdep update
rosdep install --from-paths "$WS_DIR/src" --ignore-src -r -y || true

echo "==> Installing AnswerStack core library into system Python"
pip install -e "$CORE_DIR" "${PIP_FLAGS[@]}"

echo "==> Installing Python deps for ROS nodes"
pip install \
    faster-whisper \
    gtts \
    pydub \
    "${PIP_FLAGS[@]}"

if [ ! -f "$ENV_FILE" ]; then
    echo "==> Creating AnswerStack .env from template"
    cp "$ANSWERSTACK_DIR/.env.example" "$ENV_FILE"
    echo "    Edit $ENV_FILE and fill in PROVIDER_URL, PROVIDER_API_KEY,"
    echo "    PROVIDER_MODEL, EMBEDDING_MODEL before running the nodes."
else
    echo "==> $ENV_FILE already exists, leaving it alone"
fi

echo "==> Building workspace with colcon"
cd "$WS_DIR"
colcon build --symlink-install

cat <<EOF

Setup complete.

Next steps:
  1. Edit $ENV_FILE and set your LLM provider credentials.
  2. Source the workspace:
       source $WS_DIR/install/setup.bash
  3. Launch everything:
       bash $REPO_DIR/run.sh

On first run, rag_publisher will ingest everything under $REPO_DIR/knowledge
into ChromaDB at $ANSWERSTACK_DIR/data/chromadb.
EOF
