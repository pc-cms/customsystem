# Отключить STORNO везде + удаление/правка для Finance Manager с аудитом

Сейчас сторно осталось в трёх местах: Office → Tips & Bonuses (кнопка Reverse), Office → Commissions/Other Incomes (правка = сторно + новая строка, кнопка Reverse), Extra Expenses в Monthly Report и Boss Dashboard (кнопка Storno, помечает `voided_at`). JP уже переведён на настоящее удаление — берём его как образец.

## Что получит пользователь

- Кнопки **Reverse / Storno** исчезают из всех финансовых списков.
- Вместо них — **Edit** (прямая правка записи) и **Delete** (корзина с подтверждением).
- Права: **finance_manager** и **super_admin** — правка и удаление; остальные роли (manager) — только добавление, как сейчас.
- Каждая правка и удаление пишется в финансовый аудит-лог: кто, когда, что было и что стало. История сторно-строк за прошлые периоды остаётся видимой и читаемой — ничего не переписываем.
- Кошельки пересчитываются автоматически: удаление записи удаляет и зеркальную операцию кошелька, правка обновляет её.

## Технические детали

База (одна миграция):

1. Триггерная функция `tg_fin_audit()` на `fin_other_incomes` и `boss_report_extras` (AFTER INSERT/UPDATE/DELETE) — пишет `fin_audit_log` (actor = `auth.uid()`, before/after = `to_jsonb`). Сейчас в `fin_audit_log` никто не пишет.
2. RPC `fin_other_income_delete(p_id)` — SECURITY DEFINER, доступ только `can_finance()` / `super_admin`, удаляет строку (существующий `trg_foi_delete` уже снимает зеркальную `fin_wallet_tx`), плюс снимает ссылку `reversed_by_id` у связанной пары, как это делает `fin_jp_delete_entry`.
3. RPC `fin_other_income_update(...)` — прямая правка без сторно (дата, кошелёк, категория, source, сумма, note); те же права; блокируется, если месяц закрыт (`tg_float_closed_guard` / `tg_closed_month_guard` остаются в силе).
4. RPC `fin_unplanned_delete(p_id)` для `boss_report_extras` — удаляет строку в обход `trg_unplanned_no_delete` (guard пропускает вызов из этой функции); уже оплаченные записи откатывают связанную операцию кошелька.
5. `fin_unplanned_reverse` и `fin_other_income_replace` остаются в базе для совместимости, но UI их больше не вызывает.

Фронтенд:

- `src/hooks/use-other-incomes.ts`: `useReverseOtherIncome` помечается deprecated и убирается из UI; `useUpdateOtherIncome` переводится на новый RPC прямой правки (без сообщения «storno + new entry»); добавляется `useDeleteOtherIncome` на новый RPC (сейчас это алиас на reverse).
- `src/hooks/use-fin-month-finance.ts`: добавить `useDeleteUnplanned`, `useReverseUnplanned` убрать из UI.
- `src/pages/office/TipsBonusTab.tsx`, `src/pages/office/OtherIncomesTab.tsx`: кнопка Undo2 → корзина с подтверждением, правка через новый прямой update; кнопки видны только finance_manager / super_admin.
- `src/components/boss/UnplannedExpensesDialog.tsx` и `MonthlyReportActions.tsx`: Storno → Delete.
- Строки-сторно из прошлого продолжают отображаться и исключаться из сумм, как сейчас.

Проверка: типы, `vitest run`, сборка, bump версии.
