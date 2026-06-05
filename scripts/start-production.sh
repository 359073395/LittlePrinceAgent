#!/bin/bash
# 小王子 Agent — Production start script for Linux VPS
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source .env if present
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

cd "$PROJECT_DIR"
exec node src/index.js
