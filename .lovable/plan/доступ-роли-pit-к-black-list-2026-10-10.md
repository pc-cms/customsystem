# Доступ роли Pit к Black List

## Текущее состояние (проверено)

- **Страница `/blacklist`**: доступ управляется матрицей прав (`role_module_defaults`). У роли `pit` строки для модуля `blacklist` нет — страница для Пита закрыта.
- **Боковое меню** (`AppSidebar.tsx`): пункт Blacklist показывается ролям super_admin, manager, shift_manager, reception, finance_manager, surveillance, account_manager — `pit` отсутствует.
- **Кнопки на странице** (`Blacklist.tsx`): `canBlacklist` уже включает `pit` — интерфейс кнопок готов.
- **Серверная функция** `manager_set_player_blacklist`: разрешает только manager, shift_manager, super_admin — Пит получит отказ даже при открытой странице.

## Изменения

1. **База**: добавить в `role_module_defaults` строку `pit / blacklist / can_view=true / can_write=true`.
2. **База**: расширить `manager_set_player_blacklist` — разрешить роль `pit` (проверка `has_role(_manager_id, 'pit')`). Записи в player_notes и activity_logs остаются как есть.
3. **Интерфейс**: добавить `pit` в список ролей пункта Blacklist в `AppSidebar.tsx`.

## Что не меняется

- Подтверждение действия (manager-аутентификация в диалоге) и формат записей в журнале.
- Остальные роли и их права.

## Проверка

- Пользователь с ролью pit видит Blacklist в меню, открывает страницу, может добавить/убрать игрока из чёрного списка; действие пишется в activity log.
- `npx tsgo --noEmit` без ошибок.
