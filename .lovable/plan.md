# Selcom TZS / Selcom USD в кассах Live Game и Slots + корректная печать по каналам

## Что уже проверено

- Каналы кассы заданы одним списком: сейчас это CRDB TZS/USD и NBC TZS/USD. Экраны кассира (Live Game и Slots) и отчёт Live Game строят строки автоматически из этого списка — им достаточно добавить два новых канала.
- В базе кошельки `Selcom TZS` и `Selcom USD` уже существуют во всех филиалах (Arusha, Mwanza, Dodoma, Mbeya), и правило разноса денег в кошельки уже умеет узнавать Selcom. Разнос по Post All заработает без изменений в базе.
- Найдена реальная причина «всё слипается в один банк» при печати Slots: в подготовке данных для печати слотов суммы жёстко складываются только по CRDB и NBC (отдельно TZS и отдельно USD). Любой другой канал в печать не попадает вообще, а итог по банкам выводится одной строкой.

## Что сделаем

1. **Два новых канала в кассе.** В общий список каналов добавляются `Selcom TZS` и `Selcom USD`. После этого в кассе Live Game и в кассе Slots появятся отдельные поля ввода IN/OUT по Selcom рядом с CRDB и NBC — и при открытии, и при проверке, и при закрытии смены.

2. **Печать Slots — по каналам, а не общей суммой.** Подготовка данных для печатного отчёта слотов перестаёт складывать только CRDB+NBC: значения берутся по всем каналам из списка. В отчёте печатаются отдельные строки `Bank CRDB TZS`, `Bank CRDB USD`, `Bank NBC TZS`, `Bank NBC USD`, `Bank Selcom TZS`, `Bank Selcom USD` (колонки Opener / Closer) плюс контрольная строка `Total Bank (TZS)`.

3. **Печать Live Game.** Отчёт уже строит строки по списку каналов, поэтому Selcom появится в нём автоматически; проверим готовый отчёт и итог по банкам, чтобы сумма сходилась с введёнными значениями.

4. **Старые смены не ломаются.** Если в смене нет данных по каналам (записи до внедрения), печать по-прежнему показывает прежние общие строки Bank TZS / Bank USD. Перепечатка старых отчётов остаётся идентичной.

## Технические детали

- `src/components/cage/CageHelpers.ts` — в `BANK_CHANNELS` добавить `SELCOM_TZS` и `SELCOM_USD` (bank: `Selcom`). Всё остальное (`emptyBankChannels`, `withDerivedBankTotals`, `bankChannelNet`, сверка в `src/lib/cage-reconciliation.ts`, сетка ввода `CashCountGrid`, `ActiveShiftView`, `ActiveSlotsShiftView`) уже итерируется по этому списку.
- `src/components/cage-slots/PrintSlotsShiftDialog.tsx` — в `readBank` заменить хардкод `chanValue(channels.CRDB_TZS) + chanValue(channels.NBC_TZS)` (и USD-аналог) на суммирование по `BANK_CHANNELS`, отфильтрованным по валюте.
- `src/components/cage-slots/SlotsConsolidatedReport.tsx` и `src/components/cage/ShiftClosingReport.tsx` — уже используют `BANK_CHANNELS`, менять не нужно; только проверить вёрстку при шести строках.
- База не меняется: `closing_inbox_build` разбирает ключи каналов через `split_part`, а `closing_inbox_map_wallet` уже мапит метку с `selcom` на `SELCOM_TZS` / `SELCOM_USD`.
- Bump версии в `package.json`.
