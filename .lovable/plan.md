## Проблема

В Live Game (и аналогично в Cage Slots) кассир **вручную** вписывает Cashless IN/OUT по провайдерам в момент Close Shift (поля в `CashCountGrid`). Эти значения сохраняются в `shifts.closing_count.cashless_in_providers / cashless_out_providers` и попадают в `compute_shift_balance` (`+ CashlessIn − CashlessOut`) — то есть **влияют на Shift Balance**.

Но пользователь не видит их ни в чеке, ни в печатном отчёте, потому что:

1. **`ShiftClosingReport`** (печатный отчёт Live Game) читает Cashless НЕ из ручных полей смены, а из ledger'а `cashless_transactions` (строки, введённые на странице /cashless). Если кассир вводит только вручную на Close — ledger пуст, таблица показывает нули, а в Balance цифры «прилетают из ниоткуда».
2. **`CashCheckViewerDialog`** для `live_game` не рендерит блок Cashless вообще (есть только ветка для slots).
3. **Hourly Cash Check** (`CashCheckNewGrid`) намеренно опускает Cashless — комментарий «intentionally omitted». Кассир не может свести Cashless в течение смены.
4. **Summary Panel** печатного отчёта не содержит явных строк `+ Cashless IN`, `− Cashless OUT`, `NET Cashless` — Balance «съедает» их без следа.

## Что делаем (UI/презентация, без изменения формулы)

### 1. `ShiftClosingReport.tsx` — таблица «Cash Less Shift Transactions»
- Приоритетный источник IN/OUT по провайдерам: `shift.closing_count.cashless_in_providers` / `cashless_out_providers` (ручной ввод, канонический для баланса).
- Fallback на ledger `cashless_transactions` (текущее поведение), если ручные пусты.
- Если и там и там есть данные и они расходятся — добавить визуальную пометку `⚠ manual vs ledger mismatch` в подписи к таблице.

### 2. `ShiftClosingReport.tsx` — Summary Panel (правая колонка)
Добавить три строки прямо перед `Miss Chips`, чтобы путь до Shift Balance был читаемый:
```
+ Cashless IN         [totIn]
− Cashless OUT        [-totOut]
NET Cashless          [totIn − totOut]
```
Значения — те же, что в таблице выше.

### 3. `CashCheckViewerDialog.tsx` — ветка `live_game`
Добавить блок «Cashless (manual @ shift)» такой же, как для `slots`: провайдеры IN/OUT/NET из `denominations.cashless_in_providers/out_providers` + строка totals `cashless_in` / `cashless_out`.

### 4. Hourly Cash Check — `CashCheckNewGrid.tsx` + родитель (`ActiveShiftView` / соответствующая страница)
- Добавить компактный блок Cashless IN/OUT по провайдерам (`MobileProviders`), с pre-fill из `useCashlessSuggestions(businessDate, "live_game")` (как в Close Shift).
- Значения сохраняются в snapshot чека (`denominations.cashless_in_providers/out_providers` + `totals.cashless_in/out`) — только для протокола, **не** влияют на expected chips/cash.
- В UI показывать total NET подписью «log-only, не входит в expected».
- Печатный чек hourly-check тоже включает этот блок.

### 5. Cage Slots — параллельно
- Проверить `PrintSlotsShiftDialog` (уже использует ручные providers — оставить как есть).
- В `CageSlotsHistoryView` cash-check viewer / snapshot viewer — если нет блока Cashless по провайдерам, добавить (симметрично п.3).
- В hourly cash check слотов — добавить те же поля Cashless IN/OUT (симметрично п.4).

## Что НЕ трогаем

- Формулу `compute_shift_balance` и `compute_slots_shift_balance_from_row` — уже корректно учитывают cashless.
- Правило «Tips neutral» и «Cashless Balance manual only» из памяти проекта.
- `useExpectedCheckState` — expected chips/cash по-прежнему не подвязаны к cashless_transactions (это отдельная бизнес-дискуссия).

## Технические детали

**Файлы:**
- `src/components/cage/ShiftClosingReport.tsx` — источник данных Cashless + Summary Panel
- `src/components/cage/CashCheckViewerDialog.tsx` — live_game ветка
- `src/components/cage/CashCheckNewGrid.tsx` + `src/components/cage/ActiveShiftView.tsx` (hourly check submit) — новый блок Cashless
- Слоты: `src/components/cage-slots/CageSlotsHistoryView.tsx`, `src/components/cage-slots/ActiveSlotsShiftView.tsx` — симметрия

**Провайдеры:** `MPESA / TIGO / HALOTEL / AIRTEL` (uppercase в ledger'е) ↔ `Mpesa / Tigo / Halo / AirTel` (в ручных полях) — нормализация уже есть в `useCashlessSuggestions`.

**Изменений схемы БД нет** — все поля уже существуют в `closing_count` и `denominations` JSON.

## Результат для пользователя

- В hourly чеке видно текущий Cashless IN/OUT/NET за смену.
- В печатном отчёте Live Game таблица Cashless показывает **те же цифры**, что реально ушли в Balance.
- Summary Panel явно показывает `+ Cashless IN / − Cashless OUT / NET`, и Shift Balance становится арифметически проверяемым глазом.
- Cage Slots — то же самое.
