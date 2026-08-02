# Collections учитываются как реальный вывод денег (отдельно от трансферов)

## Суть
Инкассация выручки боссом — это физический вывод денег из казино. Сейчас вся группа `collections` исключена из формулы и показана одной серой строкой «Collections (internal move)». Разделяем её на две части:

- **Collections (вывод денег)** — категории `Collection`, `CAPEX`. Вычитаются из Expected.
- **Transfers (внутреннее движение)** — категории `Inter-Casino Transfer Out`, `Money Change`. Нейтральны, в Expected не входят, показываются справочной строкой.

## Новая формула
```
Expected = Live + Slots + Other + Card Balance + Miss Chips + Miss Cards − Expenses − Collections
Actual (net) = Σ кошельков (физ. пересчёт или ledger) − Starting Float
Variance     = Actual (net) − Expected
```

## Интерфейс
- Строка «Collections (owner withdrawal)» — красная, со знаком «−», рядом с Expenses.
- Строка «Transfers (internal move)» — серая справочная, в сумму не входит.

## Технические детали
- RPC `fin_balance_snapshot`: разделить текущий `v_collections` на два поля — `collections_total` (только `Collection` и `CAPEX`) и новое `transfers_total` (`Inter-Casino Transfer Out`, `Money Change`). Расчёт `v_expenses` (все прочие категории) не меняется.
- `src/hooks/use-fin-balance.ts`: добавить `transfers_total` в тип `BalanceSnapshot`, в `computeBalanceTotals` вычесть `collections_total` из Expected.
- `src/pages/finances/FinancesWalletsPage.tsx` (~строка 475): две строки вместо одной, как описано выше.
- Поднять версию в `package.json`.
