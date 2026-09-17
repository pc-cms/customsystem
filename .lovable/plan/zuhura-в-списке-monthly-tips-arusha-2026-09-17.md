# Zuhura в списке Monthly Tips (Arusha)

Zuhura Omari числится в отделе Office (должность Trainer), а в график чаевых попадают только сотрудники отдела Pit. Поэтому её там нет.

## Что сделаем

1. Добавим сотруднику отдельную отметку «участвует в чаевых» — независимую от отдела.
2. В Monthly Tips список участников = сотрудники Pit + все с этой отметкой. Такой сотрудник получает обычную строку: дни периода, часы, Extra, Bonus, PTS и расчёт суммы — как у остальных.
3. Включим отметку для Zuhura Omari (Arusha).

Weekly Bonus и график смен Pit остаются без изменений — там она не появится.

## Технические детали

- Миграция: `ALTER TABLE public.employees ADD COLUMN tips_participant boolean NOT NULL DEFAULT false;` (аддитивно, с дефолтом — ничего не ломает).
- Данные: `UPDATE public.employees SET tips_participant = true WHERE id = 'a8703418-1816-4279-a30f-21806da08f37';` (Zuhura Omari, Arusha).
- `src/hooks/use-dealers.ts`: новый хук `useTipsParticipants()` — выборка сотрудников казино с `deleted_at IS NULL`, `department <> 'Pit'` и `tips_participant = true`, маппинг через тот же `mapEmployeeToDealer`.
- `src/pages/MonthlyTips.tsx`: объединить `useDealers()` и `useTipsParticipants()` в один список перед построением `rows`, дедупликация по `id`. Категория для сортировки/бейджа у таких сотрудников — `dealer` (или без буквы категории, если так чище визуально).
- Никаких изменений в формулах расчёта пула и распределения.
