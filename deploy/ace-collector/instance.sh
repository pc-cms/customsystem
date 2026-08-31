#!/usr/bin/env bash
#
# ACE Collector — named multi-instance installer / updater.
#
# One physical server, shared code + venv in /opt/ace-collector, but each
# named instance has its OWN env file, ACE session, cron, lock and log dir.
# The legacy/default instance (/etc/ace-collector.env) is NEVER touched here.
#
# Install:
#   NONINTERACTIVE=1 ACE_URL=... ACE_USER=... ACE_PASS=... \
#   API_URL=... ACE_KEY=... LOCATION=mwanza \
#     bash instance.sh --slug mwanza
#
# Update (config + session preserved):
#   bash instance.sh --slug mwanza --update
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ace-collector}"
SVC_USER="${SVC_USER:-acecollector}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[ace]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ok ]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
fail() { echo -e "${RED}[fail]${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run as root."

SLUG=""
UPDATE_MODE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug) SLUG="${2:-}"; shift 2 ;;
    --slug=*) SLUG="${1#*=}"; shift ;;
    --update|-u) UPDATE_MODE=1; shift ;;
    *) shift ;;
  esac
done

SLUG="$(echo "$SLUG" | tr '[:upper:]' '[:lower:]' | tr -d ' ')"
[[ -n "$SLUG" ]] || fail "instance.sh: --slug is required"
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail "Invalid instance slug: ${SLUG}"

ENV_FILE="/etc/ace-collector-${SLUG}.env"
SESSION_FILE="${APP_DIR}/.ace-session-${SLUG}.json"
LOG_DIR="/var/log/ace-collector/${SLUG}"
CRON_FILE="/etc/cron.d/ace-collector-${SLUG}"
LOCK_FILE="/run/lock/ace-collector-${SLUG}.lock"
LOGROTATE_FILE="/etc/logrotate.d/ace-collector-${SLUG}"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${CYAN}=== ACE Collector instance '${SLUG}' ($( [[ $UPDATE_MODE == 1 ]] && echo update || echo install )) ===${NC}"

if [[ "$UPDATE_MODE" == "1" ]]; then
  [[ -f "$ENV_FILE" ]] || fail "No instance configuration at ${ENV_FILE}. Install it first with --token <token> --instance=${SLUG}."
fi

# ── 1. packages + service user ─────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq || true
  apt-get install -y -qq python3 python3-venv python3-pip ca-certificates cron util-linux || true
fi
if ! id -u "$SVC_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
  ok "Created system user ${SVC_USER}"
fi

# ── 2. shared code (never touches any env or session file) ─────────────────
log "Refreshing shared code in ${APP_DIR}"
mkdir -p "$APP_DIR"
if [[ "$SRC_DIR" != "$APP_DIR" ]]; then
  if command -v rsync >/dev/null 2>&1; then
    rsync -a \
      --exclude 'venv/' --exclude '__pycache__/' --exclude '*.pyc' \
      --exclude '.ace-session*.json' --exclude '*.env' --exclude '.env' \
      "$SRC_DIR"/ "$APP_DIR"/
  else
    ( cd "$SRC_DIR" && find . \
        -path './venv' -prune -o -name '__pycache__' -prune -o \
        -name '*.pyc' -prune -o -name '.ace-session*.json' -prune -o \
        -name '*.env' -prune -o -type f -print0 ) |
    while IFS= read -r -d '' rel; do
      mkdir -p "$APP_DIR/$(dirname "$rel")"
      cp -f "$SRC_DIR/$rel" "$APP_DIR/$rel"
    done
  fi
fi
chmod +x "$APP_DIR/run.sh" "$APP_DIR/install.sh" "$APP_DIR/update.sh" "$APP_DIR/instance.sh" 2>/dev/null || true
ok "Shared code updated"

# ── 3. shared venv ─────────────────────────────────────────────────────────
if [[ -x "$APP_DIR/venv/bin/pip" ]]; then
  log "Reusing existing virtualenv"
else
  log "Creating Python virtualenv..."
  python3 -m venv "$APP_DIR/venv"
  "$APP_DIR/venv/bin/pip" install --upgrade pip -q
fi
"$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"
ok "Dependencies up to date"

chown -R "$SVC_USER":"$SVC_USER" "$APP_DIR"

# ── 4. instance env file ───────────────────────────────────────────────────
if [[ "$UPDATE_MODE" == "1" ]]; then
  ok "Instance configuration preserved: ${ENV_FILE}"
else
  [[ -n "${ACE_URL:-}"  ]] || fail "ACE_URL is required"
  [[ -n "${ACE_USER:-}" ]] || fail "ACE_USER is required"
  [[ -n "${ACE_PASS:-}" ]] || fail "ACE_PASS is required"
  [[ -n "${API_URL:-}"  ]] || fail "API_URL is required"
  [[ -n "${ACE_KEY:-}"  ]] || fail "ACE_KEY is required"
  LOCATION="${LOCATION:-$SLUG}"
  LOCATION="$(echo "$LOCATION" | tr '[:upper:]' '[:lower:]' | tr -d ' ')"
  [[ "$LOCATION" == "$SLUG" ]] || fail "Token location '${LOCATION}' does not match --instance '${SLUG}'."

  log "Writing ${ENV_FILE}"
  umask 027
  cat > "$ENV_FILE" <<EOF
# ACE Collector configuration for instance '${SLUG}' — generated $(date -Is)
# Secrets live ONLY in this file. Never commit it anywhere.
ACE_BASE_URL=${ACE_URL}
ACE_USERNAME=${ACE_USER}
ACE_PASSWORD=${ACE_PASS}
ACE_VERIFY_TLS=false

CASINO_API_URL=${API_URL}
ACE_INGEST_KEY=${ACE_KEY}
LOCATION_CODE=${LOCATION}

ACE_TZ=Africa/Dar_es_Salaam
CLOSING_WINDOW_START=7
CLOSING_WINDOW_END=18
ACE_BACKFILL_PERIODS=3
HTTP_TIMEOUT=60
EOF
  ok "Config saved (root:${SVC_USER} 0640)"
fi
chown root:"$SVC_USER" "$ENV_FILE"
chmod 0640 "$ENV_FILE"

# ── 5. instance session + logs ─────────────────────────────────────────────
[[ -f "$SESSION_FILE" ]] || : > "$SESSION_FILE"
chown "$SVC_USER":"$SVC_USER" "$SESSION_FILE"
chmod 0600 "$SESSION_FILE"

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
ok "Logrotate configured for ${SLUG}"

# ── 6. cron (per instance, own lock, no duplicate logging) ─────────────────
mkdir -p /run/lock
ENVS="ACE_ENV_FILE=${ENV_FILE} ACE_SESSION_FILE=${SESSION_FILE} ACE_LOG_DIR=${LOG_DIR}"
cat > "$CRON_FILE" <<EOF
# ACE Collector instance '${SLUG}' — every minute + once after reboot.
# Python writes ${LOG_DIR}/collector.log itself, so cron output is discarded.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
* * * * * ${SVC_USER} ${ENVS} /usr/bin/flock -n ${LOCK_FILE} ${APP_DIR}/run.sh >/dev/null 2>&1
@reboot ${SVC_USER} sleep 30 && ${ENVS} /usr/bin/flock -n ${LOCK_FILE} ${APP_DIR}/run.sh >/dev/null 2>&1
EOF
chmod 0644 "$CRON_FILE"
systemctl enable cron >/dev/null 2>&1 || true
systemctl restart cron >/dev/null 2>&1 || service cron restart >/dev/null 2>&1 || warn "Could not restart cron automatically"
ok "Cron installed: ${CRON_FILE}"

# ── 7. health check ────────────────────────────────────────────────────────
echo
log "Running health check for '${SLUG}'..."
set +e
sudo -u "$SVC_USER" env "ACE_ENV_FILE=${ENV_FILE}" "ACE_SESSION_FILE=${SESSION_FILE}" "ACE_LOG_DIR=${LOG_DIR}" \
  "$APP_DIR/run.sh" --health --verbose
HC=$?
set -e
echo
if [[ $HC -eq 0 ]]; then
  ok "Health check passed — instance '${SLUG}' is live."
else
  warn "Health check returned ${HC}. See ${LOG_DIR}/collector.log"
fi

echo
echo -e "${GREEN}Instance '${SLUG}' ready.${NC}"
echo "  Logs:   tail -f ${LOG_DIR}/collector.log"
echo "  Health: sudo -u ${SVC_USER} env ACE_ENV_FILE=${ENV_FILE} ACE_SESSION_FILE=${SESSION_FILE} ACE_LOG_DIR=${LOG_DIR} ${APP_DIR}/run.sh --health --verbose"
echo "  Live:   sudo -u ${SVC_USER} env ACE_ENV_FILE=${ENV_FILE} ACE_SESSION_FILE=${SESSION_FILE} ACE_LOG_DIR=${LOG_DIR} ${APP_DIR}/run.sh --live-only"
echo "  Cron:   cat ${CRON_FILE}"
