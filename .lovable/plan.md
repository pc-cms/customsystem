# Бизнес-день 12/08 не закрылся: Arusha, Mwanza, Dodoma

## Что случилось

Данные по столам за 12/08 есть и не потеряны:

| Казино | Столов | Tables Result | Смена кассы |
|---|---|---|---|
| Arusha | 9 | +14 401 500 | закрыта 13/08 02:12 |
| Mwanza | 8 | −8 315 000 | закрыта 13/08 02:12 |
| Mbeya | 6 | +87 000 | закрыта 13/08 01:20 |

Но запись о закрытии бизнес-дня 12/08 (`business_day_closures`) есть только у Mbeya (закрыл менеджер вручную). У Arusha, Mwanza и Dodoma её нет — поэтому статистика/Day Closings за 12/08 пустые.

## Причина (подтверждена логами)

Оба крона-автозакрытия падают с одной и той же ошибкой:

```text
new row for relation "business_day_closures"
violates check constraint "business_day_closures_closed_method_check"
```

Constraint разрешает только `'manual'` и `'auto_11am'`, а функции пишут новые значения:
- `force_close_business_day_0800()` (05:00 UTC / 08:00 EAT) → `auto_0800`
- `auto_close_forgotten_business_days()` (каждый час после 09:00 EAT) → `auto_09am`

Так что автозакрытие уже несколько дней не работает вообще — закрывается только то, что менеджер закрыл руками. Ручное закрытие Mbeya прошло, потому что метод `manual` разрешён.

## Что делаю

1. Миграция: расширяю check-constraint на `manual`, `auto_11am`, `auto_0800`, `auto_09am` (заодно `auto`), чтобы автозакрытие перестало падать.
2. Досоздаю закрытия бизнес-дня 12/08 для Arusha и Mwanza — с реальными результатами столов из `table_daily_results`, чтобы статистика подтянулась. Dodoma закрою пустым днём (там нет ни смен, ни результатов).
3. Проверяю Day Closings/статистику после закрытия: Tables Result, Drop, Live Tables за 12/08 по каждому казино.

## Что понадобится от вас

Для Arusha и Mwanza в Day Closings нужны цифры слотов за 12/08 (Slot drop / Net win / Cashdesk / Difference / JP) — как вы присылали по Mbeya за 11/08. Без них строка дня закроется с нулями по слотам, и её потом нужно будет дозаполнить вручную через Office → Day Closings.

Также у Mbeya строка 12/08 сейчас с цифрами слотов Drop 25 000 / Net win −20 000 / Cashdesk −20 000 и не залочена — скажите, если это черновик и надо поправить.

## Технические детали

- Таблица: `public.business_day_closures`, constraint `business_day_closures_closed_method_check`.
- Функции: `public.force_close_business_day_0800()`, `public.auto_close_forgotten_business_days()` → обе через `close_business_day(casino, method, force)`.
- Cron: `force_close_business_day_0800` (`0 5 * * *`), `auto-close-business-day` (`5 * * * *`).
- Ошибки видны в `cron_run_log` за 13/08 05:00 и 06:05 UTC.
- Backfill закрытий 12/08 — через `close_business_day_with_figures` / прямой insert с сохранением snapshot, без изменения `table_daily_results`.
