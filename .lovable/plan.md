# Expected в Arusha — фиксация правила и ответ про LEDGER

## Ответ: LEDGER не влияет на общий Expected

Проверено по исходнику `fin_balance_snapshot`. Общий Expected филиала не читает таблицу движений кошельков ни одной строкой. Он собирается только из:

- Opening Float
- Table Result закрытых дней (`fin_day_closing.tables_result`)
- Slots CashDesk Win закрытых дней (`fin_day_closing.cashdesk_win`)
- Office Income: Commissions, Tips & Bonuses, Movements (investment/owner_topup/office), JP — все из `fin_other_incomes`
- Add Float
- Chip Miss, Card Miss
- минус approved Expenses (из `expenses`)
- минус Collections (Expenses категории Collection минус Other Income источника collection)
- минус принятые межфилиальные переводы (`fin_inter_casino_transfers`) и Money Change

Движения кошельков (`fin_wallet_tx`) используются ровно в одном месте — в колонке Ledger **по каждому кошельку**, и там уже исключён `adjustment`. Эта колонка показывает, как деньги разложены между кошельками. На сумму Expected филиала она не влияет.

Поэтому Variance в Arusha не может быть вызван строками Money In / Money Out. Моё прошлое предложение переклассифицировать их в ADJ было ошибочным и снято — оно ничего бы не исправило и только испортило бы историю.

## Железное правило

```text
Expected филиала = Opening Float + ПРИХОДЫ − РАСХОДЫ
```

Приход или расход — только то, из-за чего деньги реально появились в филиале или ушли из него:
закрытые игровые результаты, Office Income, approved Expenses, Collections, межфилиальные переводы, Add Float.

Никогда не входит в Expected:

- любое перемещение денег внутри филиала (Cash → Bank, Wallet → Wallet, Money In / Money Out по кошельку);
- `adjustment` любого вида;
- физический пересчёт;
- Card Balance;
- Slots System / Net Win;
- открытая кассовая смена до закрытия бизнес-дня.

Ledger по кошельку — это распределение, а не Expected. Его сумма по всем кошелькам не обязана совпадать с Expected филиала и не должна на него влиять.

## Дальнейшие шаги (только Arusha, август 2026)

1. Разложить Expected Arusha на слагаемые из формулы выше и показать таблицей, откуда взялась каждая цифра.
2. Показать Actual по каждому кошельку с датой последнего пересчёта и отметить непересчитанные (они дают 0 и сами по себе создают Variance).
3. Найти реальную причину расхождения среди приходов/расходов: незакрытые дни, задвоенные Other Income, расходы без approve, переводы не в том статусе.
4. Показать список спорных записей построчно и согласовать с вами, прежде чем что-либо менять.

## Ограничения

- Никаких изменений данных, функций и интерфейса на этом шаге.
- Работаем только с Arusha. Dodoma, Mwanza, Mbeya не трогаем.
- Историю Money In / Money Out не переклассифицируем.
- Формулу Expected не меняем — она признана верной.
