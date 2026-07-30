# Daily Balance Sheet → в Reports + доступ для GM / Finance / Igor

## Что не так сейчас
- Пункт «Report · Daily Balance» стоит в секции сайдбара FINANCE, а не рядом с остальными отчётами.
- В таблице прав `role_module_defaults` для модуля `report_daily_balance` нет ни одной строки (проверено запросом). Из-за этого пункт скрыт у всех, кроме super_admin, а прямой заход на `/reports/daily-balance` редиректит на дашборд.
- Igor — роль `boss` (проверено), т.е. ему нужен доступ через роль `boss`.

## Что сделаю

1. Перенос в Reports (сайдбар)
   - В `AppSidebar.tsx` перенести пункт `/reports/daily-balance` из секции FINANCE в ту же секцию и позицию, где находится основной пункт «Reports» (секция CASHIER), сразу под ним.
   - Список ролей у пункта оставить: super_admin, finance_manager, general_manager, boss.

2. Права доступа (миграция)
   - Добавить строки в `role_module_defaults` для `report_daily_balance`:
     - `general_manager` — просмотр + запись, горизонт `all`
     - `finance_manager` — просмотр + запись, горизонт `all`
     - `boss` (Igor) — только просмотр, горизонт `all`
     - `super_admin` — просмотр + запись, `all` (для явности)
   - Проверить, что у Igor нет персонального override в `user_module_permissions`, скрывающего модуль; если есть — удалить.

3. Проверка
   - Убедиться, что `effective_module_perms` для Igor и GM возвращает `report_daily_balance` с `can_view = true`.
   - Поднять версию в `package.json`.

## Технические детали
- Запись прав идёт через миграцию (INSERT ... ON CONFLICT (role, module_key) DO UPDATE) — таблица уже существует, схема не меняется.
- RLS для `fin_legacy_balance` не трогаем: если у GM/Finance/boss нет SELECT-политики на эту таблицу, добавлю политику чтения по доступным казино в той же миграции — проверю перед применением.
