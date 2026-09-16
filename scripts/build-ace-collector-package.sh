#!/usr/bin/env bash
#
# Rebuilds public/download/ace-collector-server.tar.gz from deploy/ace-collector.
#
#   ./scripts/build-ace-collector-package.sh            # rebuild artifact
#   ./scripts/build-ace-collector-package.sh --check     # fail if artifact is stale
#
# The archive is what https://casinosystem.app/download/ace-collector-install.sh
# downloads as the "latest collector package". It must always match the repo.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${ROOT}/deploy/ace-collector"
OUT="${ROOT}/public/download/ace-collector-server.tar.gz"
MODE="${1:-build}"

[[ -d "$SRC" ]] || { echo "missing ${SRC}" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/ace-collector"

# Deterministic content: no caches, venv, local session/env/state files.
tar -cf - -C "$SRC" \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='venv' \
  --exclude='.venv' \
  --exclude='.ace-session*.json' \
  --exclude='*.env' \
  --exclude='.env' \
  --exclude='*.log' \
  . | tar -xf - -C "$TMP/ace-collector"

# Deterministic archive (stable mtime/owner/order) so --check is meaningful.
find "$TMP/ace-collector" -exec touch -h -t 200001010000.00 {} +
( cd "$TMP" && find ace-collector -print0 | LC_ALL=C sort -z | \
  tar --owner=0 --group=0 --numeric-owner --no-recursion --null -T - -cf - ) \
  | gzip -n -9 > "$TMP/out.tar.gz"

if [[ "$MODE" == "--check" ]]; then
  if [[ ! -f "$OUT" ]] || ! cmp -s "$TMP/out.tar.gz" "$OUT"; then
    echo "STALE: ${OUT} does not match deploy/ace-collector." >&2
    echo "Run: ./scripts/build-ace-collector-package.sh" >&2
    exit 1
  fi
  echo "OK: collector package matches deploy/ace-collector."
  exit 0
fi

mkdir -p "$(dirname "$OUT")"
cp "$TMP/out.tar.gz" "$OUT"
echo "Built ${OUT}"
tar -tzf "$OUT" | head -20
