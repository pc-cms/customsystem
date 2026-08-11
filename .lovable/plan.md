# Start-строка Casino Monthly Balance + чистка Statistics → Slots

## Что я проверил в базе

- `fin_day_closing` Аруша 10.08: `cashdesk_win = 3 427 362`, `slots_result = 3 427 362`, `tables_result = 372 000` — цифра внесена, Slots в отчёте теперь считается.
- `fin_day_balance_snapshot` Аруша 10.08: `cage_manager = 24 876 644`, `bank_tzs = 9 455 794`, `bank_usd = 1 147 848` — снимок записан.
- `fin_month_start` (все 4 казино, month = 2026-08-01): `start_date = 2026-08-10`, но **все суммы нули** — `cage_casino 0, cage_manager 0, bank_tzs 0, bank_usd 0`.

Причина расхождения: строка **Start** в отчёте берётся не оттуда, куда её вводят. Плитка «Starting Balance» пишет одно число в `localStorage` браузера, а хук отдаёт приоритет строке `fin_month_start` — раз она существует (с нулями), ручное значение игнорируется. Поэтому Opening = 0, и весь Money конца дня уходит в минус баланса (~−64 млн).

## Что делаем

### 1. Start становится реальной строкой в базе
- Строка «Start» в таблице делается редактируемой по ячейкам: **Cage Casino, Cage Manager, Bank TZS, Bank USD, Terminal**.
- Значения сохраняются в `fin_month_start` (по казино + месяцу), а не в `localStorage`.
- Плитка «Starting Balance» показывает сумму строки Start (только чтение), ручной ввод из localStorage убирается — источник один.
- Opening первого видимого дня = сумма Start; если строка Start пустая, отчёт явно помечает это (подсказка «Start не заполнен»), чтобы минус не выглядел ошибкой расчёта.

### 2. Statistics → Slots: убрать раскрытие строк
- В `SlotsHistoryReport.tsx` убираем состояние `expandedId`, стрелки Chevron, кликабельность строки и разворачиваемый блок деталей. Остаётся плоская таблица + кнопка печати.

## Технические детали

- `src/hooks/use-daily-balance-report.ts`: `startingBalance` берётся из `fin_month_start` как есть; убирается тихий фолбэк на `manualStart`; отдаётся флаг `start_missing`, когда все поля нулевые.
- `src/pages/reports/DailyBalanceReport.tsx`: строка `kind: "start"` рендерит редактируемые ячейки (по образцу `ManualCell`) с upsert в `fin_month_start` и `invalidateFinance(qc)`; `startKey`/`localStorage`/`StartingBalanceTile` (ввод) удаляются.
- `src/components/reports/SlotsHistoryReport.tsx`: удалить `expandedId`, `isExpanded`, `aria-expanded`, `ChevronDown/ChevronRight` и блок деталей.
- Изменений схемы не требуется — колонки в `fin_month_start` уже есть.

После внедрения пришлите фактические остатки на утро 10.08 (Cage Casino, Cage Manager, Bank TZS, Bank USD) по каждому казино — либо введёте их прямо в строке Start.
