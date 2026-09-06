# Chips Movement Report — горизонтальный лист на всю ширину

Отчёт «Casino Chips Movement Report» (лист 3 из 4) сейчас печатается на портретном A4: ширина контента 194 мм, таблица номиналов сжата. Делаем этот лист горизонтальным (landscape) на всю ширину — 281 мм, остальные три листа остаются портретными.

## Что меняем

1. **CSS (`src/index.css`)** — добавляем именованную страницу и класс:
   - `@page rv2landscape { size: A4 landscape; margin: 8mm; }` внутри `@media print`.
   - `.rv2-page-land` — вариант листа: ширина `281mm`, высота при печати `194mm` (297 − 2×8 мм полей), `page: rv2landscape`, принудительный разрыв страницы после листа, та же блокировка шрифта (`10.5px / 1.3`, `text-size-adjust: 100%`).
   - Правило `page` на элементе переопределяет портретное наследование от `body:has(.rv2-page)` — смешанная ориентация (портрет + landscape в одном задании печати) поддерживается Chromium.

2. **Отчёт (`src/components/cage/ChipsMovementReportV2.tsx`)**:
   - Корневой блок: `rv2-page rv2-page-land`, инлайн-стиль ширины `281mm` (вместо `A4_STYLE`).
   - Таблица «Quantity per Denomination»: `tableLayout: auto`, колонка «Block» — авто, «Value TZS» — `12%`, колонки номиналов растягиваются равномерно на всю ширину — цифры больше не сжимаются.
   - KPI-плитки и Chips Control тянутся на всю ширину листа автоматически (flex-раскладка).
   - Нумерация «page 3 of 4» и контент не меняются.

3. **Проверка**: `bunx tsgo --noEmit -p tsconfig.app.json`, затем печатный прогон через Playwright (Аруша 05/09, диалог перепечатки смены): PDF на 4 листа, где лист 3 — landscape (297×210 мм), остальные — портрет; скриншот листа 3 для визуальной проверки ширины таблицы.

## Технические детали

- Файлы: `src/index.css` (новый `@page rv2landscape` + `.rv2-page-land`), `src/components/cage/ChipsMovementReportV2.tsx` (класс + ширина + tableLayout).
- Другие листы (Slots, Live, Total Closing), `primitives.tsx` и `layout.tsx` не трогаем — класс применяется только к этому отчёту.
