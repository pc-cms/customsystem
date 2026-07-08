## Задача
Добавить блок Cashless IN/OUT в hourly Cash Check «New Grid», симметрично тому, что уже есть в «Old Grid» (`CashCountGrid`).

## Контекст (не меняется)
- Состояние `cashlessIn` / `cashlessOut` в `CashCheckForm` (внутри `ActiveShiftView.tsx`) уже существует.
- Snapshot чека уже сохраняет `denominations.cashless_in_providers/out_providers` + `totals.cashless_in/out`.
- Формулы `totalTzs` уже учитывают `+ cashlessInTzs − cashlessOutTzs` — не трогаем.
- `useCashlessSuggestions` уже подтягивает hint из ledger'а — не трогаем.

## Изменения

### 1. `src/components/cage/CashCheckNewGrid.tsx`
- Добавить опциональные пропы: `cashlessIn`, `onCashlessInChange`, `cashlessInSuggestion`, `cashlessOut`, `onCashlessOutChange`, `cashlessOutSuggestion` (типы как в `CashCountGrid`).
- Отрендерить компактный ряд «Cashless IN / Cashless OUT / NET» на всю ширину под сеткой Chips+Cash — использовать существующий `MobileProviderBlock` из `CashCountGrid` (либо инлайн 2 блока провайдеров).
- Показать суммарный NET (`IN − OUT`) с подписью «влияет на Counted через формулу Cash Desk», чтобы кассир понимал, что Cashless уже входит в total.
- Не трогать expected-логику: `expectedChips` / `expectedCashByCurrency` — как есть.

### 2. `src/components/cage/ActiveShiftView.tsx`
- Передать в `<CashCheckNewGrid …>` те же пропы cashless, что уже идут в `<CashCountGrid>` (Old ветка).

## Что НЕ трогаем
- Схему БД, snapshot формат, формулы totals/expected.
- Old-ветку `CashCountGrid`.
- Slots-версию (там hourly-check-flow другой, вне scope).

## Файлы
- `src/components/cage/CashCheckNewGrid.tsx` (+~40 строк, новые пропы + JSX-блок)
- `src/components/cage/ActiveShiftView.tsx` (+6 строк проп-пропаганда)

## Результат
В режиме «New» hourly Cash Check кассир видит и редактирует Cashless IN/OUT по провайдерам, значения сохраняются в snapshot (уже сохранялись), и видно как они влияют на Counted total.
