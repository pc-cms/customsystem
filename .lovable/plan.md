# Slots в балансе Wallets = Cash Desk Win

## Что меняется

Сейчас в отчёте Wallets / Balance строка **Slots** берётся из `fin_day_closing.slots_result` (Net Win слотов). По требованию она должна браться из колонки **Cash Desk Win** (`fin_day_closing.cashdesk_win`) — то есть из реальных денег, прошедших через кассу слотов.

Это меняет:
- значение Slots в Expected (итог и по дням),
- дневную разбивку (Daily audit rows),
- итоговый Variance = Actual − Expected.

Формула Expected остаётся прежней, меняется только источник Slots:

```text
Expected = Starting Float
         + Live Game (tables_result)
         + Slots (cashdesk_win)   <-- было slots_result
         + Other Incomes + JP + Card Balance
         + Missed Chips + Missed Cards
         − Expenses − Collections
```

## Технически

- Обновить функцию `fin_balance_snapshot`: заменить `SUM(slots_result)` на `SUM(cashdesk_win)` в блоке `incomes` и в дневной разбивке (`daily`), а также в поле `net` каждого дня и в условии фильтрации дней с движением.
- Клиентский код (`use-fin-balance.ts`, `FinancesWalletsPage.tsx`, `BalanceBanner.tsx`) не меняется — поле `incomes.slots` остаётся тем же.
- Подпись источника в UI/подсказках, где указано «Slots result», поправить на «Cash Desk Win» (Wallets).
- Поднять версию приложения.

## Вопрос вне области изменений

Casino Monthly Balance (CMB) и Dashboard/Monthly Report продолжают использовать `slots_result` — трогать их не буду, если не скажете иначе.
