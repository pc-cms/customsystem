# Wallets vs Casino Monthly Balance: где расходятся деньги

Ниже — построчное сравнение двух моделей и список того, что нужно добавить в Casino Monthly Balance (CMB), чтобы его Variance означал то же самое, что Variance в Wallets.

## Как считает Wallets (RPC `fin_balance_snapshot`)

```text
Expected = Starting Float (по кошелькам)
         + Live (fin_day_closing.tables_result)
         + Slots (fin_day_closing.slots_result)
         + Other Incomes (кроме JP) + JP
         + Card Balance (players_card_balance)
         − Miss Chips − Miss Cards      (в RPC они уже с минусом)
         − Expenses (approved, день закрыт; office — сразу)
         − Collections
Actual   = Σ по кошелькам последнего снимка cash_count_snapshots (иначе starting float)
Variance = Actual − Expected
```

## Как считает Casino Monthly Balance (`use-daily-balance-report.ts`)

```text
Result      = Tables + (Slots − Card Balance) + Bar
Diff        = Miss Chips (+) + Card Balance (+)
Money Total = Cage Casino (закрытия смен Live+Slots: касса+cashless)
            + Cage Manager (running ledger office-кошельков)
            + Bank TZS + Bank USD (running ledger bank-кошельков)
            + Terminal (closing_count.bank за день)
Variance    = Opening + Result + Diff + Fees + OfficeNet − Expenses − Money Total
```

## Расхождения (по источникам)

1. **Actual считается по-разному.** Wallets = только физические снимки (`cash_count_snapshots`). CMB = ledger по движениям кошельков + касса из закрытий смен. Если снимка не делали, Wallets покажет float, а CMB — реальный ledger. Это главный источник расхождения на уровне «денег».
2. **Касса (Cage) в CMB берётся не из кошельков, а из `shifts.closing_count` / `cage_slots_shifts`.** Если в казино заведены кошельки `cage_table` / `cage_slot`, одна и та же касса присутствует в обеих моделях по разным источникам — цифры не совпадают по определению.
3. **Terminal.** В CMB он прибавляется к Money Total как дневной поток, при этом эти же деньги позже приходят на банковский кошелёк. Как только транзакция в банк проведена, сумма считается дважды.
4. **Знак Miss Chips противоположный.** В Wallets `missed_chips` уходит в Expected со знаком «минус», в CMB `chip_difference` прибавляется к Diff со знаком «плюс». По одному и тому же дню две страницы дадут разницу в 2 × Miss.
5. **Card Balance.** В CMB он вычитается в Slots и тут же прибавляется в Diff (итог 0). В Wallets `slots_result` берётся полностью, и `card_balance` добавляется сверху — риск двойного учёта карт.
6. **Bar / POS.** Входит в Result в CMB, полностью отсутствует в Expected Wallets.
7. **JP и Other Incomes.** Wallets учитывает все `fin_other_incomes` (+ JP отдельно). CMB берёт только строки с `source = 'fee'`; прочие Other Incomes и JP в отчёт не попадают.
8. **Расходы фильтруются по-разному.** Wallets: только `approved = true`, `reversal_of is null` и только при закрытом бизнес-дне (office — сразу). CMB: все не-voided расходы дня без проверки approved и без ожидания закрытия дня. Не утверждённые расходы попадают только в CMB.
9. **Collections.** Wallets вычитает их отдельной строкой из Expected. В CMB они исключены из Expenses и должны сидеть в Office OUT, который теперь заполняется вручную — сейчас это просто не учитывается.
10. **Стартовая точка.** Wallets = сумма `starting_float_amount` по кошелькам. CMB = строка Start из `fin_month_start`. Если Start заполнен не полностью (как было по Аруше), Variance уезжает на всю недостающую сумму.

## Рекомендации: что добавить в Casino Monthly Balance

1. **Единый источник Actual.** Money Total собирать из тех же кошельков, что и Wallets (снимок `cash_count_snapshots` на конец дня), а закрытия смен использовать как источник снимка кассы, а не как отдельный столбец денег.
2. **Убрать Terminal из Money Total**, оставив его информационной колонкой потока (или помечать проведённые в банк суммы, чтобы исключить двойной счёт).
3. **Привести знаки к Wallets:** Miss Chips — минус, Miss Cards — минус (сейчас Miss Cards в CMB вообще нет, добавить колонку).
4. **Card Balance учитывать один раз** — выбрать: либо Slots gross + Card Balance, либо Slots net без Diff.
5. **Добавить колонки JP и Other Incomes** (не только fee), чтобы Result CMB совпадал с Incomes Wallets.
6. **Согласовать фильтр расходов:** только `approved`, без reversal, и учёт после закрытия бизнес-дня (office — сразу), как в RPC.
7. **Добавить колонку Collections** с тем же определением, что в RPC (группа `collections`, кроме transfer / money change), и вычитать её из ожидаемого.
8. **Строку Start валидировать:** предупреждение в UI, если `fin_month_start` пустой или не совпадает с суммой кошельков на дату старта.
9. **Панель расшифровки Variance по дню** (как в Wallets Breakdown): Opening → Result → Diff → Incomes → Expenses → Collections → Money Total, чтобы расхождение читалось глазами.

## Технические детали

- Источник Wallets: RPC `fin_balance_snapshot` + `src/hooks/use-fin-balance.ts` (`computeBalanceTotals`).
- Источник CMB: `src/hooks/use-daily-balance-report.ts` (функция `cmb`), рендер `src/pages/reports/DailyBalanceReport.tsx`, подписи формул `src/lib/monthly-balance-formulas.ts`.
- Реализация правок: расширить `DailyBalanceRow` полями `jp`, `other_income`, `missed_cards`, `collections`; переключить `cage`/`manager`/`bank` на снимки кошельков; обновить `COLUMN_FORMULAS`; поднять версию в `package.json`.
