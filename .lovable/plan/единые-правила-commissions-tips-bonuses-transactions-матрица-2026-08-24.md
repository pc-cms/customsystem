# Единые правила: Commissions / Tips / Bonuses / Transactions + матрица формул

## Что реально расходится (проверено по коду и по функции баланса)

Monthly Report и Wallets считают одни и те же вещи по разным правилам:

| Показатель | Wallets (функция баланса) | Monthly Report |
|---|---|---|
| Commissions / Other | все записи «прочих доходов», кроме JP и межфилиальных переводов — то есть tips, bonus, investment, owner top-up, refund, fee, other | только «настоящий доход»: other, refund, fee |
| Отменённые записи | исключаются и сторно, и оригинал (reverses_id и reversed_by_id) | исключается только сторно, оригинал остаётся в сумме |
| Расходы | только approved и только если день закрыт (или запись из Office) | все не-удалённые записи с категорией, независимо от approved/закрытия дня |
| Курс USD | последний курс смены/дня (fallback 2600) | средний курс USD за период |
| Live / Slots | Σ Day Closing за период | Σ Day Closing за период (совпадает) |

Отсюда и разные цифры.

## Что сделаем

### 1. Один общий словарь источников

- **Commissions** — только `other`, `refund`, `fee`.
- **Tips & Bonuses** — `tips`, `bonus`, старое `tips_bonus`; отдельный показатель, в Commissions не входит.
- **JP** — отдельно, как сейчас.
- **Transfers** — только реестр межфилиальных переводов, в доходы не входит.
- **Transactions (прочее движение)** — investment, owner top-up: двигают кошельки, но не доход.

### 2. Wallets

- Новая строка **Tips & Bonuses** (может быть + и −) сразу под Commissions.
- Новая строка **Other movements** (investment / owner top-up) — чтобы Expected раскладывался полностью и был проверяемым.
- Commissions становятся чистыми: только other/refund/fee.
- Исключение сторно применяется единообразно (оригинал + сторно).

### 3. Monthly Report

- Строка **Commissions** — по тому же словарю.
- Добавляются справочные строки **Tips & Bonuses** и **JP** (вне суммы дохода), чтобы страница сходилась с Wallets.
- Правила расходов выравниваются с Wallets: approved и закрытый день (Office-записи всегда), исключение сторно.
- Курс USD: единое правило — курс дня записи, иначе последний курс на конец периода (как в Wallets).

### 4. Dashboard TV / Day Closings / Statistics

Логику Drop/Result там не меняем — она уже из Day Closing и кэша Drop; только сверяем и фиксируем формулы в документе, а расхождения в подписях приводим к общим названиям (Net Win, Drop, Hold%).

### 5. Матрица формул (документ)

Создаётся `docs/FINANCE-FORMULAS.md` с матрицей по страницам: Day Closings, Monthly Report, Wallets, Dashboard TV, Statistics Live, Statistics Slots — по каждому показателю: источник данных, формула, что включено/исключено, зависимость от закрытия дня. Матрица также выводится в чат при сдаче работы.

Черновик содержания матрицы:

```text
Day Closings     Tables Result = Σ per-shift tables result (chips)
                 Slots Result  = Cashdesk Win − Players Card Balance
                 Drop Live     = Σ peak(player_day_drop_cache)
                 Drop Slots    = ACE drop_slots
Monthly Report   Live Game     = Σ Day Closing tables_result
                 Slots         = Σ Day Closing slots_result
                 Commissions   = Σ other/refund/fee (fx → TZS)
                 Expenses      = Σ approved expenses by category (closed days + office)
Wallets          Expected      = Starting Float + Live + Slots + Card Balance + Commissions
                                 + Tips&Bonuses + JP + Other movements − Expenses
                                 − Collections − Transfers − Missed chips/cards
                 Actual        = Σ last physical count per wallet
                 Variance      = Actual − Expected
Dashboard TV     Drop/Net Win/Hold% per casino, MTD = closed days + today live
Statistics Live  Drop per player/table, Result from chip snapshots
Statistics Slots ACE feed: Drop, Active Credits, Cashdesk Win, Net Win
```

## Технические детали

- Миграция `public.fin_balance_snapshot`: разделить `oth` на `other` (other/refund/fee), `tips_bonus` (tips/bonus/tips_bonus), `movements` (investment/owner_topup); те же поля добавить в элементы `daily`.
- `src/hooks/use-fin-balance.ts`: типы и слагаемые Expected (сумма итога не меняется, только детализация).
- `src/pages/finances/FinancesWalletsPage.tsx`: строки Tips & Bonuses и Other movements.
- `src/hooks/use-other-incomes.ts`: экспорт единых наборов `COMMISSION_SOURCES`, `TIPS_BONUS_SOURCES`, `MOVEMENT_SOURCES`; использовать их во всех потребителях вместо локальных списков.
- `src/hooks/use-fin-monthly-report.ts`: фильтр `reversed_by_id is null`, выравнивание фильтров расходов, справочные строки Tips&Bonuses / JP, единое правило FX.
- RPC `boss_monthly_report`: те же наборы источников.
- `src/lib/blanks/daily-balance-blank.ts` и печать Monthly: добавить новые строки.
- Новый документ `docs/FINANCE-FORMULAS.md`.
- Версия приложения: 1.3.663.

Не входит в объём: перенос записей между Transactions и Tips & Bonuses при редактировании — это отдельная предыдущая задача, сделаем её в этой же итерации только если подтвердите.
