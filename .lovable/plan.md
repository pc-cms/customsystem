## Правило: в Reports показываем только закрытые бизнес-дни

### Что меняем
На странице **Reports** (все вкладки, где данные группируются по бизнес-дню) отфильтровываем строки так, чтобы отображались **только те business_date, по которым есть запись в `business_day_closures`** для текущего казино. Открытый (ещё не закрытый) бизнес-день скрывается полностью — ни в списке, ни в тоталах, ни в KPI (Days / Drop / Table Result / Hold %).

### Почему это ускорит загрузку
Помимо чистоты данных, сейчас `compute_daily_diff` считает и для сегодняшнего открытого дня — самый тяжёлый расчёт (peak-NEP по живым player_day_drop_cache). Отсекая незакрытые даты на клиенте (а вкладка Daily — ещё и на уровне запроса, сдвигая `to` до последней закрытой даты), убираем лишние сутки из выборки и снимаем «висящий» Loading.

### Скоуп вкладок
- **Daily Balance** — фильтр по `business_day_closures` (главный кейс из скриншота).
- **Shifts / Live Game / Slots / Tables / Players / Groups / Expenses / Cashless / Miss Chips** — тот же фильтр применяем к строкам, у которых есть `business_date`. Where нет business_date (например, чистый диапазон created_at) — оставляем как есть.
- **Total** — считается из уже отфильтрованных источников, автоматически подхватит правило.

### Реализация (технически)
1. Общий хук `useClosedBusinessDates(from, to)` уже существует в `src/hooks/use-business-day-closure.ts` — возвращает `Set<string>` YYYY-MM-DD. Переиспользуем.
2. В `Reports.tsx` в компоненте `DailyReport`:
   - подтягиваем `closed = useClosedBusinessDates(from, to)`;
   - в `useQuery` после получения `rows` из RPC делаем `rows.filter(r => closed.has(r.date))`;
   - тоталы и KPI считаются уже по отфильтрованному массиву (они и так это делают).
3. Аналогичный фильтр по `business_date` добавляем в остальные табы Reports, где строки имеют business_date (Shifts, Live Game, Slots, Expenses, Cashless, Miss Chips, Players, Groups агрегируется из daily → отсечётся автоматически).
4. Если в диапазоне вообще нет закрытых дней — таблица показывает пустое состояние с подсказкой «No closed business days in range» вместо «No data».
5. Тоталы `Days` = кол-во закрытых дней в диапазоне (совпадает с числом отображаемых строк).

### Что НЕ трогаем
- Cage / Dashboard / TableTracker / Live Game — там нужны живые данные текущего дня.
- Логику `business_day_closures` и RPC не меняем — только фронтовая фильтрация.

### Файлы
- `src/pages/Reports.tsx` — добавить фильтрацию во все вкладки, где применимо.
- (при необходимости) вспомогательный util `isClosedDate(date, closedSet)` внутри Reports.tsx.
