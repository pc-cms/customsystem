## Monthly Report — 5 fixes (revised)

### 1. Plan/Year = месячный план × 12 (когда введён один месяц)
В `src/hooks/use-fin-monthly-report.ts` при сборке `planYearMap`:
- Считаем число месяцев с ненулевым значением в `fin_budget` для пары (category, currency).
- Если введён ровно один месяц → `plan_year = value × 12`.
- Если введено ≥ 2 месяцев → суммируем как сейчас.
- Логика применяется отдельно к TZS и USD.

### 2. Раздельный учёт TZS-расходов и USD-расходов (нативная валюта)
Сейчас `actual_tzs` суммирует `amount_tzs` всех расходов (включая USD, конвертированные по курсу). Это неверно — пользователю нужны **фактически списанные суммы в исходной валюте**, без конвертации.

В `use-fin-monthly-report.ts` для каждой категории/группы считаем три независимых поля:
- `actual_native_tzs` — Σ `amount` где `currency = 'TZS'`
- `actual_native_usd` — Σ `amount` где `currency = 'USD'` (уже считается как `actual_usd`)
- `actual_grand_tzs` — Σ `amount_tzs` всех (для итогового баланса в шиллингах)

Аналогично три поля для плана: `plan_month_tzs` (TZS-бюджет), `plan_month_usd` (USD-бюджет), `plan_month_grand_tzs` = TZS + USD × курс.

В таблице групп показываем колонки:
- **Plan/Year TZS**, **Plan/Year USD**
- **Plan/Mo TZS**, **Plan/Mo USD**
- **Actual TZS** (native), **Actual USD** (native)
- **%**, **MTD**, **Remain TZS**, **Remain USD**, **Remain %**

(Колонка "USD" перестаёт быть опциональной — это нативные доллары, а не пересчёт.)

### 3. Блок Total Budget (после групп, до Collections)
Новая `PageSection title="Total Budget"`:
| Метрика | TZS | USD | Grand TZS |
|---|---|---|---|
| Plan Month | Σ TZS-плана | Σ USD-плана | TZS + USD×rate |
| Actual | Σ TZS-факта | Σ USD-факта | Σ amount_tzs |
| Remain | разница | разница | разница |

Курс USD→TZS берём из `fin_daily_rates` (последний доступный для активного казино в выбранном месяце; fallback — средний по месяцу).

### 4. Порядок секций (только UI)
```
Incomes
Groups (fixed, tax, variable, salary, petrol, additional) ← Expenses
Total Budget (новая, см. п.3)
Profit         = Incomes.Total − Total Budget.Actual Grand TZS
Collections & Owner Withdrawal
Net Balance    = Profit − Collections.Actual TZS
```
Заменяет текущий блок "Grand Total".

### 5. Курс в расчётах (баг)
В `use-fin-monthly-report.ts` и `FinancesWalletsPage.tsx`:
- Заменяем `.select("usd_to_tzs, business_date")` → `.select("rate_to_tzs, business_date").eq("currency","USD")` (колонка `usd_to_tzs` не существует — запрос молча возвращает 0, поэтому курс "застревает на 2500" fallback).

### 6. Slots income из Day Closing
В `use-fin-monthly-report.ts`:
- Удаляем запрос к `cage_slots_shifts.system_shift_result`.
- Добавляем запрос к `fin_day_closing` за диапазон:
  `SELECT slots_result, tables_result FROM fin_day_closing WHERE casino_id=? AND business_date BETWEEN start AND endExclusive`
- `incomes.slots = Σ slots_result`, `incomes.live_game = Σ tables_result`. Только закрытые финансовым менеджером дни считаются доходом.

### Технические заметки
- Файлы: `src/hooks/use-fin-monthly-report.ts`, `src/pages/finances/FinancesMonthlyReportPage.tsx`, `src/pages/finances/FinancesWalletsPage.tsx`.
- Фронтенд + хук, никаких миграций.
- XLSX-экспорт обновлю в соответствии с новой структурой.
- Без bump версии (UI-only).
