# Miss Chips / Miss Cards: правильная привязка к месяцу

## Проблема (подтверждено данными)

Miss Chips считается по дате `closed_at` смены, а не по игровому дню. Ночные смены, которые открываются последним числом месяца и закрываются под утро первого числа следующего, попадают в чужой месяц:

- Arusha: смена от 31/07 (закрыта 01/08 02:34) — Miss 609 000 ушёл в август
- Mwanza: смена от 31/07 (закрыта 01/08 02:10) — Miss 231 000 ушёл в август

Итого июль недосчитывается 840 000, а август стартует не с нуля.

Miss Cards (Cage Slots) уже считается по `business_date` — там проблемы нет.

## Что делаем

1. Привязать Miss Chips к игровому дню смены (ролловер 07:00 EAT), а не к календарной дате закрытия. Использовать существующую функцию `business_date_of(opened_at)`.
2. Для Miss Cards оставить логику по `business_date`, но убрать fallback на `closed_at` (заменить на игровой день от `opened_at`), чтобы поведение было единым.
3. Никакого переноса остатка: каждый месяц стартует с 0, статистика Miss сохраняется помесячно — как и было задумано.

## Технические детали

- Миграция: обновить RPC `fin_balance_snapshot`:
  - блок Miss Chips — фильтр `business_date_of(s.opened_at) BETWEEN p_period_start AND p_period_end`
  - блок Miss Cards — `COALESCE(business_date, business_date_of(COALESCE(opened_at, closed_at)))`
- Фронтенд не меняется: Wallets / Finance Breakdown и Day Closings Totals читают те же поля снапшота.

## Результат

- Июль 2026: Miss Chips включает 609 000 (Arusha) и 231 000 (Mwanza)
- Август 2026: Miss Chips и Miss Cards стартуют с 0
