## Проблема

В `Reports → Live Game` колонка **Cash** показывает сырое поле `shifts.cash_result`. Это значение пишется при закрытии смены как `cashDelta = closingCashEffective − openingCashEffective` (без float/collection — см. коммент в `CloseShiftDialog.tsx:321-324`).

Но:
- **Старые смены** (до перехода на текущую формулу cashDelta) хранят `cash_result`, посчитанный по другой логике (включал float/collection). Поэтому в Reports мы видим "страшные" числа типа `-7 440 000`, которые не сходятся с `Cash Flow Opener / Closer` в печатном отчёте этой же смены.
- **Балансы кассы до 13/06** (`balance` ≠ 0) — это реальные исторические несхождения; сами по себе они корректны, но в паре с расходящимся `cash_result` создают полную "кашу" восприятия.

Источник правды для печатного отчёта — `opening_float` и `closing_count` (по валютам, в TZS через `exchange_rate_snapshot`). Reports же берёт скалярное закешированное поле, которое уже не консистентно.

## Решение

Считать **Cash** для строк Live Game на лету по тем же данным, что и печатный отчёт — `closing TZS total − opening TZS total` (включая mobile, без float/collection — чтобы совпадало с `cashDelta` новой формулы). Закешированное `shifts.cash_result` использовать только как fallback.

### Изменения

1. `src/lib/shift-cash.ts` (новый файл)
   - Хелпер `computeShiftCashFlow(shift) → { openerTzs, closerTzs, cashDelta }`.
   - Использует `opening_float.cash + opening_float.mobile` и `closing_count.cash + closing_count.mobile` по всем валютам через `exchange_rate_snapshot`.
   - Возвращает `null`, если данных недостаточно (legacy/импортированные смены).

2. `src/pages/Reports.tsx` → `LiveGameReport`
   - Расширить `select` на `opening_float, closing_count, exchange_rate_snapshot`.
   - В колонке Cash показывать результат `computeShiftCashFlow(s).cashDelta`; если `null` — fallback на `s.cash_result` приглушённым стилем + tooltip "Legacy stored value".
   - Сортировка по Cash использует тот же computed value.

3. Колонка **Balance** в той же таблице
   - Оставить сырое `shifts.balance` как есть (это историческая правда несхождения кассы).
   - Tooltip на заголовке `Balance`: "Cash Desk reconciliation: 0 = касса сошлась. Несхождения до 13/06 — историческая фактика, до ужесточения End Day."
   - Для смен где `balance ≠ 0` и `closed_at < 2026-06-13` — иконка ⓘ рядом со значением.

4. `src/components/cage/ShiftClosingReport.tsx`
   - Переиспользовать тот же `computeShiftCashFlow` для отображения Cash Flow Opener/Closer (если уже не использует) — гарантирует один источник правды.

### Что НЕ меняем

- Не трогаем `cash_result` в БД (immutable audit principle).
- Не меняем формулу `balance` для новых смен.
- Не убираем исторические минусы — только объясняем тултипом.
- Никаких миграций БД и бэкфилла.
