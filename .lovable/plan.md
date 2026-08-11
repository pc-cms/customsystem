# Close Day: JP (IN), Cashdesk и Net Win в Statistics

## Что сейчас

- Close Day принимает четыре цифры (Drop Slots, Net Win, CashDesk Win, Client Balance) и пишет их в закрытую смену слотов дня и в Day Closings. JP в диалоге нет — JP вносится отдельно в Office → Day Closings (колонка JP (IN)) и хранится в `fin_other_incomes` с источником `jp`.
- Statistics → Slots, колонка **Cashdesk** читает расчётное поле смены (`cash_desk_result`). Close Day его перезаписывает, но триггеры смены пересчитывают это поле при любом последующем изменении смены — введённая менеджером цифра может быть затёрта.
- Statistics → Total, колонка **Result Slots** берёт расчётное `slots_result` смены, а не введённый в Close Day **Net Win** (`manual_slots_result`).

## Что делаем

1. **JP (IN) в диалоге Close Day**
   - Пятое поле «JP (IN)» (необязательное, допускает минус).
   - Значение проводится ровно так же, как из Office → Day Closings: строка в JP-леджере за этот бизнес-день на TZS-кошелёк, дельтой (повторное закрытие не задваивает).
   - После закрытия цифра сразу видна в Office → Day Closings и Office → JP.

2. **Cashdesk в Statistics → Slots — из Close Day**
   - Колонка Cashdesk показывает значение из закрытия дня (`fin_day_closing.cashdesk_win`), если день закрыт; иначе — расчётное значение смены как раньше.
   - Так цифра менеджера больше не теряется при пересчётах смены.

3. **Result Slots в Statistics → Total — из Net Win**
   - Колонка Result Slots (и итоги, и Hold, и Total Result) считается из `manual_slots_result` (Net Win, введённый в Close Day), а не из расчётного `slots_result`.

4. **Проверка флоу закрытия**
   - Условия закрытия не меняются (кассы, слоты, столы, сессии, визиты).
   - Table Result остаётся авто-расчётным из закрытых смен столов.
   - Drop Slots / Net Win / Cashdesk / Client Balance по-прежнему перезаписывают смену слотов дня; Close Day — источник истины.
   - Инвалидация кэшей после закрытия расширяется на JP/other-incomes, чтобы Office и Statistics обновлялись без перезагрузки.

5. Версия приложения повышается.

## Технические детали

- Миграция: `CREATE OR REPLACE FUNCTION public.close_business_day_with_figures(..., _jp_in numeric DEFAULT NULL)` — апсерт JP-строки в `fin_other_incomes` (source `jp`) дельтой к уже проведённой сумме за дату, выбор TZS-кошелька той же логикой, что и в Day Closings.
- Клиент: `src/components/pit/CloseBusinessDayButton.tsx` (поле JP), `src/hooks/use-business-day-closure.ts` (параметр + инвалидация `other-incomes`).
- Отчёты: `src/components/reports/SlotsHistoryReport.tsx` (Cashdesk из `fin_day_closing`), `src/pages/Reports.tsx` → `TotalReport` (Result Slots из `manual_slots_result`).
