## Цель

Убрать «капризную» память горизонтальной прокрутки в `BreaklistGrid` и заменить её на детерминированный якорь: при каждом маунте/смене даты сетка автоматически центрируется на текущем 20-минутном слоте (`currentSlot`). Никакого sessionStorage, никаких сбросов в 0.

## Поведение

- **Сегодняшняя дата (`isToday`)**: после загрузки данных скроллим контейнер так, чтобы колонка `currentSlot` оказалась примерно по центру видимой области (`scrollLeft = slotLeft − (viewportWidth − slotWidth) / 2`, кламп в `[0, scrollWidth − clientWidth]`).
- **Прошлые/будущие даты**: якорим на 18:00 (начало смены) — слева, `scrollLeft = 0`. Это естественное «домой» для просмотра архива.
- **Ручная прокрутка пользователя**: разрешена и ничем не блокируется. Авто-центрирование срабатывает только один раз за маунт + при смене `date`. Реалтайм-инвалидации данных не двигают скролл.
- **Кнопки/панель**: не добавляем (пользователь выбрал вариант C — без памяти, без кнопок).

## Технические изменения

Файлы:

- `src/components/pit/BreaklistGrid.tsx`
  - Удалить импорт и использование `useScrollMemory` (строки 19, 85). Снять `ref`/`onScroll` со скролл-контейнера (строка 445), оставить обычный `<div className="cms-panel overflow-auto">`.
  - Завести локальный `scrollRef = useRef<HTMLDivElement>(null)` и `data-slot={slot}` атрибут на ячейках заголовка времени (или на первой ячейке столбца), чтобы найти координату нужного слота через `querySelector('[data-slot="HH:MM"]')`.
  - Новый `useEffect`, ключи: `[date, isToday, dealers.length, currentSlot]`, флаг `didAnchorRef` сбрасывается при смене `date`. Логика:
    ```text
    if (!scrollRef.current || dealers.length === 0) return;
    if (didAnchorRef.current) return;
    const target = isToday ? currentSlot : "18:00";
    const el = scrollRef.current.querySelector(`[data-slot="${target}"]`);
    if (!el) return;
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const wrap = scrollRef.current!;
      const wrapRect = wrap.getBoundingClientRect();
      const delta = rect.left - wrapRect.left - (wrap.clientWidth - rect.width) / 2;
      wrap.scrollLeft = Math.max(0, Math.min(wrap.scrollWidth - wrap.clientWidth, wrap.scrollLeft + delta));
      didAnchorRef.current = true;
    });
    ```
  - При смене `date` сбрасывать `didAnchorRef.current = false` отдельным `useEffect`.

- `src/hooks/use-scroll-memory.ts`
  - Оставить файл как есть (используется только в брейклисте; на случай, если понадобится вернуть — пусть лежит). Если хочешь чистоту — удалить; уточним при имплементации, но по умолчанию оставляем.

## Что НЕ меняем

- Никаких изменений в данных, реалтайме, ролях, ячейках, попап-пикере, attendance.
- Никаких новых кнопок, тулбаров или настроек.
- Вертикальная прокрутка/зум — без изменений.

## Проверка

1. Открыть `/pit?tab=breaklist` на сегодняшнюю дату → колонка текущего слота должна оказаться в центре видимой части без ручной прокрутки.
2. Прокрутить вручную влево/вправо → позиция держится, реалтайм-обновления ячеек её не трогают.
3. Сменить дату на вчерашнюю → скролл «домой» (18:00 слева).
4. Вернуться на сегодня → снова авто-центр на `currentSlot`.
