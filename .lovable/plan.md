# Виртуальные аккаунты: вход в 12:00, выход только при ролловере дня

## Что сейчас (проверено)

- Виртуальные игроки категории `casino`: ARK FLOOR / ARK LIVE GAME (Arusha), MBI FLOOR / MBI LIVE GAME (Mbeya), MWZ FLOOR / MWZ LIVE GAME (Mwanza), DOD FLOOR / DOD LIVE GAME (Dodoma).
- Вход: edge-функция `auto-checkin-tips`, вызывается двумя дублирующими cron-задачами (`auto-checkin-tips-arusha` и `auto-checkin-tips-daily`) в 10:00 UTC = **13:00 EAT**.
- Выход: `auto_close_business_day` (04:05 UTC = 07:05 EAT, внутри защита «не раньше 7 утра») закрывает все открытые визиты, плюс закрытие бизнес-дня.
- Ручной чекаут в Reception и Guests сейчас доступен всем — визит можно закрыть в любой момент, ничем не блокируется.

## Что сделать

1. **Вход в 12:00 EAT**: перевести расписание на 09:00 UTC и убрать дублирующую cron-задачу, чтобы функция запускалась один раз в сутки.
2. **Запретить ручной выход**: триггер на `casino_visits` блокирует любое проставление `checked_out_at` для игроков категории `casino` (виртуальных), если это делает пользователь из интерфейса. Ошибка с понятным текстом: "Virtual account visits close automatically at the business-day rollover".
3. **Системный выход разрешён**: закрытие через `auto_close_business_day`, `close_business_day`, `close_business_day_with_figures` и `force_close_business_day_0800` продолжает работать — эти функции выставляют внутренний системный флаг, который триггер пропускает. Итого выход остаётся строго в 07:00 EAT / при закрытии дня.
4. **UI**: в Reception и Guests кнопка чекаута для этих аккаунтов скрывается/дизейблится с подсказкой, чтобы пользователь не получал ошибку базы вслепую.
5. Разово проверить, что у виртуальных игроков нет висящих визитов прошлых бизнес-дней.

## Технические детали

- Одна миграция: функция `tg_block_virtual_visit_checkout()` + `BEFORE UPDATE ON public.casino_visits`; пропуск при `current_setting('cms.system_close', true) = 'on'`.
- `CREATE OR REPLACE` для четырёх функций закрытия дня — добавляется `PERFORM set_config('cms.system_close','on',true)` в начале.
- Cron: `cron.unschedule('auto-checkin-tips-arusha')`, `cron.alter_job` для `auto-checkin-tips-daily` на `0 9 * * *`. Выполняется через insert-инструмент (в командах есть ключи проекта), не миграцией.
- Фронтенд: `src/pages/Reception.tsx` и `src/pages/Guests.tsx` — проверка `player.category === 'casino'` перед показом действия чекаута.
- Проверка после применения: `cron.job` показывает одну задачу в 09:00 UTC; попытка ручного чекаута виртуального игрока возвращает ошибку; `auto_close_business_day` закрывает их штатно.
