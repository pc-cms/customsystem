#!/usr/bin/env bash
#
# ACE Collector — universal one-line installer / updater
# Ubuntu 20.04 / 22.04 / 24.04
#
# Fresh machine (provision):
#   curl -fsSL https://casinosystem.app/download/ace-collector-install.sh | sudo bash -s -- --token <token>
#
# Existing machine (upgrade code/deps/cron, keep config + ACE session):
#   curl -fsSL https://casinosystem.app/download/ace-collector-install.sh | sudo bash -s -- --update
#
# The token is generated in Casino System (Admin → Servers & Peers → ACE Collector).
# Re-running with --token on an already-configured machine is SAFE: the existing
# /etc/ace-collector.env and /opt/ace-collector/.ace-session.json are preserved
# and the script behaves exactly like --update.
#
set -euo pipefail

BOOTSTRAP_URL="https://rpehngjvwcnipvkouluu.supabase.co/functions/v1/ace-collector-bootstrap"
PACKAGE_URL="https://casinosystem.app/download/ace-collector-server.tar.gz"
APP_DIR="/opt/ace-collector"
ENV_FILE="/etc/ace-collector.env"
SESSION_FILE="${APP_DIR}/.ace-session.json"
DEF_ACE_URL="https://192.168.1.191"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[ace]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ok ]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
fail() { echo -e "${RED}[fail]${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run with sudo."

TOKEN=""
UPDATE_MODE=0
FORCE_REPROVISION=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --token) TOKEN="${2:-}"; shift 2 ;;
    --token=*) TOKEN="${1#*=}"; shift ;;
    --update|-u) UPDATE_MODE=1; shift ;;
    --force-reprovision) FORCE_REPROVISION=1; shift ;;
    *) shift ;;
  esac
done

EXISTING=0
[[ -f "$ENV_FILE" && -d "$APP_DIR" ]] && EXISTING=1

if [[ "$EXISTING" == "1" && "$FORCE_REPROVISION" != "1" ]]; then
  UPDATE_MODE=1
fi

if [[ "$UPDATE_MODE" != "1" && -z "$TOKEN" ]]; then
  fail "Missing --token. Generate the command in Casino System → Admin → Servers & Peers (or use --update on an installed machine)."
fi
if [[ "$UPDATE_MODE" == "1" && "$EXISTING" != "1" ]]; then
  fail "--update requested but no existing installation found (${ENV_FILE}). Run with --token <token> first."
fi

echo -e "${CYAN}=== ACE Collector $( [[ $UPDATE_MODE == 1 ]] && echo updater || echo installer ) ===${NC}"

# ── prerequisites ──────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
log "Installing prerequisites..."
apt-get update -qq
apt-get install -y -qq curl ca-certificates python3 tar rsync >/dev/null || \
  apt-get install -y -qq curl ca-certificates python3 tar >/dev/null
ok "Prerequisites ready"

# ── always fetch the latest collector package ──────────────────────────────
log "Downloading latest collector package..."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$PACKAGE_URL" -o "$TMP/ace.tar.gz" || fail "Could not download ${PACKAGE_URL}"
tar -xzf "$TMP/ace.tar.gz" -C "$TMP"
[[ -f "$TMP/ace-collector/install.sh" ]] || fail "Bad collector package."
SRC="$TMP/ace-collector"
chmod +x "$SRC/install.sh" "$SRC/update.sh" "$SRC/run.sh" 2>/dev/null || true
ok "Fresh package extracted"

# ═══════════════════════════ UPDATE PATH ═══════════════════════════════════
if [[ "$UPDATE_MODE" == "1" ]]; then
  if [[ -n "$TOKEN" ]]; then
    warn "Existing installation detected — ignoring --token and updating in place."
    warn "Use --force-reprovision to re-issue credentials for this machine."
  fi
  [[ -f "$SRC/update.sh" ]] || fail "Package has no update.sh — cannot update safely."
  log "Updating in place (config and ACE session preserved)..."
  bash "$SRC/update.sh"
  echo
  ok "ACE Collector updated."
  echo "  Config kept:  ${ENV_FILE}"
  echo "  Session kept: ${SESSION_FILE}"
  echo "  Logs:   tail -f /var/log/ace-collector/collector.log"
  echo "  Health: sudo -u acecollector ${APP_DIR}/run.sh --health --verbose"
  exit 0
fi

# ═══════════════════════════ PROVISION PATH ════════════════════════════════
[[ -n "$TOKEN" ]] || fail "Missing --token."

log "Contacting Casino System..."
HOSTNAME_LOCAL="$(hostname -f 2>/dev/null || hostname)"
RESP="$(curl -fsS -X POST "$BOOTSTRAP_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"${TOKEN}\",\"hostname\":\"${HOSTNAME_LOCAL}\"}" || true)"

[[ -n "$RESP" ]] || fail "Could not reach Casino System. Check internet access and try again."

read_json() {
  python3 -c "import json,sys;print(json.loads(sys.argv[1]).get(sys.argv[2],'') or '')" "$RESP" "$1" 2>/dev/null || true
}

OK_FLAG="$(python3 -c "import json,sys;print('1' if json.loads(sys.argv[1]).get('ok') else '0')" "$RESP" 2>/dev/null || echo 0)"
if [[ "$OK_FLAG" != "1" ]]; then
  ERRMSG="$(read_json error)"
  case "$ERRMSG" in
    token_already_used) fail "This install command was already used. Generate a new one." ;;
    token_expired)      fail "This install command has expired. Generate a new one." ;;
    invalid_token)      fail "Invalid install command. Generate a new one." ;;
    *)                  fail "Setup failed (${ERRMSG:-unknown error})." ;;
  esac
fi

CASINO_NAME="$(read_json casino_name)"
LOCATION="$(read_json location_code)"
API_URL="$(read_json ingest_url)"
ACE_KEY="$(read_json ingest_key)"
[[ -n "$LOCATION" && -n "$API_URL" && -n "$ACE_KEY" ]] || fail "Incomplete setup response."
unset RESP

ok "Casino: ${CASINO_NAME} (${LOCATION})"

# ── local ACE settings ─────────────────────────────────────────────────────
echo
echo -e "${CYAN}--- Local ACE server ---${NC}"
read -r -p "ACE server URL/IP [${DEF_ACE_URL}]: " ACE_URL </dev/tty || true
ACE_URL="${ACE_URL:-$DEF_ACE_URL}"
[[ "$ACE_URL" == http*://* ]] || ACE_URL="https://${ACE_URL}"

ACE_USER=""
while [[ -z "$ACE_USER" ]]; do
  read -r -p "ACE username: " ACE_USER </dev/tty || true
done

ACE_PASS=""
while [[ -z "$ACE_PASS" ]]; do
  read -r -s -p "ACE password (hidden): " ACE_PASS </dev/tty; echo
done

# ── run the fresh installer noninteractively ───────────────────────────────
NONINTERACTIVE=1 \
ACE_URL="$ACE_URL" ACE_USER="$ACE_USER" ACE_PASS="$ACE_PASS" \
API_URL="$API_URL" ACE_KEY="$ACE_KEY" LOCATION="$LOCATION" \
  bash "$SRC/install.sh"

unset ACE_KEY ACE_PASS

echo
ok "ACE Collector installed for ${CASINO_NAME} (${LOCATION})."
echo "  Logs:   tail -f /var/log/ace-collector/collector.log"
echo "  Health: sudo -u acecollector /opt/ace-collector/run.sh --health --verbose"
echo "  Update: curl -fsSL https://casinosystem.app/download/ace-collector-install.sh | sudo bash -s -- --update"
