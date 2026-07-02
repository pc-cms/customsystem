#!/usr/bin/env bash
# Casino System — OTA rollback
# ---------------------------------
# Restores the previous release recorded at /var/lib/casino-system/ota-prev
# (symlink to /opt/casino-system.bak.<TS> written by update.sh).
# Rebuilds cms-frontend from restored sources and restarts stack.
set -euo pipefail

CMS_DIR="/opt/casino-system"
STATE_DIR="/var/lib/casino-system"
PREV_LINK="$STATE_DIR/ota-prev"
LOG="$STATE_DIR/ota-rollback.log"
TS="$(date +%Y%m%d-%H%M%S)"

log()  { echo "[$(date -Iseconds)] $*" | tee -a "$LOG"; }
die()  { log "FAIL: $*"; exit 1; }

[[ $EUID -eq 0 ]] || die "must run as root"
[[ -L "$PREV_LINK" ]] || die "no previous release recorded at $PREV_LINK"
PREV_DIR="$(readlink -f "$PREV_LINK")"
[[ -d "$PREV_DIR" && -d "$PREV_DIR/deploy" ]] || die "prev tree missing: $PREV_DIR"

log "rolling back to $PREV_DIR"

# Snapshot current (broken) install so operator can inspect
BROKEN_DIR="/opt/casino-system.broken.${TS}"
cp -a "$CMS_DIR" "$BROKEN_DIR"
log "current install snapshotted to $BROKEN_DIR"

# Restore, preserving live state (.env, certs, postgres data)
rsync -a --delete \
  --exclude 'deploy/.env' \
  --exclude 'deploy/certs/' \
  --exclude 'deploy/postgres/data/' \
  --exclude 'deploy/dist/' \
  --exclude 'node_modules/' \
  --exclude '.git/' \
  "$PREV_DIR"/ "$CMS_DIR"/

cd "$CMS_DIR/deploy"
docker image ls --format '{{.Repository}}:{{.Tag}}' | grep '^cms-frontend:' | xargs -r docker image rm -f 2>/dev/null || true
docker compose build --no-cache cms-frontend
docker compose up -d --force-recreate cms-frontend nginx cms-sync

# Health probe
OK=0
for _ in $(seq 1 30); do
  if docker compose exec -T cms-frontend curl -fsS http://localhost/ -o /dev/null 2>/dev/null; then
    OK=1; break
  fi
  sleep 2
done
[[ "$OK" == 1 ]] || die "frontend still not responding after rollback"

# Record for fleet-agent to report back
echo "{\"rolled_back_to\": \"$PREV_DIR\", \"at\": \"$(date -Iseconds)\"}" > "$STATE_DIR/last-rollback.json"
log "rollback complete ✓"
