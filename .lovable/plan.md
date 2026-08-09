# Close Day: правильная маршрутизация четырёх цифр

## Что не так сейчас

- Диалог Close Day пишет все цифры только в `fin_day_closing`. В Statistics → Slots ничего не попадает — тот отчёт читает ручные поля закрытой смены слотов (`manual_drop_slots`, `manual_slots_result`, `manual_slots_deposits`).
- В `fin_day_closing` поле Table Result перезаписывается значением Net Win из диалога. Это ошибка: Table Result должен считаться автоматически из закрытия столов.

## Как должно работать

Ввод в Close Day: Drop Slots · Net Win · CashDesk Win · Client Balance.

```text
Drop Slots      -> смена слотов дня -> Statistics/Slots: колонка Drop
Net Win         -> смена слотов дня -> Statistics/Slots: колонка Net Win
CashDesk Win    -> смена слотов дня -> Statistics/Slots: колонка Cashdesk
                   + Day Closing (cashdesk_win)
Client Balance  -> смена слотов дня -> Statistics/Slots: колонка Client Balance
                   + Day Closing (players_card_balance)
Table Result    -> считается автоматически из результатов закрытых столов
```

Значения из Close Day перезаписывают то, что было введено вручную в смене слотов — Close Day является источником истины.

## Изменения

1. **Функция закрытия дня** (`close_business_day_with_figures`):
   - записывает четыре цифры в закрытую смену слотов этого бизнес-дня (Drop, Net Win, Cashdesk, Client Balance) — перезаписью;
   - в Day Closing пишет `drop_slots`, `net_win`, `cashdesk_win`, `players_card_balance`;
   - `tables_result` больше не берётся из Net Win, а вычисляется автоматически из результатов закрытых столов дня;
   - если закрытых смен слотов за день несколько — цифры пишутся в последнюю закрытую.

2. **Диалог Close Day**: подписи полей уточняются (куда именно уходит каждая цифра), Table Result показывается справочно как авто-значение.

3. **Statistics → Slots**: проверяется, что после закрытия дня строка сразу показывает новые значения (инвалидация `cage-slots-history`, финансовых ключей).

4. **Сброс после закрытия**: проверяется, что после закрытия дня оперативные экраны (Dashboard, Pit, Cage, Live Game) переключаются на новый бизнес-день и очищают кэш прошлого дня. Если где-то остаётся старая дата — правится инвалидация/ключи запроса.

5. Версия приложения повышается.

## Технические детали

- Миграция: `CREATE OR REPLACE FUNCTION public.close_business_day_with_figures(...)` — добавление UPDATE в `cage_slots_shifts` и расчёт `tables_result` через существующий расчёт результатов столов дня.
- Клиент: `src/components/pit/CloseBusinessDayButton.tsx` (подписи, авто-Table Result), `src/hooks/use-business-day-closure.ts` (инвалидация `cage-slots-history` + `invalidateFinance`).
- Отчёт `src/components/reports/SlotsHistoryReport.tsx` остаётся редактируемым вручную — структура колонок не меняется.
