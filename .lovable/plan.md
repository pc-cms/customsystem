## Что делаем

Превращаем Office Safe в **настоящую большую кассу** с формальной сверкой баланса. Добавляем: Starting Float на кошелёк, Other Income как транзакции, Missed Chips в формулу Income, страницу Balance и месячный ритуал Close Month.

## Формула

```text
Expected Cash = Starting Float
              + Live Game Result
              + Slots Result
              + Other Income
              ± Missed Chips (MISS = −, OVER = +)
              − Expenses
              − Collections

Actual Cash   = Σ Physical Balance по кошелькам (последний cash_count)

Variance      = Actual − Expected
                > 0  зелёный  (излишек)
                = 0  ок
                < 0  красный (недостача)
```

Период по умолчанию — **Lifetime** (с даты последнего Starting Float, т.е. с 1-го числа текущего месяца), переключатели Today / MTD / Custom.

---

## 1. База данных

### `fin_wallets` — добавить поля
- `starting_float_amount NUMERIC` — стартовый баланс кошелька в его валюте
- `starting_float_date DATE` — дата, с которой считается (обычно 1-е число месяца)
- `starting_float_note TEXT`
- Редактируют `manager`, `finance_manager`, `super_admin`, запись в `activity_logs`

### Новая таблица `fin_other_incomes`
Транзакции прихода «извне» (инвестиции, transfer из другого казино, refund, bonus).
- `casino_id`, `business_date`, `wallet_id → fin_wallets`, `fin_category_id → fin_categories` (`is_income=true`)
- `source` ENUM: `investment | inter_casino_transfer | owner_topup | refund | bonus | other`
- `currency`, `amount NUMERIC`, `note`, `created_by`, `reversed_by`, `reverses_id`
- **Иммутабельная** (правки только через reversal, как expenses)
- Триггер → зеркальная запись в `fin_wallet_tx` с `kind='income'` → баланс кошелька растёт
- **RLS**: SELECT для всех с доступом к казино; INSERT/UPDATE — `manager`, `finance_manager`, `super_admin`
- GRANT SELECT/INSERT/UPDATE/DELETE authenticated; GRANT ALL service_role

### Новая таблица `fin_month_closures`
Фиксация ритуала Close Month (месячный ресет).
- `casino_id`, `year`, `month`, `closed_at`, `closed_by`
- `collection_total_tzs`, `collection_total_usd`, `collection_details JSONB` (сколько снято с каждого кошелька)
- `new_float_details JSONB` (новые Starting Float на 1-е число следующего месяца)
- После закрытия месяца — прошлые данные становятся **read-only**

### RPC `fin_balance_snapshot(casino_id, period_start, period_end)`
Возвращает JSON:
```json
{
  "starting_float": { "tzs": ..., "usd": ..., "per_wallet": [...] },
  "incomes": { "live_game": ..., "slots": ..., "other": ..., "missed_chips": ..., "total": ... },
  "expenses_total": ..., "collections_total": ...,
  "expected": { "tzs": ..., "usd": ..., "grand_tzs": ... },
  "actual":   { "tzs": ..., "usd": ..., "grand_tzs": ..., "per_wallet": [...] },
  "variance": { "tzs": ..., "usd": ..., "grand_tzs": ... },
  "rates":    { "usd_tzs": ... }
}
```
Missed Chips читаются из `shifts.closing_count.chip_miss_total` по business_date (MISS→−, OVER→+).

### Миграция старых `fin_incomes`
При первом Close Month старые записи `fin_incomes` признаются legacy — показываются только в исторических Monthly Reports. Новые вводятся только через `fin_other_incomes`.

---

## 2. UI

### Office → Balance (новая страница)

```text
┌──────────────────────────────────────────────────────────────────┐
│ BALANCE                     [Lifetime ▾] [Today] [MTD] [Custom] │
├──────────────────────────────────────────────────────────────────┤
│ ╔ EXPECTED ═════╗ ╔ ACTUAL ═══════╗ ╔ VARIANCE ═════╗           │
│ ║  245 600 000  ║ ║  244 200 000  ║ ║  −1 400 000  ║  Grand TZS │
│ ║      +$12 400 ║ ║      +$12 200 ║ ║        −$200 ║            │
│ ╚═══════════════╝ ╚═══════════════╝ ╚══════════════╝            │
├──────────────────────────────────────────────────────────────────┤
│ BREAKDOWN (Expected)          │ WALLETS (компактная таблица)     │
│ Starting Float      +50.0M    │ Type  Wallet     Physical Ledger │
│ Live Game          +180.5M    │ Cash  Safe TZS   80.0M   80.0M ✓ │
│ Slots               +40.2M    │ Cash  Cage TZS   45.0M   45.0M ✓ │
│ Other Income        +15.0M    │ Bank  NMB        60.0M   60.0M ✓ │
│ Missed Chips ±       −0.6M    │ Mobile M-Pesa    34.8M   35.0M ⚠ │
│ − Expenses          −32.5M    │ Cash  Safe USD  $12 200 $12 200✓ │
│ − Collections        −7.0M    │ ──────────────────────────────── │
│ ═══════════════════════════   │ Grand TZS       244.2M           │
│ = Expected         245.6M     │ [Reconcile Now]                  │
└──────────────────────────────────────────────────────────────────┘
```

- Кошельки — **строки-таблица (как Cash Desk)**, не карточки-полотно
- Клик по строке кошелька → drill-down (последние транзакции + физический пересчёт)
- Клик по строке Breakdown → список исходных транзакций
- Physical подтягивается автоматически при новом `cash_count`

### Global banner
При Variance ≠ 0 — баннер в шапке Office (красный при недостаче, зелёный при излишке), клик → Balance page.

### Office → Other Incomes (заменяем текущий plan/fact-грид)
Список транзакций (SmartTable) + кнопка `[+ Add Income]`:
```
Date        Category      Source           Wallet      Amount        By
05/07/2026  Investment    Owner Top-up     Safe TZS    50 000 000    Boss
02/07/2026  Inter-Casino  Mwanza→Arusha    Cash TZS    20 000 000    FinMgr
```
Диалог Add Income: дата · категория · source · wallet · валюта · сумма · note.
Права: `manager`, `finance_manager`, `super_admin`.
Reversal кнопка вместо редактирования.

### Finance → Wallets
Добавляем поля Starting Float (amount / date / note) — редактируют `manager`, `finance_manager`, `super_admin` с записью в `activity_logs`.

### Monthly Report
Добавляем строку **Missed Chips (±)** между Slots и Other Incomes с drill-down по дням.
Other Incomes теперь показывает сумму транзакций за месяц (клик → фильтр по месяцу на странице Other Incomes).

### Office → Close Month (новый ритуал, только super_admin)
Кнопка появляется 1-го числа. Мастер из 3 шагов:
1. **Collection** — по каждому кошельку показывается фактический остаток → super_admin подтверждает сумму, которая уходит из кассы (запись в `expenses` с категорией Collection)
2. **New Starting Float** — вводится новый стартовый баланс по каждому кошельку (может быть 0)
3. **Confirm & Lock** — фиксация в `fin_month_closures`, прошлый месяц становится read-only

---

## 3. Права

| Роль | Balance page | Other Income | Starting Float | Close Month |
|------|--------------|--------------|----------------|-------------|
| cashier | view | — | — | — |
| manager | view | create/reverse | edit | — |
| finance_manager | view | create/reverse | edit | — |
| super_admin | view | create/reverse | edit | run |

---

## 4. Технические детали

- Валютное отображение: TZS с пробелами (`245 600 000`), USD с префиксом `$12 400`, Grand TZS = сумма всех валют по текущему курсу из `fin_daily_rates`
- Даты: `DD/MM/YYYY`
- SmartTable для всех новых списков
- Иммутабельность + reversal (следуем memory `Strict manual-entry, immutable data`)
- Все транзакции пишутся через триггер в `activity_logs` (memory `Audit Logging Rule`)
- Отрицательный Variance не блокирует работу — только визуальный сигнал

## Что НЕ делаем в этой итерации

- Не автоматизируем Missed Chips редактирование (только чтение из shifts)
- Не блокируем расходы при отрицательном балансе
- Не делаем бюджет/план для Other Income
- Не связываем Other Income → Expense через FK (просто попадает в общий котёл)
- Не трогаем существующую логику Day Closing / Shift Balance

## Файлы

**Миграции:**
- `fin_wallets` + `starting_float_*` поля
- `fin_other_incomes` + триггер зеркала в `fin_wallet_tx`
- `fin_month_closures`
- RPC `fin_balance_snapshot`

**Код:**
- `src/pages/office/BalancePage.tsx` (новая)
- `src/pages/office/OtherIncomesPage.tsx` (переписать с грида на транзакции)
- `src/pages/office/CloseMonthWizard.tsx` (новый)
- `src/components/office/WalletsCompactTable.tsx` (новый, для Balance page)
- `src/components/office/BalanceBanner.tsx` (global)
- `src/hooks/use-fin-balance.ts` (обёртка вокруг RPC)
- `src/hooks/use-other-incomes.ts` (новый)
- `src/pages/finances/FinancesWalletsPage.tsx` — добавить поля Starting Float
- `src/hooks/use-fin-monthly-report.ts` — добавить строку Missed Chips
