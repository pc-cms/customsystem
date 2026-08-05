# Casino Monthly Balance — проверка формул + объяснения в UI

## Что уже проверено в коде

Источник расчётов: `src/hooks/use-daily-balance-report.ts`, отображение: `src/pages/reports/DailyBalanceReport.tsx`.

Текущие формулы по колонкам:

| Колонка | Сейчас считается как |
|---|---|
| Result | `tables_result + (slots_result − players_card_balance) + POS bar` (из `fin_day_closing` / `pos_orders`) |
| Live | Σ `shifts.cash_desk_result` за день |
| Table | `fin_day_closing.tables_result` (fallback — Σ `shifts.tables_result`) |
| Chip Diff | Σ `chip_snapshots.miss × denomination` |
| Slots Diff | Σ `cage_slots_shifts.cash_desk_result − slots_result` |
| Cage Casino | closing cash live-смен + closing inventory слот-кассы, иначе — running-баланс cage-кошельков |
| Transfer → Manager | приходная нога `fin_wallet_tx.kind='transfer'` в `office_safe` |
| Cage Manager | running-баланс `office_safe` на конец дня |
| Transfer → Bank | приходная нога transfer в `bank_account` |
| Bank TZS / Bank USD | running-балансы банковских кошельков, разделённые по валюте кошелька |
| Expenses | Σ `expenses.amount_tzs` (не void) за business_date |
| IN | `fin_wallet_tx.kind='external_income'`, только положительные |
| OUT | `fin_wallet_tx.kind='collection'` (по модулю) |
| Money | Cage Casino + Cage Manager + Bank TZS + Bank USD |
| Balance | `Money + IN − OUT − Expenses` |

## Найденные проблемы формул (подтверждено чтением кода)

1. **Balance двойной счёт.** IN/OUT/Expenses уже проведены по кошелькам и сидят внутри Money, а затем прибавляются/вычитаются ещё раз. Правильно: `Balance = Money` на конец дня, либо `Balance(день) = Money(вчера) + Result + IN − OUT − Expenses` как контрольная проверка.
2. **Bank USD в смешанных единицах.** Стартовый float USD-кошелька прибавляется в исходной валюте, а движения — в TZS (`amount_tzs`). Нужно приводить float к TZS по курсу дня и показывать в подсказке обе величины.
3. **Result не равен сумме своих детальных колонок.** Result = Table + Slots(net) + Bar, а рядом показаны Live / Chip Diff / Slots Diff — другой набор. Нужно либо переименовать группу, либо явно указать в подсказке, что Live/Chip Diff/Slots Diff — это сверочные, а не слагаемые.
4. **Cage Casino смешивает два источника.** При отсутствии закрытия дня берётся running-баланс кошельков, что даёт скачки между днями. Нужно помечать такие дни как «carried» в подсказке.
5. **Transfer → Manager не фильтрует источник.** Любой приход в office_safe (в т.ч. из банка) считается переводом из кассы. Ограничить контр-ногой из cage-кошелька.
6. **Стартовые float игнорируют `starting_float_date`** — дни до этой даты получают завышенный остаток.
7. **Expenses не делит cage / office** (проведение cage-расходов происходит после закрытия дня 07:05), поэтому день может «плясать» до закрытия.

## Что будет сделано

### 1. Исправление формул (hook)
- **Slots Diff = `fin_day_closing.players_card_balance`** (баланс карт игроков за день), а не разница cash desk − declared.
- **Cage Casino = вся касса Live Game + Slots**: закрывающий cash live-смен + закрывающий инвентарь слот-кассы + cashless (`cage_slots_shifts` cashless / `cashless_transactions`) — то есть cash + cashless по обеим кассам. Флаг `cage_carried`, когда данных за день нет и берётся перенос.
- `balance` = `money_total` (остаток на конец дня), плюс поле `balance_check = money_prev + result + in − out − expenses` для сверки в подсказке.
- Bank USD: стартовый float конвертируется по курсу дня; сумма в USD сохраняется для тултипа.
- Учёт `starting_float_date` при накоплении running-балансов.
- Transfer → Manager: только переводы, у которых парная нога — cage-кошелёк.

### 1b. Bank TZS / Bank USD — инлайн-редактор
- Обе колонки становятся редактируемыми прямо в ячейке (как Credit/Deposit): ввод фактического остатка банка на дату.
- Значение сохраняется в `fin_legacy_balance` (поля `bank_account` для TZS и новое поле для USD) по `casino_id + business_date`; ручное значение имеет приоритет над расчётным, расчётное показывается серым плейсхолдером.
- Введённое USD-значение пересчитывается в TZS по курсу дня для Money / Balance.


### 2. Объяснения в UI
- Единый словарь `COLUMN_FORMULAS` (label, формула, источники таблиц, примечания).
- Иконка `Info` в заголовке каждой колонки + тултип с формулой и источниками.
- В строке Total и в KPI-плитках — тултип: как посчитан итог (сумма потоков / последний день для остатков) и из скольких дней.
- В боковой панели дня (Sheet) под каждой строкой — короткая расшифровка формулы и признак «carried / нет данных».

### 3. Липкая сетка
- Заголовок таблицы (`thead`, включая строку групп) — `sticky top-0` с корректными z-index поверх залипающих колонок.
- Залипают первые две колонки: Date и Result (`stickyColumns={[0, 132]}` уже есть — добавить непрозрачный фон и правую границу, чтобы прокрутка не просвечивала).
- Правки в `src/components/ui/smart-table.tsx`: опция `stickyHeader`, чтобы не ломать другие страницы.

### 4. Чистка панели инструментов
- Убрать кнопку «Hide empty» и всю логику скрытия пустых колонок — всегда показываются все колонки (группы раскрываются как раньше).
- Убрать переключатель «Heatmap» из UI; тепловая карта остаётся включённой всегда.
- Только полные числа: `formatMoney(..., "compact")` заменяется на `formatMoneyFull` во всех ячейках, итогах и средних (KPI-плитки уже полные). Ширины колонок увеличиваются под длинные значения.
- Селектор месяца переезжает в центр шапки: стрелки «‹ / ›» по бокам названия месяца (переключение на месяц назад/вперёд) плюс скрытый `input[type=month]` для быстрого выбора.

## Технические детали
- Файлы: `src/hooks/use-daily-balance-report.ts`, `src/pages/reports/DailyBalanceReport.tsx`, `src/components/ui/smart-table.tsx`, новый `src/lib/monthly-balance-formulas.ts`.
- Тултипы — существующий `@/components/ui/tooltip`, на мобильных — открытие по нажатию.
- Версия в `package.json` поднимется до 1.3.516.

