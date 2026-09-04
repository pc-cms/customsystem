# План: проверка логики Expected/Variance «на момент сейчас»

## Цель
Проверить, что текущий расчёт Expected и Variance в `Finances → Wallets` уже работает по правилу «только то, что внесено/закрыто на момент сейчас, без открытых смен и кассовых расходов, с учётом офисных движений».

## Что сделаем

### 1. Прочитать текущий расчёт Expected
- `src/hooks/use-fin-balance.ts` — откуда берётся Expected, какие источники суммируются.
- `src/hooks/use-wallet-day-grid.ts` — как строится сетка движений кошелька, что попадает в Start of month и дневные движения.
- `public.fin_balance_snapshot` / `public.fin_wallet_float_history` — какие wallet_tx_type и source участвуют в Expected.

### 2. Составить карту источников
Для каждого источника отметить, попадает ли он в Expected прямо сейчас:

| Источник | Попадает в Expected сейчас? | Комментарий |
|---|---|---|
| `fin_day_closing.cashdesk_win` / `net_win` | Да, после закрытия дня | Проверить, ждёт ли он закрытия дня или берёт предварительные данные |
| `fin_other_incomes` (Office Expenses, Collections, Tips, JP) | Да | Записи офиса обычно фиксируются сразу |
| `fin_wallet_tx` transfer | Да/Нет | Зависит от направления и резерва |
| `fin_wallet_tx` daily_result | Да, после закрытия дня |  |
| `fin_wallet_tx` collection | Да |  |
| `fin_wallet_tx` adjustment | Только Actual | Проверить |
| `fin_wallet_tx` pos_deposit | ? |  |
| `fin_wallet_tx` external_income | ? |  |
| `expenses` (модуль Expenses) | ? | Проверить, создаёт ли wallet_tx |
| `payroll` | ? | Проверить, создаёт ли wallet_tx |
| `cash_count_snapshots` | Только Actual | Физический пересчёт |

### 3. Проверить поведение для открытого/незакрытого дня
- Как определяется «сегодня» и «текущий бизнес-день» (`business_date_of` / `useBusinessDate`).
- Включаются ли в Expected движения за сегодня, если смена/день ещё не закрыт.
- Исключаются ли кассовые (cashier) расходы открытой смены из Expected.

### 4. Проверить Variance
- `Variance = Expected − Actual`.
- Actual берётся из последнего физического пересчёта (`cash_count_snapshots`).
- Проверить, что открытые смены не дают ложного Actual.

### 5. Результат
- Краткий отчёт на русском: что сейчас входит в Expected, что исключено, есть ли расхождения с заявленной логикой.
- Если расхождения найдены — предложить следующий план на исправление.
- Никаких изменений кода, схемы или данных в этом плане.
