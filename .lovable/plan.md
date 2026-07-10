## Цель
Печатать Drop по каждому столу в печатном Shift Closing Report (сейчас там `·` в колонке DROP (NEP)).

## Что меняется

**Файл:** `src/components/cage/ShiftClosingReport.tsx` (строка 465)

В строке таблицы `reportTables.map(t => ...)` заменить placeholder `·` на реальное значение per-table Drop из уже вычисленного `inByTable[t.id]` (peak-NEP на игрока за бизнес-день, распределённое пропорционально доле IN стола в окне смены — это тот же расчёт, что используется в Player Statistics / Tables / Dashboard).

```tsx
// было:
<td className="... text-gray-400">·</td>
// станет:
<td className="... text-right">{num(inByTable[t.id] || 0)}</td>
```

Строка Total остаётся без изменений — там уже печатается авторитетный `totalDropFromCache` (SUM(peak) из `player_day_drop_cache`).

Так как из-за округлений сумма per-table значений может слегка отличаться от Total, оставляем Total из cache — он остаётся источником истины для итога.

## Затрагиваемые места печати
- Печать при закрытии смены (`CloseShiftDialog` → `ShiftClosingReport`) — автоматически.
- Reprint из истории (`ReprintShiftDialog`, `EditReprintShiftPage`) — используют тот же `ShiftClosingReport`, изменение применится без правок.
- POS Z-report, Chip Movement Report — Drop там не печатается, не трогаем.

## Обновление правила проекта
Обновить memory (`mem://index.md` и `mem://features/drop-source-of-truth`): снять permanent-запрет на per-table Drop **в печатных отчётах**. На экранных списках/KPI per-table Drop продолжает отображаться как `·` (правило остаётся для экранов), Total Drop везде по-прежнему = SUM(peak) из `player_day_drop_cache`.

## Проверка
1. Открыть закрытую смену → Reprint → per-table Drop виден и не нулевой для столов с игрой.
2. Сумма per-table Drop ≈ Total (может отличаться на копейки из-за NEP-сплита).
3. Закрыть текущую смену → в напечатанном отчёте Drop по столам заполнен.