# Phase B — полный план (по этапам)

Две большие части, каждая делится на независимые шаги. Каждый шаг = один коммит, можно останавливаться и проверять.

---

## B1 — Signed License + Packages (защита релиза, ~1 неделя)

Цель: коробка не работает без подписанной лицензии; каждой лицензии соответствует пакет модулей, UI скрывает то, что не куплено.

### Шаг B1.1 — Ключи и CLI подписи
- Генерация Ed25519 пары (offline, вне репо).
- Публичный ключ вшивается в код: `src/lib/license/public-key.ts` (base64 константа).
- CLI: `deploy/cli/cms-license.mjs sign --casino=<slug> --package=<code> --expires=<ISO> --features=<csv>` → выдаёт `license.dat` (JSON + signature).
- README в `deploy/cli/` с процедурой выпуска лицензии.

### Шаг B1.2 — Таблица `casino_packages` + сид
- Миграция: `casino_packages(code, name, modules jsonb, max_tables int, max_users int, price_usd numeric, is_active bool)`.
- GRANT + RLS (read: authenticated; write: super_admin).
- Сид 9 пакетов: `starter`, `live_basic`, `live_pro`, `slots_basic`, `slots_pro`, `combo_basic`, `combo_pro`, `enterprise`, `demo`.
- Каждый пакет — список `ModuleKey` из `src/lib/modules.ts`.

### Шаг B1.3 — БД: `casino_license` + verify
- Миграция: `casino_license(id, payload jsonb, signature text, package_code, expires_at, activated_at, activated_by)`. Одна строка на казино.
- SQL функция `verify_license(payload jsonb, sig text) returns bool` (проверка Ed25519 через `pgcrypto`/edge-function fallback).
- Триггер: при вставке — вызвать verify, при провале — reject.

### Шаг B1.4 — Хук `useLicense` + контекст
- `src/hooks/use-license.ts`: читает `casino_license`, декодирует payload, возвращает `{ package, modules: Set<ModuleKey>, expiresAt, isValid, daysLeft }`.
- Клиентская проверка подписи через WebCrypto (Ed25519) — как defense-in-depth.
- Cloud без строки → `enterprise` (все модули), on-prem без строки → блок.

### Шаг B1.5 — `<ModuleGate>` + интеграция в роутинг
- Компонент `src/components/license/ModuleGate.tsx`: `<ModuleGate module="cage_slots">…</ModuleGate>` → если модуля нет в пакете → `<UpgradeCard>` с названием пакета и списком фич.
- Обернуть все routes в `App.tsx` соответствующими `ModuleGate` (маппинг route → ModuleKey уже есть в `src/lib/route-module-map.ts`).
- Скрыть пункты меню (`Sidebar`) для отсутствующих модулей.

### Шаг B1.6 — Страница `/superadmin/license`
- Просмотр текущей лицензии (пакет, срок, кол-во модулей).
- Загрузка `license.dat` → verify → insert/update `casino_license`.
- Кнопка «Скачать текущую» + audit log в `activity_logs`.
- Доступ: только `super_admin`.

### Шаг B1.7 — Баннер и hard-stop
- Расширить `LicenseBanner`: показывать «License expires in N days» когда `daysLeft ≤ 14`.
- При `expiresAt < now()` → полный read-only режим (переиспользуем `useReadonlyMode`), кроме `/superadmin/license`.

---

## B2 — Settings-driven Core (~1 неделя)

Цель: убрать хардкод (валюты, номиналы, лимиты чаевых, шаги cash check и т.д.) в единую таблицу `casino_settings` с типизированным API и универсальным UI.

### Шаг B2.1 — Таблица `casino_settings` + spec
- Миграция: `casino_settings(casino_id, key text, value jsonb, updated_at, updated_by)`, PK (casino_id, key).
- GRANT + RLS (read: authenticated same casino; write: manager/super_admin).
- `src/lib/casino-settings-spec.ts`: полный реестр ключей с типом, дефолтом, группой, `irreversible: bool`, описанием.
  Группы: General, Chips, Cashless, Tips, Currency, Time, Limits.

### Шаг B2.2 — Хук `useCasinoSetting`
- `useCasinoSetting<T>(key)` → `{ value, setValue, isLoading, isDefault }`.
- Батчевая загрузка всех настроек одним запросом + кэш (React Query, staleTime 5min).
- Realtime подписка на изменения (через `use-module-live-sync`).

### Шаг B2.3 — Универсальный `SettingCard`
- Компонент: рендерит control по типу из spec (number/text/select/toggle/json/currency-list/denomination-list).
- Для `irreversible: true` — confirm-диалог + запись в `activity_logs` с `before/after`.
- Инлайновая валидация, «Save/Reset» кнопки, индикатор «modified».

### Шаг B2.4 — Миграция хардкода (по группам)

Для каждой группы: 1) добавить ключи в spec, 2) заменить константы на `useCasinoSetting`, 3) удалить старый хардкод.

- **B2.4a Currency**: список валют, primary currency, отображение в grid.
  Затрагивает: `src/lib/currency.ts`, `CashCountGrid`, `CashCheckNewGrid`.
- **B2.4b Chips**: цвета и номиналы (сейчас в `chip_color_settings` — оставить как есть, но проксировать через spec для унификации API).
- **B2.4c Cashless**: список провайдеров (сейчас hardcoded MPESA/TIGO/HALOTEL/AIRTEL), max per transaction.
  Затрагивает: `useCashless`, `useSlotsCashless`, все Cashless-блоки в отчётах.
- **B2.4d Tips**: пороги для weekly/monthly bonus, formula weights.
  Затрагивает: `use-weekly-bonus`, `use-monthly-tips`.
- **B2.4e Time**: `business_day_start` (сейчас `casinos.business_day_start`) — оставить в casinos, но зеркалить в spec.
- **B2.4f Limits**: max shift duration, max cash desk imbalance warning, hourly check interval.

### Шаг B2.5 — Страница `CasinoSettingsPage` (расширение)
- В существующий `src/pages/admin/CasinoSettingsPage.tsx` добавить вкладки: General / Currency / Cashless / Tips / Limits.
- Каждая вкладка = `<SettingsGroup group="…">` — автогенерация из spec (map по ключам группы → `SettingCard`).
- Существующие вкладки Time/Tables/Float/Chip Colors/Chip Mode — оставить (уже кастомные, не трогать).

### Шаг B2.6 — Audit + экспорт/импорт
- Все изменения → `activity_logs` (уже есть trigger — добавить table в registry).
- Кнопки «Export settings.json» / «Import settings.json» для тиража на новую коробку.

---

## Технические детали

- Ed25519 verify в браузере: `crypto.subtle.verify('Ed25519', ...)` — доступен в Chromium 108+.
- Ed25519 в Postgres: через edge function `verify-license` (Deno имеет native Ed25519), либо `pgsodium` если доступен.
- `ModuleGate` использует `Suspense` для избежания CLS при первой загрузке лицензии.
- `SettingCard` использует те же shadcn примитивы, что и остальной admin UI — без новых зависимостей.

## Порядок исполнения

Строго по номерам: B1.1 → B1.7, затем B2.1 → B2.6. После каждого шага — build check + smoke test. Останавливаемся, если что-то ломается.

## Что вне scope Phase B
- Phase C/D (уточним отдельно, когда B закроется).
- Изменения в существующих Cage/Slots/Tips формулах — только скрытие через ModuleGate, логика не трогается.
