# Phase B — статус исполнения

## B1 — Signed License + Packages — ✅ DONE

- **B1.1** ✅ Ed25519 keygen + sign CLI + README
  - `deploy/cli/generate-keys.mjs`, `deploy/cli/cms-license.mjs`, `deploy/cli/README.md`
  - `src/lib/license/public-key.ts` (placeholder — заменить на прод-ключ перед первым релизом)
- **B1.2** ✅ Таблица `casino_packages` + сид 9 пакетов
  (starter, live_basic, live_pro, slots_basic, slots_pro, combo_basic, combo_pro, enterprise, demo)
- **B1.3** ✅ Таблица `casino_license` + edge function `verify-license`
  - Ed25519 verify через `@noble/ed25519` в Deno
  - Требует секрет `LICENSE_PUBLIC_KEY_B64` в edge function env (после B1.1)
- **B1.4** ✅ Хук `useLicense` + `hasModule()` (Cloud без строки → implicit enterprise)
- **B1.5** ✅ `ModuleGate` + `UpgradeCard` + интеграция в `RoleGuard` и `AppSidebar`
- **B1.6** ✅ `/superadmin/license` (upload/download/audit) + вкладка License в Admin
- **B1.7** ✅ `LicenseBanner` расширен (expired hard-stop + ≤14 дней warning)

## B2 — Settings-driven Core — 🟡 INFRA DONE, MIGRATION PENDING

- **B2.1** ✅ Таблица `casino_settings` + spec `src/lib/casino-settings-spec.ts`
  Первые ключи: currency.enabled/primary, cashless.providers/max_per_tx_tzs,
  tips.weekly_bonus_min_hours/monthly_pool_share_percent,
  limits.hourly_check_interval_minutes/max_shift_duration_hours/cash_desk_imbalance_warning_tzs,
  general.enable_incidents_ai_hints
- **B2.2** ✅ Хук `useCasinoSetting<T>` + `useSettingsExport` (батчевый fetch, 5min кэш)
- **B2.3** ✅ Универсальный `SettingCard` (number/text/toggle/select/currency-list/provider-list/denomination-list/json + irreversible confirm)
- **B2.4** ⏳ Миграция хардкода — **не сделана**. Требует отдельного захода:
  - B2.4a Currency (`src/lib/currency.ts` + CashCountGrid/CashCheckNewGrid)
  - B2.4b Chips (проксирование через spec — опционально)
  - B2.4c Cashless providers (useCashless, useSlotsCashless, все отчёты — заменить hardcoded ["MPESA","TIGO","HALOTEL","AIRTEL"] на `useCasinoSetting("cashless.providers")`)
  - B2.4d Tips (weekly/monthly пороги)
  - B2.4e Time (зеркалирование `business_day_start` в spec)
  - B2.4f Limits (hourly check interval, shift duration warning, imbalance warning)
- **B2.5** ✅ CasinoSettingsPage расширен — авто-генерация вкладок General/Currency/Cashless/Tips/Limits из spec
- **B2.6** ✅ Export/Import settings.json (`SettingsExportImport` в General табе)

## Что нужно сделать перед прод-релизом

1. Сгенерировать реальный Ed25519 ключ (`node deploy/cli/generate-keys.mjs`).
2. Заменить `LICENSE_PUBLIC_KEY_B64` в `src/lib/license/public-key.ts`.
3. Добавить секрет `LICENSE_PUBLIC_KEY_B64` в edge function environment.
4. Выпустить первую лицензию для каждого казино и загрузить через `/superadmin/license`.
5. (Опционально) выполнить B2.4 — миграцию хардкода на `useCasinoSetting`.

## Phase C/D

Ещё не специфицированы. Открыть отдельный план когда потребуется.
