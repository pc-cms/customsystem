# Справка: что показывают Slots / Slot Results и Incomes в Wallets

Без изменений кода — только объяснение текущей механики по коду.

## Исходные данные (один источник сырья)

Все экраны читают одни и те же поля `fin_day_closing` (только **закрытые** бизнес-дни — есть запись в `business_day_closures`):

- `slots_result` = **system result = net_win** из игровой системы (ACE).
- `cashdesk_win` = физический кэш-результат слотов (деньги в кассе слотов).
- `players_card_balance` = деньги игроков на картах, лежащие в клетке.
- `tables_result` = результат live-столов.

Канон: `slots_result` ≠ `cashdesk_win`; Card Balance учитывается **один раз** и только в Wallets Expected.

## Monthly Report (`FinancesMonthlyReportPage.tsx`)

- Строка **Slot Result** = Σ `fin_day_closing.slots_result` (= net_win, системный результат) по закрытым дням месяца (`use-fin-monthly-report.ts:387`, выборка на `:266`).
- Table Result = Σ `tables_result`. Total Income = Table + Slot Result + Bar + Commissions (`:743`).
- Card Balance здесь НЕ входит в доход.

## Boss TV / Dashboard (`src/lib/boss-display-metrics.ts`)

**Today (Live):**
- Slots Drop: свежий ACE `total_drop` (≤15 мин), иначе `drop_slots` закрытого дня, иначе «—».
- Slots Result: свежий ACE `net_win − active_credits`; иначе закрытый день `cashdesk_win − players_card_balance`; иначе «—».
- Total = только Tables + Slots. Hold% = Result/Drop.

**Monthly (MTD) на Boss TV:**
- Только закрытые Day Closings, без ACE. Slots = Σ по дням `cashdesk_win − players_card_balance` (НЕ net_win).

Т.е. Boss TV MTD и Monthly Report используют **разные** формулы слотов: MTD = CashDesk Win − Card Balance, Monthly Report = net_win (system). Это осознанное расхождение (owner-approved).

## Day Closings (Office)

Показывает дневные колонки `fin_day_closing` как есть; ACE-live подмешивается только для открытого дня.

## Wallets → Breakdown «Incomes» (Expected) — RPC `fin_balance_snapshot`

Строки блока (`FinancesWalletsPage.tsx:680-702` → SQL в миграции `20260901161514`):

| Строка | Источник |
|---|---|
| Opening Basic Float | `fin_wallet_float_asof` на начало периода + `add_float` до периода |
| Add Float | `fin_other_incomes` source=`add_float` за период |
| Table Result | Σ `fin_day_closing.tables_result` (закрытые дни) |
| CashDesk Win (slots cash) | Σ `fin_day_closing.cashdesk_win` — именно кэш, не net_win |
| Commissions | `fin_other_incomes` source ∈ other/fee/commission/agent_commission |
| Tips & Bonuses (±) | `fin_other_incomes` source ∈ tips/bonus/tips_bonus |
| Other movements | source ∈ investment/owner_topup/office |
| JP (±) | source = `jp` |
| Card Balance (cash held in cage) | Σ `players_card_balance` — **один раз**, здесь |
| Missed Chips / Cards (±) | `chip_miss_total` из `shifts.closing_count`, `cards_miss` из `cage_slots_shifts` |

Дальше вычитаются: − Expenses (approved, без collection-категорий), − Collections (вкл. signed `source='collection'`), − Transfers (accepted межфилиальные + transfer/money-change expenses).

**Expected = float + incomes − expenses − collections − transfers.**
**Actual** = последний физический пересчёт (`cash_count_snapshots`) внутри периода; ADJ (`kind='adjustment'`) в Expected не входит. **Variance = Actual − Expected.**

Важно: в Expected слотов идёт `cashdesk_win` (физические деньги) + Card Balance отдельной строкой — суммарно это то же, что Boss TV MTD Slots, и это сделано намерено, чтобы Expected отражал реальный кэш.
