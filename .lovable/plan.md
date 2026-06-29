## Цель

В модалке `EditReprintShiftDialog`: при изменении результата конкретного стола (per-table) автоматически пересчитывать CLOSE chips этого стола по номиналам, чтобы Tables Result соответствовал введённому значению. Только для печати, без записи в БД.

## Поведение

- При редактировании любой строки в "Table results (per table)" — для этого стола применяется дельта = `(newResult − initialTableResult)` к его per-table CLOSE chips.
- Распределение: жадно от крупной к мелкой денеоминации, остаток уносится вниз.
- Отрицательные количества разрешены (если дельта больше имеющихся фишек номинала).
- Тоггл "auto chips per-table" всегда активен при редактировании per-table; работает независимо от существующих "auto result" / "auto chips" (общий).
- Затем суммарный `closeChips` казино пересчитывается как сумма всех per-table close + кэш‑деск/сейф (неизменно) → подставляется в печатный отчёт.
- Сам Tables Result (сумма) обновляется как сумма всех per-table результатов (как сейчас).
- В DB ничего не пишется. Все правки — только для печатного preview/print.

## Технические шаги

1. **`compute_shift_table_results` уже возвращает per-table результат**. Дополнительно нужны per-table baseline CLOSE chips по номиналам. Источник:
   - Использовать последний snapshot per table из `chip_snapshots` (как уже делает существующий RPC). Если данных не хватает — добавить параллельный лёгкий запрос в `EditReprintShiftDialog`, собирающий `{ table_id → { denom → actual_quantity } }` из snapshot'ов за смену (или RPC `shift_table_close_chips_by_denom(p_shift_id)` если потребуется — обсудим перед добавлением).

2. **State** в `EditReprintShiftDialog.tsx`:
   - `perTableCloseChips: Record<tableId, Record<denom, qty>>` — baseline из snapshot.
   - `perTableCloseOverrides: Record<tableId, Record<denom, qty>>` — после авто‑распределения.
   - `perTableResults: Record<tableId, number>` — уже есть.

3. **`redistributeTableCloseChips(tableId, targetResult)`**:
   - delta = `targetResult − initialPerTableResult[tableId]`.
   - greedy от крупной к мелкой: qty[d] += floor(remaining/d), remaining %= d; в конце мелкая денеоминация добирает остаток (может стать отрицательной).
   - Возвращает новый `Record<denom, qty>` для стола.

4. **`onChange` per-table input**:
   - Обновить `perTableResults[tableId]`.
   - Вызвать redistribute и записать в `perTableCloseOverrides[tableId]`.
   - Пересчитать общий `resultTable` = Σ perTableResults.
   - Пересчитать общий `closeChips` = (baseline closeChips казино) + Σ дельт per-table chip overrides.
   - Выключить общие `resultAuto` и `chipsAuto` (чтобы не конфликтовали).

5. **Передача в печать**:
   - В `tableRowOverrides` уже идёт `result`. Добавить опциональное поле `closeChipsByDenom?: Record<number, number>` и пробросить в `ShiftClosingReport` / `ChipMovementReport` так, чтобы per-table breakdown в печатном отчёте отражал новые количества (только визуально).
   - Общий `closeChipsOverride` уже поддерживается — использовать его для total CLOSE.

6. **UI**:
   - Под секцией "Table results (per table)" добавить мелкий хинт: "Изменение результата автоматически пересчитывает CLOSE по номиналам этого стола (только для печати)."
   - Никаких новых тоггл‑чекбоксов: per-table авто всегда включено.

## Файлы

- `src/components/cage/EditReprintShiftDialog.tsx` — state, redistribute, onChange, проброс override.
- `src/components/cage/ShiftClosingReport.tsx` — принять `tableRowOverrides[*].closeChipsByDenom` и использовать в per-table chips breakdown печатного отчёта (если такой раздел есть; если нет — только пересчитать total close).
- `src/components/cage/ChipMovementReport.tsx` — аналогично, если в нём есть per-table chip breakdown.
- (Опционально) `src/components/cage/printLiveGameReport.ts` — пробросить новые поля.

## Что НЕ делаем

- БД не трогаем, миграций нет, реальные snapshot'ы не меняются.
- Кэш‑деск/сейф фишки не трогаем.
- Существующие режимы "auto result" / "auto chips" (общие) остаются как есть.
