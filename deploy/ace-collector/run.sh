#!/usr/bin/env bash
# Wrapper used by cron and by humans.
#   /opt/ace-collector/run.sh --health --verbose
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ace-collector}"
VENV_PY="${APP_DIR}/venv/bin/python3"

[[ -x "$VENV_PY" ]] || { echo "venv missing at ${VENV_PY} — run install.sh" >&2; exit 1; }

cd "$APP_DIR"
exec "$VENV_PY" "${APP_DIR}/collector.py" "$@"
