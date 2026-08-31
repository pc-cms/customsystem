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

## Согласованные решения (по вашим ответам)

1. База слотов за месяц — **Net Win** (`slots_result`), а не `cashdesk_win`.
2. Card Balance вычитается **каждый день**, со знаком (минус — уменьшает, плюс — увеличивает).
3. Открытый (незакрытый) день в TV Monthly **не учитывается** — как в Monthly Report.
4. Формулы фиксируются в документации и в подсказках (i) на обоих экранах.
5. Дубли ACE-снапшотов чистятся, ставится защита от повторов.

## Единая каноническая формула месяца

```text
Monthly (обе страницы, только закрытые дни):
  Table Result = Σ fin_day_closing.tables_result
  Slot Result  = Σ по каждому дню (slots_result − players_card_balance)   // знак учитывается
  Result       = Table Result + Slot Result
```

## Что изменится по экранам

**Dashboard TV → Monthly**
- Slots Result переходит с `cashdesk_win` на `slots_result` (Net Win).
- Tables Result перестаёт подмешивать живой Chips Check текущего дня — только закрытые дни.
- Tables Drop перестаёт брать открытый день из drop-кэша — считается по закрытым дням.
- Режим **Today** не меняется вообще: там по-прежнему живой ACE и живой Chips Check.

**Report (Company Report)**
- Slot Result: вместо одного вычитания последнего Card Balance месяца — вычитание по каждому дню (`Σ (slots_result − players_card_balance)`) внутри RPC `boss_monthly_report`.
- Остальные строки (Collection, Estimated, Extras, Bonus 5%, Expected Profit, Balance) не трогаем.

## Как будет выглядеть финал

- Строки Table Result / Slot Result / Result в Monthly Report и в TV Monthly дают **одинаковые цифры** по каждому казино.
- Единственная оставшаяся разница между экранами — Drop и Hold, которых в Report просто нет.
- Под каждой строкой в подсказке (i) написано, откуда цифра: «Closed Day Closings only · Net Win − Card Balance».
- Пример по августу после правки: Arusha Slot Result станет одинаковым в обоих местах (сейчас 89 608 350 против 89 065 506).

## Технические детали
- `src/lib/boss-display-metrics.ts:56-68` — `closedDaySlotsResult` переводится на `slots_result − players_card_balance`, тесты в `src/test/boss-display-metrics.test.ts` обновляются.
- `src/hooks/use-boss-dashboard.ts:134-173` — MTD Tables считается только по закрытым дням (без live-снапшота и без открытого дня в drop-кэше).
- Миграция RPC `boss_monthly_report` — per-day вычитание Card Balance вместо `cards_last`.
- `src/hooks/use-boss-monthly-report.ts:141-151` — убрать клиентское вычитание, брать готовую сумму из RPC.
- Чистка дубля `ace_finance_snapshots` (Arusha 20.08) + уникальный индекс `(casino_id, business_date)`.
- Обновление `docs/FINANCE-FORMULAS.md` §2 и §4.

