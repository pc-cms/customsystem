# Импорт персонала Mbeya (56 сотрудников)

Файл `For_HR.xlsx` — 9 колонок-департаментов, только имена. Импорт выполняется одной вставкой данных в таблицу сотрудников казино **Mbeya Cloud**.

## Раскладка по департаментам

| Колонка в файле | Департамент | Позиция | Кол-во |
|---|---|---|---|
| Trainee dealer | Pit | Trainee | 20 |
| Dealer-Ispector | Pit | Inspector | 2 |
| PIT BOSS | Pit | Pit Boss | 3 |
| CASHIERS | Floor | Cashier | 6 |
| SLOT | Floor | Waiter | 7 |
| BARTENDER | Floor | Bartender | 3 |
| RECEPTION | Floor | Receptionist | 4 |
| SECURITY | Security | Security | 6 |
| HK | Floor | Housekeeper | 5 |

Итого: **56** сотрудников.

## Общие правила заполнения

- `casino_id` = Mbeya Cloud
- `onboarding_date` = 01.08.2026 (`employment_date` — то же значение)
- `basic_salary` = 0, `payroll_status` = active
- Имена приводятся к виду «Первая Буква Заглавная» (в файле часть в CAPS), нумерация «1. » вырезается
- `first_name` = первое слово, `last_name` = остальное
- Для Pit проставляются производные поля: `dealer_category` = trainee/inspector, `is_pit_boss` = true для Pit Boss
- Остальные поля (телефон, дата рождения, контракт, документы) остаются пустыми — HR заполнит позже

## Защита от дублей

Перед вставкой проверяется, что сотрудник с таким `full_name` в Mbeya ещё не существует; повторный запуск не создаст дублей.

## Проверка после импорта

Сверка количества по департаментам (Pit 25 / Floor 25 / Security 6) и появление людей в Staff Master и Break List для Mbeya.
