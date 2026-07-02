#!/usr/bin/env bash
#
# Casino System — Fleet Agent
# --------------------------------------------------------
# Отправляет heartbeat в Cloud (fleet-heartbeat edge function),
# получает список pending fleet_commands, исполняет их локально
# и рапортует completed. Запускается по таймеру каждые 5 минут.
#
# Обязательные env (deploy/.env):
#   FLEET_HEARTBEAT_URL  — https://<project>.functions.supabase.co/fleet-heartbeat
#   FLEET_SYNC_SECRET    — hex-secret из public.peer_links.sync_secret
#   FLEET_ANON_KEY       — anon key проекта (для Authorization заголовка функции)
#
set -euo pipefail

STATE_DIR="/var/lib/casino-system"
CMS_ROOT="${CMS_ROOT:-/opt/casino-system}"
ENV_FILE="$CMS_ROOT/deploy/.env"
LOG="$STATE_DIR/fleet-agent.log"

log() { echo "[$(date -Iseconds)] $*" >> "$LOG"; }
mkdir -p "$STATE_DIR"

[[ -f "$STATE_DIR/node_id" ]] || { log "no node_id — skip"; exit 0; }
NODE_ID="$(cat "$STATE_DIR/node_id")"

if [[ -f "$ENV_FILE" ]]; then set -a; . "$ENV_FILE"; set +a; fi

URL="${FLEET_HEARTBEAT_URL:-}"
SECRET="${FLEET_SYNC_SECRET:-}"
ANON="${FLEET_ANON_KEY:-}"
if [[ -z "$URL" || -z "$SECRET" || -z "$ANON" ]]; then
  log "FLEET_* env missing — offline-only mode"; exit 0
fi

# ── Собираем telemetry ─────────────────────────────────────────────
HOSTNAME_="$(hostname)"
CMS_VERSION="$(docker inspect --format='{{index .Config.Labels "org.casino.version"}}' cms-frontend 2>/dev/null || echo unknown)"
LIC_JSON="$(cat "$STATE_DIR/license.json" 2>/dev/null || echo '{}')"
LIC_MODE="$(echo "$LIC_JSON" | jq -r '.mode // "unknown"')"
LIC_EXP="$(echo "$LIC_JSON"  | jq -r '.expires_at // empty')"
UPTIME=$(awk '{printf "%d", $1}' /proc/uptime)
CPU=$(awk '{print $1}' /proc/loadavg)
DISK=$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')
RAM=$(free | awk '/Mem:/ {printf "%.1f", ($3/$2)*100}')
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
TS_IP=$(tailscale ip -4 2>/dev/null | head -1 || true)

BODY=$(jq -nc \
  --arg h "$HOSTNAME_" --arg v "$CMS_VERSION" \
  --arg m "$LIC_MODE" --arg e "$LIC_EXP" \
  --arg lip "$LOCAL_IP" --arg tip "$TS_IP" \
  --argjson up "$UPTIME" --argjson cpu "$CPU" \
  --argjson disk "$DISK" --argjson ram "$RAM" \
  '{hostname:$h, cms_version:$v, license_mode:$m,
    license_expires_at: ($e | select(. != "") // null),
    local_ip:$lip, tailscale_ip: ($tip | select(. != "") // null),
    uptime_seconds:$up, cpu_load:$cpu,
    disk_used_pct:$disk, ram_used_pct:$ram, notes:{}}')

SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -binary | xxd -p -c 256)

RESP="$(curl -fsS --max-time 20 -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON" \
  -H "apikey: $ANON" \
  -H "x-peer-node-id: $NODE_ID" \
  -H "x-peer-signature: $SIG" \
  --data "$BODY" "$URL" 2>>"$LOG" || echo "")"

if [[ -z "$RESP" ]]; then log "heartbeat failed"; exit 0; fi
log "heartbeat ok"

# ── Исполняем полученные команды ──────────────────────────────────
echo "$RESP" | jq -c '.commands[]?' 2>/dev/null | while read -r cmd; do
  ID=$(echo "$cmd"   | jq -r '.id')
  KIND=$(echo "$cmd" | jq -r '.kind')
  log "run $KIND ($ID)"
  RESULT="ok"; STATUS="done"
  case "$KIND" in
    reboot)          nohup bash -c 'sleep 5; systemctl reboot' >/dev/null 2>&1 & ;;
    update)          nohup bash -c "sleep 3; curl -fsSL https://casinosystem.app/install | bash -s -- --rebuild" >>"$LOG" 2>&1 & ;;
    license_refresh) /usr/local/sbin/casino-license-agent || RESULT="refresh_failed"; [[ "$RESULT" == "ok" ]] || STATUS="error" ;;
    custom)          RESULT="ignored: custom"; STATUS="error" ;;
    *)               RESULT="unknown kind"; STATUS="error" ;;
  esac
  # ACK через ту же функцию heartbeat — но проще писать напрямую через REST:
  curl -fsS -X PATCH \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
    --data "$(jq -nc --arg s "$STATUS" --arg r "$RESULT" \
      '{status:$s, completed_at:"now()", result_text:$r}')" \
    "${URL%/fleet-heartbeat}/../rest/v1/fleet_commands?id=eq.$ID" >/dev/null 2>>"$LOG" || true
done
