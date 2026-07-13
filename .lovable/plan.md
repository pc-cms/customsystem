# Boss TV — переставить блоки: MTD сверху, TODAY снизу

Добавляем к предыдущему плану ещё одно изменение по компоновке.

## Изменение порядка внутри каждого казино

Сейчас в `CasinoDoubleBlock`:
- Landscape: TODAY (слева) | MTD (справа)
- Portrait:  TODAY (сверху) / MTD (снизу)

Меняем на:
- Landscape: **MTD (слева) | TODAY (справа)** — MTD ближе к общему тоталу
- Portrait:  **MTD (сверху) / TODAY (снизу)** — под TODAY идут топ-игроки / новые игроки

Причина: под TODAY-блоком дальше по странице идут «сегодняшние» списки (Top Players, New Players), логично поставить их прямо под сегодняшними метриками. MTD-«тотал» уходит наверх карточки — визуально подсказывает, что это накопительная сумма.

То же самое применяем к `CompanyTotalPanel`:
- Сверху — MTD Company Total (с 100 %-полосками по казино).
- Снизу — TODAY Company Total.

## Файлы

- `src/components/boss/casino-double-block.tsx` — поменять порядок двух подблоков (и подписей "TODAY" / "MTD"), сохранить landscape/portrait поведение.
- `src/components/boss/company-total-panel.tsx` — тот же swap на уровне компании.

## Остаётся в силе из прошлого плана

1. `use-boss-dashboard.ts`: Result (live/slots/total, today и MTD) читаем из `fin_day_closing` (`tables_result`, `slots_result`); fallback — `shifts.tables_result` и `cage_slots_shifts.slots_result`. Убрать `chip_snapshots` из хука.
2. `use-business-day-filter.ts`: добавить `boss` в `isPrivileged` — Igor получает полную глубину истории для Player Tracker, Tables, Player Profile и т.п.

Никаких изменений в SQL, RLS и данных.
