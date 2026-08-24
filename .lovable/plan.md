# Inter-Casino Transfer 10M: Transfers вместо Other Income + снятие дубля в Мванзе

## Что показала проверка данных

- **Аруша:** приход только ОДИН — проводка по Cash TZS от 08.08 на +10 000 000 (`FLOAT (DEBT) Mwanza`), привязанная к записи Other Income (source `inter_casino_transfer`). В интерфейсе она видна дважды (во вкладке Inter-Casino и в Other Incomes), потому что трансфер ссылается на ту же проводку. Денег в базе один раз — двойного зачисления кассы нет.
- **Мванза:** оттоков ДВА по 10 000 000:
  - 06.08 — ручная проводка по Cash TZS «Send to Arusha!Float replenishment!» (привязана к трансферу как out-сторона, записи расхода нет, поэтому в Expected она не участвует);
  - 17.08 — расход «Inter-Casino Transfer Out / Sent to Arusha for cash flow» со своей проводкой по кошельку (участвует в Expected в строке Transfers).
  По твоему подтверждению это дубль одной и той же отправки.
- Строка **Transfers** сейчас берётся только из расходов с категорией `collections` + «transfer/money change». Реестр `fin_inter_casino_transfers` в расчёт не входит — поэтому у Аруши Transfers = 0, а приход сидит в Other Income.

## Что делаю

1. **Transfers считается из реестра трансферов** (знаково): отправитель −сумма, получатель +сумма, по business date трансфера, с пересчётом в TZS. Статусы `accepted` и `pending` (деньги уже физически вышли).
2. **Убираю двойной счёт в формуле:** записи `fin_other_incomes` с source `inter_casino_transfer` больше не входят в Other Income, а расходы с категорией «Inter-Casino Transfer …» больше не попадают в Expenses/Collections/Transfers — межфилиальные движения живут только в строке Transfers.
3. **Аруша:** запись Other Income по трансферу удаляю, проводку по кошельку сохраняю и перепривязываю к записи трансфера (`ref_table = fin_inter_casino_transfers`). Приход перестаёт дублироваться в списке Other Incomes и уходит в Transfers.
4. **Мванза — снятие дубля:** расход 17.08 «Inter-Casino Transfer Out» гашу сторно-записью (reversal, без удаления — история сохраняется), вместе с его проводкой по кошельку. Реальной отправкой остаётся проводка 06.08, связанная с трансфером и с приходом Аруши 08.08.
5. Подпись строки в UI: `– TRANSFERS (INTER-CASINO ±)`, чтобы знак читался однозначно (у получателя значение положительное).

## Как изменится баланс

**Аруша (август):** Actual (физический факт) не меняется; сумма просто переезжает из Other Income в Transfers.

```text
OTHER INCOME    +10 524 716  →      +524 716
– TRANSFERS               0  →  +10 000 000
= EXPECTED      +130 267 847  →  +130 267 847  (без изменений)
ACTUAL          +129 591 175  →  +129 591 175  (без изменений)
= VARIANCE          −676 672  →      −676 672  (без изменений)
```

**Мванза (август):** дубль снимается, а реальная отправка попадает в Transfers.

```text
– TRANSFERS (расход 17.08)   −10 000 000  →  сторнируется (0)
– TRANSFERS (трансфер 06.08)           0  →  −10 000 000
= EXPECTED                       без изменений по сумме
Ledger кошелька Cash TZS         +10 000 000 (возврат сторнированного дубля)
ACTUAL (пересчёт)                не меняется
```

Итог: суммарно ни в одном казино деньги не появляются и не исчезают — устраняется дублирующая проводка в Мванзе и дублирующее отображение прихода в Аруше, а межфилиальные движения обеих сторон видны в одной строке Transfers с правильным знаком.

## Техническая часть

- Миграция: `CREATE OR REPLACE FUNCTION public.fin_balance_snapshot` — `v_transfers` считается из `fin_inter_casino_transfers` (in по `to_casino_id`, out по `from_casino_id`, курс из `fin_daily_rates`); из CTE `other` и блока `v_incomes` исключается `source = 'inter_casino_transfer'`; из `v_expenses`/`v_collections`/`v_transfers` исключаются расходы с transfer-категориями; те же правки в дневных строках `daily`.
- `run_sql`: (а) перепривязка `fin_wallet_tx` 63e8efeb… на `fin_inter_casino_transfers` и удаление записи `fin_other_incomes` 23cbbab5…; (б) сторно расхода 850e949b… (17.08, Мванза) и его проводки c5bc2d6c… по правилам иммутабельности (reversal-запись, не удаление).
- Фронтенд: в `computeBalanceTotals` (`src/hooks/use-fin-balance.ts`) Transfers прибавляется со своим знаком вместо вычитания; подпись строки в `src/pages/finances/FinancesWalletsPage.tsx`.
- Проверка после применения: Аруша — Other Income −10М, Transfers +10М, Expected/Actual/Variance без изменений; Мванза — один транcфер −10М в Transfers, дубль виден только как сторно в истории.
- Версия приложения → 1.3.661.
