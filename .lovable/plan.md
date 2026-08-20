# Три исправления + удаление модуля Monthly Balance

## 1. Admin → ACE Collector: «Generate install command»

Текущее состояние проверено: функция `ace_create_install_token` уже использует `extensions.gen_random_bytes` и `extensions.digest`, расширение `pgcrypto` действительно живёт в схеме `extensions`. То есть заявленная причина в текущей базе не подтверждается — ошибка либо устранена ранее, либо приходит из другого места (например, дефолт колонки в `ace_collector_installs`).

Шаги:
- Сначала воспроизвести вызов RPC и получить точный текст ошибки.
- Если проблема в дефолтах таблицы или в другой функции цепочки — переписать её с полной квалификацией схемы `extensions.` и `SET search_path = public, extensions`.
- Если ошибка не воспроизводится — подтвердить это и закрыть замечание.

## 2. Expenses → «+ New subcategory» падает у персонала

RLS на `fin_categories`: чтение доступно всем авторизованным, запись — только `super_admin` и ролям с `can_finance()`. Кассиры и менеджеры видят кнопку, но получают отказ.

Решение (UI-уровень, без ослабления RLS):
- В `CategoryCombobox` показывать пункт «+ New subcategory» только пользователям с правом записи (super_admin / finance_manager).
- Остальным пункт скрыт; если категории нет — они выбирают «Unallocated», финансист позже переклассифицирует.

## 3. Record / Freeze в Monthly Balance

Модуль удаляется целиком (см. ниже), поэтому конфликт перезаписи снимка в этом отчёте исчезает вместе с ним. Но `fin_day_balance_snapshot` также используется на странице Finances → Wallets (`useRecordDayBalance` / `useDayBalanceSnapshot`), поэтому:
- В `use-day-balance-snapshot.ts` заменить полную перезапись JSON на слияние (merge) полей — блокировка дня больше не затирает ранее записанные `money_locked` / `money_detail`.

## 4. Удаление модуля Casino/Office Monthly Balance и матриц расходов

Убрать из приложения:
- Пункты меню в секции FINANCE: «Casino Monthly Balance», «Office Monthly Balance», «Expenses · Casino», «Expenses · Office».
- Маршруты `/reports/daily-balance`, `/reports/office-balance`, `/reports/expenses-matrix`, `/reports/expenses-casino`, `/reports/expenses-office` (и их демо-аналоги, если есть).
- Страницы `DailyBalanceReport.tsx`, `OfficeBalanceReport.tsx`, `ExpensesMatrix.tsx` и их хуки/хелперы, которые больше нигде не используются (`use-daily-balance-report`, `use-office-balance-report`, `use-expenses-matrix`, `monthly-balance-formulas`, связанные части `demo-report-data`).
- Записи в `route-module-map.ts` и ключи в `fin-invalidate.ts`, относящиеся только к этим страницам.

Что НЕ трогаем: Office, Budget, Monthly Report в Office, Day Closings, Dashboard TV, таблицы БД (данные остаются, удаляется только UI).

## Технические детали
- Файлы: `src/App.tsx`, `src/components/layout/AppSidebar.tsx`, `src/lib/route-module-map.ts`, `src/lib/fin-invalidate.ts`, `src/components/expenses/CategoryCombobox.tsx`, `src/hooks/use-day-balance-snapshot.ts`, удаление файлов в `src/pages/reports/` и соответствующих хуков.
- Проверка: типизация без ошибок, отсутствие «мертвых» импортов, ручная проверка меню под ролями super_admin / finance_manager / boss.
- Версия приложения повышается после внесения изменений.
