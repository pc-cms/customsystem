# Меню: чистка для Shift Manager + возврат Blacklist

## Что меняем

1. **Shift Manager больше не видит:**
   - ANALYTICS → Groups
   - FINANCE → Budget
   - HR → Warnings

2. **Blacklist возвращается в левое меню для всех ролей**, у которых он разрешён (super_admin, manager, shift_manager, finance_manager, general_manager, boss, reception, surveillance, account_manager), и **убирается кнопка Blacklist** из шапки страницы Player Tracking. Кнопка Merge Duplicates там остаётся.

## Технические детали

- `src/components/layout/AppSidebar.tsx`
  - Убрать спец-фильтр, который прятал `/blacklist` у всех, кроме reception/surveillance/account_manager.
  - Из `roles` пунктов `/groups`, `/budget`, `/hr/warnings` убрать `shift_manager`.
  - Добавить в фильтр явное правило: скрывать эти три маршрута для роли `shift_manager` (видимость по матрице модулей).
- Миграция в БД (`role_module_defaults`): для роли `shift_manager` выставить `can_view = false` для `groups`, `hr_warnings` (у `finance_budget` уже false). Персональные override'ы для этих модулей у shift-менеджеров отсутствуют, так что дополнительной чистки не требуется.
- `src/pages/PlayerStatistics.tsx`: удалить кнопку Blacklist из `PageHeader`, оставив Merge Duplicates.
- Поднять версию приложения.
