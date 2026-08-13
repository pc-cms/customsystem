# Бизнес-день 12/08: статус и починка автозакрытия

## Статус на 10:30 EAT 13/08

| Казино | День 12/08 | Tables Result | Слоты (Drop / Net / CD) |
|---|---|---|---|
| Arusha | закрыт вручную 10:21 | +14 401 500 | 96 203 490 / −9 194 520 / −9 297 765 |
| Mbeya | закрыт вручную 04:38 | +87 000 | 25 000 / −20 000 / −20 000 |
| Mwanza | НЕ закрыт | −8 315 000 (столы есть) | не внесены |
| Dodoma | НЕ закрыт | нет данных | нет данных |

Да, Аруша закрыта. Цифры Mbeya (Drop 25 000, Net −20 000, CD −20 000, Cashless 0, JP 0) совпадают с тем, что уже в базе — менять нечего.

Данные столов за 12/08 нигде не потеряны: `table_daily_results` заполнена по всем казино, смены кассы столов закрыты. Пустой в статистике был только сам «день».

## Причина, почему дни не закрылись сами (подтверждено логами)

Оба крона автозакрытия падают с одной ошибкой:

```text
new row for relation "business_day_closures"
violates check constraint "business_day_closures_closed_method_check"
```

Constraint разрешает только `manual` и `auto_11am`, а функции пишут новые методы:
- `force_close_business_day_0800()` (08:00 EAT) → `auto_0800`
- `auto_close_forgotten_business_days()` (ежечасно после 09:00 EAT) → `auto_09am`

То есть автозакрытие не работает вовсе — проходит только ручное. Именно поэтому Mbeya и Arusha закрыты (руками), а Mwanza и Dodoma висят.

## Что делаю

1. Миграция: расширяю check-constraint до `manual`, `auto_11am`, `auto_0800`, `auto_09am`. После этого автозакрытие в 08:00 EAT снова начнёт работать.
2. Закрываю бизнес-день 12/08 для Mwanza (столы уже посчитаны, результат −8 315 000) и для Dodoma (пустой день).
3. Проверяю после закрытия: Day Closings, Statistics и Live Tables за 12/08 по всем казино.

## Нужно от вас

Цифры слотов Mwanza за 12/08: Slot drop / Net win / Cashdesk / Cashless money / JP. Без них день закроется с нулями по слотам, и строку придётся дозаполнять вручную в Office → Day Closings.

## Технические детали

- `public.business_day_closures`, constraint `business_day_closures_closed_method_check`.
- Функции: `force_close_business_day_0800()`, `auto_close_forgotten_business_days()` → обе через `close_business_day(casino, method, force)`.
- Cron: `force_close_business_day_0800` (`0 5 * * *` UTC), `auto-close-business-day` (`5 * * * *`).
- Ошибки в `cron_run_log` за 13/08 05:00 и 06:05 UTC.
- Закрытие 12/08 для Mwanza/Dodoma — через `close_business_day` со снапшотом, без правки `table_daily_results`.
