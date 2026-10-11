# Столы и флот: перенос в Settings + доступ Manager и Finance Manager

## Что сделаю
1. **Новый пункт меню «Settings → Tables & Float»** (отдельная страница, не внутри Admin). Три вкладки:
   - **Tables**: добавить стол, переименовать, порядок, Activate / Deactivate (блокировка). Это те же функции, что сейчас в Admin.
   - **Float**: базовый флот каждого стола по номиналам. Сейчас эта функция тоже в Admin.
   - **Move Chips** (новое): выбрать стол «откуда» и стол «куда», ввести количество по номиналам. Флот одного стола уменьшается, другого — увеличивается на столько же, общий итог не меняется. Перед сохранением видно, каким станет флот обоих столов.
2. **Доступ**: Manager, Finance Manager, Super Admin — просмотр и изменение, только в своём казино. Остальные роли пункт не видят.
3. **Admin**: вкладки Tables и Float убираются из Admin → Casino Settings, остальные вкладки (Time, Chip Colors, Chip Mode и др.) остаются на месте.

## Правила безопасности
- Move Chips нельзя увести в минус: в столе-источнике должно быть достаточно фишек.
- Переносить фишки и менять флот можно только у закрытых столов. Иначе сломается результат стола в текущей смене.
- Каждое изменение (добавление и блокировка стола, правка флота, перенос) пишется в журнал действий автоматически, с пользователем и временем.

## Что не меняется
- Расчёты результатов, Drop, Miss Chips и итоги кассы.
- Cage, Safe и фишки в кассе — переносы только между столами.
- Остальные разделы Admin.

## Технические детали
- Route `/settings/tables-float` + RoleGuard + module permission (manager, finance_manager, super_admin); пункт в AppSidebar в разделе SYSTEM.
- Переиспользовать `TableManagement` и `FloatManagement`; удалить их вкладки из `CasinoSettingsPage`.
- Миграция: в RLS на `gaming_tables` (insert/update) и `chip_baseline` (insert/update) добавить `has_role(auth.uid(),'finance_manager')` в пределах `has_casino_scope`.
- Новый RPC `move_table_chips(p_from, p_to, p_chips jsonb)` (security definer): проверка роли и casino scope, одно казино, оба стола закрыты, без отрицательных значений; атомарный update chip_baseline; запись в журнал триггером `tg_activity_log`. GRANT EXECUTE только authenticated.
- Новый UI на SmartTable; один typecheck и одна сборка в конце.
