# Ранний дневной старт (live_open_from) — аудит и план

## Что нашёл в коде и БД

### Жёстко зашитые часы (18:00 / 19:00)
- `src/components/pit/BreaklistGrid.tsx`
  - `generateTimeSlots()` — цикл `for (let h = 18; h <= 29)`, шаг 20 мин → сетка Break List всегда 18:00–05:40.
  - `isInWorkingHours(slot)` — `h >= 18 || h < 7`.
  - Логика Sick: `shiftStartIdx = 0 // default = 18:00` — расчёт отработанных часов привязан к индексу первого слота.
- `src/pages/TableTracker.tsx`
  - `generateSlots()` — `for (let h = 19; h <= 30)` → часовые колонки Numbers 19:00…06:00 (Final).
  - Подпись секции «Per-table result · 20-min slots (18:00 → 06:00)».
- `src/components/tables/HeadCountPanel.tsx`
  - `SLOTS` — `h = 19..29`; `getCurrentHourSlot()` возвращает `SLOTS[0]` вне окна 19–07.
- `src/components/tables/ChipCountPanel.tsx`
  - `slotForChipCount()` — разрешены только `19..23` и `00..04`, всё дневное → `null` (авто-запись Chip Count днём не работает).
- `src/lib/business-day.ts`
  - `isAfterBreaklistLock()` — «locked, если время ≥ lock И `h < 18`» — единственный жёсткий 18 в общей библиотеке.
- `src/lib/shift-hours.ts`, `src/pages/Pit.tsx` (подписи M/EM «18:00–05:00») — только текст/нормо-часы, к доступности времени не относится.
- БД: `public.record_table_drop_slot()` — `IF NOT (target_h >= 19 OR target_h <= 6) THEN RETURN 0` → дневные часы не пишут снимок Drop (это серверный крон, важно).

### Break List
- Генерация слотов — только фронт (`BreaklistGrid.tsx`), в БД хранится `breaklist.time_slot` как текст, ограничений на диапазон нет.
- Блокировка: `casinos.breaklist_lock` (+ `breaklist_lock_pending/_from`), промоушен через RPC `get_effective_shift_settings`; клиентская проверка `isAfterBreaklistLock`; триггеры `check_one_dealer_per_slot`, `enforce_breaklist_same_casino`, `clear_future_breaklist_on_shift`, `clear_breaklist_when_off_rota` — все без привязки к времени суток.

### Открытие столов / Live Cashdesk
- Проверил все функции БД: `tables_open`/`shift_start` **не используются ни в одной** функции или триггере (`pg_get_functiondef` содержит их только в `get_effective_shift_settings` и `trg_block_shift_close_if_tables_open` — последняя лишь запрещает закрывать смену при открытых столах).
- `src/components/cage/OpenShiftScreen.tsx` — никаких временных ограничений на открытие смены нет.
- Вывод: **бэкенд сейчас время открытия не проверяет вообще**. Ограничение де-факто только визуальное — сетки просто не показывают дневные часы. Значит UI-изменение достаточно и не создаёт дыры в безопасности; ролевые права менять не нужно.

### Где хранить настройку
Два готовых механизма:
1. `public.casinos` — колонки `tables_open ('17:30')`, `shift_start`, `shift_end ('06:00')`, `breaklist_lock ('06:30')`, `shift_matrix jsonb`. Редактор: `src/components/admin/TimeSettingsPanel.tsx`. Текущие данные: Arusha/Dodoma/Mbeya `shift_start 18:00`, Mwanza `20:00`.
2. `public.casino_settings (casino_id, key, value jsonb)` + `src/lib/casino-settings-spec.ts` + `useCasinoSetting` — группа `time` уже объявлена, но пуста.

## Рекомендация

**Вариант A (per-casino настройка), реализованный как одно поле, а не как toggle.** Toggle 12:00 — частный случай, который через полгода упрётся в «а нам с 14:30». Одно поле покрывает оба сценария и не плодит логику.

Модель данных: `casinos.live_open_from text NOT NULL DEFAULT '18:00'` (рядом с `tables_open`/`shift_end`, в том же редакторе, консистентно с уже существующей schedule-логикой; `casino_settings` хуже — Break List и трекеры читают `casino-info` и без того).

Опционально в UI (не в БД): переключатель «Show daytime hours» в Break List/Numbers, который сворачивает ранние колонки, когда `live_open_from < 18:00`, но данные там уже есть. По умолчанию — развёрнуто с `live_open_from`.

Единый хелпер `src/lib/live-hours.ts`:
- `liveOpenHour(casino) → number` (минуты, поддержка 14:30);
- `generateSlots(openMinutes, endHour, stepMin)` — общий генератор для Break List (20 мин) и Numbers/HeadCount (60 мин);
- `isInLiveHours(slot, openMinutes, endHour)` — замена `isInWorkingHours`.

## Поведение при 12:00 vs 18:00

| Модуль | 18:00 (default) | 12:00 |
|---|---|---|
| Break List | 18:00–05:40 (как сейчас) | 12:00–05:40, первый слот = 12:00, редактирование до `breaklist_lock` |
| Numbers / Table Tracker | 19:00–06:00 | 12:00–06:00 (шаг 1 ч), Final остаётся 06:00 |
| Head Count | 19:00–05:00 | 12:00–05:00 |
| Chip Count автослот | 19–04 | 12–04 |
| Hourly Check баннер | окна 09–21 (уже покрывает день) | без изменений |
| Столы / Live Cashdesk | без ограничений | без ограничений |
| Закрытие дня, `shift_end`, rollover 07:00 | не трогаем | не трогаем |

## Технические шаги

1. Миграция: `ALTER TABLE public.casinos ADD COLUMN IF NOT EXISTS live_open_from text NOT NULL DEFAULT '18:00';` — обратная совместимость полная, все казино сохраняют текущее поведение.
2. `record_table_drop_slot()`: заменить `target_h >= 19 OR target_h <= 6` на диапазон от `live_open_from` соответствующего казино (функция пишет по всем казино — фильтровать per-casino при вставке).
3. Новый `src/lib/live-hours.ts` с генератором слотов и предикатом рабочих часов.
4. `BreaklistGrid.tsx`, `TableTracker.tsx`, `HeadCountPanel.tsx`, `ChipCountPanel.tsx` — перевести на хелпер, брать `live_open_from` из `useCasinoInfo()`.
5. `business-day.ts::isAfterBreaklistLock` — принимать `openHour` параметром вместо константы 18.
6. `TimeSettingsPanel.tsx` — поле «Live Open From» в левой колонке (Working Hours) + подсказка «Earliest hour tables/breaklist appear. Does not change closing».
7. Sick-логика Break List: `shiftStartIdx` считать от индекса слота смены, а не от 0.

## Краевые случаи
- **14:30** — слоты выравниваются вниз до шага сетки (Break List → 14:20, Numbers → 14:00); хранение в минутах, не в часах.
- **День уже открыт** — изменение `live_open_from` только добавляет/скрывает колонки, записи не удаляются; уже сохранённые дневные слоты всегда показываем, даже если настройка позже поднята обратно на 18:00.
- **Refresh** — значение приходит из `casino-info`, отдельного состояния нет.
- **Africa/Dar_es_Salaam** — весь расчёт через существующий `nowEAT()`, новых конверсий не вводим.
- **После полуночи** — генератор продолжает работать в «виртуальных часах» 24…30, бизнес-дата по-прежнему через `business_date_of`/rollover 07:00.
- **Mwanza `shift_start 20:00`** — сейчас сетка всё равно рисуется с 18:00; после изменения можно выставить им `20:00` и сетка станет короче (обсудить, менять ли).

## План тестирования
1. Дефолт `18:00` — Break List/Numbers/HeadCount выглядят байт-в-байт как сейчас (регресс по скриншотам).
2. Ставим Arusha `12:00` → появляются слоты 12:00+, ввод сохраняется, Mwanza остаётся 18:00 (изоляция per-casino).
3. `14:30` → первый слот 14:20 (BL) / 14:00 (Numbers).
4. Смена настройки в середине дня → уже введённые дневные данные не пропадают.
5. Крон `record_table_drop_slot()` пишет дневной слот для казино с ранним стартом и не пишет для остальных.
6. `breaklist_lock` продолжает блокировать редактирование утром; закрытие дня и `shift_end` не изменились.
