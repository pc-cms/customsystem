## Проблема

В Live cage в Шифт Баланс затягивается NET (Cashless IN − OUT). По договорённости cashless для Live — это только лог + ручная колонка Balance в принт-отчёте, и НИКАК не должен влиять на CDR / Shift Balance. Печатная колонка Balance уже корректна (читается только из `closing_count.totals.mobile_*` — ручной ввод закрывающего), но сама формула баланса нарушает правило.

## Источники бага

1. **БД-триггер `public.compute_shift_balance_from_row(shifts)`** (последняя миграция `20260612192205…`), строка ~77:
   ```sql
   v_cash_desk := v_delta_cash + v_expenses + v_collection - v_add_float
                  + v_slots_out - v_slots_in
                  + v_cashless_in - v_cashless_out;   -- ← лишнее
   ```
   `shifts.cash_desk_result` и `shifts.balance` мирорятся из этого JSON триггером на UPDATE, поэтому каждое сохранение Cashless IN/OUT сдвигает Balance.

2. **Клиентская формула `src/lib/cage-balance.ts → computeShiftBalance`**, строки 41–43:
   ```ts
   const cashDeskResult =
     deltaCash + i.expenses + i.collection - i.addFloat
     + i.slotsOut - i.slotsIn
     + (i.cashlessIn || 0) - (i.cashlessOut || 0);  // ← лишнее
   ```
   Используется в `CloseShiftDialog` и `ActiveShiftView` для превью.

3. **Закрытые/открытые шифты** в БД уже содержат «грязные» `cash_desk_result`/`balance`. Их нужно пересчитать новой формулой.

## Что строим (Live cage только)

1. **Миграция: новая версия `compute_shift_balance_from_row`**
   - Убрать `+ v_cashless_in − v_cashless_out` из `v_cash_desk`.
   - В возвращаемом JSON оставить `cashless_in`, `cashless_out` как информационные поля (для UI/печати).
   - Никаких структурных изменений: те же ключи, тот же мирор-триггер в `shifts`.
   - В конце миграции одноразовый пересчёт всех существующих шифтов:
     ```sql
     UPDATE public.shifts s
     SET cash_desk_result = (public.compute_shift_balance_from_row(s)->>'cash_desk_result')::bigint,
         balance          = (public.compute_shift_balance_from_row(s)->>'balance')::bigint;
     ```
   - Slots-функцию НЕ трогаем (Slots остаётся как сейчас).

2. **`src/lib/cage-balance.ts → computeShiftBalance`**
   - Убрать `+ cashlessIn − cashlessOut` из `cashDeskResult`.
   - Поля `cashlessIn`/`cashlessOut` оставить в типе `CageBalanceInputs` (передаются вызывающим кодом), но игнорировать в формуле — так же, как уже сделано для `tips`.
   - Обновить doc-комментарий канонической формулы:
     ```
     Cash Desk Result = ΔCash + Expenses + Collection − AddFloat
                       + SlotsOut − SlotsIn               (NO miss, NO tips, NO cashless)
     Shift Balance    = Cash Desk Result − Tables Result − Miss
     ```

3. **UI Live cage — без правок логики**
   - `CloseShiftDialog`, `ActiveShiftView` продолжают передавать `cashlessIn/Out` в `computeShiftBalance` (поля игнорируются — обратная совместимость).
   - Печатный `ShiftClosingReport` уже корректен: колонка Balance берётся из ручного `closing_count.totals.mobile_<prov>`. Не трогаем.
   - Логика автозаполнения «Mobile Balance is MANUAL-ONLY — never auto-fill from NET» уже на месте — без изменений.

4. **Bump версии**
   - Патч-bump `package.json` (миграция = backend change).

5. **Память**
   - Обновить `mem://features/cash-desk-balance-formula` — новая формула без cashless.
   - Расширить `mem://features/cashless-balance-manual-only` пунктом: «В Live cage cashless IN/OUT также НЕ влияют на CDR/Shift Balance. Колонка Balance в печати = ручной `closing_count.totals.mobile_*` only».
   - Core: освежить строку про CDR-формулу (сейчас в Core её нет — обновляем только сопутствующие memory-файлы).

## Проверка

- После миграции: одна выборка `SELECT id, cashless_in, cashless_out, cash_desk_result, balance FROM shifts WHERE casino_id = '<Mwanza>' ORDER BY opened_at DESC LIMIT 5` — баланс не должен зависеть от cashless значений.
- На фронте: открыть Mwanza Live → ActiveShiftView, изменить Cashless IN — Shift Balance в превью не меняется.
- Печать `ShiftClosingReport`: колонка Balance показывает ровно введённые ручные значения (или `0`), NET в соседней колонке — справочно.

## Чего НЕ делаем

- Slots cage не трогаем (по выбору пользователя).
- `cashless_transactions` и edge-функции не меняем.
- Никаких новых таблиц/колонок.
