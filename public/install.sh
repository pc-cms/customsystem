#!/usr/bin/env bash
#
# Casino System — One-line bootstrap installer (private repo edition)
# --------------------------------------------------------------------
# Usage:
#   curl -fsSL https://casinosystem.app/install | sudo bash
#   curl -fsSL https://casinosystem.app/install | sudo bash -s -- --reset
#   curl -fsSL https://casinosystem.app/install | sudo bash -s -- --rebuild
#   curl -fsSL https://casinosystem.app/install | sudo bash -s -- --reconfigure
#
# Авторизация для приватного репо:
#   GH_TOKEN передаётся через env или через /etc/casino-system/bootstrap.env
#   echo 'GH_TOKEN=ghp_xxx' | sudo tee /etc/casino-system/bootstrap.env
#   sudo chmod 600 /etc/casino-system/bootstrap.env
#
set -euo pipefail

BOOTSTRAP_VERSION="1.3.3"
REPO="${CASINO_REPO:-pc-cms/customsystem}"
if [[ "$REPO" == "pms-cms/customsystem" ]]; then
  REPO="pc-cms/customsystem"
fi
BRANCH="${CASINO_BRANCH:-main}"
USE_LATEST_RELEASE="${CASINO_USE_LATEST_RELEASE:-false}"
TARGET="${CASINO_TARGET:-/opt/casino-system}"
ENV_FILE="/etc/casino-system/bootstrap.env"
SELF_URL="${CASINO_BOOTSTRAP_URL:-https://casinosystem.app/install}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${CYAN}[bootstrap]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ok ]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
fail() { echo -e "${RED}[fail]${NC} $*" >&2; exit 1; }

normalize_env_file() {
  local env_path="$1"
  [[ -f "$env_path" ]] || return 0
  local tmp
  tmp="$(mktemp)"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ -z "$line" || "$line" =~ ^[[:space:]]*# || "$line" != *=* ]]; then
      printf '%s\n' "$line" >> "$tmp"
      continue
    fi
    local key="${line%%=*}" val="${line#*=}"
    if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ || -z "$val" || "$val" =~ ^\'.*\'$ || "$val" =~ ^\".*\"$ ]]; then
      printf '%s\n' "$line" >> "$tmp"
      continue
    fi
    local q_val
    q_val=$(printf "'%s'" "$(printf '%s' "$val" | sed "s/'/'\\\\''/g")")
    printf '%s=%s\n' "$key" "$q_val" >> "$tmp"
  done < "$env_path"
  mv "$tmp" "$env_path"
}

echo -e "${CYAN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Casino System Bootstrap  v${BOOTSTRAP_VERSION}              ║${NC}"
echo -e "${CYAN}║  repo: ${REPO}@${BRANCH}${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════╝${NC}"

[[ $EUID -eq 0 ]] || fail "Запустите от root: curl -fsSL ${SELF_URL} | sudo bash"

command -v curl >/dev/null 2>&1 || { log "Устанавливаю curl..."; apt-get update -qq && apt-get install -y -qq curl; }
command -v tar  >/dev/null 2>&1 || { log "Устанавливаю tar...";  apt-get update -qq && apt-get install -y -qq tar; }

# ── Загружаем токен (опционально, нужен только для приватных репо) ──
if [[ -z "${GH_TOKEN:-}" ]] && [[ -f "$ENV_FILE" ]]; then
  set -a; . "$ENV_FILE"; set +a
fi

AUTH_ARGS=()
if [[ -n "${GH_TOKEN:-}" ]]; then
  AUTH_ARGS=(-H "Authorization: Bearer ${GH_TOKEN}")
  log "Использую GH_TOKEN из ${ENV_FILE:-env}"
else
  log "GH_TOKEN не задан — работаю в анонимном режиме (репо должна быть публичной)"
fi
ACCEPT_HDR="Accept: application/vnd.github+json"
API_VER_HDR="X-GitHub-Api-Version: 2022-11-28"

TMP="$(mktemp -d /tmp/casino-bootstrap.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# ── Определяем ref: по умолчанию main; release только если явно включён ──
REF="$BRANCH"
if [[ "$USE_LATEST_RELEASE" == "true" ]]; then
  log "Запрашиваю latest release из GitHub API..."
  REL_HTTP=$(curl -fsS -o "$TMP/release.json" -w "%{http_code}" \
    "${AUTH_ARGS[@]}" -H "$ACCEPT_HDR" -H "$API_VER_HDR" \
    --retry 3 --retry-delay 2 \
    "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null || echo "000")

  if [[ "$REL_HTTP" == "200" ]]; then
    REF=$(grep -oP '"tag_name"\s*:\s*"\K[^"]+' "$TMP/release.json" | head -n1)
    ok "Latest release: $REF"
  elif [[ "$REL_HTTP" == "401" || "$REL_HTTP" == "403" ]]; then
    fail "GitHub отклонил доступ (HTTP=$REL_HTTP). Если репо приватная — нужен GH_TOKEN. Если публичная — проверь имя репо: ${REPO}."
  else
    warn "GitHub API вернул HTTP=$REL_HTTP — использую ветку '${BRANCH}'"
  fi
else
  log "Использую ветку '${BRANCH}'"
fi

# ── Качаем tarball ──
TARBALL_URL="https://api.github.com/repos/${REPO}/tarball/${REF}"
log "Скачиваю tarball: $TARBALL_URL"
HTTP=$(curl -fL --retry 3 --retry-delay 2 \
  "${AUTH_ARGS[@]}" -H "$ACCEPT_HDR" -H "$API_VER_HDR" \
  -o "$TMP/src.tar.gz" -w "%{http_code}" \
  "$TARBALL_URL" 2>&1 | tail -n1 || echo "000")

[[ "$HTTP" == "200" ]] || fail "Не удалось скачать tarball (HTTP=$HTTP). Проверь доступ к ${REPO} (или задай GH_TOKEN если репо приватная)."

SIZE=$(stat -c%s "$TMP/src.tar.gz" 2>/dev/null || stat -f%z "$TMP/src.tar.gz")
[[ "$SIZE" -gt 100000 ]] || fail "Скачанный архив подозрительно мал ($SIZE байт)."
ok "Архив скачан: $((SIZE/1024)) KB"

log "Распаковываю..."
tar -xzf "$TMP/src.tar.gz" -C "$TMP"
SRC_DIR=$(find "$TMP" -maxdepth 1 -type d \( -name "${REPO##*/}-*" -o -name "pc-cms-*" \) | head -n1)
[[ -d "$SRC_DIR" ]] || fail "Не найдена распакованная папка"
[[ -f "$SRC_DIR/deploy/install.sh" ]] || fail "В архиве нет deploy/install.sh"

# ── Бэкап + сохранение состояния ──
if [[ -d "$TARGET" ]]; then
  BAK="${TARGET}.bak.$(date +%Y%m%d-%H%M%S)"
  log "Бэкаплю существующую папку → $BAK"
  command -v rsync >/dev/null 2>&1 || { log "Устанавливаю rsync..."; apt-get update -qq && apt-get install -y -qq rsync; }
  if [[ -f "$TARGET/deploy/.env" ]]; then cp -f "$TARGET/deploy/.env" "$TMP/deploy.env.preserve"; fi
  if [[ -d "$TARGET/deploy/certs" ]]; then cp -a "$TARGET/deploy/certs" "$TMP/certs.preserve"; fi
  if [[ -d "$TARGET/data" ]]; then cp -a "$TARGET/data" "$TMP/data.preserve"; fi
  rsync -a --delete "$TARGET"/ "$BAK"/
  ok "Backup → $BAK"
fi

log "Устанавливаю в $TARGET"
mkdir -p "$(dirname "$TARGET")"
mkdir -p "$TARGET"
rsync -a --delete "$SRC_DIR"/ "$TARGET"/

if [[ -f "$TMP/deploy.env.preserve" ]]; then
  cp -f "$TMP/deploy.env.preserve" "$TARGET/deploy/.env"
  normalize_env_file "$TARGET/deploy/.env"
  ok "Восстановлен deploy/.env"
fi
if [[ -d "$TMP/certs.preserve" ]]; then
  rm -rf "$TARGET/deploy/certs" 2>/dev/null || true
  mv "$TMP/certs.preserve" "$TARGET/deploy/certs"
  ok "Восстановлены deploy/certs/"
fi
if [[ -d "$TMP/data.preserve" ]]; then
  rm -rf "$TARGET/data" 2>/dev/null || true
  mv "$TMP/data.preserve" "$TARGET/data"
  ok "Восстановлена папка data/"
fi

chmod +x "$TARGET/deploy/install.sh" 2>/dev/null || true

# ── Ставим alias `casino-update` ──
ALIAS_PATH="/usr/local/bin/casino-update"
cat > "$ALIAS_PATH" <<EOF
#!/usr/bin/env bash
# Auto-generated by Casino System bootstrap
exec curl -fsSL ${SELF_URL} | sudo bash -s -- "\$@"
EOF
chmod +x "$ALIAS_PATH"
ok "Alias установлен: \`sudo casino-update [args]\`"

ok "Код установлен. Запускаю инсталлер..."
echo
if [[ -e /dev/tty ]]; then
  exec bash "$TARGET/deploy/install.sh" "$@" </dev/tty
else
  warn "/dev/tty недоступен — интерактивные вопросы могут не работать."
  exec bash "$TARGET/deploy/install.sh" "$@"
fi
