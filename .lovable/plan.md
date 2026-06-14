# Unified Categories + Universal Expense Editor

Three changes, all aligned to "fin_categories = единственный список категорий".

## 1. Единый список категорий (без связок)

**Сейчас:** две таблицы — `expense_categories` (per-casino, scope, code) ссылается на `fin_categories` через `fin_category_id`. Кассир выбирает из `expense_categories`, а затем строка маппится в Monthly Report по `fin_category_id`. Пересечений много, повторов тоже (Food/Alcohol/Bar charge × 3 scope × несколько казино).

**Станет:** Кассир/менеджер выбирает напрямую из `fin_categories` (where `is_income=false AND is_active=true`). Никакого `expense_categories` в UI.

### UI выбора при создании расхода (`Expenses.tsx`, `New entry` строки)

- Поле `Source` (Live/Slots/Office) — остаётся, потому что определяет кошелёк (cage live shift / cage slots shift / MAIN_CASH) и required-валидацию шифта. Для cashier роли source залочен как сейчас.
- Поле `Category` — заменяется на **Combobox с поиском по имени** (cmdk, как в PlayerNameAutocomplete). При вводе букв фильтрует `fin_categories` по `name ILIKE %q%`. Группировка по `group_code` (fixed/variable/tax/...). Выбор записывает `fin_category_id` прямо в `expenses.fin_category_id`. Поле `category_code` ставится `=fin_categories.name`-slug (или просто `'fin:<id>'` плейсхолдер) для обратной совместимости — но больше нигде не читается из UI.
- Колонка "Fin Category" в таблице расходов удаляется (она теперь = основная Category).

### Бэкенд
- Миграция: добавить `fin_category_id` обязательным для новых `expenses` (NOT NULL только enforce-ом в новых RPC, старые строки остаются как есть для аудита). Существующие данные не трогаем.
- RPC `create_office_expense`, `create_live_expense`, `create_slots_expense`: принимают `p_fin_category_id uuid` напрямую вместо `p_category_code`. Если приходит legacy `category_code` — fallback маппит через `expense_categories.fin_category_id` (одну миграцию для совместимости с offline-queue).
- `expense_categories` таблицу **оставляем как есть** (read-only legacy для уже сохранённых строк), но из всех UI убираем `useExpenseCategories`. Админка `ExpenseCategoriesSettings.tsx` заменяется на ссылку "Categories live in Finances → Categories" (страница уже существует, редактирует `fin_categories`).

## 2. Universal Edit Expense Dialog (с кнопкой OK)

**Новый компонент** `src/components/expenses/EditExpenseDialog.tsx` — `ResponsiveDialog`, размер `form` (560px), доступ только для `manager` / `finance_manager` / `super_admin`.

Поля:
- **Category** — тот же Combobox с поиском по `fin_categories`.
- **Target** — `Casino` / `Player` (+ `PlayerNameAutocomplete`).
- **Amount + Currency** (`TZS|USD|EUR|GBP|KES`). При сабмите `amount_tzs` пересчитывается через `fin_daily_rates` для `business_date` строки (если курса нет — toast "No exchange rate for DD/MM/YYYY").
- **Description**.

Футер: `Cancel` (ghost) · **`OK`** (default — единственный primary). При сохранении: `update_expense_as_manager` RPC (новая), пишет patch в `expenses`, плюс строку в `fin_audit_log` (before/after JSONB, manager_id). Никаких удалений — это правка, не cancel.

**Точки вызова кнопки `Edit` (icon-only, `ghost`, видна только Manager/Finance Manager):**
1. `src/pages/Expenses.tsx` — на каждой строке.
2. `src/pages/finances/FinancesExpensesPage.tsx` — в Monthly Expenses таблице.
3. `src/pages/finances/FinancesMonthlyReportPage.tsx` — в drill-down expense rows (раздел `expenses` категории).
4. `src/components/closings/ExpensesDayReport.tsx` — **печатный отчёт, без кнопки** (он только для print).
5. `src/pages/office/DayClosingsTab.tsx` (Expenses tab) — в списке расходов дня.
6. `src/components/cage/CageHistoryView.tsx` + `src/components/cage-slots/CageSlotsHistoryView.tsx` — в строке `Expenses` внутри шифта.

Существующий `Cancel as manager` (void) остаётся отдельным action — это разные операции.

## 3. Monthly Report: MTD per-category sum + проверка расчётов

В `useMonthlyReport` хуке актуал уже считается из `expenses.amount_tzs` GROUP BY `fin_category_id` (см. `actualMap`). Это правильный пайплайн — расход с любым `fin_category_id` автоматически попадает в Monthly Report.

**Что меняется:**
- В `FinancesMonthlyReportPage.tsx` колонке `Actual` категории показывать **две строки**: `MTD: 1 250 000` (всегда текущий месяц, независимо от выбранного YTD/period) + текущее значение под фильтром. Расчёт MTD: отдельный лёгкий хук `useCategoryMtdActuals(year, currentMonth)` — те же GROUP BY, но всегда month-to-date по `business_date >= '01.MM.YYYY'`.
- Добавить **футер таблицы группы** с суммой `Plan / Actual / Δ` (она уже есть как `totals`, проверим что подсвечивается).
- Добавить **smoke-тест** в `src/test/business-logic.test.ts`: создать 2 расхода (TZS + USD), проверить что `actual_tzs` в репорте = `amount_tzs1 + amount_tzs2`.

**Аудит формулы (sanity check, без правок если ок):**
- `expenses.amount_tzs` — заполняется триггером `expenses_set_amount_tzs` через `fin_daily_rates`. Проверим что для row без курса fallback `= amount` (TZS) и не ноль.
- Income категории (`is_income=true`) не должны попадать в группы расходов — они показываются как separate top block (`incomes.live_game/slots/other`). Проверим что Other Incomes (из `fin_incomes`) корректно конвертируются USD→TZS по средне-месячному курсу.

## Файлы

**Новые:**
- `src/components/expenses/EditExpenseDialog.tsx`
- `src/components/expenses/CategoryCombobox.tsx` (переиспользуется в New entry и Edit)
- `src/hooks/use-edit-expense.ts` (mutation, audit-log)
- `src/hooks/use-category-mtd.ts`
- `supabase/migrations/...` — RPC `update_expense_as_manager(p_id, p_patch jsonb)` с проверкой роли + insert в `fin_audit_log`.

**Изменённые:**
- `src/pages/Expenses.tsx` — Category Combobox, Edit-кнопка, убрать "Fin Category" колонку.
- `src/hooks/use-expenses.ts` + `use-expense-categories.ts` — RPC параметры (`p_fin_category_id`).
- `src/pages/finances/FinancesMonthlyReportPage.tsx` — MTD-колонка, футер с totals.
- `src/pages/finances/FinancesExpensesPage.tsx`, `office/DayClosingsTab.tsx`, `cage/CageHistoryView.tsx`, `cage-slots/CageSlotsHistoryView.tsx` — добавить Edit-кнопку.
- `src/components/admin/ExpenseCategoriesSettings.tsx` — превратить в редирект-ссылку на Finances → Categories.
- `src/hooks/use-fin-monthly-report.ts` — мелкая правка: добавить `mtd_actual_tzs/usd` в `ReportCategory` (опционально, или отдельный хук).
- `src/test/business-logic.test.ts` — новый тест на сумму актуала.

## Что НЕ трогается

- `expense_categories` строки в БД — остаются для аудита старых записей (read-only).
- `fin_category_id` уже существует на `expenses` — менять nullability не нужно для legacy.
- Балансы, кошельки, формулы CDR/Tables — не затрагиваются.
- Печатные отчёты, тиражирование, sync engine.
- Cancel-as-manager и void-логика.

После аппрува сразу запускаю миграцию и редактирование файлов параллельно.