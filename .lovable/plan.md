# Демо-раздел: доступ для Igor, GM и обоих Michael

## Что сейчас

- Раздел DEMO содержит 4 отчёта: Demo Casino Balance, Demo Office Balance, Demo Expenses Casino, Demo Expenses Office (синтетические данные, ничего не пишется в базу).
- Все `/demo/*` маршруты сейчас защищены тем же модулем, что и реальный отчёт `report_daily_balance`. Открыт ролям: super_admin, boss, finance_manager, general_manager.
- Igor — роль boss, GM — general_manager, Michael — finance_manager: доступ уже есть.
- Michael Mwanza — только роль manager: доступа к DEMO нет.

## Что сделать

1. Ввести отдельный модуль доступа `report_demo` только для демо-раздела, чтобы выдача демо не открывала реальный финансовый отчёт.
   - `/demo/*` маршруты и пункты меню DEMO переводятся на этот модуль.
2. Дефолты нового модуля: super_admin, boss, finance_manager, general_manager (как сейчас) — Igor, GM и Michael сохраняют доступ.
3. Персонально выдать `report_demo` аккаунту Michael Mwanza (роль manager), без выдачи остального финансового блока.
4. Проверить, что после входа под каждым из четырёх аккаунтов раздел DEMO виден и все 4 отчёта открываются.

## Технические детали

- `src/lib/route-module-map.ts`: `if (base.startsWith("/demo/")) return "report_demo"`.
- `src/lib/modules.ts`: добавить ключ `report_demo` (label «Demo Reports»).
- `src/components/layout/AppSidebar.tsx`: пункты секции DEMO уже ограничены ролями — оставить, гейт по модулю сделает `RoleGuard`.
- `src/App.tsx`: у 4 демо-маршрутов заменить `RoleGuard path="/reports/daily-balance"` на демо-путь, чтобы сработал новый модуль.
- Миграция: строки в `role_module_defaults` для `report_demo` (4 роли, can_view = true).
- Данные: запись в `user_module_permissions` для Michael Mwanza (`8054959d-…`) с `can_view = true`.

## Формула Balance в таблицах

- Office Monthly Balance → **Balance** = Money вчера + IN − Expenses − Transfer → Casino − OUT (IK) − Money сегодня, где Money = Cage + Bank. В норме ≈ 0.
- Casino Monthly Balance → **Variance** = Money (фактические деньги) − (Money вчера + Result + IN − OUT − Expenses), где Money = Cage Casino + Cage Manager + Bank TZS + Bank USD.
- Там же **Fin Result** = Casino Result − Expenses ± Diff (чипы + карты).
