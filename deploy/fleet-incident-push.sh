#!/usr/bin/env bash
# Casino System — Local incident forwarder
# ------------------------------------------
# Reads local incidents (severity >= warn) inserted since last cursor and
# forwards them to Cloud fleet-incident-forward for centralized alerting.
# Cursor stored in /var/lib/casino-system/incident-cursor.
set -euo pipefail

STATE_DIR="/var/lib/casino-system"
CMS_ROOT="${CMS_ROOT:-/opt/casino-system}"
ENV_FILE="$CMS_ROOT/deploy/.env"
CURSOR="$STATE_DIR/incident-cursor"
LOG="$STATE_DIR/fleet-incident-push.log"

log() { echo "[$(date -Iseconds)] $*" >> "$LOG"; }
mkdir -p "$STATE_DIR"

[[ -f "$STATE_DIR/node_id" ]] || exit 0
NODE_ID="$(cat "$STATE_DIR/node_id")"
[[ -f "$ENV_FILE" ]] && { set -a; . "$ENV_FILE"; set +a; }

URL="${FLEET_INCIDENT_URL:-}"
SECRET="${FLEET_SYNC_SECRET:-}"
ANON="${FLEET_ANON_KEY:-}"
DB_URL="${LOCAL_DB_URL:-postgres://postgres:postgres@localhost:5432/postgres}"
[[ -z "$URL" || -z "$SECRET" || -z "$ANON" ]] && { log "env missing"; exit 0; }

SINCE="$(cat "$CURSOR" 2>/dev/null || echo '1970-01-01T00:00:00Z')"
NOW="$(date -Iseconds)"

ROWS=$(psql "$DB_URL" -Atc "
  SELECT jsonb_build_object(
    'local_incident_id', id,
    'severity', COALESCE(severity, 'info'),
    'category', category,
    'title', COALESCE(title, summary, '(no title)'),
    'body', description,
    'occurred_at', COALESCE(occurred_at, created_at)
  )
  FROM public.incidents
  WHERE COALESCE(occurred_at, created_at) > '$SINCE'
    AND COALESCE(severity, 'info') IN ('warn','warning','error','critical')
  ORDER BY COALESCE(occurred_at, created_at) ASC
  LIMIT 100;" 2>/dev/null || true)

if [[ -z "$ROWS" ]]; then
  echo "$NOW" > "$CURSOR"
  exit 0
fi

INC_JSON=$(echo "$ROWS" | jq -sc '{incidents: .}')
SIG=$(printf '%s' "$INC_JSON" | openssl dgst -sha256 -hmac "$SECRET" -binary | xxd -p -c 256)

if curl -fsS --max-time 30 -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
  -H "x-peer-node-id: $NODE_ID" -H "x-peer-signature: $SIG" \
  --data "$INC_JSON" "$URL" >>"$LOG" 2>&1; then
  echo "$NOW" > "$CURSOR"
  log "forwarded $(echo "$INC_JSON" | jq '.incidents|length') incidents"
else
  log "forward failed — keeping cursor"
fi
