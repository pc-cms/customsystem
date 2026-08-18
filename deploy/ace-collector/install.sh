#!/usr/bin/env bash
#
# ACE Collector — installer for Ubuntu 20.04 / 22.04 / 24.04 LTS
#
#   sudo ./install.sh
#
set -euo pipefail

APP_DIR="/opt/ace-collector"
ENV_FILE="/etc/ace-collector.env"
LOG_DIR="/var/log/ace-collector"
CRON_FILE="/etc/cron.d/ace-collector"
LOGROTATE_FILE="/etc/logrotate.d/ace-collector"
SVC_USER="acecollector"

DEF_ACE_URL="https://192.168.1.191"
DEF_API_URL="https://rpehngjvwcnipvkouluu.supabase.co/functions/v1/ace-finance-ingest"
DEF_LOCATION="arusha"
DEF_TZ="Africa/Dar_es_Salaam"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[ace]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ok ]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
fail() { echo -e "${RED}[fail]${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run as root:  sudo ./install.sh"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${CYAN}=== ACE Collector installer ===${NC}"

# ── 1. packages ────────────────────────────────────────────────────────────
log "Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip ca-certificates cron util-linux
ok "Packages installed"

# ── 2. service user ────────────────────────────────────────────────────────
if id -u "$SVC_USER" >/dev/null 2>&1; then
  ok "User ${SVC_USER} already exists"
else
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
  ok "Created system user ${SVC_USER}"
fi

# ── 3. copy project ────────────────────────────────────────────────────────
log "Installing project into ${APP_DIR}"
mkdir -p "$APP_DIR"
if [[ "$SRC_DIR" != "$APP_DIR" ]]; then
  cp -a "$SRC_DIR"/. "$APP_DIR"/
fi
chmod +x "$APP_DIR/run.sh" "$APP_DIR/install.sh" 2>/dev/null || true

# ── 4. venv ────────────────────────────────────────────────────────────────
log "Creating Python virtualenv..."
python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install --upgrade pip -q
"$APP_DIR/venv/bin/pip" install -q -r "$APP_DIR/requirements.txt"
ok "Dependencies installed (requests, beautifulsoup4)"

# ── 5. configuration (interactive, or noninteractive via env) ──────────────

# Noninteractive mode: set NONINTERACTIVE=1 and provide
#   ACE_URL ACE_USER ACE_PASS API_URL ACE_KEY LOCATION
echo
if [[ "${NONINTERACTIVE:-0}" == "1" ]]; then
  ACE_URL="${ACE_URL:-$DEF_ACE_URL}"
  ACE_USER="${ACE_USER:-}"
  ACE_PASS="${ACE_PASS:-}"
  API_URL="${API_URL:-$DEF_API_URL}"
  ACE_KEY="${ACE_KEY:-}"
  LOCATION="${LOCATION:-$DEF_LOCATION}"
  [[ -n "$ACE_USER" ]] || fail "NONINTERACTIVE: ACE_USER is required"
  [[ -n "$ACE_PASS" ]] || fail "NONINTERACTIVE: ACE_PASS is required"
  [[ -n "$ACE_KEY"  ]] || fail "NONINTERACTIVE: ACE_KEY is required"
  log "Noninteractive install for location '${LOCATION}'"
else
  echo -e "${CYAN}--- Configuration ---${NC}"

  read -r -p "ACE base URL [${DEF_ACE_URL}]: " ACE_URL </dev/tty || true
  ACE_URL="${ACE_URL:-$DEF_ACE_URL}"

  read -r -p "ACE username: " ACE_USER </dev/tty || true

  ACE_PASS=""
  while [[ -z "$ACE_PASS" ]]; do
    read -r -s -p "ACE password (hidden): " ACE_PASS </dev/tty; echo
  done

  read -r -p "Casino System API URL [${DEF_API_URL}]: " API_URL </dev/tty || true
  API_URL="${API_URL:-$DEF_API_URL}"

  ACE_KEY=""
  while [[ -z "$ACE_KEY" ]]; do
    read -r -s -p "x-ace-key (hidden): " ACE_KEY </dev/tty; echo
  done

  read -r -p "Location code [${DEF_LOCATION}]: " LOCATION </dev/tty || true
  LOCATION="${LOCATION:-$DEF_LOCATION}"
fi
LOCATION="$(echo "$LOCATION" | tr '[:upper:]' '[:lower:]' | tr -d ' ')"


# ── 6. env file ────────────────────────────────────────────────────────────
log "Writing ${ENV_FILE}"
umask 027
cat > "$ENV_FILE" <<EOF
# ACE Collector configuration — generated $(date -Is)
# Secrets live ONLY in this file. Never commit it anywhere.
ACE_BASE_URL=${ACE_URL}
ACE_USERNAME=${ACE_USER}
ACE_PASSWORD=${ACE_PASS}
ACE_VERIFY_TLS=false

CASINO_API_URL=${API_URL}
ACE_INGEST_KEY=${ACE_KEY}
LOCATION_CODE=${LOCATION}

ACE_TZ=${DEF_TZ}
CLOSING_WINDOW_START=8
CLOSING_WINDOW_END=12
HTTP_TIMEOUT=60
EOF
chown root:"$SVC_USER" "$ENV_FILE"
chmod 0640 "$ENV_FILE"
ok "Config saved (root:${SVC_USER} 0640)"

# ── 7. logs ────────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"
touch "$LOG_DIR/collector.log"
chown -R "$SVC_USER":"$SVC_USER" "$LOG_DIR"
chmod 0755 "$LOG_DIR"
chown -R "$SVC_USER":"$SVC_USER" "$APP_DIR"

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

# ── 8. cron ────────────────────────────────────────────────────────────────
mkdir -p /run/lock
cat > "$CRON_FILE" <<EOF
# ACE Collector — every 5 minutes + once after reboot
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/5 * * * * ${SVC_USER} /usr/bin/flock -n /run/lock/ace-collector.lock ${APP_DIR}/run.sh >> ${LOG_DIR}/collector.log 2>&1
@reboot ${SVC_USER} sleep 30 && /usr/bin/flock -n /run/lock/ace-collector.lock ${APP_DIR}/run.sh >> ${LOG_DIR}/collector.log 2>&1
EOF
chmod 0644 "$CRON_FILE"
systemctl enable cron >/dev/null 2>&1 || true
systemctl restart cron >/dev/null 2>&1 || service cron restart >/dev/null 2>&1 || warn "Could not restart cron automatically"
ok "Cron installed: ${CRON_FILE}"

# ── 9. health check ────────────────────────────────────────────────────────
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
  warn "Health check returned ${HC}. Check ${LOG_DIR}/collector.log and ${ENV_FILE}."
fi

echo
echo -e "${GREEN}Installed.${NC}  Useful commands:"
echo "  sudo -u ${SVC_USER} ${APP_DIR}/run.sh --health --verbose"
echo "  sudo -u ${SVC_USER} ${APP_DIR}/run.sh --live-only"
echo "  sudo -u ${SVC_USER} ${APP_DIR}/run.sh --closing-only --force-closing"
echo "  sudo -u ${SVC_USER} ${APP_DIR}/run.sh --dry-run --force-closing"
echo "  tail -f ${LOG_DIR}/collector.log"
