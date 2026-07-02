#!/usr/bin/env bash
#
# Casino System — First Boot Bootstrap
# --------------------------------------------------------
# Запускается один раз при первой загрузке бокса (через casino-firstboot.service).
# Задачи:
#   1. Генерирует node_id и storage-пароли если их нет
#   2. Стартует docker compose (Postgres + PostgREST + Realtime + Frontend)
#   3. Поднимает setup-hotspot (Wi-Fi AP "Casino-Setup-XXXX") + captive portal
#   4. Печатает на HDMI/tty инструкции для оператора
#   5. Ждёт, пока оператор пройдёт /setup через хотспот или прямой LAN
#   6. По завершении маркирует /var/lib/casino-system/firstboot.done и гасит хотспот
#
set -euo pipefail

CMS_ROOT="${CMS_ROOT:-/opt/casino-system}"
STATE_DIR="/var/lib/casino-system"
DONE_FLAG="$STATE_DIR/firstboot.done"
ENV_FILE="$CMS_ROOT/deploy/.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[firstboot]${NC} $*" | tee -a "$STATE_DIR/firstboot.log"; }
ok()   { echo -e "${GREEN}[ ok      ]${NC} $*" | tee -a "$STATE_DIR/firstboot.log"; }
warn() { echo -e "${YELLOW}[warn     ]${NC} $*" | tee -a "$STATE_DIR/firstboot.log"; }
fail() { echo -e "${RED}[fail     ]${NC} $*" | tee -a "$STATE_DIR/firstboot.log" >&2; exit 1; }

mkdir -p "$STATE_DIR"

if [[ -f "$DONE_FLAG" ]]; then
  ok "First boot уже завершён — выхожу"
  exit 0
fi

log "=== Casino System — первая загрузка ==="

# ── 1. Node identity ─────────────────────────────────────────────
if [[ ! -f "$STATE_DIR/node_id" ]]; then
  NODE_ID="node_$(openssl rand -hex 8)"
  echo "$NODE_ID" > "$STATE_DIR/node_id"
  ok "Сгенерирован node_id: $NODE_ID"
else
  NODE_ID="$(cat "$STATE_DIR/node_id")"
fi

# ── 2. .env — генерируем пароли если пусто ───────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  log "Создаю $ENV_FILE со случайными паролями"
  install -m 0640 /dev/null "$ENV_FILE"
  {
    echo "# Auto-generated on first boot $(date -Iseconds)"
    echo "NODE_ID=$NODE_ID"
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
    echo "JWT_SECRET=$(openssl rand -hex 32)"
    echo "ANON_KEY=$(openssl rand -hex 32)"
    echo "SERVICE_ROLE_KEY=$(openssl rand -hex 32)"
    echo "FIRSTRUN_TOKEN=$(openssl rand -hex 16)"
  } >> "$ENV_FILE"
  ok ".env создан (пароли уникальны для этого бокса)"
fi

FIRSTRUN_TOKEN="$(grep '^FIRSTRUN_TOKEN=' "$ENV_FILE" | cut -d= -f2)"

# ── 3. Стартуем стек ─────────────────────────────────────────────
log "Запускаю docker compose…"
( cd "$CMS_ROOT/deploy" && docker compose up -d ) || fail "docker compose не поднялся"
ok "Стек запущен"

# ── 4. Поднимаем setup-hotspot (если есть Wi-Fi) ─────────────────
WIFI_IFACE="$(iw dev 2>/dev/null | awk '/Interface/{print $2; exit}')"
if [[ -n "$WIFI_IFACE" ]]; then
  log "Найден Wi-Fi $WIFI_IFACE — поднимаю точку доступа Casino-Setup-${NODE_ID:5:4}"
  if [[ -x "$CMS_ROOT/deploy/setup-hotspot.sh" ]]; then
    "$CMS_ROOT/deploy/setup-hotspot.sh" start "$WIFI_IFACE" "Casino-Setup-${NODE_ID:5:4}" || warn "Не удалось поднять хотспот"
  else
    warn "setup-hotspot.sh не найден — пропускаю Wi-Fi setup"
  fi
else
  warn "Wi-Fi адаптер не найден — оператору нужно подключиться по LAN"
fi

# ── 5. Инструкция на HDMI/tty ────────────────────────────────────
LAN_IP="$(hostname -I | awk '{print $1}')"
cat <<BANNER | tee /dev/tty1 || true

╔════════════════════════════════════════════════════════════════╗
║  CASINO SYSTEM — первая настройка                              ║
╠════════════════════════════════════════════════════════════════╣
║  Node ID:  ${NODE_ID}
║  LAN IP:   http://${LAN_IP}/setup
║  Wi-Fi:    Casino-Setup-${NODE_ID:5:4}  →  http://192.168.44.1/setup
║  Token:    ${FIRSTRUN_TOKEN}
╚════════════════════════════════════════════════════════════════╝

Оператор: подключитесь к Wi-Fi или откройте страницу по LAN,
введите токен выше и заполните мастер. Бокс перезапустится сам.

BANNER

ok "Мастер доступен. Жду завершения…"

# ── 6. Ожидаем, пока wizard пометит завершение ───────────────────
# FirstRunWizard в UI пишет box_config.setup_completed_at=NOW() → DB trigger
# создаёт /var/lib/casino-system/firstboot.done через outbox.
# Простое ожидание файла:
for _ in $(seq 1 720); do  # 720 * 10s = 2 hours
  [[ -f "$DONE_FLAG" ]] && break
  sleep 10
done

if [[ -f "$DONE_FLAG" ]]; then
  ok "Мастер завершён"
  if [[ -n "$WIFI_IFACE" && -x "$CMS_ROOT/deploy/setup-hotspot.sh" ]]; then
    "$CMS_ROOT/deploy/setup-hotspot.sh" stop "$WIFI_IFACE" || true
    ok "Хотспот выключен"
  fi
else
  warn "Мастер не завершён за 2 часа — сервис завершится, при следующей загрузке повторит"
fi
