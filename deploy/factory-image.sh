#!/usr/bin/env bash
#
# Casino System — Factory Image Builder
# --------------------------------------------------------
# Собирает "золотой" образ для mini-PC (N150 / 32GB / 512 SSD):
#   * ставит Docker, Tailscale, Avahi, hostapd/dnsmasq (для setup-hotspot)
#   * скачивает и распаковывает CMS в /opt/casino-system
#   * подтягивает Docker-образы Supabase (offline-ready)
#   * ставит firstboot.service (запуск мастера при первой загрузке)
#   * НЕ конфигурирует казино — это делает FirstRunWizard
#
# Использование (на build-хосте с sudo и интернетом):
#   sudo ./deploy/factory-image.sh                     # обычная сборка
#   sudo ./deploy/factory-image.sh --tag 1.4.0         # с явной версией
#   sudo ./deploy/factory-image.sh --offline-tarball   # + .tar.gz архив для оффлайн-установки
#
set -euo pipefail

FACTORY_VERSION="1.0.0"
CMS_ROOT_DEFAULT="/opt/casino-system"
CMS_ROOT="${CMS_ROOT:-$CMS_ROOT_DEFAULT}"
BUILD_TAG=""
MAKE_TARBALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) BUILD_TAG="$2"; shift 2 ;;
    --offline-tarball) MAKE_TARBALL=1; shift ;;
    --root) CMS_ROOT="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[factory]${NC} $*"; }
ok()   { echo -e "${GREEN}[ ok  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
fail() { echo -e "${RED}[fail]${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Запустите под root: sudo $0"

log "Casino Factory Image Builder v${FACTORY_VERSION}"

# ── 1. APT dependencies ──────────────────────────────────────────
log "Устанавливаю системные пакеты…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl gnupg lsb-release git jq rsync openssl \
  avahi-daemon avahi-utils \
  hostapd dnsmasq iptables \
  network-manager \
  cron logrotate ufw \
  chrony
ok "apt пакеты установлены"

# ── 2. Docker ────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "Ставлю Docker Engine…"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  ok "Docker готов"
else
  ok "Docker уже установлен"
fi

# ── 3. Tailscale ─────────────────────────────────────────────────
if ! command -v tailscale >/dev/null 2>&1; then
  log "Ставлю Tailscale…"
  curl -fsSL https://tailscale.com/install.sh | sh
  systemctl enable tailscaled
  ok "Tailscale установлен (не активирован — введёт оператор через мастер)"
else
  ok "Tailscale уже установлен"
fi

# ── 4. Разворачиваем CMS-дерево ──────────────────────────────────
mkdir -p "$CMS_ROOT"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

log "Копирую дерево $REPO_ROOT → $CMS_ROOT"
rsync -a --delete \
  --exclude node_modules --exclude .git --exclude dist --exclude .lovable \
  "$REPO_ROOT/" "$CMS_ROOT/"
ok "Дерево скопировано"

if [[ -n "$BUILD_TAG" ]]; then
  echo "$BUILD_TAG" > "$CMS_ROOT/.factory-tag"
  ok "Метка версии: $BUILD_TAG"
fi

# ── 5. Prefetch Docker образов (offline-ready) ───────────────────
log "Подтягиваю Docker-образы Supabase (parity)…"
if [[ -f "$CMS_ROOT/deploy/docker-compose.yml" ]]; then
  ( cd "$CMS_ROOT/deploy" && docker compose pull --quiet ) || \
    warn "Не удалось скачать все образы — оффлайн-установка потребует ручного pull"
  ok "Образы загружены"
else
  warn "docker-compose.yml не найден — пропускаю pull"
fi

# ── 6. Систему запуска первой загрузки ──────────────────────────
log "Ставлю firstboot.service…"
install -m 0755 "$SCRIPT_DIR/firstboot.sh" /usr/local/sbin/casino-firstboot
cat > /etc/systemd/system/casino-firstboot.service <<'UNIT'
[Unit]
Description=Casino System — first boot wizard bootstrap
After=network-online.target docker.service
Wants=network-online.target docker.service
ConditionPathExists=!/var/lib/casino-system/firstboot.done

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/casino-firstboot
RemainAfterExit=yes
StandardOutput=journal+console
StandardError=journal+console

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable casino-firstboot.service
ok "firstboot.service активирован (сработает при следующей загрузке)"

# ── 7. mDNS: <slug>.local должен резолвиться в LAN ──────────────
systemctl enable --now avahi-daemon
ok "Avahi mDNS запущен (казино будет доступно по .local)"

# ── 8. Оффлайн-архив (опционально) ──────────────────────────────
if [[ $MAKE_TARBALL -eq 1 ]]; then
  OUT="/tmp/casino-factory-${BUILD_TAG:-$(date +%Y%m%d)}.tar.gz"
  log "Собираю оффлайн-архив $OUT"
  tar -C / -czf "$OUT" \
    opt/casino-system \
    etc/systemd/system/casino-firstboot.service \
    usr/local/sbin/casino-firstboot
  ok "Готов оффлайн-архив: $OUT"
fi

hr() { echo -e "${CYAN}────────────────────────────────────────────────${NC}"; }
hr
ok "Factory image готов."
echo "  • Дерево:        $CMS_ROOT"
echo "  • FirstBoot:     systemctl status casino-firstboot.service"
echo "  • Метка:         ${BUILD_TAG:-<none>}"
echo "  • Дальше:        выключить бокс, снять образ SSD (dd/clonezilla)"
hr
