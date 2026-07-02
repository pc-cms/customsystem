#!/usr/bin/env bash
#
# Casino System — License Agent
# --------------------------------------------------------
# Запускается по таймеру (раз в час). Задачи:
#   1. Читает node_id из /var/lib/casino-system/node_id
#   2. Если задан CLOUD_LICENSE_URL — стучится в Cloud, получает
#      { expires_at, activation_hash, mode } и апсертит в box_licenses.
#   3. Оффлайн — просто пересчитывает mode через box_license_mode()
#      и пишет актуальный statuses/stopped_at.
#   4. Если mode='stopped' — оставляет только страницу /admin/license
#      (флаг ставится в box_config.license_stopped=true; фронт сам
#      блокирует роуты через use-box-license.ts).
#
set -euo pipefail

STATE_DIR="/var/lib/casino-system"
CMS_ROOT="${CMS_ROOT:-/opt/casino-system}"
ENV_FILE="$CMS_ROOT/deploy/.env"
LOG="$STATE_DIR/license-agent.log"

mkdir -p "$STATE_DIR"
log() { echo "[$(date -Iseconds)] $*" >> "$LOG"; }

[[ -f "$STATE_DIR/node_id" ]] || { log "no node_id — skip"; exit 0; }
NODE_ID="$(cat "$STATE_DIR/node_id")"

# Load .env if present
if [[ -f "$ENV_FILE" ]]; then
  set -a; . "$ENV_FILE"; set +a
fi

PGPASSWORD="${POSTGRES_PASSWORD:-}"
PGUSER="${POSTGRES_USER:-postgres}"
PGDB="${POSTGRES_DB:-postgres}"

psql_local() {
  docker exec -e PGPASSWORD="$PGPASSWORD" cms-postgres \
    psql -U "$PGUSER" -d "$PGDB" -tAqc "$1" 2>>"$LOG"
}

# ── 1. Cloud heartbeat (optional) ────────────────────────────────
CLOUD_URL="${CLOUD_LICENSE_URL:-}"
if [[ -n "$CLOUD_URL" ]]; then
  ACT_CODE="$(cat "$STATE_DIR/activation_code" 2>/dev/null || echo "")"
  RESP="$(curl -fsS --max-time 15 \
    -H "Content-Type: application/json" \
    -d "{\"node_id\":\"$NODE_ID\",\"activation_code\":\"$ACT_CODE\"}" \
    "$CLOUD_URL" 2>>"$LOG" || echo "")"
  if [[ -n "$RESP" ]]; then
    EXP="$(echo "$RESP" | jq -r '.expires_at // empty')"
    HASH="$(echo "$RESP" | jq -r '.activation_hash // empty')"
    if [[ -n "$EXP" ]]; then
      psql_local "INSERT INTO public.box_licenses (node_id, expires_at, activation_hash, last_heartbeat_at)
                  VALUES ('$NODE_ID', '$EXP'::timestamptz, NULLIF('$HASH',''), now())
                  ON CONFLICT (node_id) DO UPDATE SET
                    expires_at = EXCLUDED.expires_at,
                    activation_hash = COALESCE(EXCLUDED.activation_hash, box_licenses.activation_hash),
                    last_heartbeat_at = now();" > /dev/null
      log "cloud heartbeat ok exp=$EXP"
    fi
  else
    log "cloud heartbeat failed — offline grace"
  fi
fi

# ── 2. Пересчёт mode локально ────────────────────────────────────
MODE="$(psql_local "SELECT public.box_license_mode();")"
log "current mode=$MODE"

if [[ "$MODE" == "stopped" ]]; then
  psql_local "UPDATE public.box_licenses SET stopped_at = COALESCE(stopped_at, now()) WHERE node_id='$NODE_ID';" > /dev/null
fi

# Экспортируем summary для внешнего мониторинга
psql_local "SELECT jsonb_build_object('node_id', node_id, 'expires_at', expires_at, 'stopped_at', stopped_at, 'mode', public.box_license_mode())
            FROM public.box_licenses WHERE node_id='$NODE_ID';" > "$STATE_DIR/license.json" 2>>"$LOG" || true
