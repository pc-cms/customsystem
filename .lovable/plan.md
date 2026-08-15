# Dodoma: персонал и рота на август 2026

Заводим 61 сотрудника казино Dodoma из файла `Rota_Dodomas.xlsx` и переносим их месячную роту (1–31 августа 2026).

## Сотрудники

**Live Game — 27 человек** (отдел Pit):
- Позиция `Dealer` для кода `D`, `Trainee` для `Tr` / `TR`.
- Категории проставляются автоматически (`dealer` / `trainee`), чтобы люди сразу были доступны в Break List и Live Game.

**Other — 34 человека**, по департаментам из файла:

| Код в файле | Отдел в системе | Позиция | Люди |
|---|---|---|---|
| CD | Cash Desk | Cashier | Erick, Kelvin R, Fatuma, Jenipha, Irine, Joseph, Mtiri |
| HK | Housekeeper | Housekeeper | Sosteness, Regina, Jaquline, Christina H, Consolatha |
| F&B | Bar | Bartender | Didas Augustino, Shabani Aloyce, James Mtei |
| F&B | Bar | Waiter | Naomi Benjamin, Amina Ahmad, Isaack Meshack, Judith Kavishe, Lulu Ramadhan |
| Hst | Floor | Hostess | Kisa Abel, Asia |
| Scr | Security | Security | Melina Edwin, Idrisa Ramadhani, Issa Abdallah, Karim Khalifa, Catias Alex |
| Off | Office | IT | Abdul, Salim Urassa |
| Off | Office | HR | Evaristo |
| Off | Office | Manager | Kelvin (CD) |
| PB | Pit | Pit Boss | Estomy, Aisha, Ramadhan |

Заводим только имя / отдел / позицию — зарплаты, даты приёма и телефоны добавим позже импортом HR-таблицы. Имена чистим от лишних пробелов и скобок (`Abdul(IT)` → `Abdul`, позиция IT).

## Рота

- Live Game → Pit Rota (`pit_rota`), Other → Staff Rota (`staff_rota`), обе за 01.08.2026 – 31.08.2026.
- Коды смен переносятся как есть: `N` — ночь, `D` — день, `M` — утро/middle, `Lv` → `L` (Leave). Пустая клетка = выходной, строка не создаётся.
- Записи ставятся идемпотентно: повторный запуск не создаёт дублей (уникальность `casino_id + employee_id + date`).
- Итого около 1 200 смен.

## Техническая часть

- Данные заводятся через insert-запросы (без изменения схемы): `employees` для Dodoma (`casino_id` Dodoma, `is_active = true`), затем `pit_rota` / `staff_rota` с `ON CONFLICT DO UPDATE` по смене.
- `dealer_category` / `is_pit_boss` выставляются по правилу из `src/lib/staff-dictionaries.ts`.
- `created_by` для строк роты — учётная запись super_admin, от имени которой выполняется загрузка.
- Проверка после загрузки: количество сотрудников по отделам и количество смен по дням, плюс визуальный контроль страниц Rota Floor / Rota Pit за август.
