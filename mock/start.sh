#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# ClawJS Demo — Mock Mode Launcher
#
# Starts the demo with pre-populated mock data and no external service calls.
# All data lives in a temp directory and resets on every restart.
#
# Usage:
#   ./mock/start.sh          # dev server (hot reload)
#   ./mock/start.sh build    # production build
#   ./mock/start.sh start    # production server (requires prior build)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEMO_DIR="$ROOT_DIR/demo"

# ── Create isolated temp directory ────────────────────────────────────────────
MOCK_ROOT="/tmp/clawjs-mock-$$"
MOCK_DATA_DIR="$MOCK_ROOT/data"
MOCK_WORKSPACE_DIR="$MOCK_ROOT/workspace"
MOCK_CONFIG_DIR="$MOCK_ROOT/config"
MOCK_STATE_DIR="$MOCK_ROOT/state"
MOCK_AGENT_DIR="$MOCK_STATE_DIR/agents/clawjs-demo/agent"
MOCK_SESSIONS_DIR="$MOCK_STATE_DIR/agents/clawjs-demo/sessions"

mkdir -p "$MOCK_DATA_DIR" "$MOCK_WORKSPACE_DIR" "$MOCK_CONFIG_DIR" \
         "$MOCK_STATE_DIR" "$MOCK_AGENT_DIR" "$MOCK_SESSIONS_DIR"

echo "╔══════════════════════════════════════════════════════╗"
echo "║        ClawJS Demo — Mock Mode                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Temp root: $MOCK_ROOT"
echo ""

# ── Seed mock data ────────────────────────────────────────────────────────────
echo "Seeding mock data..."
MOCK_DATA_DIR="$MOCK_DATA_DIR" \
MOCK_WORKSPACE_DIR="$MOCK_WORKSPACE_DIR" \
MOCK_CONFIG_DIR="$MOCK_CONFIG_DIR" \
MOCK_LOCAL_SETTINGS_DIR="$MOCK_WORKSPACE_DIR" \
  node "$SCRIPT_DIR/seed.mjs"

echo ""

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Cleaning up temp data: $MOCK_ROOT"
  rm -rf "$MOCK_ROOT"
}
trap cleanup EXIT

# ── Export environment variables ──────────────────────────────────────────────
export CLAWJS_E2E=1
export CLAWJS_E2E_FIXTURE_MODE=hermetic
export CLAWJS_E2E_DISABLE_EXTERNAL_CALLS=1
export CLAWJS_DEMO_DATA_DIR="$MOCK_DATA_DIR"
export OPENCLAW_STATE_DIR="$MOCK_STATE_DIR"
export OPENCLAW_WORKSPACE_DIR="$MOCK_WORKSPACE_DIR"
export OPENCLAW_WORKSPACE_DIR="$MOCK_WORKSPACE_DIR"
export OPENCLAW_AGENT_DIR="$MOCK_AGENT_DIR"
export OPENCLAW_CONVERSATIONS_DIR="$MOCK_SESSIONS_DIR"

# Config dir override (if the demo reads from a shared config location)
export CLAWJS_CONFIG_DIR="$MOCK_CONFIG_DIR"

# Use a separate .next build directory to avoid lock conflicts with the normal demo
export NEXT_DIST_DIR=".next-mock"

# ── Determine command ─────────────────────────────────────────────────────────
CMD="${1:-dev}"
PORT="${2:-4201}"

case "$CMD" in
  dev)
    echo "Starting dev server on port $PORT..."
    echo "  → http://localhost:$PORT"
    echo ""
    cd "$DEMO_DIR" && exec npx next dev --port "$PORT"
    ;;
  build)
    echo "Building production bundle..."
    cd "$DEMO_DIR" && npm run build
    echo "Done! Run './mock/start.sh start' to serve."
    ;;
  start)
    echo "Starting production server on port $PORT..."
    echo "  → http://localhost:$PORT"
    echo ""
    cd "$DEMO_DIR" && exec npx next start --port "$PORT"
    ;;
  *)
    echo "Unknown command: $CMD"
    echo "Usage: ./mock/start.sh [dev|build|start] [port]"
    exit 1
    ;;
esac
