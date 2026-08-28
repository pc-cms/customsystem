# Guests для кассы Slots — только просмотр

Кассир слотов (`cashier_slots`) получает доступ к экрану **Guests** (кто сейчас на флоре), но без каких-либо действий: ни Check In, ни Check Out, ни Edit.

## Что меняется

1. **Доступ к разделу**
   - Пункт меню «Guests» в секции RECEPTION становится видимым для роли `cashier_slots`.
   - В матрице прав добавляется доступ роли `cashier_slots` к модулю `in_casino` (это то, что открывает маршрут `/guests`).

2. **Режим только для чтения на странице Guests**
   - Для `cashier_slots` (если у пользователя нет других ролей, дающих право на действия) скрываются кнопки:
     - «Check In»
     - «Check Out»
     - «Edit» (переход в Reception на редактирование игрока)
   - Клик по строке/открытие карточки игрока в режиме просмотра остаётся как есть; список, столы, время входа/выхода — видны.

3. Остальные роли (reception, pit, manager, super_admin и т.д.) работают без изменений.

## Технические детали

- `src/components/layout/AppSidebar.tsx`: добавить `"cashier_slots"` в `roles` пункта `/guests`.
- Миграция: строка в `role_module_defaults` для `cashier_slots` → модуль `in_casino` (только просмотр). Маршрут гейтится `RoleGuard` через `useMyModulePermissions`, поэтому без записи в матрице страница не откроется.
- `src/pages/Guests.tsx`: ввести флаг `readOnly = roles.includes("cashier_slots") && !roles.some(r => ["reception","pit","manager","shift_manager","super_admin"].includes(r))`; скрыть кнопки Check In / Check Out / Edit при `readOnly`.
- Никакие RLS-политики не ослабляются: чтение `casino_visits`/`players` уже разрешено для персонала казино; кнопки убираются только в UI, а серверные проверки остаются прежними.
