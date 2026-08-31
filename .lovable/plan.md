# Почему месячные цифры расходятся: источники, формулы, план унификации

## Коротко

Это два разных конвейера расчёта, а не ошибка ввода данных.

- **Report (Company Report)** — серверный RPC `boss_monthly_report`. Только ЗАКРЫТЫЕ дни (`business_day_closures`). P&L-логика.
- **Live TV (месячный режим)** — клиентский расчёт в `use-boss-dashboard.ts`. Закрытые дни + ТЕКУЩИЙ открытый день по живым Chips Check. Операционная логика.

## Формулы и источники (проверено в коде и БД)

### Report tab — `boss_monthly_report`
| Строка | Источник / формула |
|---|---|
| Table Result | `Σ fin_day_closing.tables_result`, только дни из `business_day_closures` |
| Slot Result | `Σ fin_day_closing.slots_result − players_card_balance` (карта берётся **один раз**, последний день месяца с ненулевым балансом) |
| Result (Table+Slot) | Table + Slot |
| Collection | `expenses` с `fin_categories.group_code='collections'`, в TZS по дате-курсу |
| Estimated Expenses | `fin_budget.planned_amount` + FX |
| Extra Expenses | `boss_report_extras` + синтетический бонус 5% = `max(0, Result − Estimated) × 0.05` |
| Expected Profit | `(Result / закрытых дней) × дней в месяце − Estimated − Extras − Collection` |
| Balance | `Result − Estimated − Extras − Collection` |

### Live TV (Monthly)
| Строка | Источник / формула |
|---|---|
| Tables Drop | `Σ player_day_drop_cache.peak` через `compute_daily_diff` — **все дни, включая открытый** |
| Tables Result | `Σ fin_day_closing.tables_result` (без сегодня) **+ живой Chips Check сегодня** (`chip_snapshots_latest`: Σ (actual − expected) × номинал) |
| Slots Drop | `fin_day_closing.drop_slots`, иначе `cage_slots_shifts.manual_drop_slots` |
| Slots Result | `Σ по каждому дню (cashdesk_win − players_card_balance)` |
| Total / Hold | Tables + Slots; Hold = Result / Drop × 100 |
| ACE live | В месячном режиме НЕ используется (только в режиме Today) |

### Три конкретные причины расхождения
1. **Открытый день**: Report его исключает, TV включает Tables по живым Chips Check (Arusha: 115 101 500 в Report против 115 611 500 на TV).
2. **Разная база слотов**: Report берёт `slots_result` (Net Win), TV — `cashdesk_win` (физическая касса). За август по БД: Arusha `slots_result` 89 635 980 против `cashdesk_win` 89 226 132; Mwanza 408 222 299 против 398 599 143.
3. **Card Balance**: Report вычитает его ОДИН раз за месяц, TV — КАЖДЫЙ день. Это системная разница, которая растёт к концу месяца.

Дополнительно найден дефект данных: в `ace_finance_snapshots` есть дубль Arusha за 20.08.2026 (две записи, 81 835 090 и 78 167 894) — влияет на режим Today.

## Где «правильно»

Обе цифры верны в своих терминах, но они не должны называться одинаково:
- **Report = P&L (Net Win)** — источник истины для прибыли, бюджета и бонусов. Это то, по чему считаются деньги месяца.
- **Live TV = операционная картина «прямо сейчас»**, включая ещё не закрытый день и физическую кассу слотов.

## Что предлагается сделать

1. Привести месячные слоты к одной канонической формуле: TV Monthly переводится на `slots_result` (Net Win) − Card Balance, как в Report, чтобы строка «SLOTS RESULT» означала одно и то же везде.
2. Согласовать Card Balance: единое правило — вычитать последний Card Balance месяца один раз (как в Report), а не каждый день.
3. Подписать открытый день: в TV Monthly добавить пометку, что текущий незакрытый день входит в Tables по Chips Check, а в слотах не участвует.
4. Вынести обе формулы в `docs/FINANCE-FORMULAS.md` и в подсказки (i) на обоих экранах, чтобы источник каждой строки читался прямо в интерфейсе.
5. Убрать дубликат ACE-снапшота Arusha 20.08 и добавить уникальный индекс `(casino_id, business_date)` в `ace_finance_snapshots`, чтобы дубли не появлялись снова.

## Технические детали
- `src/hooks/use-boss-monthly-report.ts:141-151` — вычитание Card Balance один раз.
- `src/lib/boss-display-metrics.ts:56-68` (`closedDaySlotsResult`) — `cashdesk_win − players_card_balance`; сюда вносится канон.
- `src/hooks/use-boss-dashboard.ts:134-173` — месячная агрегация TV.
- RPC `boss_monthly_report` — гейт по `business_day_closures`.
