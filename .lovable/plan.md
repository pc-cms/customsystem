# Доступы Michael (финменеджер): Staff Master и Management Rota

## Что нашёл
- **Michael** (michael@cms.local, Arusha, роли manager + finance_manager). У него стоят **личные запреты**, выставлены админом 01/07/2026: Staff Master, Staff Rota, Staff Attendance, Staff Employees — `can_view = false`. Личный запрет сильнее роли. Поэтому он не видит ни Staff Master, ни Management Rota/Attendance: эти страницы относятся к модулям Staff Rota и Staff Attendance.
- **Michael Mwanza** (michaelm@cms.local): личных запретов нет, по ролям эти модули ему открыты. Правки не нужны.
- Роли manager и finance_manager сами по себе дают доступ к этим модулям, в правилах ролей ничего менять не нужно.

## Что сделать
1. Удалить у Michael четыре личных запрета: staff_master, staff_rota, staff_attendance, staff_employees. После этого доступ будет по ролям:
   - Staff Master — данные его домена (Arusha).
   - Management Rota / Attendance — видит блоки всех филиалов и может править все: финменеджер относится к сетевым ролям.
2. Проверить результат: запросить его итоговые права и открыть страницы под его учёткой.

## Технически
- Удалить из `user_module_permissions` строки для user_id `71919bf9-…` с этими четырьмя module_key.
- Код и правила ролей не меняются.
