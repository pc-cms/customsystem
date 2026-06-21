## Budget Page — таблица-редактор с месяцами × категориями

Полный редизайн `src/pages/finances/FinancesBudgetPage.tsx`.

### Структура таблицы

**Колонки слева (sticky):**
1. Группа (badge) + Категория
2. Сортировка-кнопка (стрелочки в заголовке)

**Колонки месяцев (Jan..Dec):**
- Каждый месяц = `colspan=2` в верхнем заголовке.
- Под ним два под-заголовка: `TZS` и `USD`.
- Ширина одной под-ячейки ~110px, monospaced tabular-nums, помещает `999 000 000` (9 цифр + разделители).

**Правые sticky колонки:**
- `Plan Year TZS` (Σ TZS за 12 месяцев — если введён 1 месяц → ×12, иначе сумма; та же логика, что в Monthly Report).
- `Plan Year USD` (то же для USD).

**Низ — три sticky строки:**
- Row 1: `Total TZS` — Σ TZS-плана по всем категориям × месяц.
- Row 2: `Total USD` — Σ USD-плана.
- Row 3: `Grand TZS` — TZS + USD × rate, где rate из `fin_daily_rates` (последний USD-курс активного казино за год; fallback — текущий курс из useFinDailyRate).

### Группировка и сортировка

Слева над таблицей (в `belowHeader`):
- Select **Sort by**: `Group → Name` (по умолчанию) / `Name A→Z` / `Plan Year TZS desc` / `Plan Year USD desc`.
- При `Group → Name`: строки рендерятся секциями — для каждой группы заголовочная строка с именем (Fixed expenses, Tax, Variable, ...) и subtotal-строка (Σ TZS/USD/Grand TZS по группе и по месяцам) сразу под категориями группы.
- Sticky левая колонка содержит группу-бейдж + имя.

### Inline-редактирование

- Каждая под-ячейка — `<input type="number">` с `onBlur` коммитом через существующий `useUpsertFinBudget` (передаём `currency: 'TZS' | 'USD'`).
- Tab перемещает фокус слева направо по строке (TZS → USD → next month TZS …).
- Enter сохраняет и переходит на следующую строку в той же колонке.
- Пустая строка / `0` → удалить запись (или сохранить как 0, как сейчас).
- Оптимистичное обновление через invalidate `["fin-budget", year]`.

### Прокрутка и размеры

- Контейнер: `overflow-auto`, `max-h: calc(100vh - 220px)`.
- Sticky: верхний `thead` (2 уровня), левая колонка (Category), правые 2 колонки (Plan Year TZS/USD), нижние 3 totals-строки.
- Не пытаемся уместить в один экран — горизонтальный скролл по 12 месяцам × 2 = 24 под-колонки + 3 sticky.
- Общая мин-ширина таблицы: `200 (cat) + 24×110 (months) + 2×130 (plan year) ≈ 3100px`.

### Удаления

- Убираем глобальный селектор валюты (Select TZS/USD) — обе валюты теперь в таблице.
- Убираем колонку «Plan Year (auto)» — заменяем на две (TZS + USD).

### Где не трогаем

- Хук `useUpsertFinBudget` остаётся как есть (он уже принимает `currency`).
- Таблица `fin_budget` и схема — без изменений.
- Monthly Report остаётся как есть.

### Файлы

- `src/pages/finances/FinancesBudgetPage.tsx` — полная замена.
- Без backend-изменений, без миграций, без bump версии.
