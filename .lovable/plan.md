# Унификация сетевого поведения между казино

## Контекст (что уже одинаково)

Я провёл аудит — между Arusha и Mwanza **нет ни одного функционального различия** в клиентском коде:

| Что | Arusha | Mwanza | Статус |
|---|---|---|---|
| PWA-манифест (cloud) | `manifest-arusha.json` | `manifest-mwanza.json` | Идентичны, кроме `name`/`short_name` (косметика) |
| PWA-манифест (on-prem) | `manifest-aru.json` | `manifest-mwz.json` | Идентичны, кроме `name` и `id` |
| Иконки, `start_url`, `scope`, `theme_color` | те же | те же | OK |
| `node_modes.mode` в БД | `cloud_primary` | `cloud_primary` | OK |
| Таймаут offline-mutation | 8000 ms | 8000 ms | OK (см. ниже) |
| Auth throttle / 429 cooldown | 30000 ms | 30000 ms | OK |
| Sync backoff (1s→16s) | глобальный | глобальный | OK |
| Realtime/prefetch логика | одна и та же | одна и та же | OK |

**Единственная реальная разница** — физическая сетевая задержка от ISP клиента в Мванзе vs Аруше до cloud-edge Supabase (EU). Это вне кода. Но мы можем сделать UX устойчивым к худшему из двух RTT, чтобы при подключении следующего казино (Dodoma, Mbeya) поведение было одинаковым.

## Что меняем

### 1. Поднять единый таймаут операций до 15 секунд

`src/lib/offline-mutation.ts`: `onlineTimeoutMs` default `8000 → 15000`.

**Почему:** 8 секунд — слишком жёстко для casino, у которого RTT до облака >300 ms + редкие jitter-пики. Запрос успевает дойти, но клиент уже считает его «зависшим», сбрасывает в IndexedDB и показывает «Connection slow». Поднимаем до 15 с — это всё ещё гарантирует, что UI не зависнет навсегда, но перестаёт ложно срабатывать на нормальном африканском интернете.

### 2. Убрать всплывающий тост «Connection slow — saved offline, will retry»

`src/lib/offline-mutation.ts`: при `navigator.onLine === true` (т.е. не настоящий offline, а просто медленный round-trip) **не показывать toast**. Запись всё равно сохраняется в IndexedDB и синхронизируется фоном через `syncPendingActions`.

Реальный offline (`navigator.onLine === false`) → toast остаётся: «Saved offline — will sync when connected». Это валидный сигнал.

**Почему:** сейчас этот тост пугает Мванзу при каждом jitter-пике, хотя данные не теряются. Верхний `OfflineBanner` (красная/жёлтая полоса) продолжает корректно показывать статус сети и очередь.

### 3. Зафиксировать паритет манифестов

Добавить короткий комментарий-header в каждый `public/manifest-<casino>.json` и `public/manifest-<code>.json`, явно говорящий: «отличия от других манифестов — только косметика (name/short_name)». Чтобы при добавлении нового казино было видно правило.

(Файлы менять не нужно по содержимому — только короткий комментарий поверх описания через поле `description`, либо отдельный `MANIFESTS.md` рядом.)

### 4. Документация

Создать `docs/CASINO-PARITY.md` — короткая страница со списком гарантий: «все казино должны иметь идентичные таймауты, ретраи, частоту prefetch, размер кэша; различия допускаются только в name/short_name/иконке». Это станет чек-листом при подключении Dodoma/Mbeya.

## Чего НЕ делаем

- Не вводим per-casino таймауты — это противоречит цели «одинаковые задержки везде».
- Не трогаем `auth-throttle`, `sync-engine`, `pit-prefetch` — там уже всё симметрично и проверено.
- Не трогаем on-prem (`manifest-aru/mwz`) логику — она к Mwanza Cloud отношения не имеет.
- Не меняем `node_modes` — оба казино правильно в `cloud_primary`.

## Технические детали

**Файлы:**
- `src/lib/offline-mutation.ts` — изменить `timeoutMs ?? 8000` → `?? 15000`; в блоке `enqueue` показывать `toast.info` только если `!navigator.onLine`.
- `docs/CASINO-PARITY.md` — новый файл, ~30 строк.
- (опционально) `public/manifest-*.json` — добавить ключ `"_comment": "All casino manifests must be identical except name/short_name/description"`. PWA-парсеры неизвестные ключи игнорируют.

**Версия:** bump patch — это behavioural change в клиенте.

**Проверка после деплоя:**
- Открыть Mwanza, поправить ячейку attendance — toast «Connection slow» больше не должен появляться при медленном (но успешном) ответе.
- Полностью выключить Wi-Fi → toast «Saved offline» появляется как раньше.
- Очередь sync в `/admin/sync-queue` пустеет при возврате online.
