# Удаление сотрудника для Shift Manager (Mwanza, Valeriy)

## Причина

Valeriy (Mwanza) имеет роль `shift_manager`. Права в базе разошлись:

- таблица `employees`: запись разрешена ролям super_admin, hr, manager/GM **и shift_manager** — поэтому создание и inline-правка работают;
- функция удаления `hr_delete_employee` проверяет только super_admin, hr и `manage.core` (manager / general_manager / super_admin). Shift Manager в список не входит → «Not allowed to delete this employee».

Интерфейс Staff Master показывает кнопку удаления Shift Manager'у, а база её отклоняет.

## Что делаю

Привожу удаление к тем же правам, что и остальная запись по сотрудникам: разрешаю `shift_manager` удалять сотрудника **только в рамках своего казино** (проверка casino scope сохраняется). Остальная логика функции (очистка роты, брейклиста, посещаемости, отвязка от транзакций и payroll) не меняется.

## Технически

- Миграция: `CREATE OR REPLACE FUNCTION public.hr_delete_employee` — в условие доступа добавляется `has_role(auth.uid(), 'shift_manager')` внутри той же ветки с `has_casino_scope`. Тело функции остаётся байт-в-байт прежним.
- Фронтенд не меняется (кнопка уже видна Shift Manager'у).
- Поднять версию приложения (`package.json`), прогнать typecheck / тесты / сборку.
- Проверка: удаление тестового сотрудника Mwanza под ролью shift_manager; попытка удалить сотрудника другого филиала должна по-прежнему отклоняться.

Публикация не выполняется.
