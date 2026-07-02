#!/usr/bin/env bash
#
# Casino System — On-Premises Installer
# --------------------------------------------------------
# Запуск без аргументов = интерактивное меню:
#   sudo ./deploy/install.sh                   # меню: Обновить / Переустановить / Стереть всё
#
# Или сразу с флагом:
#   sudo ./deploy/install.sh --update          # обновить frontend, сохранить БД и .env
#   sudo ./deploy/install.sh --rebuild         # пересобрать frontend (no-cache)
#   sudo ./deploy/install.sh --reset           # сбросить .env (БД остаётся)
#   sudo ./deploy/install.sh --wipe            # удалить ВСЁ (БД, образы) и поставить заново
#   sudo ./deploy/install.sh --enable-remote   # включить Cloudflare Tunnel (см. REMOTE-ACCESS.md)
#   sudo ./deploy/install.sh --disable-remote  # выключить Cloudflare Tunnel
#   sudo ./deploy/install.sh --menu            # принудительно показать меню
#
set -euo pipefail

INSTALLER_VERSION="2.1.6"

# Resolve script directory robustly. Falls back when piped through
# `curl ... | bash` (no BASH_SOURCE) — then we look for an installed
# tree under /opt/casino-system/deploy.
_SRC="${BASH_SOURCE[0]:-${0:-}}"
if [[ -z "$_SRC" || "$_SRC" == "bash" || ! -f "$_SRC" ]]; then
  if [[ -f /opt/casino-system/deploy/install.sh ]]; then
    SCRIPT_DIR="/opt/casino-system/deploy"
  else
    echo "[fail] Cannot locate installer tree. Unpack the USB tarball into" >&2
    echo "       /opt/casino-system first, then run: sudo /opt/casino-system/deploy/install.sh" >&2
    exit 1
  fi
else
  SCRIPT_DIR="$(cd "$(dirname "$_SRC")" && pwd)"
fi
CMS_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$SCRIPT_DIR"

echo -e "\033[1;36m╔════════════════════════════════════════════════╗\033[0m"
echo -e "\033[1;36m║  Casino System Installer  v${INSTALLER_VERSION}              ║\033[0m"
echo -e "\033[1;36m╚════════════════════════════════════════════════╝\033[0m"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()    { echo -e "${BLUE}[install]${NC} $*"; }
ok()     { echo -e "${GREEN}[ ok ]${NC} $*"; }
warn()   { echo -e "${YELLOW}[warn]${NC} $*"; }
fail()   { echo -e "${RED}[fail]${NC} $*" >&2; exit 1; }
hr()     { echo -e "${CYAN}────────────────────────────────────────────────────────${NC}"; }
title()  { echo; hr; echo -e "${BOLD}${CYAN}  $*${NC}"; hr; }
trap 'rc=$?; ln="${BASH_LINENO[0]:-?}"; cmd="${BASH_COMMAND:-?}"; echo -e "${RED}[fail]${NC} Installer stopped at line ${ln} (exit ${rc})\n        command: ${cmd}\n        Diag: sudo docker compose -f ${SCRIPT_DIR:-/opt/casino-system/deploy}/docker-compose.yml logs --tail=80" >&2; exit "$rc"' ERR

require_root() { [[ $EUID -eq 0 ]] || fail "Запустите от root: sudo ./deploy/install.sh"; }

# ── CLI ──
RESET=0; REBUILD=0; RECONFIGURE=0; WIPE=0; UPDATE=0; UPDATE_FRONT=0; MENU=0; REPAIR=0; VERIFY=0; BACKFILL=0; BOXED=0
ENABLE_REMOTE=0; DISABLE_REMOTE=0; SKIP_NET_CHECK=0
PRESET_CASINO_SLUG=""; PRESET_NODE_ID=""; LEGACY_ROLE=""; LEGACY_SEED=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --reset)         RESET=1; shift ;;
    --rebuild)       REBUILD=1; shift ;;
    --reconfigure)   RECONFIGURE=1; shift ;;
    --wipe)          WIPE=1; RESET=1; REBUILD=1; shift ;;
    --update)        UPDATE=1; REBUILD=1; shift ;;
    --frontend-only|--update-frontend) UPDATE_FRONT=1; shift ;;
    --repair)        REPAIR=1; shift ;;
    --verify-parity) VERIFY=1; shift ;;
    --backfill)      BACKFILL=1; shift ;;
    --enable-remote)  ENABLE_REMOTE=1; shift ;;
    --disable-remote) DISABLE_REMOTE=1; shift ;;
    --role)          [[ $# -ge 2 ]] || fail "--role требует значение"; LEGACY_ROLE="$2"; shift 2 ;;
    --casino)        [[ $# -ge 2 ]] || fail "--casino требует slug"; PRESET_CASINO_SLUG="$2"; shift 2 ;;
    --node-id)       [[ $# -ge 2 ]] || fail "--node-id требует значение"; PRESET_NODE_ID="$2"; shift 2 ;;
    --seed)          LEGACY_SEED=1; shift ;;
    --menu)          MENU=1; shift ;;
    --skip-net-check|--offline) SKIP_NET_CHECK=1; shift ;;
    --boxed)         BOXED=1; SKIP_NET_CHECK=1; shift ;;
    -h|--help)       sed -n '4,16p' "$0"; exit 0 ;;
    *) fail "Неизвестный аргумент: $1" ;;
  esac
done

require_root

# ── Standalone: --enable-remote / --disable-remote ──
# Управляют только Cloudflare Tunnel — не трогают БД/frontend/sync.
# Подробно: deploy/REMOTE-ACCESS.md
if [[ $ENABLE_REMOTE -eq 1 || $DISABLE_REMOTE -eq 1 ]]; then
  ENV_PATH="${SCRIPT_DIR}/.env"
  [[ -f "$ENV_PATH" ]] || fail ".env не найден (${ENV_PATH}). Сначала установите систему."

  set_env_var() {
    local key="$1" val="$2" file="$3"
    if grep -qE "^${key}=" "$file"; then
      # in-place replace
      sed -i.bak "s|^${key}=.*|${key}=${val}|" "$file" && rm -f "${file}.bak"
    else
      echo "${key}=${val}" >> "$file"
    fi
  }

  if [[ $ENABLE_REMOTE -eq 1 ]]; then
    title "Включаю удалённый доступ (Cloudflare Tunnel)"
    TOKEN="${TUNNEL_TOKEN:-}"
    if [[ -z "$TOKEN" ]]; then
      if [[ -e /dev/tty ]]; then
        echo
        echo "Получите токен в Cloudflare Zero Trust:"
        echo "  Networks → Tunnels → Create tunnel → Docker → скопируйте значение после --token"
        echo
        printf "TUNNEL_TOKEN: "
        IFS= read -r TOKEN </dev/tty || true
      fi
    fi
    TOKEN="${TOKEN//[[:space:]]/}"
    [[ -n "$TOKEN" ]] || fail "TUNNEL_TOKEN не задан. Прерываю."

    set_env_var "TUNNEL_TOKEN" "$TOKEN" "$ENV_PATH"
    chmod 600 "$ENV_PATH"
    ok "TUNNEL_TOKEN сохранён в .env"

    log "Поднимаю контейнер cms-cloudflared..."
    docker compose --profile with-tunnel up -d cloudflared
    sleep 3
    docker compose logs --tail=15 cloudflared || true
    echo
    ok "Удалённый доступ включён."
    echo
    echo "Дальше:"
    echo "  1. В Cloudflare Zero Trust добавьте public hostname для туннеля:"
    echo "     local-<slug>.casinosystem.app → http://nginx:80"
    echo "  2. ОБЯЗАТЕЛЬНО создайте Access policy на этот hostname (email allowlist),"
    echo "     иначе логин-страница казино торчит в открытый интернет."
    echo "  3. Подробно: deploy/REMOTE-ACCESS.md"
    exit 0
  fi

  if [[ $DISABLE_REMOTE -eq 1 ]]; then
    title "Отключаю удалённый доступ"
    log "Останавливаю контейнер cms-cloudflared..."
    docker compose --profile with-tunnel rm -sf cloudflared 2>/dev/null || true
    set_env_var "TUNNEL_TOKEN" "" "$ENV_PATH"
    chmod 600 "$ENV_PATH"
    ok "Удалённый доступ отключён. DNS-запись и Access policy в Cloudflare НЕ удалены — это вручную, если нужно."
    exit 0
  fi
fi

# ── Interactive menu (default when запущен без флагов в TTY) ──
if [[ $BOXED -eq 0 && $MENU -eq 0 && $RESET -eq 0 && $REBUILD -eq 0 && $RECONFIGURE -eq 0 && $WIPE -eq 0 && $UPDATE -eq 0 && $UPDATE_FRONT -eq 0 && $REPAIR -eq 0 && $VERIFY -eq 0 && $BACKFILL -eq 0 ]]; then
  if [[ -t 0 || -e /dev/tty ]]; then MENU=1; fi
fi

if [[ $MENU -eq 1 ]]; then
  # Открываем /dev/tty как fd 3 — read будет читать оттуда напрямую,
  # независимо от того, чем заняты stdin/stdout (pipe от curl и т.п.).
  if [[ -e /dev/tty ]]; then
    exec 3</dev/tty || { warn "Нет доступа к /dev/tty — пропускаю меню"; MENU=0; }
  else
    warn "/dev/tty недоступен — пропускаю меню"
    MENU=0
  fi
fi

if [[ $MENU -eq 1 ]]; then
  echo
  echo -e "${BOLD}${CYAN}  Выберите действие:${NC}"
  echo
  HAS_ENV=0; [[ -f "${SCRIPT_DIR}/.env" ]] && HAS_ENV=1
  if [[ $HAS_ENV -eq 1 ]]; then
    echo -e "    ${BOLD}1${NC})  ${GREEN}Обновить только Frontend${NC} — быстро (3-5 мин), БД и сервисы НЕ трогаются  ${YELLOW}(для UI-патчей)${NC}"
    echo -e "    ${BOLD}2${NC})  ${GREEN}Обновить ВСЁ${NC}              — пересобрать frontend + sync + применить миграции БД"
    echo -e "    ${BOLD}3${NC})  Переустановить              — пересоздать .env, сертификаты и пересобрать frontend (БД сохранить)"
    echo -e "    ${BOLD}4${NC})  ${RED}Стереть всё${NC}              — удалить БД, .env, образы и поставить заново"
    echo -e "    ${BOLD}5${NC})  Статус и логи"
    echo -e "    ${BOLD}6${NC})  ${CYAN}Repair БД${NC}                 — починить схему (FKs, RPC) без пересборки/wipe"
    echo -e "    ${BOLD}7${NC})  ${CYAN}Verify parity${NC}             — сравнить локальную копию с Cloud (схема, данные, версия)"
    echo -e "    ${BOLD}8${NC})  Выйти"
  else
    echo -e "    ${BOLD}1${NC})  ${GREEN}Установить${NC}      — чистая установка (БД и .env будут созданы)  ${YELLOW}(рекомендуется)${NC}"
    echo -e "    ${BOLD}2${NC})  ${RED}Стереть всё и поставить заново${NC}  — на всякий случай очистить остатки"
    echo -e "    ${BOLD}3${NC})  Статус и логи"
    echo -e "    ${BOLD}4${NC})  Выйти"
  fi
  DEFAULT_CHOICE=1
  echo
  printf "  Ваш выбор [%s]: " "$DEFAULT_CHOICE"
  CHOICE=""
  if ! IFS= read -r -u 3 CHOICE; then CHOICE=""; fi
  CHOICE="${CHOICE//[[:space:]]/}"
  CHOICE="${CHOICE:-$DEFAULT_CHOICE}"
  echo

  if [[ $HAS_ENV -eq 1 ]]; then
    case "$CHOICE" in
      1) echo -e "${GREEN}▶ Запускаю: Обновление Frontend (БД не трогаю)${NC}"; UPDATE_FRONT=1 ;;
      2) echo -e "${GREEN}▶ Запускаю: Полное обновление${NC}"; UPDATE=1; REBUILD=1 ;;
      3) echo -e "${GREEN}▶ Запускаю: Переустановка (.env + пересборка frontend)${NC}"; RESET=1; REBUILD=1 ;;
      4)
         echo
         printf "  ⚠  Это удалит ВСЮ базу данных. Введите 'WIPE' для подтверждения: "
         CONFIRM=""; IFS= read -r -u 3 CONFIRM || true
         [[ "$CONFIRM" == "WIPE" ]] || fail "Отмена."
         echo -e "${RED}▶ Запускаю: Полная очистка и установка с нуля${NC}"
         WIPE=1; RESET=1; REBUILD=1
         ;;
      5)
         echo; docker compose ps || true; echo
         echo -e "${CYAN}Последние логи (Ctrl+C для выхода):${NC}"
         exec docker compose logs --tail=100 -f
         ;;
      6) echo -e "${CYAN}▶ Запускаю: Repair БД${NC}"; REPAIR=1 ;;
      7) echo -e "${CYAN}▶ Запускаю: Verify parity${NC}"; VERIFY=1 ;;
      8) echo "Выход."; exit 0 ;;
      *) fail "Неизвестный выбор: '${CHOICE}'" ;;
    esac
  else
    case "$CHOICE" in
      1) echo -e "${GREEN}▶ Запускаю: Чистая установка${NC}" ;;
      2)
         echo
         printf "  ⚠  Введите 'WIPE' для подтверждения полной очистки: "
         CONFIRM=""; IFS= read -r -u 3 CONFIRM || true
         [[ "$CONFIRM" == "WIPE" ]] || fail "Отмена."
         echo -e "${RED}▶ Запускаю: Полная очистка и установка${NC}"
         WIPE=1; RESET=1; REBUILD=1
         ;;
      3)
         echo; docker compose ps 2>/dev/null || true; echo
         echo -e "${CYAN}Последние логи (Ctrl+C для выхода):${NC}"
         exec docker compose logs --tail=100 -f 2>/dev/null || { echo "Стек ещё не запущен."; exit 0; }
         ;;
      4) echo "Выход."; exit 0 ;;
      *) fail "Неизвестный выбор: '${CHOICE}'" ;;
    esac
  fi
  echo
fi

# ── Frontend-only fast path: делегируем в update.sh и выходим ─────────────
if [[ $UPDATE_FRONT -eq 1 ]]; then
  title "Frontend-only update"
  log "Пропускаю проверки системы, .env, сертификаты, миграции БД."
  log "Только: git pull → rebuild cms-frontend → restart frontend + nginx."
  if [[ ! -x "${SCRIPT_DIR}/update.sh" ]]; then
    chmod +x "${SCRIPT_DIR}/update.sh" 2>/dev/null || true
  fi
  exec bash "${SCRIPT_DIR}/update.sh" --frontend-only
fi

# ── Repair fast path: применить hotfix SQL и перезапустить postgrest ───────
if [[ $REPAIR -eq 1 ]]; then
  title "Repair БД (полная локальная схема + sync worker)"
  cd "$SCRIPT_DIR"
  [[ -f .env ]] || fail ".env не найден — repair доступен только на установленной системе."
  set -a; . ./.env; set +a
  HOTFIX="${SCRIPT_DIR}/postgres/hotfix-fks-rpc.sql"
  [[ -f "$HOTFIX" ]] || fail "Не найден $HOTFIX"
  if ! docker compose ps postgres 2>/dev/null | grep -qE "Up|running"; then
    log "Postgres не запущен — стартую..."
    docker compose up -d postgres
    for i in $(seq 1 30); do
      docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-postgres}" &>/dev/null && break
      sleep 2
    done
  fi
  log "Копирую hotfix в контейнер postgres..."
  docker compose cp "$HOTFIX" postgres:/tmp/hotfix-fks-rpc.sql
  log "Применяю hotfix..."
  docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
    psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" \
    -v ON_ERROR_STOP=1 -f /tmp/hotfix-fks-rpc.sql
  ok "Hotfix применён."

  REPAIR_SQL="${SCRIPT_DIR}/postgres/repair-local-schema.sql"
  if [[ -f "$REPAIR_SQL" ]]; then
    log "Применяю полный local schema repair (новые таблицы/RPC/триггеры)..."
    docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
      psql -h 127.0.0.1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" \
      -v ON_ERROR_STOP=1 < "$REPAIR_SQL"
    ok "Local schema repair применён."
  else
    warn "repair-local-schema.sql не найден — пропускаю полный repair."
  fi

  # ── Pull missing tables from Cloud schema ───────────────────────────────
  if [[ -n "${CLOUD_URL:-}" && -n "${SYNC_SECRET:-}" && -n "${CASINO_ID:-}" ]]; then
    log "Скачиваю актуальную схему из Cloud (cloud-schema-export)..."
    TMP_DDL=$(mktemp /tmp/cloud-schema.XXXXXX.sql)
    if curl -fsSL --max-time 30 \
        -H "x-sync-secret: ${SYNC_SECRET}" -H "x-casino-id: ${CASINO_ID}" \
        "${CLOUD_URL}/functions/v1/cloud-schema-export" -o "$TMP_DDL" 2>/dev/null \
        && [[ -s "$TMP_DDL" ]]; then
      log "Применяю Cloud-схему локально (idempotent, CREATE IF NOT EXISTS)..."
      docker compose cp "$TMP_DDL" postgres:/tmp/cloud-schema.sql
      # NOT --ON_ERROR_STOP: дублирующиеся объекты ожидаемы; warnings игнорим
      docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
        psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" \
        -f /tmp/cloud-schema.sql 2>&1 | grep -iE "ERROR|FATAL" | grep -viE "already exists|duplicate" | head -20 || true
      rm -f "$TMP_DDL"
      ok "Cloud-схема применена (новые таблицы добавлены, существующие не тронуты)."
    else
      warn "cloud-schema-export недоступен — пропускаю sync схемы (хотфикс уже применён)."
      rm -f "$TMP_DDL"
    fi
  else
    warn "CLOUD_URL/SYNC_SECRET/CASINO_ID не заданы — пропускаю Cloud schema sync."
  fi

  log "Перезапускаю postgrest (обновление schema cache)..."
  docker compose restart postgrest >/dev/null 2>&1 || warn "Не удалось перезапустить postgrest"
  log "Пересобираю cms-sync, чтобы repair/backfill использовали новый код..."
  docker compose build cms-sync >/dev/null
  docker compose up -d cms-sync >/dev/null
  ok "Repair завершён. Очистите кэш браузера (Ctrl+Shift+R) на ${LOCAL_DOMAIN:-arusha.local}"
  exit 0
fi

# ── Backfill fast path: дозалить недостающие строки из Cloud (ON CONFLICT DO NOTHING) ──
if [[ $BACKFILL -eq 1 ]]; then
  title "Backfill from Cloud (idempotent)"
  cd "$SCRIPT_DIR"
  [[ -f .env ]] || fail ".env не найден — backfill доступен только на установленной системе."
  set -a; . ./.env; set +a
  : "${CASINO_ID:?CASINO_ID не задан в .env}"
  : "${SYNC_SECRET:?SYNC_SECRET не задан — сервер ещё не спарен с Cloud}"

  log "Обновляю cms-sync перед импортом, чтобы использовать текущий pair-cli.js..."
  docker compose build cms-sync >/dev/null
  docker compose up -d cms-sync >/dev/null

  log "Запускаю pair-cli.js sync (стрим cloud-seed-export, ON CONFLICT DO UPDATE)…"
  if ! docker compose exec -T cms-sync node /app/pair-cli.js sync; then
    fail "Backfill завершился с ошибкой. См. логи: docker compose logs --tail=80 cms-sync"
  fi
  ok "Backfill завершён."
  log "Проверьте: sudo casino-update --verify-parity"
  exit 0
fi

# ── Verify-parity fast path: сравнить локальную копию с Cloud ──────────────
if [[ $VERIFY -eq 1 ]]; then
  title "Verify parity (Local ↔ Cloud)"
  cd "$SCRIPT_DIR"
  [[ -f .env ]] || fail ".env не найден — verify-parity доступен только на установленной системе."
  set -a; . ./.env; set +a
  : "${CLOUD_URL:?CLOUD_URL не задан в .env}"
  : "${CASINO_ID:?CASINO_ID не задан в .env}"
  : "${SYNC_SECRET:?SYNC_SECRET не задан в .env — сервер ещё не спарен с Cloud}"
  # CLOUD_ANON_KEY больше не требуется — counts через cloud-parity-counts с service-role

  PG_RUN=(docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres
          psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -At -F'|')

  TABLES=(players gaming_tables shifts employees casinos
          transactions expenses casino_visits client_sessions
          player_cards player_tags player_notes player_chip_adjustments
          chip_inventory chip_emissions cash_counts
          table_tracker table_daily_results business_day_closures
          player_position_history mirror_cutover_state node_modes
          sync_table_registry user_roles user_casino_access)

  PASS=0; DIFF=0; MISS=0; LOCAL_MORE=0; LOCAL_LESS=0
  printf "\n  ${BOLD}%-32s %12s %12s   %s${NC}\n" "Table" "Local" "Cloud" "Status"
  printf "  %-32s %12s %12s   %s\n" "────────────────────────────────" "────────────" "────────────" "──────"

  # Fetch all Cloud counts in ONE call via cloud-parity-counts (uses service-role on Cloud,
  # bypasses RLS). Requires SYNC_SECRET registered as peer/pending registration.
  PARITY_JSON=$(curl -sk --max-time 20 \
    -H "x-sync-secret: ${SYNC_SECRET}" -H "x-casino-id: ${CASINO_ID}" \
    "${CLOUD_URL}/functions/v1/cloud-parity-counts" 2>/dev/null || echo "")
  if [[ -z "$PARITY_JSON" || "$PARITY_JSON" == *'"error"'* ]]; then
    warn "cloud-parity-counts недоступен или вернул ошибку:"
    echo "    ${PARITY_JSON:0:200}"
    warn "Проверьте что edge function задеплоена и SYNC_SECRET валиден."
    PARITY_JSON='{"counts":{}}'
  fi

  get_cloud() {
    echo "$PARITY_JSON" | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*[0-9]+" | head -1 | grep -oE '[0-9]+$' || echo ""
  }

  # Глобальные / Cloud-only таблицы — расхождение ожидаемо (super_admin'ы из других казино,
  # cloud-side оркестрация). Показываем как INFO и не считаем в DIFF.
  is_info_table() {
    case "$1" in
      user_roles|user_casino_access|sync_table_registry|node_modes|mirror_cutover_state) return 0 ;;
      *) return 1 ;;
    esac
  }
  INFO=0
  for T in "${TABLES[@]}"; do
    case "$T" in
      player_cards|player_tags)
        LOC=$("${PG_RUN[@]}" -c "SELECT count(*) FROM public.${T} t JOIN public.players p ON p.id=t.player_id WHERE p.casino_id='${CASINO_ID}'" 2>/dev/null || true)
        ;;
      casinos)
        LOC=$("${PG_RUN[@]}" -c "SELECT count(*) FROM public.casinos WHERE id='${CASINO_ID}'" 2>/dev/null || true)
        ;;
      user_roles|user_casino_access|sync_table_registry|node_modes)
        LOC=$("${PG_RUN[@]}" -c "SELECT count(*) FROM public.${T}" 2>/dev/null || true)
        ;;
      *)
        LOC=$("${PG_RUN[@]}" -c "SELECT count(*) FROM public.${T} WHERE casino_id='${CASINO_ID}'" 2>/dev/null || true)
        ;;
    esac
    [[ -z "$LOC" ]] && LOC="MISS"
    CLD=$(get_cloud "$T")
    [[ -z "$CLD" ]] && CLD="?"
    if [[ "$LOC" == "MISS" ]]; then
      printf "  %-32s %12s %12s   ${RED}%s${NC}\n" "$T" "—" "$CLD" "no table"
      MISS=$((MISS+1))
    elif [[ "$LOC" == "$CLD" ]]; then
      printf "  %-32s %12s %12s   ${GREEN}%s${NC}\n" "$T" "$LOC" "$CLD" "OK"
      PASS=$((PASS+1))
    elif is_info_table "$T"; then
      printf "  %-32s %12s %12s   ${CYAN}%s${NC}\n" "$T" "$LOC" "$CLD" "INFO"
      INFO=$((INFO+1))
    elif [[ "$LOC" =~ ^[0-9]+$ && "$CLD" =~ ^[0-9]+$ && "$LOC" -gt "$CLD" ]]; then
      printf "  %-32s %12s %12s   ${YELLOW}%s${NC}\n" "$T" "$LOC" "$CLD" "DIFF local+"
      DIFF=$((DIFF+1)); LOCAL_MORE=$((LOCAL_MORE+1))
    elif [[ "$LOC" =~ ^[0-9]+$ && "$CLD" =~ ^[0-9]+$ && "$LOC" -lt "$CLD" ]]; then
      printf "  %-32s %12s %12s   ${YELLOW}%s${NC}\n" "$T" "$LOC" "$CLD" "DIFF cloud+"
      DIFF=$((DIFF+1)); LOCAL_LESS=$((LOCAL_LESS+1))
    else
      printf "  %-32s %12s %12s   ${YELLOW}%s${NC}\n" "$T" "$LOC" "$CLD" "DIFF"
      DIFF=$((DIFF+1))
    fi
  done

  echo
  log "Frontend version:"
  LOC_VER=$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' "$SCRIPT_DIR/../package.json" 2>/dev/null | head -1 | sed -E 's/.*"([^"]+)"$/\1/')
  REL_VER=$(curl -fsSL --max-time 8 https://api.github.com/repos/pc-cms/customsystem/releases/latest 2>/dev/null | grep -oP '"tag_name"\s*:\s*"\K[^"]+' | head -1)
  printf "  Local:  %s\n  Latest: %s\n" "${LOC_VER:-?}" "${REL_VER:-?}"
  if [[ -n "$LOC_VER" && -n "$REL_VER" && "$LOC_VER" != "$REL_VER" && "v$LOC_VER" != "$REL_VER" ]]; then
    warn "Frontend отстаёт от Cloud — запустите: curl -fsSL https://casinosystem.app/install | sudo bash -s -- --update"
  fi

  echo
  log "Schema diff (cloud vs local, отсутствующие таблицы):"
  CLOUD_TABLES=$(curl -sk --max-time 15 -H "x-sync-secret: ${SYNC_SECRET}" -H "x-casino-id: ${CASINO_ID}" \
    "${CLOUD_URL}/functions/v1/cloud-schema-export" 2>/dev/null \
    | grep -oP 'CREATE TABLE[^(]*public\.\K[a-z_]+' | sort -u)
  LOCAL_TABLES=$("${PG_RUN[@]}" -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1" 2>/dev/null | sort -u)
  if [[ -n "$CLOUD_TABLES" ]]; then
    MISSING=$(comm -23 <(echo "$CLOUD_TABLES") <(echo "$LOCAL_TABLES"))
    if [[ -z "$MISSING" ]]; then
      ok "Все таблицы Cloud присутствуют локально."
    else
      warn "Локально отсутствуют таблицы:"
      echo "$MISSING" | sed 's/^/    • /'
      warn "→ Запустите: curl -fsSL https://casinosystem.app/install | sudo bash -s -- --repair"
    fi
  else
    warn "Не удалось получить схему из Cloud (cloud-schema-export недоступен или не авторизован)."
  fi

  echo
  hr
  printf "  ${BOLD}Итог:${NC}  ${GREEN}OK: %d${NC}   ${YELLOW}DIFF: %d${NC}   ${CYAN}INFO: %d${NC}   ${RED}MISSING: %d${NC}\n" "$PASS" "$DIFF" "$INFO" "$MISS"
  if [[ $DIFF -gt 0 ]]; then
    echo
    if [[ $LOCAL_LESS -gt 0 ]]; then
      warn "Есть строки, которых не хватает локально (DIFF cloud+). Запустите дозалив из Cloud:"
      echo "    sudo casino-update --backfill"
    fi
    if [[ $LOCAL_MORE -gt 0 ]]; then
      warn "Есть local-only строки (DIFF local+). Backfill их не удаляет и не исправит."
      echo "    Если это свежие локальные операции — дождитесь push-sync и повторите verify."
      echo "    Если нужен точный клон Cloud→Local — используйте destructive clone / wipe, не backfill."
    fi
  fi
  hr
  exit 0
fi


title "1/5  Проверка системы"

if ! command -v lsb_release &>/dev/null; then
  apt-get update -qq && apt-get install -y -qq lsb-release
fi
UBUNTU_VER=$(lsb_release -rs)
log "Ubuntu: $UBUNTU_VER"
[[ "${UBUNTU_VER%%.*}" -ge 22 ]] || fail "Нужен Ubuntu 22.04+ (у вас $UBUNTU_VER)"

for pkg in curl jq openssl ca-certificates; do
  command -v "$pkg" &>/dev/null || apt-get install -y -qq "$pkg" 2>&1 | tail -2
done

if ! command -v docker &>/dev/null; then
  log "Устанавливаю Docker..."
  apt-get install -y -qq gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  ok "Docker установлен"
else
  ok "Docker: $(docker --version | awk '{print $3}' | tr -d ',')"
fi

# Проверка интернета — пробуем несколько endpoint'ов (Cloud, GitHub, DNS).
# Многие провайдеры/firewall режут 1.1.1.1, но GitHub/Cloud работают.
if [[ $SKIP_NET_CHECK -eq 1 ]]; then
  warn "Проверка интернета пропущена (--skip-net-check)"
else
  NET_OK=0
  for url in \
    "https://rpehngjvwcnipvkouluu.supabase.co/auth/v1/health" \
    "https://api.github.com" \
    "https://casinosystem.app/install" \
    "https://1.1.1.1" \
    "https://8.8.8.8"; do
    if curl -fsS --max-time 6 -o /dev/null "$url" 2>/dev/null; then
      NET_OK=1
      ok "Интернет доступен (через $(echo "$url" | awk -F/ '{print $3}'))"
      break
    fi
  done
  if [[ $NET_OK -eq 0 ]]; then
    warn "Не удалось достучаться до Cloud/GitHub/DNS за 6с каждый."
    warn "Если сервер всё-таки имеет доступ к https://rpehngjvwcnipvkouluu.supabase.co,"
    warn "запустите с флагом: sudo casino-update --update --skip-net-check"
    fail "Нет интернета. На сервере должен быть доступ к Cloud (хотя бы на момент установки)."
  fi
fi

# ────────── helper ──────────
update_env() {
  local key="$1" val="$2"
  # Always single-quote value so spaces/specials are safe when sourced.
  # Escape any existing single quotes inside the value.
  local q_val
  q_val=$(printf "'%s'" "$(printf '%s' "$val" | sed "s/'/'\\\\''/g")")
  if grep -qE "^${key}=" .env 2>/dev/null; then
    local esc=$(printf '%s\n' "$q_val" | sed -e 's/[\/&|]/\\&/g')
    sed -i "s|^${key}=.*|${key}=${esc}|" .env
  else
    echo "${key}=${q_val}" >> .env
  fi
}

normalize_env_file() {
  [[ -f .env ]] || return 0
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
  done < .env
  mv "$tmp" .env
}
gen_secret() { openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-64; }

write_root_compose_env() {
  {
    echo "# Auto-generated by Casino System installer."
    echo "# Lets \`docker compose ...\` work from /opt/casino-system."
    echo "COMPOSE_FILE=deploy/docker-compose.yml"
    echo "COMPOSE_PROJECT_NAME=deploy"
    grep -vE '^COMPOSE_(FILE|PROJECT_NAME|ENV_FILES)=' .env 2>/dev/null || true
  } > "${CMS_ROOT}/.env"
}

fix_local_file_permissions() {
  if getent group docker >/dev/null 2>&1; then
    chgrp docker .env "${CMS_ROOT}/.env" 2>/dev/null || true
    chmod 0640 .env "${CMS_ROOT}/.env" 2>/dev/null || true
  else
    chmod 0644 .env "${CMS_ROOT}/.env" 2>/dev/null || true
  fi
}

open_firewall_ports() {
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi '^Status: active'; then
    ufw allow 80/tcp >/dev/null 2>&1 || true
    ufw allow 443/tcp >/dev/null 2>&1 || true
    ufw allow 51820/udp >/dev/null 2>&1 || true
    ok "Firewall: открыты 80/tcp, 443/tcp, 51820/udp"
  fi
}

assert_local_frontend_env() {
  : "${ANON_KEY:?ANON_KEY missing}"
  # Universal bundle: docker-compose bakes a placeholder rewritten at runtime to
  # `location.origin + "/api"`. We just verify the placeholder is present so a
  # bad edit can't silently bake a Cloud URL.
  if ! docker compose config 2>/dev/null | grep -q "VITE_SUPABASE_URL: __CMS_ORIGIN_PLACEHOLDER__/api"; then
    fail "docker-compose is not baking the universal __CMS_ORIGIN_PLACEHOLDER__ URL."
  fi
  ok "Frontend build target: universal (location.origin/api)"
}

compose_project_name() {
  docker compose config --format json 2>/dev/null | jq -r '.name // empty' 2>/dev/null || true
}

reset_postgres_volume() {
  log "Останавливаю stack и удаляю docker volumes Postgres..."
  docker compose stop postgres postgrest gotrue realtime storage cms-frontend nginx cms-sync cms-monitor cms-updater cms-backup &>/dev/null || true
  docker rm -f cms-postgres &>/dev/null || true
  docker compose down -v --remove-orphans &>/dev/null || true
  local project_name volume_name
  project_name="$(compose_project_name)"
  [[ -n "$project_name" ]] || project_name="$(basename "$SCRIPT_DIR")"
  volume_name="${project_name}_postgres_data"
  docker volume rm "$volume_name" &>/dev/null || true
  docker volume rm "deploy_postgres_data" "casino-system_postgres_data" "casino-system-deploy_postgres_data" "cms-postgres-data" &>/dev/null || true
  while IFS= read -r v; do
    [[ -n "$v" ]] || continue
    if docker volume inspect "$v" --format '{{ index .Labels "com.docker.compose.project" }} {{ index .Labels "com.docker.compose.volume" }}' 2>/dev/null | grep -q "^${project_name} postgres_data$"; then
      docker volume rm "$v" &>/dev/null || true
    fi
  done < <(docker volume ls --format '{{.Name}}' | grep -E '(^|_)postgres[_-]data$' || true)
  while IFS= read -r v; do
    [[ -n "$v" ]] || continue
    docker volume rm "$v" &>/dev/null || true
  done < <(docker volume ls --format '{{.Name}}' | grep -E '(^|_)postgres-data$' || true)
  ok "Postgres volume очищен"
  return 0
}

wait_for_postgres() {
  local label="${1:-Postgres}"
  for i in $(seq 1 60); do
    if docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
        psql -h 127.0.0.1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -tAc "SELECT 1" &>/dev/null; then
      ok "${label} готов и принимает пароль из .env"
      return 0
    fi
    sleep 2
  done
  docker compose ps postgres >&2 || true
  docker compose logs --tail=80 postgres >&2 || true
  fail "${label} не принимает пароль из .env после ожидания"
}

wait_for_postgres_ready() {
  local label="${1:-Postgres}"
  for i in $(seq 1 60); do
    docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-postgres}" &>/dev/null && { ok "${label} готов"; return 0; }
    sleep 2
  done
  docker compose ps postgres >&2 || true
  docker compose logs --tail=80 postgres >&2 || true
  fail "${label} не стартовал"
}

apply_local_schema_repair() {
  local repair_file="${SCRIPT_DIR}/postgres/repair-local-schema.sql"
  [[ -f "$repair_file" ]] || repair_file="${SCRIPT_DIR}/repair-local-schema.sql"
  [[ -f "$repair_file" ]] || { warn "repair-local-schema.sql не найден — пропускаю repair"; return 0; }
  log "Проверяю локальную схему (profiles/user_casino_access/effective_module_perms)..."
  docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
    psql -h 127.0.0.1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" \
    -v ON_ERROR_STOP=1 < "$repair_file" >/dev/null \
    && ok "Локальная схема проверена/исправлена" \
    || warn "Schema repair не применился; проверьте docker compose logs postgres"
}

postgres_network_name() {
  local cid net
  cid="$(docker compose ps -q postgres 2>/dev/null || true)"
  [[ -n "$cid" ]] || return 1
  net="$(docker inspect "$cid" --format '{{range $name, $conf := .NetworkSettings.Networks}}{{println $name}}{{end}}' 2>/dev/null | head -1)"
  [[ -n "$net" ]] || return 1
  printf '%s' "$net"
}

# ────────── 2. Конфигурация ──────────
SEED_DONE_FILE="${SCRIPT_DIR}/.install-done"

if [[ $WIPE -eq 1 ]]; then
  warn "WIPE: удаляю все контейнеры, volumes, образы frontend, .env и сертификаты..."
  docker compose down -v --remove-orphans &>/dev/null || true
  docker volume ls --format '{{.Name}}' | grep -E '(postgres|storage|cms-)' | xargs -r docker volume rm &>/dev/null || true
  # Удаляем образ frontend, чтобы гарантированно пересобрать с новым кодом
  docker image rm -f "cms-frontend:${FRONTEND_VERSION:-local}" cms-frontend:local &>/dev/null || true
  docker builder prune -af &>/dev/null || true
  rm -f .env "$SEED_DONE_FILE" "${SCRIPT_DIR}/.super-admin-done" "${SCRIPT_DIR}/.pairing-done"
  rm -rf certs postgres/seed-data data runtime-config.json
  ok "WIPE завершён — продолжаю чистую установку"
fi

if [[ $RESET -eq 1 ]]; then
  rm -f "$SEED_DONE_FILE" .env
fi
[[ -f .env ]] || cp env.template .env
normalize_env_file
set -a; source .env; set +a

# ── Версия фронтенда: всегда берём из package.json (а не "local") ──
PKG_VERSION="$(grep -oP '"version"\s*:\s*"\K[^"]+' "${CMS_ROOT}/package.json" 2>/dev/null | head -n1 || true)"
if [[ -n "$PKG_VERSION" ]]; then
  update_env FRONTEND_VERSION "$PKG_VERSION"
  set -a; source .env; set +a
  ok "FRONTEND_VERSION=${PKG_VERSION} (из package.json)"
fi

# ── Параметры локации (auto; меняются позже в Admin → Peers → Server Identity) ──
title "2/4  Параметры локации (auto)"
# Placeholder casino UUID — matches deploy/postgres/init/20-seed-defaults.sql.
# Name/slug/IP редактируется в UI, но CASINO_ID остаётся постоянным.
: "${CASINO_ID:=00000000-0000-0000-0000-0000000000ca}"
: "${CASINO_NAME:=Local Casino}"
: "${CASINO_SLUG:=local}"
if [[ -n "$PRESET_CASINO_SLUG" ]]; then
  CASINO_SLUG="$PRESET_CASINO_SLUG"
  case "$PRESET_CASINO_SLUG" in
    arusha) CASINO_NAME="Arusha Cloud" ;;
    premier) CASINO_NAME="Premier Cloud" ;;
    *) CASINO_NAME="${CASINO_NAME:-$PRESET_CASINO_SLUG}" ;;
  esac
fi
: "${LOCAL_IP:=$(hostname -I 2>/dev/null | awk '{print $1}')}"
: "${LOCAL_IP:=127.0.0.1}"
: "${LOCAL_DOMAIN:=casino.local}"
update_env CASINO_ID     "$CASINO_ID"
update_env CASINO_NAME   "$CASINO_NAME"
update_env CASINO_SLUG   "$CASINO_SLUG"
[[ -n "$PRESET_NODE_ID" ]] && update_env NODE_ID "$PRESET_NODE_ID"
update_env LOCAL_IP      "$LOCAL_IP"
update_env LOCAL_DOMAIN  "$LOCAL_DOMAIN"
ok "Casino: ${CASINO_NAME} (${CASINO_SLUG}) @ ${LOCAL_IP} / ${LOCAL_DOMAIN}"
[[ -n "$LEGACY_ROLE" || "$LEGACY_SEED" -eq 1 ]] && warn "Флаги --role/--seed приняты для совместимости; режим сервера задаётся через Cloud pairing."
ok "Поменять можно после установки в Admin → Peers → Server Identity"

normalize_env_file
set -a; source .env; set +a

# Сопряжение с Cloud — теперь делается из админки кнопкой Connect to Cloud.
# install.sh ничего не запрашивает.

# ────────── 4. Секреты + сертификаты ──────────
title "3/4  Секреты и сертификаты"

[[ -z "${POSTGRES_PASSWORD:-}" ]] && { update_env POSTGRES_PASSWORD "$(gen_secret)"; ok "POSTGRES_PASSWORD"; }
[[ -z "${JWT_SECRET:-}" ]]        && { update_env JWT_SECRET        "$(gen_secret)"; ok "JWT_SECRET"; }
normalize_env_file
set -a; source .env; set +a

gen_jwt() {
  local role="$1" secret="$2"
  local header='{"alg":"HS256","typ":"JWT"}'
  local aud="$role"
  [[ "$role" == "service_role" ]] && aud="authenticated"
  local payload="{\"iss\":\"casino-local\",\"aud\":\"${aud}\",\"role\":\"${role}\",\"iat\":$(date +%s),\"exp\":$(date -d '+10 years' +%s)}"
  local h=$(printf '%s' "$header"  | openssl base64 -A | tr -d '=' | tr '/+' '_-')
  local p=$(printf '%s' "$payload" | openssl base64 -A | tr -d '=' | tr '/+' '_-')
  local sig=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$secret" -binary | openssl base64 -A | tr -d '=' | tr '/+' '_-')
  echo "${h}.${p}.${sig}"
}
[[ -z "${ANON_KEY:-}" ]]         && { update_env ANON_KEY         "$(gen_jwt anon "$JWT_SECRET")";          ok "ANON_KEY"; }
[[ -z "${SERVICE_ROLE_KEY:-}" ]] && { update_env SERVICE_ROLE_KEY "$(gen_jwt service_role "$JWT_SECRET")"; ok "SERVICE_ROLE_KEY"; }
set -a; source .env; set +a
write_root_compose_env
fix_local_file_permissions
assert_local_frontend_env

# Repair existing local auth users created by older installers. Those GoTrue
# versions could mint access tokens with an empty DB role, causing PostgREST to
# reject profile/role queries with `role "" does not exist` after login.
ensure_auth_defaults_sql="
  UPDATE auth.users
     SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                           || jsonb_build_object('provider','email','providers',ARRAY['email'],'role','authenticated'),
         aud = 'authenticated',
         role = 'authenticated'
   WHERE COALESCE(role, '') = ''
      OR COALESCE(aud, '') = ''
      OR COALESCE(raw_app_meta_data->>'role', '') = '';
"

mkdir -p certs
if [[ ! -f certs/ca.crt ]]; then
  openssl genrsa -out certs/ca.key 4096 2>/dev/null
  openssl req -x509 -new -nodes -key certs/ca.key -sha256 -days 3650 \
    -out certs/ca.crt -subj "/C=TZ/O=${CASINO_NAME}/CN=Casino System Local CA" 2>/dev/null
  ok "CA создан"
fi
if [[ ! -f certs/server.crt ]] \
  || ! openssl x509 -in certs/server.crt -noout -text 2>/dev/null | grep -q "DNS:${LOCAL_DOMAIN}" \
  || ! openssl x509 -in certs/server.crt -noout -text 2>/dev/null | grep -q "IP Address:${LOCAL_IP}"; then
  openssl genrsa -out certs/server.key 2048 2>/dev/null
  cat > certs/server.cnf <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no
[req_distinguished_name]
C = TZ
O = ${CASINO_NAME}
CN = ${LOCAL_DOMAIN}
[v3_req]
keyUsage = keyEncipherment, dataEncipherment, digitalSignature
extendedKeyUsage = serverAuth
subjectAltName = @alt_names
[alt_names]
DNS.1 = ${LOCAL_DOMAIN}
DNS.2 = *.${LOCAL_DOMAIN}
DNS.3 = localhost
IP.1  = 127.0.0.1
IP.2  = ${LOCAL_IP}
EOF
  openssl req -new -key certs/server.key -out certs/server.csr -config certs/server.cnf 2>/dev/null
  openssl x509 -req -in certs/server.csr -CA certs/ca.crt -CAkey certs/ca.key -CAcreateserial \
    -out certs/server.crt -days 3650 -sha256 -extensions v3_req -extfile certs/server.cnf 2>/dev/null
  rm -f certs/server.csr certs/server.cnf certs/ca.srl
  chmod 600 certs/*.key
  ok "Server cert для ${LOCAL_DOMAIN}"
fi

grep -qE "^[^#]*\s${LOCAL_DOMAIN}(\s|$)" /etc/hosts \
  || echo "127.0.0.1  ${LOCAL_DOMAIN}" >> /etc/hosts
open_firewall_ports

# ────────── 4.5. Миграции + seed ──────────
mkdir -p postgres/migrations postgres/init
if [[ -d ../supabase/migrations ]]; then
  cp ../supabase/migrations/*.sql postgres/migrations/ 2>/dev/null || true
  cp ../supabase/migrations/*.sql postgres/init/      2>/dev/null || true
  ok "Скопировано $(ls postgres/migrations/*.sql 2>/dev/null | wc -l) миграций"
fi
if [[ -f postgres/init/20-seed-defaults.sql ]]; then
  mv -f postgres/init/20-seed-defaults.sql postgres/init/99-seed-defaults.sql
fi
if [[ -f postgres/repair-local-schema.sql ]]; then
  cp postgres/repair-local-schema.sql postgres/init/98-repair-local-schema.sql 2>/dev/null || true
fi

# ────────── 4.6. Чистая установка БД + baked snapshot seed (Variant B) ──────────
# v1.3.47+: install.sh tries to seed a fresh DB from a baked snapshot stored
# in Lovable Cloud Storage (bucket: installer-snapshots). This is one-shot,
# guarded by $SEED_DONE_FILE — re-runs never re-seed.
log "Запускаю postgres (чистая БД, миграции применятся автоматически)..."
docker compose up -d postgres
wait_for_postgres_ready "Postgres"
docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
  psql -h 127.0.0.1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" \
  -v ON_ERROR_STOP=1 -c "$ensure_auth_defaults_sql" &>/dev/null || true
apply_local_schema_repair

# Baked snapshot seed — pulls latest <slug>/latest.ndjson.gz via cloud-snapshot-build
# edge function (uses SERVICE_ROLE on Cloud side; we only forward ANON_KEY here
# because the snapshot itself is delivered as a signed URL by the function).
if [[ ! -f "$SEED_DONE_FILE" && "${SKIP_SEED:-0}" != "1" ]]; then
  log "Пытаюсь загрузить baked snapshot для '${CASINO_SLUG}' из Cloud..."
  SEED_TMP="/tmp/seed-${CASINO_SLUG}-$$.ndjson.gz"
  SEED_URL="${CLOUD_URL}/storage/v1/object/sign/installer-snapshots/${CASINO_SLUG}/latest.ndjson.gz"
  # Try public-style fetch first (works if bucket has public read policy added later)
  if curl -fsSL --max-time 120 -o "$SEED_TMP" \
       "${CLOUD_URL}/storage/v1/object/public/installer-snapshots/${CASINO_SLUG}/latest.ndjson.gz" 2>/dev/null \
     && [[ -s "$SEED_TMP" ]]; then
    log "Snapshot скачан ($(du -h "$SEED_TMP" | awk '{print $1}'))."
    if command -v gzip >/dev/null && command -v node >/dev/null && [[ -x "${SCRIPT_DIR}/sync/seed-import.js" ]]; then
      gzip -dc "$SEED_TMP" | LOCAL_DB_URL="postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB:-postgres}" \
        node "${SCRIPT_DIR}/sync/seed-import.js" - \
        && ok "Snapshot применён в локальную БД." \
        || warn "Snapshot import упал; продолжаю без seed (БД пустая)."
    else
      warn "seed-import.js не найден или node не установлен; пропускаю applying."
    fi
    rm -f "$SEED_TMP"
  else
    warn "Baked snapshot недоступен (нет публичного URL или не сгенерирован)."
    warn "БД останется пустой — данные подтянутся через cms-sync после pairing."
  fi
fi
touch "$SEED_DONE_FILE"
ok "БД готова."

# ────────── 5. Сборка frontend + старт ──────────
title "4/4  Сборка frontend и запуск стека"

if [[ $UPDATE -eq 1 ]]; then
  log "UPDATE: пересобираю ВСЕ локальные образы (frontend, sync, monitor, updater, backup)..."
  # Удаляем старые образы локальной сборки, чтобы гарантированно подтянуть новый код
  docker image rm -f \
    "cms-frontend:${FRONTEND_VERSION:-local}" cms-frontend:local \
    cms-sync:local cms-monitor:local cms-updater:local cms-backup:local &>/dev/null || true
  log "Подтягиваю свежие образы внешних сервисов (postgres, gotrue, postgrest, realtime, storage, nginx)..."
  docker compose pull --ignore-pull-failures 2>&1 | grep -vE '^$' || true
  log "Собираю все локальные сервисы (--no-cache, 5-10 минут)..."
  docker compose build --no-cache --pull
  ok "Все образы пересобраны"
  log "Перезапускаю весь стек с новыми образами..."
  docker compose up -d --force-recreate --remove-orphans
elif [[ $REBUILD -eq 1 ]]; then
  log "Удаляю старый образ frontend для чистой пересборки..."
  docker image rm -f "cms-frontend:${FRONTEND_VERSION:-local}" cms-frontend:local &>/dev/null || true
  log "Собираю cms-frontend (3-7 минут)..."
  docker compose build --no-cache cms-frontend
  ok "Frontend собран"
  log "Запуск всех контейнеров..."
  docker compose up -d
elif ! docker image inspect "cms-frontend:${FRONTEND_VERSION:-local}" &>/dev/null; then
  log "Собираю cms-frontend (3-7 минут)..."
  docker compose build cms-frontend
  ok "Frontend собран"
  log "Запуск всех контейнеров..."
  docker compose up -d
else
  ok "Frontend образ уже есть (используем кэш). --rebuild чтобы пересобрать."
  log "Запуск всех контейнеров..."
  docker compose up -d
fi

log "Жду готовности frontend (до 30 сек)..."
for i in $(seq 1 15); do
  docker compose exec -T cms-frontend curl -fsS http://localhost/ -o /dev/null 2>/dev/null && { ok "Frontend запущен"; break; }
  sleep 2
done

# ── Авто-подъём Cloudflare Tunnel если TUNNEL_TOKEN задан ──
# Сервис в profiles=["with-tunnel"] не стартует при обычном `compose up -d`,
# поэтому поднимаем его явно. При пустом токене — пропускаем.
TUNNEL_TOKEN_VAL=""
if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  TUNNEL_TOKEN_VAL=$(grep -E '^TUNNEL_TOKEN=' "${SCRIPT_DIR}/.env" 2>/dev/null | head -n1 | cut -d= -f2- | sed -e "s/^['\"]//" -e "s/['\"]$//" || true)
fi
if [[ -n "${TUNNEL_TOKEN_VAL//[[:space:]]/}" ]]; then
  log "TUNNEL_TOKEN задан — поднимаю cms-cloudflared..."
  docker compose --profile with-tunnel up -d cloudflared || warn "cloudflared не стартовал — проверь токен"
fi

# ────────── 5.5. Super admin (idempotent) ──────────
# Always ensure superadmin@cms.local exists with super_admin role + correct password.
title "Ensure Super Admin (superadmin@cms.local / superadmin)"

SA_EMAIL="${SUPER_ADMIN_EMAIL:-superadmin@cms.local}"
SA_PASS="${SUPER_ADMIN_PASSWORD:-superadmin}"

log "Жду готовности GoTrue..."
for i in $(seq 1 30); do
  docker compose exec -T gotrue wget -q -O- http://localhost:9999/health 2>/dev/null | grep -q '"name"' && break
  sleep 2
done

# Check if user already exists in DB
SA_USER_ID=$(docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
  psql -h 127.0.0.1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -tAc \
  "SELECT id FROM auth.users WHERE email='${SA_EMAIL}' LIMIT 1" 2>/dev/null | tr -d ' \n' || true)

if [[ -z "$SA_USER_ID" ]]; then
  log "Создаю пользователя через GoTrue admin API: ${SA_EMAIL}"
  SA_RESP=$(docker compose exec -T gotrue wget -q -O- \
    --header="Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    --header="Content-Type: application/json" \
    --post-data="$(jq -n --arg e "$SA_EMAIL" --arg p "$SA_PASS" '{email:$e,password:$p,email_confirm:true}')" \
    http://localhost:9999/admin/users 2>&1 || true)
  SA_USER_ID=$(printf '%s' "$SA_RESP" | jq -er '.id // empty' 2>/dev/null || true)
  if [[ -z "$SA_USER_ID" ]]; then
    SA_USER_ID=$(docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
      psql -h 127.0.0.1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -tAc \
      "SELECT id FROM auth.users WHERE email='${SA_EMAIL}' LIMIT 1" 2>/dev/null | tr -d ' \n' || true)
  fi
else
  log "Пользователь ${SA_EMAIL} уже существует — обновляю пароль через GoTrue"
  docker compose exec -T gotrue wget -q -O- \
    --method=PUT \
    --header="Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    --header="Content-Type: application/json" \
    --body-data="$(jq -n --arg p "$SA_PASS" '{password:$p}')" \
    "http://localhost:9999/admin/users/${SA_USER_ID}" &>/dev/null || true
fi

if [[ -z "$SA_USER_ID" ]]; then
  warn "Не удалось создать/найти super_admin (${SA_EMAIL})."
  docker compose logs --tail=40 gotrue >&2 || true
else
  # Ensure (1) super_admin role, (2) profile row linked to placeholder casino,
  # (3) the casinos row's name/slug match this server's .env so the frontend's
  #     slug-based casino resolver (runtime-config.json → accessibleCasinos)
  #     actually matches. Without (3) the admin logs in but sees an empty UI
  #     because slug "arusha" never matches the seed row's slug "local".
  docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
    psql -h 127.0.0.1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -v ON_ERROR_STOP=1 -c "
      ${ensure_auth_defaults_sql}

      INSERT INTO public.user_roles (user_id, role)
      VALUES ('${SA_USER_ID}', 'super_admin')
      ON CONFLICT (user_id, role) DO NOTHING;

      INSERT INTO public.profiles (user_id, casino_id, display_name)
      VALUES ('${SA_USER_ID}', '${CASINO_ID}'::uuid, 'Super Admin')
      ON CONFLICT (user_id) DO UPDATE
        SET casino_id    = COALESCE(public.profiles.casino_id, EXCLUDED.casino_id),
            display_name = COALESCE(NULLIF(public.profiles.display_name,''), EXCLUDED.display_name);

      UPDATE public.casinos
         SET name = '${CASINO_NAME//\'/\'\'}',
             slug = '${CASINO_SLUG//\'/\'\'}'
       WHERE id   = '${CASINO_ID}'::uuid;
    " &>/dev/null || warn "Не удалось привязать профиль super_admin (${SA_EMAIL})."
  ok "Super admin готов: ${SA_EMAIL} / ${SA_PASS}"
fi
# ── cms-status CLI (Ubuntu diagnostics, works even if frontend is down) ──
CLI_SRC="${SCRIPT_DIR}/cli"
CLI_DST="/opt/casino-system/cli"
if [[ -d "$CLI_SRC" ]]; then
  mkdir -p "$CLI_DST"
  cp -f "${CLI_SRC}/cms-status.mjs" "${CLI_DST}/cms-status.mjs"
  cp -f "${CLI_SRC}/package.json"    "${CLI_DST}/package.json"
  chmod +x "${CLI_DST}/cms-status.mjs"
  # Install pg via npm into /opt (idempotent, offline-tolerant)
  if command -v npm >/dev/null 2>&1; then
    (cd "$CLI_DST" && npm install --omit=dev --no-audit --no-fund --silent 2>/dev/null) || \
      warn "cms-status: npm install pg failed (offline?). CLI will work once 'npm i pg' runs in ${CLI_DST}."
  else
    warn "npm не найден — cms-status CLI установлен без зависимостей. Установите Node.js + npm и выполните 'cd ${CLI_DST} && npm i'."
  fi
  # Symlink to /usr/local/bin
  ln -sf "${CLI_DST}/cms-status.mjs" /usr/local/bin/cms-status
  ok "cms-status CLI установлен — запускайте 'sudo cms-status' для диагностики"
fi

# ── systemd timer for `cms-status pull-cmd` (Cloud→Local remote-control) ──
# Polls peer-mesh /node/commands/pop every 60s, runs whitelisted actions
# (restart_sync, repair_pairing, retry_errors). No SSH required.
PULLCMD_SERVICE=/etc/systemd/system/cms-pull-cmd.service
PULLCMD_TIMER=/etc/systemd/system/cms-pull-cmd.timer
cat > "$PULLCMD_SERVICE" <<EOF
[Unit]
Description=Casino System — pull remote commands from Cloud
After=network-online.target docker.service
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/bin/cms-status pull-cmd
EOF
cat > "$PULLCMD_TIMER" <<EOF
[Unit]
Description=Casino System — poll Cloud commands every 60s
[Timer]
OnBootSec=90
OnUnitActiveSec=60
Unit=cms-pull-cmd.service
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload 2>/dev/null || true
systemctl enable --now cms-pull-cmd.timer 2>/dev/null \
  && ok "cms-pull-cmd.timer enabled — Cloud commands pulled every 60s" \
  || warn "cms-pull-cmd.timer could not be enabled (systemd unavailable?)"

SYSTEMD_UNIT=/etc/systemd/system/casino-system.service
if [[ ! -f "$SYSTEMD_UNIT" ]]; then
  cat > "$SYSTEMD_UNIT" <<EOF
[Unit]
Description=Casino System (${CASINO_NAME})
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target
[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${SCRIPT_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=600
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable casino-system.service
  ok "systemd unit установлен"
fi

# ── License agent (systemd timer) ──
if [[ -f "${SCRIPT_DIR}/license-agent.sh" ]]; then
  install -m 0755 "${SCRIPT_DIR}/license-agent.sh" /usr/local/sbin/casino-license-agent
  if [[ -d "${SCRIPT_DIR}/systemd" ]]; then
    install -m 0644 "${SCRIPT_DIR}/systemd/casino-license-agent.service" /etc/systemd/system/
    install -m 0644 "${SCRIPT_DIR}/systemd/casino-license-agent.timer"   /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable --now casino-license-agent.timer >/dev/null 2>&1 || warn "не удалось активировать casino-license-agent.timer"
    ok "License agent зарегистрирован (запуск раз в час)"
  fi
fi

# ── финал ──
echo; hr
echo -e "${GREEN}${BOLD}  ✓ Установка завершена!${NC}"
hr; echo
echo -e "  📍 ${BOLD}${CASINO_NAME}${NC} (slug: ${CASINO_SLUG})"
echo -e "  🌐 URL:        ${BOLD}https://${LOCAL_DOMAIN}${NC}"
echo -e "  🖥️  IP:         ${LOCAL_IP}"
echo -e "  🔑 CA:         ${SCRIPT_DIR}/certs/ca.crt"
echo
echo -e "  👤 Login:      ${BOLD}superadmin${NC}  /  ${BOLD}superadmin${NC}   (полный email: superadmin@cms.local)"
echo
echo -e "  Следующие шаги (опционально — узел работает автономно):"
echo -e "    1. Откройте ${BOLD}https://${LOCAL_DOMAIN}${NC} (или http://${LOCAL_IP}) и войдите"
echo -e "    2. Если есть другой узел (Cloud или соседний local), перейдите в"
echo -e "       ${BOLD}Admin → Peers → Add Peer${NC} → введите URL соседа и придумайте"
echo -e "       общий ${BOLD}sync secret${NC} → нажмите Add"
echo -e "    3. На соседнем узле в ${BOLD}Admin → Peers${NC} нажмите ${BOLD}Approve${NC} рядом"
echo -e "       с входящим запросом. Сразу начнётся двунаправленная синхронизация"
echo -e "    4. HA (виртуальный IP через keepalived) — см. ${BOLD}deploy/HA-SETUP.md${NC}"
echo
echo -e "  ℹ️  Опционально: скопируйте ${BOLD}certs/ca.crt${NC} как Trusted Root для HTTPS без warning"
echo
echo -e "  📊 Статус:     ${CYAN}docker compose ps${NC}"
echo -e "  📜 Логи:       ${CYAN}docker compose logs -f${NC}"
echo -e "  🩺 Диагностика: ${CYAN}sudo cms-status${NC}   (mirror | logs | errors | probe <peer>)"
echo -e "  🔄 Меню:        ${CYAN}sudo casino-update${NC}   (или sudo ./deploy/install.sh)"
echo -e "  ⬆️  Обновить:    ${CYAN}sudo casino-update --update${NC}"
echo -e "  💣 Стереть всё: ${CYAN}sudo casino-update --wipe${NC}"
echo

# ── Авто-цепочка после --update: применить hotfix БД и сверить parity ──
# Чтобы пользователь одним `--update` получал свежий код + актуальную схему
# + отчёт о расхождениях с Cloud.
if [[ $UPDATE -eq 1 ]]; then
  title "Авто-цепочка: --repair → --verify-parity"
  if ! "${SCRIPT_DIR}/install.sh" --repair; then
    warn "repair завершился с ошибкой — посмотрите вывод выше"
  fi
  if ! "${SCRIPT_DIR}/install.sh" --verify-parity; then
    warn "verify-parity показал расхождения — посмотрите таблицу выше"
  fi
fi
