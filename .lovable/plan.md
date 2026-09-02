# Payroll expenses — Arusha, August 2026

Внести 9 расходов по зарплате за 31.08.2026 в филиал Arusha через Office.

## Подтверждённый список

| # | Дата | Сотрудник | Должность | Сумма (TZS) |
|---|------|-----------|-----------|-------------|
| 1 | 31.08.2026 | Samora Msangi | Security Supervisor | 50 000 |
| 2 | 31.08.2026 | Fransisca Erasmus | Receptionist | 365 000 |
| 3 | 31.08.2026 | Elizabeth Frank | Receptionist | 365 000 |
| 4 | 31.08.2026 | Miriam Mlay | Dealer | 450 000 |
| 5 | 31.08.2026 | Marry Samson | Slot Supervisor | 200 000 |
| 6 | 31.08.2026 | Livingstone Massawe | IT | 50 000 |
| 7 | 31.08.2026 | Emmanuel Thomas | IT | 370 000 |
| 8 | 31.08.2026 | Ruth Ian | Cashier | 200 000 |
| 9 | 31.08.2026 | Deo Swai | HR Manager | 200 000 |

**Итого: 2 250 000 TZS**

Пропущены (по вашему указанию): Asnath Mchangila (Bar Supervisor) и Abrahamu Paulo (PIT).

## Параметры проводки

- Филиал: Arusha
- Business date: 31/08/2026 (август не закрыт — проводка разрешена)
- Категория: Salary Expenses → Staff Salary PAYROLL
- Кошелёк: Cash TZS
- Валюта: TZS, статус: approved (сразу двигает Expected)
- Формат: отдельная строка на человека, описание вида `Payroll 08/2026 · Samora Msangi (Security Supervisor)`

## Технические детали

- Вставка 9 строк в `public.expenses` через data-запрос (не миграция): `casino_id` Arusha, `source='office'`, `category='other'`, `category_code='other'`, `fin_category_id` = Staff Salary PAYROLL, `wallet_id` = Cash TZS, `amount`/`amount_tzs` = сумма, `business_date='2026-08-31'`, `approved=true`.
- Движения кошелька создаются существующим триггером `trg_expenses_office_after_insert`; вручную `fin_wallet_tx` не создаём.
- Идемпотентность: перед вставкой проверить, что строк с таким описанием за 31/08/2026 ещё нет.
- Код, схема, расчёты и другие месяцы/филиалы не меняются.

## Ожидаемый эффект

Paid Expenses августа по Arusha увеличатся на 2 250 000 TZS, Expected по Cash TZS уменьшится на ту же сумму, Variance изменится соответственно.
