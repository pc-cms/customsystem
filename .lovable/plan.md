
# Enterprise Server-in-a-Box — финальный план

## 0. Стек-решение (важно)

**Оставляем Supabase self-hosted.** Это и есть чистый Postgres 15 + готовый API-слой (GoTrue, PostgREST, Realtime, Storage). Смена на «голый Postgres» = 3 месяца переписывания auth/RLS/realtime без выигрыша. Ставим **официальные образы Supabase** (не форки) — это даёт 100% паритет с Cloud, что решает главную боль «не удалось получить точную копию».

**Железо N150 / 32GB / 512GB SSD** тянет полный стек с большим запасом. Реальный target: 2–4GB RAM, 20GB данных/год, <5% CPU в пике.

## 1. Ответы, зафиксированные из вопросов

| Решение | Выбор |
|---|---|
| Автономность | Managed с grace period |
| Cloud | Опционален (для мульти-сайт агрегации) |
| Обновления | Signed OTA через Tailscale |
| Multi-casino на боксе | Один бокс = одно казино |
| Grace period | 60 дн full → 30 дн «cashier + pit open/close столов, без Player Stats» → stop |
| Backup | Локально: USB + NAS |
| Пайринг | Peer-to-peer **и** central hub (клиент выбирает) |
| Compliance | v2, через OTA после релиза Box v1 |
| First-boot | Hotspot + HDMI (оба параллельно) |
| Demo data | Мини-демо + одна кнопка «Clear» |

## 2. Архитектура бокса

```text
┌────────────────────────────────────────────────┐
│  Ubuntu 24.04 LTS (минимальная установка)      │
├────────────────────────────────────────────────┤
│  Docker Compose stack:                         │
│   - caddy         (HTTPS через local CA)       │
│   - supabase-db   (Postgres 15, оф. образ)     │
│   - supabase-auth (GoTrue)                     │
│   - supabase-rest (PostgREST)                  │
│   - supabase-realtime                          │
│   - supabase-storage                           │
│   - cms-frontend  (наш Vite build, nginx)      │
│   - cms-fleet-agent (WSS к Cloud, опц.)        │
│   - cms-license   (grace-period enforcer)      │
│   - cms-backup    (pg_dump → USB/NAS, cron)    │
├────────────────────────────────────────────────┤
│  Host services:                                │
│   - tailscaled  (SSH + OTA канал)              │
│   - avahi       (mDNS: casino.local)           │
│   - hostapd     (Wi-Fi hotspot, только setup)  │
│   - casino-firstboot.service                   │
└────────────────────────────────────────────────┘
```

## 3. Фазы поставки

### Фаза A — Factory Image (наш сборочный процесс)
- `deploy/factory-image.sh`: заливает Ubuntu 24.04, ставит Docker + Tailscale + Avahi + hostapd, вшивает наш SSH-ключ, пуллит все образы, вшивает Tailscale auth-key под tag `tag:casino-box`.
- Результат: клонируемый образ SSD или USB-инсталлятор.
- Заводской тест: 30 автоматических проверок, включая Playwright smoke.

### Фаза B — First Boot (клиент)
1. Клиент включает бокс в розетку, подключает Ethernet **или** оставляет без сети.
2. Бокс параллельно:
   - выводит на HDMI: IP, QR-код, PIN;
   - поднимает Wi-Fi hotspot `CASINO-SETUP-<serial>` с captive portal.
3. Клиент открывает `https://casino.local` (или сканирует QR / подключается к hotspot) → `/setup` wizard:
   - Название казино, логотип, primary color
   - LAN IP (static/DHCP)
   - Основная валюта (default TZS), номиналы
   - Создание первого `super_admin` (email + password)
   - **Tailscale**: один клик «Enable remote support» → login-link → клиент подтверждает в браузере
   - Cloud pairing (опц.): вставляет URL Cloud + pairing code
4. Wizard применяет настройки, гасит hotspot, показывает «Готово, `https://casino.local`».
5. Мини-демо загружено; кнопка **«Clear demo data»** доступна до первой реальной транзакции.

### Фаза C — Ежедневная работа
- LAN: 22 (SSH локально), 80/443 (UI).
- Remote support: только через Tailscale SSH.
- Автообновления: fleet-agent слушает WSS → команда `pull image X → verify → restart → healthcheck → rollback on fail`.
- Backup: `pg_dump` каждые 2 часа → `/backup/local` + монтированный USB; ежедневный полный дамп на NAS через SMB/NFS.

### Фаза D — Cloud clone (One-click Cloud → Local)
- В UI Cloud: `super_admin` жмёт «Clone to box».
- Cloud блокирует запись (maintenance lock) → атомарный `pg_dump` + storage bundle.
- Бокс тянет по Tailscale, восстанавливает в staging-БД, прогоняет 30 self-tests + Playwright smoke.
- `super_admin` на боксе жмёт «Cutover: local becomes primary». Cloud уходит в mirror-mode.

### Фаза E — Fleet management (наш Cloud)
- `/admin/fleet`: список боксов, версии, health, disk, uptime, last-seen, license status.
- Действия: restart container, force update, request logs, remote shell (через Tailscale), rotate keys, revoke.
- Signed release: SQL-миграции + образы подписаны Ed25519, бокс проверяет подпись до применения.

## 4. Grace period (лицензия)

```text
День 0–60 :  Full functionality
День 61–90:  Restricted mode
             ✓ Cashier: buy-in/cash-out/tips/cashless
             ✓ Pit: open/close столов, chip counts
             ✗ Player Statistics скрыт
             ✗ Reports read-only (текущий день OK)
             ✗ Настройки/HR/Finances заблокированы
             Баннер: "Contact support to renew"
День 91+  :  Full stop, read-only, кнопка "Enter activation code"
```
Активация: challenge-response — бокс показывает 8-символьный challenge, мы даём 12-символьный response, работает offline.

## 5. Пайринг двух+ боксов одной сети

- **Peer-to-peer**: справочники (players, employees, currencies, chip settings, expenses categories) синхронизируются через Tailscale mesh с CRDT-подобным конфликт-резолвом (last-write-wins по `updated_at`, аудит конфликтов в `sync_apply_errors`). Оперативные данные остаются на своём боксе.
- **Central hub**: каждый бокс дополнительно пушит read-only копию транзакций в hub (наш Cloud или бокс главного офиса) для агрегированных отчётов. Hub — только читает.
- Клиент выбирает режим в `/admin/network`.

## 6. Файлы, которые создадим/изменим

**Новые:**
- `deploy/factory-image.sh` — сборка золотого образа
- `deploy/boxed-setup.sh` — first-boot orchestrator
- `deploy/hotspot-portal/` — captive portal (лёгкий Node)
- `deploy/firstboot.service` — systemd unit
- `deploy/license-agent/` — Go/Node service для grace-period
- `deploy/fleet-agent/` — WSS клиент к Cloud
- `deploy/backup/` — pg_dump + rclone → USB/NAS
- `src/pages/setup/FirstRunWizard.tsx` — UI wizard
- `src/pages/admin/FleetDashboard.tsx` (в Cloud) — управление парком
- `src/pages/admin/BoxNetwork.tsx` — peer/hub настройки
- `src/pages/admin/LicenseStatus.tsx` — grace UI
- `supabase/migrations/*` — `fleet_heartbeat`, `node_commands`, `box_licenses`, `sync_peers_config`

**Изменяем:**
- `deploy/docker-compose.yml` — перевод на офиц. Supabase-образы (parity fix)
- `deploy/install.sh` + `deploy/bootstrap.sh` — новый режим `--boxed`
- `src/App.tsx` — guard на wizard если `is_setup_complete=false`; grace-mode gate
- `src/hooks/use-realtime.ts` — режим local-realtime без Cloud
- `deploy/update.sh` — hooks для fleet-agent

## 7. Порядок реализации

1. **Stack parity** — миграция docker-compose на офиц. Supabase-образы, повторное тестирование Cloud→Local clone до 100% зелёного self-test.
2. **First-Run Wizard + firstboot service** (hotspot + HDMI).
3. **Factory image script + Tailscale prebake**.
4. **License agent** (grace-period 60/30/stop).
5. **Fleet agent + Cloud dashboard** (OTA, remote logs).
6. **Peer-to-peer sync + central hub option**.
7. **Backup service** (USB + NAS).
8. **Полевой прогон**: 3 тестовых бокса → Arusha (mirror), Mwanza (mirror), новый demo-клиент.

## 8. Что клиент получает в коробке

- Mini-PC N150 / 32GB / 512GB с предустановленным Ubuntu + всем стеком
- Ethernet-кабель, HDMI-кабель, USB-стик для бэкапов
- QR-карточка «Scan to setup»
- Печатный quick-start (1 страница): «Включи → подключи к роутеру → отсканируй QR → следуй wizard»

## 9. Технические детали (для тебя)

- Официальные образы Supabase закреплены по SHA256 в compose.
- Postgres `wal_level=logical` для будущей peer-репликации.
- Caddy получает локальный CA (mkcert) → `https://casino.local` без предупреждений на устройствах, где мы установим корневой сертификат (iOS/Android — QR на установку CA в wizard).
- Fleet-agent авторизуется TLS-client-cert; сервер отдаёт команды через Supabase Realtime канал `node_commands` c row-level фильтрацией по `node_id`.
- License challenge: HMAC(server_secret, node_id || day_bucket), response — расшифрованный AES-GCM пейлоад со сроком.

По подтверждению — переключусь в build mode и начну с Фазы 1 (stack parity), потому что без неё Cloud→Local clone не даст 100% результата, ради которого всё это делается.
