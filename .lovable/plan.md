## Что добавляем

На странице `Monthly Expenses` (`src/pages/finances/FinancesExpensesPage.tsx`) в `PageHeader` рядом с «New Expense» появятся две кнопки:

- **Export Excel** (icon `FileSpreadsheet`, `variant="outline"`)
- **Print** (icon `Printer`, `variant="outline"`)

Обе действуют по текущему отфильтрованному списку `visible` (тот же набор, что показан в таблице — учитывают период, категорию, кошелёк, поиск, флаг "Show voided").

## Excel export

Используем существующий `downloadXlsx` из `src/lib/excel-export.ts`. Колонки:

| Date | Category | Wallet | Description | Amount (TZS) | Currency | Original Amount |
|---|---|---|---|---|---|---|

- `Date` — `r.business_date` (YYYY-MM-DD как в БД, без переформатирования — Excel сам поймёт).
- `Category` — `r.fin_categories?.group_name · r.fin_categories?.name`.
- `Wallet` — `r.fin_wallets?.name` (только в Excel).
- `Description` — `r.description`.
- `Amount (TZS)` — `r.amount_tzs || r.amount` числом.
- `Currency` + `Original Amount` — оригинальная сумма для не-TZS строк (для TZS пусто).
- Последняя строка — Total по `Amount (TZS)`.
- Voided строки помечаем суффиксом `[VOID]` в Description и amount = 0 (как в KPI), чтобы итог совпал с UI.
- Имя файла: `Monthly_Expenses_<from>_<to>.xlsx`.

## Print

Открываем новое окно (`window.open("", "_blank")`) с сгенерированным HTML и вызываем `window.print()`. Структура печатной страницы:

- Заголовок: «Monthly Expenses» + период `from — to` + имя текущего казино (из `FinanceCasinoSwitcher` контекста, читаем из того же места, что и страница).
- Таблица с 4 колонками: **Date · Category · Description · Amount** (без Wallet).
- Сумма Total внизу.
- Минимальный inline CSS: A4 portrait, моноширинный шрифт для чисел, `@media print` скрывает кнопки браузера, `border-collapse`, мелкий шрифт ~10pt, повторяющийся `<thead>` через `thead { display: table-header-group }`.
- Voided строки — серым/зачёркнутым, в Total не идут.

## Технические детали

- Добавить импорты `Printer`, `FileSpreadsheet` из `lucide-react`, `downloadXlsx` из `@/lib/excel-export`.
- Извлечь два хелпера прямо в файле страницы: `handleExportExcel()` и `handlePrint()` — они используют `visible`, `range`, `totalTzs`.
- В `embedded` режиме кнопки не показываем (так же, как сейчас прячется весь `PageHeader`).
- Кнопки видимы всем ролям, у кого есть доступ к странице (не только canManage) — экспорт/печать read-only.
- Никаких изменений данных, миграций, бекенд-функций. Версию не бампим (чисто UI).

## Проверка

- Открыть `/finances/expenses`, поменять период / категорию / "Show voided" → нажать Print → в превью браузера 4 колонки, итог совпадает с KPI Total TZS.
- Нажать Export Excel → файл `Monthly_Expenses_YYYY-MM-DD_YYYY-MM-DD.xlsx` с 7 колонками + Total в конце.
