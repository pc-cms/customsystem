# Убрать Card Balance из Expected и UI (Wallets)

## Что меняем

Card Balance (`Σ fin_day_closing.players_card_balance`) перестаёт участвовать в расчёте Expected по кошелькам и больше не отображается в разделе Wallets.

## Изменения

1. `src/hooks/use-fin-balance.ts` (`computeBalanceTotals`)
   - удалить слагаемое `(incomes.card_balance || 0)` из формулы Expected;
   - обновить комментарий канона: Card Balance — справочная величина, в Expected не входит.

2. `src/pages/finances/FinancesWalletsPage.tsx`
   - удалить строку разбивки `Card Balance (cash held in cage)`;
   - убрать импорт/рендер связанных с `card_balance` элементов, если они больше нигде не используются.

3. Тест-регрессия: добавить проверку в `src/test/`, что `computeBalanceTotals` игнорирует `incomes.card_balance`.

4. Поднять версию `package.json` / `package-lock.json` до 1.3.724 после успешных typecheck/build.

## Что НЕ трогаем

- RPC `fin_balance_snapshot` — продолжает возвращать `incomes.card_balance` (используется Monthly Report).
- Monthly Report: `card_balance` там участвует в Deposits/Cash Position — вне этой задачи.
- Boss TV / Day Closings / Slots-логика — без изменений.
- Данные в БД не меняются.

## Ожидаемый эффект (по текущим данным)

| Филиал | Месяц | Variance сейчас | Станет |
|---|---|---:|---:|
| Arusha | Авг | −8 787 866 | −8 620 880 |
| Dodoma | Авг | +1 257 992 | −2 915 388 |
| Mbeya | Авг | 0 | +51 690 |
| Dodoma | Сен | +145 389 | +245 759 |
| Mbeya | Сен | 0 | +100 |
| Mwanza | Сен | +85 347 | +84 007 |

Деплоя не будет — только preview.
