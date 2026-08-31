# Убрать бейджи LIVE в строке Slots (Dashboard TV)

Вкладка уже называется Live, поэтому отдельная пометка на каждой строке Slots избыточна.

## Что меняется

- Убрать бейдж `LIVE` рядом с меткой Slots во всех стилях Dashboard TV (Black Gold, Red Gold, Dark Gold).
- Данные остаются как сейчас: при незакрытом дне Slots берутся из живого фида ACE, при закрытом — из Day Closing. Меняется только оформление.
- Свежесть ACE-фида остаётся доступной как всплывающая подсказка (title) на строке Slots — без визуального шума.

## Технические детали

- `src/components/boss/tv/primitives.tsx`: убрать передачу `badge` в `MetricRow` для строки Slots в `MetricsBlock`; сам проп `badge`/`badgeTitle` в `MetricRow` оставить неиспользуемым или удалить вместе с разметкой пилюли, оставив `title` на строке.
- `src/components/boss/tv/black-gold.tsx`: то же для локального компонента `Line`.
- Логика в `src/lib/boss-display-metrics.ts` и `src/hooks/use-boss-dashboard.ts` не меняется (`usesAce`/`aceHint` продолжают использоваться только для подсказки).
- Поднять версию до 1.3.704.

## Про источник данных строки Tables (ответ на вопрос)

Подтверждено по коду `src/hooks/use-boss-dashboard.ts`:

- Tables Drop (открытый день) — RPC `compute_daily_diff`, то есть сумма peak из `player_day_drop_cache`.
- Tables Result (открытый день) — RPC `chip_snapshots_latest`: последние снимки подсчёта фишек по каждому столу, Σ (actual − expected) × номинал. Да, это именно последние Chips Check по столам.
- Как только день закрыт в Day Closings, Tables Result берётся из `fin_day_closing.tables_result` и перестаёт зависеть от чеков.
