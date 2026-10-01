# Автоперенос остатка Tips на следующий месяц (все казино)

## Что получит пользователь
- Во вкладке Tips (Tips & Bonuses) при выборе целого месяца появляются строки:
  - **START** сверху: остаток чаевых с прошлого месяца (Tips IN − Tips OUT за всё время до начала месяца).
  - **END** снизу: START + Net текущего месяца.
- START следующего месяца всегда равен END предыдущего. Ничего вручную переносить больше не нужно.
- Карточки Tips IN / OUT / Net остаются как есть (только движения месяца). Добавляется карточка **Tips START** и **Tips END**.
- Bonuses не переносятся.
- Работает во всех четырёх казино.

## Замена ручных переносов на START
Удаляются пары ручных записей «перенос на следующий месяц» (в сумме дают 0, кассы не меняются):
- Mbeya: −1 439 000 (31/08 «to September 2026») и +1 439 000 (01/09 «from August 2026»).
- Mwanza: −1 849 474 (31/08 «Transfer to September») и +1 849 474 (01/09 «from August 2026»).

После этого START сентября в Mbeya и Mwanza получится автоматически из итога августа.

Не трогаем (это не пары переносов):
- Arusha +2 020 000 (02/08 «Tips from July 2026») — у неё нет парной записи за июль; если удалить, касса Arusha уменьшится на 2 020 000. Остаётся как обычный IN августа.
- Dodoma −455 000 (31/08 «balance was 0»), Mbeya +456 000 (24/08 «From 08.08.26»), Mwanza +2 000 (17/09 «from te tips»).

Каждое удаление записывается в журнал изменений финансов.

## Технические детали
- SQL-функция `tips_carry(p_casino_id uuid, p_month_start date) → numeric`: SUM(amount × coalesce(fx_rate,1)) из `fin_other_incomes` где source = 'tips', business_date < p_month_start, reverses_id IS NULL и reversed_by_id IS NULL. Security definer, проверка доступа к казино через существующую функцию доступа. Без новых таблиц.
- Удаление 4 записей через существующий RPC удаления прочих доходов (удаляет связанный wallet tx и пишет fin_audit_log).
- `src/pages/office/TipsBonusTab.tsx`: isWholeMonth (как в MissChips), useQuery `["tips-carry", casinoId, from]` → rpc `tips_carry`; карточки START/END; в таблице при фильтре all/tips — строка START первой и END в футере. Инвалидация вместе с other-incomes.
- Финансовые отчёты не меняются.
