#!/usr/bin/env bash
#
# ACE Collector — universal one-line installer for Ubuntu 20.04 / 22.04 / 24.04
#
#   curl -fsSL https://casinosystem.app/download/ace-collector-install.sh | sudo bash -s -- --token <token>
#
# The token is generated in Casino System (Admin → Servers & Peers → ACE Collector).
# It resolves the casino, the ingest URL and a freshly rotated ingest key.
# You are only asked for the LOCAL ACE server settings.
#
set -euo pipefail

BOOTSTRAP_URL="https://rpehngjvwcnipvkouluu.supabase.co/functions/v1/ace-collector-bootstrap"
PACKAGE_URL="https://casinosystem.app/download/ace-collector-server.tar.gz"
APP_DIR="/opt/ace-collector"
DEF_ACE_URL="https://192.168.1.191"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[ace]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ok ]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
fail() { echo -e "${RED}[fail]${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run with sudo."

TOKEN=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --token) TOKEN="${2:-}"; shift 2 ;;
    --token=*) TOKEN="${1#*=}"; shift ;;
    *) shift ;;
  esac
done
[[ -n "$TOKEN" ]] || fail "Missing --token. Generate the command in Casino System → Admin → Servers & Peers."

echo -e "${CYAN}=== ACE Collector installer ===${NC}"

# ── prerequisites ──────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
log "Installing prerequisites..."
apt-get update -qq
apt-get install -y -qq curl ca-certificates python3 tar >/dev/null
ok "Prerequisites ready"

# ── 1. exchange token for routing config ───────────────────────────────────
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

# ── 2. local ACE settings ──────────────────────────────────────────────────
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

# ── 3. fetch collector package if needed ───────────────────────────────────
if [[ ! -f "${APP_DIR}/install.sh" ]]; then
  log "Downloading collector package..."
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  curl -fsSL "$PACKAGE_URL" -o "$TMP/ace.tar.gz" || fail "Could not download ${PACKAGE_URL}"
  tar -xzf "$TMP/ace.tar.gz" -C "$TMP"
  [[ -f "$TMP/ace-collector/install.sh" ]] || fail "Bad collector package."
  SRC="$TMP/ace-collector"
else
  SRC="$APP_DIR"
fi

# ── 4. run the collector installer noninteractively ────────────────────────
chmod +x "$SRC/install.sh" "$SRC/run.sh" 2>/dev/null || true
NONINTERACTIVE=1 \
ACE_URL="$ACE_URL" ACE_USER="$ACE_USER" ACE_PASS="$ACE_PASS" \
API_URL="$API_URL" ACE_KEY="$ACE_KEY" LOCATION="$LOCATION" \
  bash "$SRC/install.sh"

unset ACE_KEY ACE_PASS

echo
ok "ACE Collector installed for ${CASINO_NAME} (${LOCATION})."
echo "  Logs:   tail -f /var/log/ace-collector/collector.log"
echo "  Health: sudo -u acecollector /opt/ace-collector/run.sh --health --verbose"
