# Inter-Casino Transfers в строке Transfers (Аруша / Мванза)

## Что показала проверка данных

- Строка **Transfers** в Balance/Wallets сейчас считается ТОЛЬКО из таблицы расходов: берутся расходы с категорией группы `collections`, в названии которой есть `transfer` или `money change`. Таблица `fin_inter_casino_transfers` в этот расчёт не входит вообще.
- Поэтому в **Аруше** (принимающая сторона) Transfers = 0: у неё нет расхода-трансфера, а приход лежит записью в `fin_other_incomes` (source `inter_casino_transfer`, +10 000 000, 08.08) и попадает в **Other Income**.
- В **Мванзе** записей в Other Incomes по этому трансферу нет — убирать нечего. Отток есть: проводка по кошельку Cash TZS от 06.08 на −10 000 000 («Send to Arusha!Float replenishment!»), она привязана к трансферу как out-сторона.
- Отдельно найдено: в Мванзе есть ещё расход от 17.08 на 10 000 000 с категорией «Inter-Casino Transfer Out» («Sent to Arusha for cash flow») со своей проводкой по кошельку. Это второй отток на 10М, не связанный с трансфером 06.08 → 08.08. Его трогать не буду, пока не подтвердишь, что это отдельная отправка, а не дубль.

## Что делаю

1. **Transfers становится собственной строкой из реестра трансферов** (знаковой):
   - для казино-отправителя трансфер уменьшает Expected (−сумма),
   - для казино-получателя увеличивает Expected (+сумма),
   - учитываются трансферы со статусом `accepted` (и `pending` для отправителя, т.к. деньги уже вышли), по business date трансфера, с пересчётом валюты в TZS.
2. **Убираем двойной счёт**: записи `fin_other_incomes` с source `inter_casino_transfer` больше не входят в Other Income; расходы с категорией «Inter-Casino Transfer …» больше не попадают в Expenses/Collections — они видны только в строке Transfers.
3. **Чистка записи в Аруше**: удаляю запись Other Income по трансферу (23cbbab5…), но проводку по кошельку **сохраняю** — она перепривязывается к записи трансфера (`ref_table = fin_inter_casino_transfers`). Физический баланс и денежные движения кошелька не меняются ни на шиллинг.
4. **Мванза**: Other Income по трансферу отсутствует — изменений в данных не требуется; после правки формулы Мванза покажет Transfers −10 000 000 (и −20 000 000, если подтвердишь, что расход 17.08 — тоже межфилиальная отправка и его надо учитывать в Transfers).
5. Подпись строки в UI меняю на `– TRANSFERS (INTER-CASINO ±)`, чтобы знак читался однозначно; для получателя значение положительное.

## Техническая часть

- Миграция: `CREATE OR REPLACE FUNCTION public.fin_balance_snapshot` — новый расчёт `v_transfers` из `fin_inter_casino_transfers` (in/out по `to_casino_id`/`from_casino_id`, курс из `fin_daily_rates`), исключение `source = 'inter_casino_transfer'` из CTE `other` (и из блока `v_incomes`), исключение transfer-категорий из `v_expenses`/`v_collections`; та же правка в дневных строках `daily`.
- Данные (`run_sql`): перепривязка `fin_wallet_tx` 63e8efeb… на `fin_inter_casino_transfers`, затем удаление строки `fin_other_incomes` 23cbbab5….
- Фронтенд: в `computeBalanceTotals` (`src/hooks/use-fin-balance.ts`) Transfers теперь **прибавляется** со своим знаком вместо вычитания; подпись строки в `src/pages/finances/FinancesWalletsPage.tsx`.
- Проверка после применения: Аруша — Other Income −10М, Transfers +10М, Expected и Variance без изменений; Мванза — Transfers отрицательный, Expected без изменений.
- Версия приложения → 1.3.661.
