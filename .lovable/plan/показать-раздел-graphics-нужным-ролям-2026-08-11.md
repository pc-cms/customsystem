# Показать раздел Graphics нужным ролям

## Что не так сейчас

Проверено в базе: у модуля `report_graphics` во всех ролях стоит `can_view = false` (manager, shift_manager, finance_manager, surveillance, super_admin, boss, general_manager). Поэтому пункт меню скрыт у всех, включая супер-админа.

Дополнительно в сайдбаре (`src/components/layout/AppSidebar.tsx`) пункт Graphics ограничен ролями `super_admin, manager, shift_manager, finance_manager, surveillance` — ролей `boss` и `general_manager` там нет.

## Что делаем

1. Включаем `can_view = true` для модуля `report_graphics` ролям: General Manager, Boss, Finance Manager, Super Admin, Manager, Shift Manager, Surveillance.
2. Добавляем `boss` и `general_manager` в список ролей пункта Graphics в сайдбаре.
3. Поднимаем версию приложения.

После этого Graphics появится в разделе ANALYTICS рядом со Statistics.

## Технические детали

- Миграция: `update public.role_module_defaults set can_view = true where module_key = 'report_graphics' and role in (...)`.
- `src/components/layout/AppSidebar.tsx` — строка пункта `/reports/graphics`, дополнить массив `roles`.
- `package.json` — версия 1.3.597.
