#!/usr/bin/env bash
# openclaw hermes-setup
# Clones NousResearch/hermes-agent and installs per its README.

set -e

HERMES_DIR="${HERMES_PATH:-$HOME/.hermes-agent}"
HERMES_REPO="https://github.com/NousResearch/hermes-agent.git"

echo ""
echo "=== openclaw: Hermes Agent Setup ==="
echo ""

# ── Clone or update ────────────────────────────────────────────────────────

if [ -d "$HERMES_DIR/.git" ]; then
  echo "[1/4] Updating existing Hermes clone at $HERMES_DIR ..."
  git -C "$HERMES_DIR" pull --ff-only || git -C "$HERMES_DIR" fetch origin
else
  echo "[1/4] Cloning Hermes Agent into $HERMES_DIR ..."
  git clone "$HERMES_REPO" "$HERMES_DIR"
fi

echo ""
echo "[2/4] Installing Hermes Python dependencies (pip install -e '.[all]') ..."
echo "      This may take a few minutes on first run."
echo ""

cd "$HERMES_DIR"
pip install -e ".[all]" --quiet

echo ""
echo "[3/4] Setting up Hermes environment file ..."

if [ ! -f "$HERMES_DIR/.env" ]; then
  if [ -f "$HERMES_DIR/.env.example" ]; then
    cp "$HERMES_DIR/.env.example" "$HERMES_DIR/.env"
    echo "      Created $HERMES_DIR/.env from .env.example"
    echo "      NOTE: Edit it and add your ANTHROPIC_API_KEY and other keys."
  else
    echo "      No .env.example found — creating minimal .env"
    echo "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}" > "$HERMES_DIR/.env"
  fi
else
  echo "      $HERMES_DIR/.env already exists — skipping"
fi

echo ""
echo "[4/4] Verifying install ..."

python3 -c "
import sys
sys.path.insert(0, '$HERMES_DIR')
try:
    from run_agent import AIAgent
    print('      ✓ Hermes AIAgent imported successfully')
except ImportError as e:
    print(f'      ✗ Import failed: {e}')
    sys.exit(1)
"

echo ""
echo "=== Setup complete! ==="
echo ""
echo "  Start the Hermes bridge:  openclaw hermes-bridge"
echo "  Start openclaw server:    openclaw deploy"
echo ""
echo "  Set env vars before deploy:"
echo "    export ANTHROPIC_API_KEY=sk-..."
echo "    export HERMES_URL=http://localhost:8000"
echo "    export HERMES_PATH=$HERMES_DIR"
echo ""
