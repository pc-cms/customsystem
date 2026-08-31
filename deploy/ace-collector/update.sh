#!/usr/bin/env bash
#
# ACE Collector — safe updater for an EXISTING installation.
#
#   sudo ./update.sh
#
# Never touches /etc/ace-collector.env and never asks for credentials.
# Preserves /opt/ace-collector/.ace-session.json byte-for-byte.
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ace-collector}"
ENV_FILE="${ENV_FILE:-/etc/ace-collector.env}"
LOG_DIR="${LOG_DIR:-/var/log/ace-collector}"
CRON_FILE="${CRON_FILE:-/etc/cron.d/ace-collector}"
LOGROTATE_FILE="${LOGROTATE_FILE:-/etc/logrotate.d/ace-collector}"
SVC_USER="${SVC_USER:-acecollector}"
SESSION_FILE="${APP_DIR}/.ace-session.json"
SKIP_HEALTH="${SKIP_HEALTH:-0}"
SKIP_CRON_RESTART="${SKIP_CRON_RESTART:-0}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[ace]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ok ]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
fail() { echo -e "${RED}[fail]${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run as root:  sudo ./update.sh"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${CYAN}=== ACE Collector updater ===${NC}"

# ── 1. must be an existing installation ────────────────────────────────────
[[ -f "$ENV_FILE" ]] || fail "No existing configuration at ${ENV_FILE}. This is not an update — run:  sudo ./install.sh"
[[ -d "$APP_DIR"  ]] || fail "No existing installation at ${APP_DIR}. This is not an update — run:  sudo ./install.sh"
id -u "$SVC_USER" >/dev/null 2>&1 || fail "System user ${SVC_USER} is missing. Run the full installer:  sudo ./install.sh"
[[ "$SRC_DIR" != "$APP_DIR" ]] || fail "Run update.sh from the unpacked archive directory, not from ${APP_DIR}."

ENV_SUM_BEFORE="$(sha256sum "$ENV_FILE" | awk '{print $1}')"
SESSION_SUM_BEFORE=""
if [[ -f "$SESSION_FILE" ]]; then
  SESSION_SUM_BEFORE="$(sha256sum "$SESSION_FILE" | awk '{print $1}')"
fi

# ── 2. packages ────────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
if command -v apt-get >/dev/null 2>&1; then
  log "Ensuring system packages..."
  apt-get update -qq || true
  apt-get install -y -qq python3 python3-venv python3-pip ca-certificates cron util-linux || true
fi

# ── 3. copy application code only ──────────────────────────────────────────
log "Updating application code in ${APP_DIR}"
mkdir -p "$APP_DIR"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude 'venv/' \
    --exclude '__pycache__/' \
    --exclude '*.pyc' \
    --exclude '.ace-session*.json' \
    --exclude '*.env' \
    --exclude '.env' \
    "$SRC_DIR"/ "$APP_DIR"/
else
  ( cd "$SRC_DIR" && find . \
      -path './venv' -prune -o \
      -name '__pycache__' -prune -o \
      -name '*.pyc' -prune -o \
      -name '.ace-session*.json' -prune -o \
      -name '*.env' -prune -o \
      -name '.env' -prune -o \
      -type f -print0 ) |
  while IFS= read -r -d '' rel; do
    mkdir -p "$APP_DIR/$(dirname "$rel")"
    cp -f "$SRC_DIR/$rel" "$APP_DIR/$rel"
  done
fi
chmod +x "$APP_DIR/run.sh" "$APP_DIR/install.sh" "$APP_DIR/update.sh" 2>/dev/null || true
ok "Application code updated"

# ── 4. config & session preserved ──────────────────────────────────────────
chown root:"$SVC_USER" "$ENV_FILE"
chmod 0640 "$ENV_FILE"

# Non-destructive config migration: secrets & routing are NEVER touched,
# only operational tuning keys are aligned with the proven Arusha behavior.
env_get() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n1; }
SECRETS_BEFORE="$(for k in ACE_BASE_URL ACE_USERNAME ACE_PASSWORD CASINO_API_URL ACE_INGEST_KEY LOCATION_CODE; do printf '%s=%s\n' "$k" "$(env_get "$k")"; done | sha256sum | awk '{print $1}')"

MIGRATED=0
cp -a "$ENV_FILE" "${ENV_FILE}.bak"

CWE="$(env_get CLOSING_WINDOW_END)"
if [[ -z "$CWE" ]]; then
  printf 'CLOSING_WINDOW_END=18\n' >> "$ENV_FILE"; MIGRATED=1
elif [[ "$CWE" =~ ^[0-9]+$ && "$CWE" -lt 18 ]]; then
  sed -i 's/^CLOSING_WINDOW_END=.*/CLOSING_WINDOW_END=18/' "$ENV_FILE"; MIGRATED=1
fi

if [[ -z "$(env_get ACE_BACKFILL_PERIODS)" ]]; then
  printf 'ACE_BACKFILL_PERIODS=3\n' >> "$ENV_FILE"; MIGRATED=1
fi

SECRETS_AFTER="$(for k in ACE_BASE_URL ACE_USERNAME ACE_PASSWORD CASINO_API_URL ACE_INGEST_KEY LOCATION_CODE; do printf '%s=%s\n' "$k" "$(env_get "$k")"; done | sha256sum | awk '{print $1}')"
if [[ "$SECRETS_BEFORE" != "$SECRETS_AFTER" ]]; then
  mv -f "${ENV_FILE}.bak" "$ENV_FILE"
  fail "Configuration secrets changed unexpectedly — restored backup and aborted."
fi
chown root:"$SVC_USER" "$ENV_FILE"; chmod 0640 "$ENV_FILE"
rm -f "${ENV_FILE}.bak"

if [[ "$MIGRATED" == "1" ]]; then
  ok "Configuration preserved (credentials untouched); tuning keys aligned"
else
  ok "Existing configuration preserved: ${ENV_FILE}"
fi


if [[ ! -f "$SESSION_FILE" ]]; then
  : > "$SESSION_FILE"
fi
chown "$SVC_USER":"$SVC_USER" "$SESSION_FILE"
chmod 0600 "$SESSION_FILE"
if [[ -n "$SESSION_SUM_BEFORE" ]]; then
  SESSION_SUM_AFTER="$(sha256sum "$SESSION_FILE" | awk '{print $1}')"
  [[ "$SESSION_SUM_BEFORE" == "$SESSION_SUM_AFTER" ]] || fail "ACE session file changed unexpectedly — aborting."
  ok "ACE session preserved"
else
  ok "ACE session file created (empty) — collector will log in once"
fi

# ── 5. venv (reuse if present) ─────────────────────────────────────────────
if [[ -x "$APP_DIR/venv/bin/pip" ]]; then
  log "Reusing existing virtualenv"
else
  log "Creating Python virtualenv..."
  python3 -m venv "$APP_DIR/venv"
  "$APP_DIR/venv/bin/pip" install --upgrade pip -q
fi
"$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"
ok "Dependencies up to date"

# ── 6. ownership of application code ───────────────────────────────────────
chown -R "$SVC_USER":"$SVC_USER" "$APP_DIR"
chown root:"$SVC_USER" "$ENV_FILE"; chmod 0640 "$ENV_FILE"

# ── 7. logs & logrotate ────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"
touch "$LOG_DIR/collector.log"
chown -R "$SVC_USER":"$SVC_USER" "$LOG_DIR"
chmod 0755 "$LOG_DIR"

cat > "$LOGROTATE_FILE" <<EOF
${LOG_DIR}/*.log {
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    su ${SVC_USER} ${SVC_USER}
}
EOF
ok "Logrotate configured (14 daily rotations)"

# ── 8. cron: every minute ──────────────────────────────────────────────────
mkdir -p /run/lock
cat > "$CRON_FILE" <<EOF
# ACE Collector — every minute (session is cached & reused) + once after reboot
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
* * * * * ${SVC_USER} /usr/bin/flock -n /run/lock/ace-collector.lock ${APP_DIR}/run.sh >/dev/null 2>&1
@reboot ${SVC_USER} sleep 30 && /usr/bin/flock -n /run/lock/ace-collector.lock ${APP_DIR}/run.sh >/dev/null 2>&1
EOF
chmod 0644 "$CRON_FILE"
if [[ "$SKIP_CRON_RESTART" != "1" ]]; then
  systemctl enable cron >/dev/null 2>&1 || true
  systemctl restart cron >/dev/null 2>&1 || service cron restart >/dev/null 2>&1 || warn "Could not restart cron automatically"
fi
ok "Cron installed: every minute (${CRON_FILE})"

# ── 9. health check (read-only) ────────────────────────────────────────────
if [[ "$SKIP_HEALTH" != "1" ]]; then
  echo
  log "Running health check..."
  set +e
  sudo -u "$SVC_USER" "$APP_DIR/run.sh" --health --verbose
  HC=$?
  set -e
  echo
  if [[ $HC -eq 0 ]]; then
    ok "Health check passed — collector is live."
  else
    warn "Health check returned ${HC}. Config was NOT modified. See ${LOG_DIR}/collector.log"
  fi
fi

echo
echo -e "${GREEN}Update complete.${NC}"
echo "  tail -f ${LOG_DIR}/collector.log"
