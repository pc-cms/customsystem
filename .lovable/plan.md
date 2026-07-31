# Печатный отчёт смены: Result по фишкам закрытия + пересчёт Miss Chips

## Что не так сейчас (проверено в БД)

Смена Arusha 30/07 (`66860611…`):

- Мастер «Close Tables» записал в столы `closing_chips` и `closing_result`: AR1 7 852 000, AR2 155 000, BJ1 −55 000, P1 120 000 → **8 072 000** (это видно на экране закрытия).
- Финальные строки Chip Count в `chip_snapshots` за 30/07 при этом НЕ появились: последние снимки — почасовые проверки 22:58.
- Печатный отчёт считает Result через RPC `compute_shift_table_results`, который смотрит только `chip_snapshots`: AR1 4 900 000, AR2 −1 640 000, BJ1 −60 000, P1 150 000 → **3 350 000**. Отсюда «фигня» в печати.
- Fill/Credit по смене нет (0 записей в `cage_transfers`), т.е. расхождение целиком из-за снимков.
- `miss_total = 0`, потому что при закрытии кассы фишки записаны ровно как на открытии (`closing_count.chips` = `opening_float.chips`).

## Что делаем

Источник истины остаётся Chip Count — но закрытие стола обязано быть последним Chip Count.

### 1. Системно (все казино)

- Изменить RPC `compute_shift_table_results`: если у стола заполнен `closing_chips`, использовать его как финальный счёт фишек (вместо последнего почасового снимка). Формула не меняется: `Σ(actual − baseline)·denom − Fill + Credit`.
- Тот же приоритет применить в `src/lib/table-live-result.ts` (фронтовый fallback) и в `ShiftClosingReport.tsx`, чтобы экран, печать и повторная печать давали одну цифру.
- В `useSetSingleTableResult` (`src/hooks/use-table-lifecycle.ts`) гарантировать запись финальных строк `chip_snapshots` при сохранении закрытия (сейчас они пишутся только если UI передал `snapshot_rows`; строим их из `closing_chips` + baseline, если не переданы).

### 2. Разовый бэкфилл Arusha 30/07

- Дописать в `chip_snapshots` финальные строки за 30/07 из `gaming_tables.closing_chips` (по одной на номинал и стол) с временем закрытия смены.
- После этого RPC вернёт 8 072 000, и печатный отчёт совпадёт с экраном закрытия.

### 3. Miss Chips и пересчёт итогов

- Вы даёте фактический пересчёт фишек кассы (cage) по номиналам на закрытие смены 30/07.
- Записываем его в `shifts.closing_count.chips`, считаем `miss_total = Σ(факт − открытие)·номинал` по каждому номиналу.
- Пересчитываем `shift_result` и баланс смены по действующей формуле и обновляем запись смены, чтобы Dashboard, Day Closings и печать сошлись.

## Технические детали

- Изменяемые файлы: миграция RPC `compute_shift_table_results`, `src/lib/table-live-result.ts`, `src/components/cage/ShiftClosingReport.tsx`, `src/hooks/use-table-lifecycle.ts`.
- Данные: INSERT в `chip_snapshots` (Arusha, 2026-07-30), UPDATE `shifts` (`closing_count`, `miss_total`, `shift_result`, `balance`).
- Поднимаем версию в `package.json`.

## Что нужно от вас

Фишки закрытия кассы (cage) на 30/07 по номиналам: 5 000 000, 1 000 000, 500 000, 100 000, 50 000, 25 000, 10 000, 5 000, 2 000, 1 000, 500.
