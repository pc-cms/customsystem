# Доступы Michael: сетевой финменеджер, удалить Michael Mwanza

## Что нашёл
- **Michael** (michael@cms.local, Arusha, роли manager + finance_manager). У него стоят **личные запреты** (выставлены админом 01/07/2026): Staff Master, Staff Rota, Staff Attendance, Staff Employees — `can_view = false`. Личный запрет сильнее роли, поэтому он не видит ни Staff Master, ни Management Rota/Attendance.
- **Michael Mwanza** (michaelm@cms.local) — отдельная учётка, её нужно удалить.
- Финменеджер уже сетевая роль: видит Management Rota всех филиалов и финансы по всем казино. Правила ролей менять не нужно.

## Что сделать
1. **Удалить учётку Michael Mwanza** (michaelm@cms.local) вместе с ролями и личными правами.
2. **Michael (michael@cms.local)**: удалить четыре личных запрета (staff_master, staff_rota, staff_attendance, staff_employees). После этого по ролям:
   - Staff Master — данные по домену, на котором он зашёл.
   - Management Rota / Attendance — видит блоки всех филиалов, может править все (финменеджер — сетевая роль).
3. **Сетевой доступ ко всем локациям**: у finance_manager уже есть возможность смотреть все казино (view.all_casinos) — проверить, что у Michael нет ограничений по казино, и что на доменах других филиалов данные ему доступны. Если его профиль жёстко привязан к Arusha и это мешает — отвязать casino_id у профиля, чтобы он работал как сетевой.
4. Проверить результат: итоговые права Michael и вход под его учёткой на доменах разных филиалов.

## Технически
- Удалить пользователя `8054959d-…` (auth.users + profiles + user_roles + user_module_permissions) через admin-функцию/SQL.
- Удалить из `user_module_permissions` строки user_id `71919bf9-…` с module_key: staff_master, staff_rota, staff_attendance, staff_employees.
- При необходимости: `profiles.casino_id = NULL` для Michael (сетевой режим).
- Код приложения не меняется.
