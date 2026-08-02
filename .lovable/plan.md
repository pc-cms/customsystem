# Collections учитываются как реальный вывод денег

## Суть
Collections (инкассация выручки боссом) — это физический вывод денег из казино, а не внутреннее перемещение. Сейчас они исключены из формулы и показаны справочной строкой «Collections (internal move)». Их нужно вычитать из Expected.

## Новая формула
```
Expected = Live + Slots + Other + Card Balance + Miss Chips + Miss Cards − Expenses − Collections
```
Actual и Variance считаются как раньше:
```
Actual (net) = Σ кошельков (физ. пересчёт или ledger) − Starting Float
Variance     = Actual (net) − Expected
```

## Что изменится в интерфейсе
- В разбивке Expected строка Collections становится обычной вычитаемой строкой со знаком «−» (красная), рядом с Expenses, а не серой справочной.
- Подпись меняется с «Collections (internal move)» на «Collections (owner withdrawal)».
- Итог Expected по каждому казино уменьшится на сумму инкассаций за период — Variance соответственно сдвинется.

## Технические детали
- `src/hooks/use-fin-balance.ts` → `computeBalanceTotals`: вычесть `s.collections_total`, обновить комментарий о том, что коллекции — реальный отток.
- `src/pages/finances/FinancesWalletsPage.tsx` (строка ~475): перенести строку Collections в блок вычитаний, убрать `muted`, отображать со знаком минус.
- RPC `fin_balance_snapshot` менять не нужно — `collections_total` уже считается отдельно (категории группы `collections`: CAPEX, Collection (Owner Withdrawal), Inter-Casino Transfer Out, Money Change).
- Уточнение: в группу `collections` сейчас входят также Money Change и Inter-Casino Transfer Out, которые деньги из казино не выводят. Если вычитать всю группу, они попадут в отток ошибочно — предлагаю вычитать только реальные выводы (Collection (Owner Withdrawal), CAPEX), а Money Change / Inter-Casino Transfer оставить нейтральными. Подтвердите или скажу вычитать всю группу целиком.
- Поднять версию в `package.json`.
