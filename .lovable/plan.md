## Удалить legacy Cash, оставить только on-the-fly расчёт

### Что меняем в `src/pages/Reports.tsx` (Live Game)

1. **Колонка Cash**
   - Убрать fallback на `shift.cash_result` и tooltip "Legacy stored value".
   - Всегда показывать `computeShiftCashFlow(shift).cashDelta` (closer TZS − opener TZS, без float/collection).
   - Если данных для расчёта нет (нет opener/closer снапшотов) — показывать `—`, а не сохранённую цифру.

2. **Экспорт / печать**
   - В CSV/печатный отчёт писать тот же `cashDelta`, без `cash_result`.

3. **Итоги (Total Cash)**
   - Сумма по `cashDelta` всех смен периода (смены без снапшотов = 0 в сумме).

### Что НЕ трогаем
- `shifts.cash_result` в БД остаётся (исторические данные, используется другими местами).
- Логика Balance, Miss Chips, Drop — без изменений.
- Файл `src/lib/shift-cash.ts` — без изменений (он и есть «правильное»).

### Проверка
- Tsgo typecheck.
- Глазами: открыть Mwanza Live Game за июнь — Cash в строках = Cash в Shift Closing Report.
