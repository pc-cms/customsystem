# Attendance: доделать оставшееся (без POS)

Выполняется по очереди, каждый шаг отдельно.

## 1. Office: вкладки All / HR / Tech
- Над таблицами Rota и Attendance в Office появятся вкладки All / HR / Tech, как в Live Game.
- All показывает всех сотрудников Office, HR и Tech — только свой подотдел.
- Коды смен на вкладках HR и Tech свои, на All — только просмотр.

## 2. Floor и Security: вкладки подотделов
- Floor: All / Cash Desk / Bar / Housekeeping / Slots / Reception.
- Security: одна группа, вкладки не нужны.
- Фильтр отдела, который сейчас стоит над таблицей, остаётся.

## 3. Monthly Attendance: фильтр по подотделам
- Рядом с фильтром отдела появится фильтр подотдела (Dealers, Pit Bosses, Cash Desk, Bar, Housekeeping, Slots, Reception, HR, Tech, Security).
- Итоги по часам пересчитываются по выбранному фильтру. Unassigned показываются отдельной группой.

## 4. Проверка
- Одна проверка типов и одна полная сборка.
- Сверка сентября: у каждого, у кого стоит смена в Rota, есть часы в Attendance, и Monthly Attendance показывает те же часы. Данные не меняются.

## Не входит (ждёт вашего решения)
- Приводить ли к часам по кодам дни, где часы вписали вручную (Arusha, Dodoma, Mbeya, Mwanza — список уже присылал). Без вашего «да» не трогаю.

## Технические детали
- Вкладки строятся на `DEPT_UNITS` из `ShiftCodesDialog` и `employee_unit_key` (тот же маппинг должность → подотдел, что и в базе).
- Office/Floor: фильтрация списка сотрудников в `Staff.tsx` по unit; в `ShiftCodesDialog` передаётся `defaultUnit` выбранной вкладки.
- Monthly Attendance: unit считается на клиенте из department + job_position + is_pit_boss (поля уже приходят из `get_monthly_attendance`), фильтр без изменений в базе.
- Версия приложения поднимается.
