# Dashboard: три плитки сверху + колонки Slots / Live Table

## Что меняем (только страница Dashboard, `/dashboard`)

Сейчас сверху две панели: «Day at a glance» и «Tables Totals», а данных по слотам нет вообще.

### 1. Верхний ряд — три плитки

```text
+---------------+---------------+-------------------------+
| EXPENSES      | HEADCOUNT     | TOTAL (Live + Slots)    |
| 2             | 41            | +4 560 000              |
+---------------+---------------+-------------------------+
```

- Expenses — то же значение, что сейчас (pending approvals), ссылка на /expenses.
- Headcount — визиты за бизнес-день, ссылка на /reception.
- Total = Result Live Tables + Net Win Slots (ACE). Зелёный/красный по знаку.

### 2. Ниже — две колонки

Колонка **Slots** (источник — ACE Collector, обновление раз в 5 минут):
- Drop — `total_drop`
- Active Credits — плейсхолдер `·` (поле придёт в следующем обновлении ингеста ACE)
- Result — `net_win` (итоговая строка колонки)
- Подпись со свежестью: `ACE Live · Nm ago`. Если данных нет или они старше 15 минут — строки показывают `·` и подпись `No ACE data`.

Колонка **Live Table** (как сейчас, без изменений в расчётах):
- Total ARs / Total BJ / Total Poker
- Result (итог = Total Casino)

Строки Active Players и Total Drop по столам остаются доступны — Total Drop переносится в колонку Live Table как отдельная строка, Active Players — в плитку Headcount как подпись, чтобы ничего не потерялось.

## Технические детали

- Файл: `src/pages/Dashboard.tsx`. Новых запросов к БД не добавляем, кроме уже существующего хука.
- Данные слотов: `useAceLiveSlotsResult(slug)` из `src/hooks/use-ace-finance.ts`; slug активного казино берём из `useCasino()` (`src/lib/casino-context.tsx`), а не хардкодом.
- Freshness-гейт уже встроен в хук (`ACE_LIVE_MAX_AGE_MS` = 15 мин) — при `fresh === false` слоты показываются как `·` и в Total не входят.
- Компонент `SummaryPanel` переиспользуем для колонок; для трёх верхних плиток добавим небольшой локальный компонент `StatTile` в том же файле.
- Права/роли, Top players today и CCTV-секция не трогаются.
