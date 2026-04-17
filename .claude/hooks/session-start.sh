#!/bin/bash
set -euo pipefail

# Only run in remote (web) environment
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Install Python backend dependencies (includes packages from the emergent.sh index)
pip install -r "$CLAUDE_PROJECT_DIR/backend/requirements.txt" \
  --extra-index-url https://pypi.emergent.sh/simple/ \
  --quiet

# Install frontend Node.js dependencies
cd "$CLAUDE_PROJECT_DIR/frontend"
npm install
