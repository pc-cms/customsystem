# Отделы и подотделы: единый справочник, свои коды смен, новое меню

## Что сейчас (проверено в базе)

В Staff Master отделы записаны вразнобой: у одних казино `Floor`, у других `Bar`, `Cash Desk`, `Housekeeper`, `Slots`; должности — `Cleaner` в Arusha и `Housekeeper` в Mbeya/Dodoma/Mwanza — это одно и то же. Коды смен сейчас есть только на уровне Pit / Floor / Security / Office / Management, поэтому бармены, кассиры и уборщики всегда считаются по кодам Floor.

## Единый справочник (Отдел → Подотдел → Должность)

```text
Live Game   Dealers        Dealer, Inspector, Trainee
            Pit Bosses     Pit Boss
Floor       Cash Desk      Cashier, Head Cashier
            Bar            Bartender, Waiter
            Housekeeping   Housekeeper            (Cleaner → Housekeeper)
            Slots          Slot Attendant
            Reception      Receptionist, Hostess
Security    Security       Security, Supervisor Security
Office      HR             HR, Manager
            Tech           IT, Trainer
Management  (отдельный список менеджеров/CCTV — как сейчас)
```

- Всем сотрудникам проставляется отдел + подотдел по этой таблице; старые значения (`Bar`, `Cash Desk`, `Housekeeper`, `Slots` в поле отдела) переводятся в `Floor` + нужный подотдел. `Cleaner` переименовывается в `Housekeeper`.
- Staff Master: выпадашки Отдел → Подотдел → Должность только из справочника.

## Коды смен с наследованием

- Коды можно задать на уровне подотдела (например, Floor → Bar в Dodoma). Если у подотдела своих кодов нет — берутся коды отдела (Floor), если и их нет — встроенные значения.
- Одинаковое правило везде: Rota (прогноз), Attendance (факт и автозаполнение), автозаполнение при закрытии дня, Master Attendance.
- В окне кодов смен появляется выбор подотдела и пометка «inherits from Floor».

## Новое меню слева

```text
Live Game      вкладки: All · Dealers · Pit Bosses      (Rota / Attendance / Codes)
Floor          сводно все подотделы, группировка по подотделам
Security       Rota / Attendance / Codes
Office         вкладки: All · HR · Tech
Management     отдельный раздел (текущая сетка менеджеров + Attendance)
Monthly Attendance   все отделы и часы за месяц, фильтр по отделу/подотделу
```

Каждая страница отдела — одна универсальная страница с переключателем Rota / Attendance и кнопкой кодов смен. Старые адреса перенаправляются на новые.

## Проверка после

- Сверка сентября: у каждого сотрудника часы = код его подотдела (или унаследованный), пропусков нет, Monthly Attendance совпадает с экранами.
- Уже внесённые вручную часы не меняются.

## Уточнить (по умолчанию как выше)

- Security вы не назвали — оставляю отдельной кнопкой.
- Manager (Mbeya) → Office/HR, Trainer (Arusha) → Office/Tech, Waiter в отделе Slots (Mwanza) → Floor/Slots как Slot Attendant, 2 сотрудника в Mwanza без отдела — оставляю без отдела, покажу списком.

## Технические детали

- Таблицы: `staff_units` (department, unit, sort) и `staff_positions` (unit, position); в `employees` добавляется `unit` (nullable) + бэкфилл, старое значение `department` нормализуется одним UPDATE по маппингу.
- `shift_codes`: новый столбец `unit` (nullable); поиск кода: (casino, dept, unit) → (casino, dept, null) → встроенные.
- `attendance_autofill_day` и `get_monthly_attendance` переводятся на это правило (Monthly берёт часы из уже заполненных значений + коды при пустом).
- Фронт: общий компонент `DepartmentPage` (dept, units, mode) поверх существующих сеток Pit/Staff; `AppSidebar` — новые пункты; редиректы со старых `/rota/*`, `/attendance/*`.
- Права: новые ключи модулей наследуют текущие права Rota/Attendance соответствующего отдела.
