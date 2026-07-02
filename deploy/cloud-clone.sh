#!/usr/bin/env bash
#
# Casino System — Cloud Clone Uploader
# --------------------------------------------------------
# Runs nightly (03:30 EAT) via systemd timer.
#   1. pg_dump business schemas → custom format
#   2. AES-256-CBC encrypt with CLOUD_CLONE_KEY (from .env)
#   3. Split into ~4 MB chunks (edge body cap is 6 MB)
#   4. POST each chunk to cloud-clone-upload with HMAC-SHA256 signature
#   5. Keep last 7 local dumps, prune older
#
# Required env (in /opt/casino-system/deploy/.env):
#   CLOUD_CLONE_URL     — https://<project>.functions.supabase.co/cloud-clone-upload
#   FLEET_SYNC_SECRET   — peer_links.sync_secret (shared with fleet-agent)
#   FLEET_ANON_KEY      — Cloud anon key
#   CLOUD_CLONE_KEY     — hex/base64 secret (generated at firstboot)
#   POSTGRES_PASSWORD   — for local pg_dump connection
#
set -euo pipefail

STATE_DIR="/var/lib/casino-system"
BACKUP_DIR="$STATE_DIR/clones"
CMS_ROOT="${CMS_ROOT:-/opt/casino-system}"
ENV_FILE="$CMS_ROOT/deploy/.env"
LOG="$STATE_DIR/cloud-clone.log"

mkdir -p "$BACKUP_DIR"
log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG"; }

[[ -f "$STATE_DIR/node_id" ]] || { log "no node_id — skip"; exit 0; }
NODE_ID="$(cat "$STATE_DIR/node_id")"

if [[ -f "$ENV_FILE" ]]; then set -a; . "$ENV_FILE"; set +a; fi

URL="${CLOUD_CLONE_URL:-}"
SECRET="${FLEET_SYNC_SECRET:-}"
ANON="${FLEET_ANON_KEY:-}"
KEY="${CLOUD_CLONE_KEY:-}"
PGP="${POSTGRES_PASSWORD:-}"

if [[ -z "$URL" || -z "$SECRET" || -z "$ANON" || -z "$KEY" || -z "$PGP" ]]; then
  log "required env missing — offline-only mode, skip"; exit 0
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
UPLOAD_ID="$(cat /proc/sys/kernel/random/uuid)"
DUMP="$BACKUP_DIR/clone-$STAMP.dump"
ENC="$BACKUP_DIR/clone-$STAMP.enc"
MANIFEST="$BACKUP_DIR/clone-$STAMP.manifest.json"

log "start upload_id=$UPLOAD_ID"

# ── 1. pg_dump business schemas ──────────────────────────────────
export PGPASSWORD="$PGP"
docker exec -i cms-postgres pg_dump -U supabase_admin -d postgres \
  --schema=public --schema=extensions \
  --exclude-schema=auth --exclude-schema=storage --exclude-schema=realtime \
  --exclude-schema=supabase_functions --exclude-schema=vault \
  --format=custom --compress=6 > "$DUMP"
SIZE_RAW=$(stat -c%s "$DUMP")
log "dump ok raw_size=$SIZE_RAW"

# ── 1b. row-count manifest ───────────────────────────────────────
docker exec -i cms-postgres psql -U supabase_admin -d postgres -tAc "
  SELECT jsonb_object_agg(relname, n_live_tup)
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
" > "$MANIFEST" || echo '{}' > "$MANIFEST"

# ── 2. encrypt (AES-256-CBC, pbkdf2) ─────────────────────────────
openssl enc -aes-256-cbc -pbkdf2 -salt -iter 100000 \
  -pass pass:"$KEY" -in "$DUMP" -out "$ENC"
SIZE=$(stat -c%s "$ENC")
SHA=$(sha256sum "$ENC" | awk '{print $1}')
log "encrypted size=$SIZE sha=$SHA"

# ── 3. split into 4 MB chunks ────────────────────────────────────
CHUNK_DIR="$BACKUP_DIR/chunks-$STAMP"
mkdir -p "$CHUNK_DIR"; rm -f "$CHUNK_DIR"/*
split -b 4M -a 4 -d "$ENC" "$CHUNK_DIR/c"
CHUNKS=($(ls "$CHUNK_DIR" | sort))
TOTAL=${#CHUNKS[@]}
log "split into $TOTAL chunks"

ROWS_B64=$(base64 -w0 < "$MANIFEST")

# ── 4. upload each chunk ─────────────────────────────────────────
IDX=0
for CHUNK in "${CHUNKS[@]}"; do
  FILE="$CHUNK_DIR/$CHUNK"
  SIG=$(openssl dgst -sha256 -hmac "$SECRET" -binary < "$FILE" | xxd -p -c 256)
  EXTRA_HEADERS=()
  if (( IDX == TOTAL - 1 )); then
    EXTRA_HEADERS+=(-H "x-clone-rows: $ROWS_B64")
  fi
  if ! curl -fsS --max-time 120 -X POST \
    -H "Content-Type: application/octet-stream" \
    -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
    -H "x-peer-node-id: $NODE_ID" -H "x-peer-signature: $SIG" \
    -H "x-clone-upload-id: $UPLOAD_ID" \
    -H "x-clone-chunk-idx: $IDX" -H "x-clone-chunk-total: $TOTAL" \
    -H "x-clone-sha256: $SHA" -H "x-clone-size: $SIZE" \
    "${EXTRA_HEADERS[@]}" \
    --data-binary "@$FILE" "$URL" >>"$LOG" 2>&1; then
    log "chunk $IDX FAILED — abort"
    rm -rf "$CHUNK_DIR"
    exit 1
  fi
  log "chunk $IDX/$TOTAL ok"
  IDX=$((IDX + 1))
done
rm -rf "$CHUNK_DIR" "$ENC"

# ── 5. retention: keep last 7 dumps ──────────────────────────────
ls -1t "$BACKUP_DIR"/clone-*.dump 2>/dev/null | tail -n +8 | xargs -r rm -f
ls -1t "$BACKUP_DIR"/clone-*.manifest.json 2>/dev/null | tail -n +8 | xargs -r rm -f
log "done upload_id=$UPLOAD_ID"
