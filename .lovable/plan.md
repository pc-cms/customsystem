# Пересчёт часов Attendance по Shift Codes (октябрь)

## 1. Пересчёт заполненных дней
Часы = конец смены − начало смены из Shift Codes своего казино и подотдела (через полночь учитывается).
- Mwanza HR, M: 11 → 8 (5 дней).
- Mbeya Bar, Slots, Reception, N: 9 → 8 (4 дня).
- Mbeya Housekeeping, Slots, D и N: 9 → 8 (5 дней).
- Mbeya Dealers, N: 9 → 8 (2 дня).
- Dodoma Pit Bosses, M: 10 → 9 (2 дня).
- Не трогаю: Mbeya Dealers D 7 ч и Dodoma Housekeeping D 6 ч (похоже на ручную правку), а также A, S, SP, L, O и значения вида 8L, 3S.

## 2. Код D для Pit Bosses в Mbeya
- Создаю код D у Pit Bosses Mbeya с тем же началом и концом, что у D у Dealers Mbeya. Часы считаются как конец − начало.
- Заполняю этими часами 2 пустых дня с D в Attendance.

## 3. Без подотдела
- 3 сотрудника Mbeya со сменой D без отдела: часы не ставлю, пока им не назначен отдел в Staff Master. Покажу имена.

## 4. Проверка
- Повторная сверка Rota → Attendance → Monthly Attendance за 1–9 октября по всем казино: расхождений нет, кроме оставленных ручных правок.

## Технические детали
- Изменение данных в `dealer_attendance` / `staff_attendance` только по найденным строкам (employee_id + date), значение = `shift_codes.hours` подотдела.
- Новая запись `shift_codes` (Mbeya, pit, unit `pit_bosses`, D), start/end скопированы из unit `dealers`, hours = end − start.
