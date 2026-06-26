
# План: Полное зеркало Arusha Cloud → Local Master

Цель: локальный сервер `arusha.local` = байт-в-байт копия Cloud Arusha. После cutover Cloud становится read-only зеркалом, видимым на `arusha.casinosystem.app`. Записи только локально, в Cloud летят через sync_outbox.

## A. Подготовка фронта (одна сборка работает в обоих режимах)

Frontend образ один и тот же. Все различия — через `runtime-config.json`, который entrypoint подставляет ДО старта nginx:

```text
Cloud build  → runtime-config.json содержит публичный Cloud URL
Local build  → entrypoint меняет на http://arusha.local/api + локальный anon key
```

Захардкоженные вещи (логотипы, манифесты, активные players, шрифты, дизайн) уже в `src/`. Локалка получит тот же `dist/` что и Cloud. Не должно быть НИКАКОЙ ветки `if (isLocalMode)` в визуале.

**Проверочный чек-лист** (что обязано совпасть с Cloud):
- логотипы Arusha (`public/manifest-arusha.json`, `public/manifest-aru.json`)
- цветовые токены, шрифты, density
- все компоненты Active Players (Daily/Present/Left с активными)
- иконки PWA, favicon
- набор страниц по ролям (Pit, Cage, Tables, Reception, ...)

Audit перед cutover: я прогоняю `bun run build` в Cloud-режиме и сравниваю `dist/` с тем что собирает `Dockerfile.frontend`. Любая разница → правлю Dockerfile.

## B. Backfill всей истории Arusha

Новая edge function `cloud-full-export`:
- auth: `x-service-key` ИЛИ `x-sync-secret + x-casino-id`
- стримит NDJSON по таблицам в порядке зависимостей (FK-safe)
- использует `TransformStream` (как уже было сделано в `cloud-schema-export`)
- параметр `?since=<timestamp>` для инкрементального догона

Таблицы (полный список ~170, scope `casino_id = <arusha>`):
- Global: `casinos`, `user_roles`, `user_casino_access`, `profiles`, `chip_color_settings`, `expense_categories`, `fin_categories`, всё `pos_*` справочное
- Players: `players`, `player_cards`, `player_tags`, `player_notes`, `player_chip_adjustments`, `player_daily_*`, `casino_visits`, `client_sessions`
- Operational: `gaming_tables`, `employees`, `shifts`, `transactions`, `cage_*`, `chip_*`, `cash_*`, `breaklist*`, `incidents`, `staff_*`, `attendance_*`
- Reports: `fin_*`, `table_daily_results`, `business_day_closures`, `payroll_*`, `monthly_tips_*`, `weekly_bonus_*`
- Logs (последние 90 дней чтобы не раздувать): `activity_logs`, `breaklist_logs`, `sync_*_log`

Импорт на локалке:
- скрипт `deploy/import-full-snapshot.sh`
- стримит NDJSON → `psql COPY` (быстрее чем INSERT по строке)
- ON CONFLICT (id) DO NOTHING — идемпотентно
- сохраняет последний `synced_at` для инкрементального dogon

## C. Перенос auth (хеши паролей)

Cloud GoTrue хранит bcrypt в `auth.users.encrypted_password`. Локальный GoTrue читает тот же столбец и формат — хеши совместимы.

Новая edge function `cloud-auth-export`:
- auth: только `x-service-key`
- возвращает строки `auth.users` (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data) для пользователей с доступом к Arusha
- НИКОГДА не показывается в UI, только installer вызывает

Локальный installer:
- INSERT в `auth.users` с теми же id и хешами
- юзеры заходят теми же логинами/паролями
- JWT signing key локального GoTrue — свой (хеши паролей это не ломает, токены генерятся локально)

## D. Cutover процедура (5–10 минут даунтайма)

Скрипт `deploy/cutover-to-local.sh` запускается super_admin'ом:

```text
[0] Pre-flight на локалке: docker compose ps все Up, healthcheck зелёный
[1] В Cloud: вставить запись в system_locks → readonly_mode=true для casino_id
    Триггер блокирует INSERT/UPDATE на operational таблицы (кроме sync_*)
[2] Сообщение всем сессиям через realtime: "Maintenance, переподключитесь через 10 мин"
[3] Финальный delta-export: cloud-full-export?since=<last_sync_ts>
[4] Импорт дельты на локалке
[5] Verify-parity: cloud-parity-counts vs local counts по каждой таблице. Mismatch → abort.
[6] Локально: UPDATE node_modes SET mode='local_primary' WHERE casino_id=arusha
[7] Cloud: UPDATE node_modes SET mode='cloud_replica' WHERE casino_id=arusha  
    + триггер sync_outbox начинает СЛУШАТЬ входящие от локалки, а не генерить свои
[8] Снять readonly_mode в Cloud
[9] LAN-юзеры → arusha.local (записи летят в локалку)
    Внешние юзеры → arusha.casinosystem.app (читают Cloud, который зеркалирует локалку)
```

Roll-back: на любом шаге до [6] просто снять readonly_mode и Cloud снова master. После [6] — обратный flip скриптом `cutover-rollback.sh`.

## E. Двусторонняя репликация после cutover

Локалка = master. Cloud = replica.

- На локалке: каждая мутация триггером `tg_sync_outbox` пишет в локальный `sync_outbox`
- Воркер `cms-sync` (уже есть в `deploy/sync/`) каждые 2 сек POST'ит в Cloud edge `pull-changes` (reverse direction добавим)
- Cloud применяет с `set_config('sync.loopback', 'true')` чтобы не зацикливалось
- При offline воркер копит в outbox, при возврате интернета — догоняет

Конфликты: невозможны, т.к. писатель один (локалка). Cloud принимает безусловно.

## F. Network admin UI (объединяем с предыдущим планом)

Страница `/admin/network`:
- **Status**: online/offline, версия, uptime, размер БД
- **Role**: MASTER/REPLICA бейдж + кнопка switch (super_admin, audit log)
- **Sync**: last sync, pending count, failed count, "Force sync now"
- **Other nodes**: read-only список других casino-нод

Удаляем: Update Commands, Initial Sync Jobs UI, Peer Bootstrap UI, Cron Health, Sync Outbox Health overview, Endpoint Health checks, Secret rotation, VPN peers, Cloudflare UI.

## G. Удаление мёртвого "Local Casino"

Через `read_query` найти casino_id записи "Local Casino" (которую снесли в попытках), затем миграцией удалить:
- `peer_links`, `node_identity`, `node_modes`, `pending_server_registrations`, `cutover_sessions`, `mirror_cutover_state` где `casino_id` совпадает
- `casinos` сама запись

## Этапы выполнения

1. **Cleanup**: удалить "Local Casino" из Cloud
2. **Cloud edge functions**: `cloud-full-export`, `cloud-auth-export`, расширение `pull-changes` для reverse-direction
3. **Cloud lock**: триггер `enforce_readonly_mode()` + таблица флагов
4. **Frontend audit**: убедиться что Cloud build = Local build (только runtime-config различается)
5. **Installer rewrite**: `deploy/bootstrap.sh` v2 с `--mirror-from-cloud --casino arusha`
6. **Import scripts**: `import-full-snapshot.sh`, `cutover-to-local.sh`, `cutover-rollback.sh`
7. **Reverse sync**: воркер `cms-sync` начинает push в Cloud когда `node_modes.mode=local_primary`
8. **Network admin UI**: новый `/admin/network` с 4 блоками, удаление мёртвых страниц
9. **Документация**: `deploy/CUTOVER-ARUSHA.md` пошагово
10. **Тест на Arusha**: cutover, верификация. После успеха — копируем процедуру для Mwanza. Dodoma стартует сразу с локалки.

## Что НЕ делаем сейчас

- Cloudflare Tunnel снаружи — оставляем `arusha.casinosystem.app` на Cloud (read-only зеркало). Cutover Cloud-домена на локалку = отдельный этап после доказательства стабильности.
- Control-Agent для прямого ssh-управления — отдельный план, не блокирует cutover.
