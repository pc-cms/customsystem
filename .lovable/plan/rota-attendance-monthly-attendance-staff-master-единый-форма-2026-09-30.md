# Rota / Attendance / Monthly Attendance / Staff Master — единый формат и без 404

## 1. Найти все 404 (сначала проверка, без правок)
- В браузере под вашим входом открыть каждую кнопку меню: Live Game, Floor, Security, Office, Management (свёрнутое и развёрнутое меню), все пункты Rota и Attendance, Monthly Attendance, Staff Master, старые адреса (`/pit?tab=…`, `/staff?tab=…`).
- Составить список: какая кнопка → какой адрес → 404 или нет. Причина по каждому — по факту, не догадкой.

## 2. Исправить 404
- Все кнопки ведут только на существующие страницы; старые/виртуальные адреса перенаправляются на нужный отдел.
- Если кнопка скрыта правами — не показывать её, а не вести на 404.

## 3. Один формат отделов везде
Единый порядок и названия во всех экранах (Staff Master, Rota, Attendance, Monthly Attendance, окно Shift codes):

```text
Live Game   Dealers · Pit Bosses
Floor       Cash Desk · Bar · Housekeeping · Slots · Reception
Security    Security
Office      HR · Tech
Unassigned
```
- Staff Master: группировка по отделу и подотделу в этом порядке, колонка подотдела (определяется по должности, только показ). Группа «Other» убирается — всё неизвестное идёт в Unassigned.
- Monthly Attendance: те же группы и порядок, заголовки отдел → подотдел, «Other»/«Floor по умолчанию» убираются.
- Rota / Attendance: вкладки подотделов в том же порядке и с теми же названиями.
- Названия должностей только из общего справочника.

## 4. Проверка
- Одна проверка типов + одна сборка.
- Повторный проход в браузере по списку из шага 1: ни одного 404; количество людей в каждой группе совпадает в Staff Master, Rota/Attendance и Monthly Attendance.
- Данные сотрудников и часы не меняются.

## Технические детали
- Один общий модуль справочника (отдел → подотдел → должность, порядок, подписи, `unitOf`) — зеркало `employee_unit_key`; его используют StaffMaster, AttendanceMonthly, Staff, Pit, ShiftCodesDialog вместо локальных копий (`DEPT_ORDER`, `UNIT_FILTERS`, `DEPT_UNITS`, `mapDept`).
- Маршруты: сверить `AppSidebar` (DEPT_GROUP_SUBITEMS, свёрнутый режим), `App.tsx`, `route-module-map.ts`, `RoleGuard`; добавить редиректы для `__dept:*__`.
- Версия приложения поднимается.
