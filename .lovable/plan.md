# Monthly Report: плитки, карточки + межфилиальный долг Mwanza → Arusha

Один заход, три блока работ.

---

## A. KPI-плитки Monthly Report

Новый набор (7 плиток, слева направо), файл `src/pages/finances/FinancesMonthlyReportPage.tsx`, блок `SummaryBlock`:

1. **Total Income** — без изменений (`kpi.total_income`).
2. **Budget** — без изменений (`g.plan_month_grand_tzs`).
3. **Paid Expenses** — переименование текущей «Actual Expenses» (`cash.expenses_actual`).
4. **Pending Est Expenses** — новая: `Budget − Paid Expenses`. При перерасходе показываем минус.
5. **Current Profit** — переименование «Expected Profit» (для закрытого месяца остаётся «Final Profit»; формула `kpi.expected_profit` не меняется).
6. **Current Cash Balance** — новая, формула строго как задана:
   **TOTAL IN − PAID EXPENSE − DEPOSITS − INVESTMENT − COLLECTION**
   (`kpi.total_income − cash.expenses_actual − cash.deposits − cash.investment − cash.collections_actual`), со знаком (зелёный/красный).
7. **Total Money** — плитка **удаляется** вместе с загрузкой `useOfficePeriod`, `useFinBalanceSnapshot`, `computeBalanceTotals` и переменной `walletTotals`.

Плитка **Cash Position** остаётся без изменений.
Сетка: `xl:grid-cols-6` → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7`.

---

## B. Сводные карточки Monthly Report

- **Убираем** строку **Total Income** (карточка доходов).
- **Убираем** строку **Total Expenses & Obligations** вместе с расчётом `obligationsTotal` и импортом `totalExpensesAndObligations` (в файле больше не используется).
- **Убираем** строку **Office** в Cash Adjustments.
- **Investment** — превращаем в раскрывающуюся секцию `Section` со стрелкой. Детали: записи `fin_other_incomes` с `source = 'investment'` за месяц (дата, описание, сумма TZS). Для этого в `use-fin-monthly-report.ts` в select `fin_other_incomes` добавляем `id, label` и кладём массив `cash.investment_items`.
- **Collections** — тоже раскрывающаяся секция `Section`. Детали: категории группы `collections` из уже загруженного `data.collections.categories` (название + actual Grand TZS), новых запросов не требуется.
- Итоги и тултипы сохраняются, меняется только способ отображения.

---

## C. Межфилиальный долг Mwanza → Arusha (Liabilities)

### Что выявлено в базе
- Таблица `fin_liabilities` **пуста** — поэтому Liabilities показывает нули и выглядит как «долг погашен».
- Существует ровно один трансфер: **Mwanza → Arusha, 10 000 000 TZS, 06/08/2026, accepted, kind = funding**, note «FLOAT (DEBT)», но с **`repayable = false`**.
- Триггер `tg_ic_transfer_liability()` создаёт обязательство только при `kind='funding' AND repayable = true`.
- Флаг нигде не выставляется: в `src/hooks/use-inter-casino.ts` и `FinancesInterCasinoPage.tsx` слова `repayable` нет, RPC `fin_inter_casino_send(_from_wallet_id, _to_casino_id, _amount, _business_date, _note, _kind, _repays_id)` параметра возвратности не принимает — колонка всегда остаётся `DEFAULT false`.

### Исправления
1. **Данные:** проставить трансферу `87b2a33f-83af-4aed-b5fa-e596fba82b9e` `repayable = true` и создать обязательство в `fin_liabilities` (casino = Arusha, creditor = Mwanza, 10 000 000 TZS, дата 06/08/2026, `source='intercompany'`, `transfer_id` = id трансфера — уникальный индекс исключает дубль). Платежей не создаём: долг остаётся открытым.
2. **RPC:** добавить параметр `_repayable boolean DEFAULT true` в `fin_inter_casino_send` и записывать его в строку трансфера (для `kind <> 'funding'` принудительно `false`).
3. **UI:** в форме отправки на **Finances → Inter-Casino Transfers** переключатель **«Repayable — creates a debt at the receiver»**, по умолчанию включён для funding, скрыт для float/adjustment; значение прокидывается через `useSendInterCasino`.
4. **Список трансферов:** бейдж **DEBT / NON-REPAYABLE** в строке.

---

## Технические детали
- Файлы: `src/pages/finances/FinancesMonthlyReportPage.tsx`, `src/hooks/use-fin-monthly-report.ts`, `src/hooks/use-inter-casino.ts`, `src/pages/finances/FinancesInterCasinoPage.tsx` + одна миграция (RPC) и разовая правка данных.
- Триггеры и схему обязательств не меняем — они корректны.
- UI только на английском, числа через `fmtT` (пробел-разделитель), даты `DD/MM/YYYY`.
- Версия приложения повышается по обычной схеме.

## Проверка
- `bunx vitest run` зелёный; сборка без ошибок.
- Monthly Report (открытый и закрытый месяц): 7 плиток, Pending = Budget − Paid, Current Cash Balance сходится вручную; Office / Total Income / Total Expenses & Obligations отсутствуют; Investment и Collections раскрываются.
- Arusha → Liabilities Closing = 10 000 000 (warn), Mwanza → «Transfers · repayable to us» = 10 000 000.
- Новый трансфер с включённым флагом автоматически создаёт обязательство у получателя.
