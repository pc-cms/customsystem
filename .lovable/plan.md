## Цель
Каждый день в 13:00 EAT (10:00 UTC) все игроки казино Arusha, у которых `first_name` или `last_name` содержит «tips» (ILIKE), автоматически чекинятся в зал (position = `hall`).

## Реализация

### 1. Edge function `auto-checkin-tips`
`supabase/functions/auto-checkin-tips/index.ts`:
- Через service role находит casino Arusha (`slug ILIKE 'arus%'` или `name ILIKE 'arusha%'`).
- Берёт всех игроков этого казино, где `first_name ILIKE '%tips%' OR last_name ILIKE '%tips%'` и `status='active'`.
- Для каждого: апсерт в `casino_visits` на сегодняшнюю дату (Africa/Dar_es_Salaam):
  - если строки нет — `INSERT` с `position='hall'`, `checked_in_by = NULL` (system).
  - если есть и `checked_out_at IS NOT NULL` — переоткрыть (`checked_out_at = NULL`).
  - если уже открыт — пропустить.
- Возвращает `{ casino, processed, opened, reopened, skipped }`.
- Идемпотентна — безопасно дёргать вручную и повторно.

### 2. Cron job
Через `supabase--insert` (содержит секреты — НЕ migration):
```sql
select cron.schedule(
  'auto-checkin-tips-arusha',
  '0 10 * * *',  -- 10:00 UTC = 13:00 EAT
  $$ select net.http_post(
    url:='https://<ref>.supabase.co/functions/v1/auto-checkin-tips',
    headers:='{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
    body:='{}'::jsonb
  ); $$
);
```
Расширения `pg_cron` и `pg_net` уже включены (используются другими кронами).

### 3. Версия
Bump patch в `package.json` (cron + edge function = backend change).

## Что НЕ меняется
- UI, страницы Guests/Reception — без изменений.
- Никаких миграций схемы; используется существующая таблица `casino_visits` с её уникальным индексом `(casino_id, player_id, date)`.
- Логика чекина соответствует ручной из `Guests.tsx` (reopen vs insert).

## Замечания
- Если cashier/reception захотят check-out — обычная кнопка работает как раньше.
- Если в Arusha нет ни одного игрока с TIPS в имени — функция вернёт `processed: 0`, без ошибки.
