# Проверка формул Dashboard TV — изменений не требуется

Проверены формулы Slots Result во всех трёх местах:

- **Dashboard TV, Live (свежий ACE, ≤15 мин):** `net_win − active_credits`
  (`src/lib/boss-display-metrics.ts` → `deriveDisplayedToday`)
- **Dashboard TV, закрытый день / фолбэк:** `cashdesk_win − players_card_balance`
  (`closedDaySlotsResult`, используется в `use-boss-dashboard`)
- **Monthly Report:** `Σ per closed day (cashdesk_win − players_card_balance)`
  (SQL-функция `boss_monthly_report`, строка `slots_net`)

Регрессионный тест `src/test/boss-display-metrics.test.ts` фиксирует оба правила
(ACE никогда не использует `win_cashdesk`; закрытые дни никогда не используют `net_win`).

## Действия

Никаких — код, база и отчёты остаются без изменений.
