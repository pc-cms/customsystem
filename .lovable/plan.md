# Виртуальные TIPS-игроки не блокируют закрытие дня

## Проблема (подтверждено в базе)

Виртуальные "боты" для чаевых (категория `casino`: `ARK/MWZ/MBI/DOD — FLOOR`, `LIVE GAME`, `CLUB POKER`) автоматически чекинятся в 12:00 EAT и никогда не выписываются — ручной checkout для них запрещён триггером. Сейчас у 8 таких игроков висят открытые визиты (Arusha 2, Mwanza 2, Mbeya 2, Dodoma 2).

Функция `list_open_cycles_for_day` считает эти визиты и любые их сессии как «открытые циклы», поэтому `close_business_day_with_figures` возвращает `has_open_cycles`, и Close Day не проходит.

## Что меняем

Одна миграция базы: в `list_open_cycles_for_day` исключить виртуальных игроков из двух блоков:

- `active_sessions` — не учитывать сессии игроков с `players.category = 'casino'`
- `open_visits` — не учитывать визиты игроков с `players.category = 'casino'`

Остальные блокировки (открытая смена кассы, смена слотов, открытые столы, реальные игроки) работают как раньше.

## Технические детали

```sql
CREATE OR REPLACE FUNCTION public.list_open_cycles_for_day(_casino_id uuid) ...
-- active_sessions
FROM public.client_sessions cs
JOIN public.players p ON p.id = cs.player_id
WHERE cs.casino_id = _casino_id AND cs.stopped_at IS NULL
  AND p.category <> 'casino'

-- open_visits
FROM public.casino_visits cv
JOIN public.players p ON p.id = cv.player_id
WHERE cv.casino_id = _casino_id AND cv.checked_out_at IS NULL
  AND p.category <> 'casino'
```

Сигнатура, права и `SECURITY DEFINER` не меняются, поэтому фронтенд (`useOpenCyclesForDay`, `CloseBusinessDayButton`) правок не требует — чек-лист «No active sessions / open visits» станет зелёным автоматически.

Версия в `package.json` поднимается до 1.3.621.
