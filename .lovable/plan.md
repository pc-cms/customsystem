## Что делаем в этот заход

Две завершающие подсистемы «Enterprise Server-in-a-Box»:

### Phase D — Cloud Clone (репликация Local → Cloud) и Smoke-tests

**Цель:** каждый бокс раз в сутки заливает свой снапшот в Cloud (для DR и Fleet-обзора данных), Cloud автоматически прогоняет smoke-tests на свежих данных.

1. **`deploy/cloud-clone.sh`** (systemd timer, 03:30 EAT):
   - `pg_dump --format=custom --exclude-schema=auth,storage,realtime,supabase_functions,vault` в `/var/lib/casino-system/backups/clone-YYYYMMDD.dump`
   - шифрует AES-256 (`CLOUD_CLONE_KEY` из `.env`), режет на 50 МБ чанки
   - POST в edge `cloud-clone-upload` с HMAC-подписью (peer_links.sync_secret)
   - хранит последние 7 локальных копий
2. **Edge `cloud-clone-upload`** — приём чанков, сборка, restore в изолированную БД `clone_<node_id>` в Cloud (используем `pg_restore` через SQL); пишет `cloud_clone_uploads` (node_id, uploaded_at, size, rows_by_table, sha256).
3. **Edge `cloud-clone-smoketest`** (cron 04:00 EAT):
   - для каждого свежего clone гоняет 6 проверок: parity counts vs. cloud master, orphan FK, RLS drift, cron_run_log freshness, chip conservation, cage vs. shifts balance
   - результат в `cloud_clone_reports` + отправка `fleet_commands` (kind=`notify`) при регрессиях
4. **UI `/admin/fleet/clones`** — таблица боксов с датой последнего clone, размером, статусом smoke-tests, кнопка «Download dump» (signed URL, только super_admin).

### Signed OTA

**Цель:** невозможно залить фейковый образ на бокс — все releases подписаны ключом мейнтейнера, `update.sh` проверяет подпись до `docker compose up`.

1. **CI (`release-onprem.yml`)**:
   - после сборки `.tar.gz` — `cosign sign-blob --key env://COSIGN_KEY release.tar.gz > release.sig`
   - публикация трёх артефактов: tarball, `.sig`, `.pub` (public key стабилен)
2. **`deploy/update.sh`**:
   - скачивает `release.tar.gz` + `.sig`
   - `cosign verify-blob --key /etc/casino-system/ota.pub --signature release.sig release.tar.gz` (жёсткий exit при провале)
   - только после успеха — распаковка и `docker compose up -d`
3. **`deploy/install.sh --boxed`** — при первой установке кладёт `ota.pub` в `/etc/casino-system/ota.pub` из встроенного factory-tree.
4. **Rollback safety** — сохраняет предыдущий tarball в `/var/lib/casino-system/ota-prev/`; при 3 подряд провалах smoke-теста license-agent'ом откатывает.

## Файлы (создание/правка)

**Новые:**
- `deploy/cloud-clone.sh`
- `deploy/systemd/casino-cloud-clone.service`, `.timer`
- `deploy/ota-verify.sh` (helper для `update.sh`)
- `supabase/functions/cloud-clone-upload/index.ts`
- `supabase/functions/cloud-clone-smoketest/index.ts`
- `src/pages/admin/CloneStatusPage.tsx` (маршрут `/admin/fleet/clones`)
- Migration: `cloud_clone_uploads`, `cloud_clone_reports` (RLS: super_admin read, service_role write; realtime on)

**Правка:**
- `deploy/update.sh` — вставить verify перед distributed rollout
- `deploy/install.sh` — регистрация clone timer + копирование `ota.pub`
- `deploy/factory-image.sh` — pre-fetch `cosign` binary в offline-tree
- `.github/workflows/release-onprem.yml` — cosign sign-blob шаг
- `src/App.tsx` — маршрут `/admin/fleet/clones`
- `src/pages/admin/FleetOverviewPage.tsx` — вкладка «Clones»

## Секреты, которые понадобятся

- `COSIGN_PRIVATE_KEY` (GitHub Actions secret) — для подписи releases в CI
- `CLOUD_CLONE_KEY` — генерируется на каждом боксе firstboot'ом, зеркалится в `peer_links.clone_key`

## Что НЕ делаем в этот проход

- полноценный streaming logical replication (избыточно для 20-строчных таблиц; snapshot-based clone покрывает DR)
- восстановление из clone на другой бокс через UI — только вручную командой `pg_restore` из Cloud dump (документируется в `ARCHIVE-RESTORE.md`)
- ротацию ключа `COSIGN` (делается один раз в год руками; переиздание `ota.pub` через OTA-команду)
