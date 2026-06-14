
# Monthly Report — Collections, Totals, Category Guard

## 1. Collections (Owner Withdrawal) — двойное отображение

Категория `Collection (Owner Withdrawal)` уже существует (`group_code='income'`, `is_income=false`). Сейчас она невидима в Monthly Report, потому что `GROUP_ORDER` исключает `income`.

**Решение — и то, и другое:**

**A) Новая группа в основной таблице** (`use-fin-monthly-report.ts`):
- Добавить `'collections'` в `GROUP_ORDER` после `additional`.
- Миграция: создать `group_code='collections'`, `group_name='Collections & Owner Withdrawals'`, перенести туда категорию `Collection (Owner Withdrawal)` (`is_income=false`). Также перенести `CAPEX`, `Inter-Casino Transfer Out`, `Money Change` (они тоже `is_income=false` в `income` группе и логически не "доходы", а движения вне P&L).
- Группа отображается обычной таблицей Plan vs Actual со всеми колонками и группой Total.

**B) KPI-блок «Net After Collections» в Grand Total секции:**
- Добавить два KPI: `Collections TZS` (сумма actual по группе collections), `Net Cash After Collections = Incomes.total − Expenses(без collections) − Collections`.
- Сами Collections **не** включаются в `grand.actual_tzs` основных расходов (чтобы не дублировались с операционными расходами), а вычитаются отдельной строкой.

**Код:**
- В хуке выделить новую группу `collections`, считать `collections_total` отдельно.
- В `MonthlyReport` тип добавить `collections: { total_tzs, total_usd, expenses: ReportExpense[] }`.
- Grand total `actual_tzs` остаётся **операционным** (без collections) → корректное сравнение с бюджетом.
- Revenue USD KPI пересчитать: `(incomes.total − expenses_ops − collections) / usdRate`.

## 2. Группы без бюджета — фикс суммирования

Текущий код в `useMonthlyReport` уже добавляет все активные non-income категории в `byGroup`, поэтому категории отображаются. Но **проблема**: `GROUP_ORDER.filter((g) => byGroup.has(g))` — если в группе ни у одной категории нет ни plan, ни actual, она всё равно появляется (это ОК). А вот totals row показывает `fmt(0) = '—'` — визуально кажется пустой.

**Фикс:**
- В `fmt()` для totals row показывать `0` вместо `—`, когда у группы есть категории (хотя бы одна с actual>0). Сейчас `fmt = (n) => n ? formatNumberSpaces(n) : '—'`.
- Group Total и Grand Total: если `actual_tzs > 0` ИЛИ `plan_month_tzs > 0` — показывать число (включая 0). Иначе `—`.
- Проверить: убедиться что Group Total корректно суммирует `actual_tzs` даже если все `plan_month_tzs = 0` (логика уже правильная, но добавить тест: открыть месяц с реальными расходами в Mwanza без бюджетов и убедиться, что Group Total и Grand Total Actual колонка показывает суммы).

## 3. Запрет удаления категории при наличии расходов

**Миграция:** триггер `BEFORE DELETE` на `fin_categories`:
```sql
IF EXISTS (SELECT 1 FROM expenses WHERE fin_category_id = OLD.id LIMIT 1) THEN
  RAISE EXCEPTION 'Cannot delete category "%": has linked expenses. Move them first.', OLD.name;
END IF;
-- то же для fin_budget и fin_incomes
```

**UI** (`src/components/admin/ExpenseCategoriesSettings.tsx` или где удаление):
- Перед удалением `SELECT count(*) FROM expenses WHERE fin_category_id=...`
- Если > 0 — disabled кнопка Delete с tooltip «Has N linked expenses».
- Soft-delete (`is_active=false`) остаётся доступным всегда.

## 4. Auto version bump

`package.json` patch (миграция + триггер).

## Technical details

**Files to edit:**
- `src/hooks/use-fin-monthly-report.ts` — добавить группу `collections`, выделить collections в отдельное поле, передать в UI
- `src/pages/finances/FinancesMonthlyReportPage.tsx` — рендер группы Collections (как обычная GroupTable), KPI «Collections» и «Net After Collections» в Grand Total, fix `fmt` для totals (показывать 0)
- `src/components/admin/ExpenseCategoriesSettings.tsx` — disable Delete если есть расходы, показать счётчик
- `package.json` — bump patch

**Migration:**
- Создать `group_code='collections'` группу
- `UPDATE fin_categories SET group_code='collections', group_name='Collections & Owner Withdrawals' WHERE name IN ('Collection (Owner Withdrawal)', 'CAPEX', 'Inter-Casino Transfer Out', 'Money Change')`
- Триггер `fin_categories_prevent_delete_with_expenses`
- GRANT и RLS не меняются (категории уже public-read)

**XLSX export:** добавить секцию Collections перед Grand Total.

## Out of scope (не делаем)
- Реклассификация старых 251 расхода (пользователь сказал «всё ок»).
- Auto-fallback в «Others Expenses» при удалении — заменено на запрет удаления.
