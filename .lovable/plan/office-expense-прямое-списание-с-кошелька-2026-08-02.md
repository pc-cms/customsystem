# Office expense: прямое списание с кошелька

## Что сейчас происходит

Расход с Source = "Office (MAIN_CASH)" на странице Expenses физически **не создаётся**: в базе 0 записей с source = office. Причина — триггер `expenses_office_after_insert` пытается записать проводку в таблицу `wallet_transactions`, которой в базе больше нет (кошельки давно переехали в `fin_wallets` / `fin_wallet_tx`). Любая вставка office-расхода падает с ошибкой.

Дополнительно RPC `create_office_expense` жёстко ставит кошелёк `main_cash`, не сохраняет выбранную категорию `fin_category_id`, валюту и курс.

Cage Live и Cage Slots office-расходы уже не учитывают (их формулы фильтруют по source), так что там менять ничего не нужно.

## Что будет сделано

1. Убрать сломанный триггер и вместо него писать проводку в актуальный реестр кошельков `fin_wallet_tx` (kind = expense, ссылка на запись расхода) — прямое списание с выбранного кошелька.
2. В строке создания расхода при Source = Office добавить выбор кошелька (Safe TZS, Safe USD, NBC, M PESA и т.д.), валюта и курс подтягиваются из кошелька; сумма пишется и в валюте, и в TZS.
3. Расход сохраняет выбранную категорию, сразу помечается approved, без привязки к смене.
4. Видимость: кассиры (cashier / cashier_slots) office-расходы не видят и не создают — источник Office доступен только менеджерам/финансам; на странице Expenses для кассиров он остаётся скрытым.
5. Влияние: баланс кассы Live и Slots (CDR, Shift Balance) не затрагивается вообще. Баланс казино (Wallets / Office Balance) уменьшается, расход учитывается в Expenses, разрезах по категориям, Monthly Report и прочих отчётах по расходам.
6. Удаление/сторнирование office-расхода откатывает и проводку по кошельку.

## Технические детали

- Миграция: `DROP TRIGGER trg_expenses_office_after_insert` + новая функция, вставляющая строку в `fin_wallet_tx` (`kind='expense'`, `amount = -amount`, `amount_tzs = -amount_tzs`, `ref_table='expenses'`, `ref_id = NEW.id`, `wallet_id = NEW.wallet_id`) только при `source='office'` и заполненном `wallet_id`.
- Триггер `expenses_office_before_insert` оставить (approved, обнуление shift_id), добавить требование `wallet_id IS NOT NULL` для office.
- `create_office_expense` расширить параметрами `p_wallet_id`, `p_fin_category_id`, `p_currency`, `p_exchange_rate`, `p_business_date`; сохранять их в строке.
- `src/pages/Expenses.tsx` (`DraftRowView` + `submitDraft`): селект кошелька из `useFinWallets` при `source === 'office'`, валидация выбора, передача в мутацию.
- `src/hooks/use-expense-categories.ts` (`useCreateOfficeExpense`): прокинуть новые параметры, инвалидировать `fin-wallet-tx` и `fin-wallet-balances`.
- Проверить, что удаление расхода (`useVoidFinExpense` / delete) убирает связанную проводку по `ref_id`.
