#!/usr/bin/env bash
#
# ota-verify.sh — verify signature of a Casino System OTA release tarball.
#
# Usage:
#   ota-verify.sh <release.tar.gz> <release.sig>
#
# Verifies with cosign against /etc/casino-system/ota.pub (installed at
# first-boot from factory image). Exits 0 on success, non-zero on failure.
#
# Falls back to `openssl dgst -verify` if cosign is unavailable (offline).
#
set -euo pipefail

TARBALL="${1:?tarball path required}"
SIGFILE="${2:?signature path required}"
PUBKEY="${OTA_PUBKEY:-/etc/casino-system/ota.pub}"

[[ -f "$TARBALL" ]] || { echo "[ota] tarball missing: $TARBALL" >&2; exit 2; }
[[ -f "$SIGFILE" ]] || { echo "[ota] signature missing: $SIGFILE" >&2; exit 2; }
[[ -f "$PUBKEY"  ]] || { echo "[ota] public key missing: $PUBKEY" >&2; exit 2; }

if command -v cosign >/dev/null 2>&1; then
  echo "[ota] verifying with cosign…"
  cosign verify-blob --key "$PUBKEY" --signature "$SIGFILE" "$TARBALL"
  echo "[ota] cosign OK"
  exit 0
fi

echo "[ota] cosign not installed, falling back to openssl…"
# openssl expects raw signature (base64-decoded) and a PEM pubkey
TMPSIG="$(mktemp)"
trap 'rm -f "$TMPSIG"' EXIT
if base64 -d < "$SIGFILE" > "$TMPSIG" 2>/dev/null; then :; else cp "$SIGFILE" "$TMPSIG"; fi
openssl dgst -sha256 -verify "$PUBKEY" -signature "$TMPSIG" "$TARBALL"
echo "[ota] openssl OK"
