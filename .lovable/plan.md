# Office → Wallets: объединение с Balance и Grand Total в TZS/USD

## Разница между Balance и Wallets (что есть сейчас)

| | Balance (`BalanceTab.tsx`) | Wallets (`FinancesWalletsPage.tsx`) |
|---|---|---|
| KPI сверху | Expected · Actual · Variance | Total Wallets · Total Income · Total Expenses · Reconciliation |
| Breakdown | Starting Float + Live + Slots + Other ± Miss − Expenses − Collections | нет |
| Таблица кошельков | компактная (Physical vs Ledger) через `WalletsCompactTable` | полноценная с inline physical count + Edit + Add Wallet |
| Транзакции | нет | лог `fin_wallet_tx` с фильтрами |
| Close Month wizard | есть (super_admin) | нет |
| Reconcile Now | есть | нет |
| Источник цифр | RPC `fin_balance_snapshot` (единый снимок) | отдельные хуки `useWalletBalancesAsOf` + `usePeriodIncome` + `usePeriodExpenses` |

Функционально они пересекаются на 80% (обе — про баланс кассы), но подача разная. Оставляем **одну вкладку Wallets** — она уже включает CRUD, inline count и transactions log. Всё уникальное из Balance (Breakdown, Variance-строка, Reconcile Now, Close Month) переносим туда.

## Что делаю

### 1. Валюты и Grand Total (как в Budget)

В таблице Wallets колонка `Balance (TZS)` заменяется на две:
- **Balance (native)** — сумма в валюте кошелька (TZS/USD/EUR/GBP/KES) с корректным `formatNumberSpaces` + суффикс валюты.
- **Balance (TZS)** — конвертированное значение (уже есть, `ledger` из `fin_wallet_tx.amount_tzs`).

Под таблицей — панель **Grand Total** в стиле Budget:
```
Grand TZS    ───────  Σ всех кошельков в TZS-эквиваленте
Grand USD    ───────  Grand TZS ÷ usd_tzs (rate из Office Rates, тот же что в Budget)
```
Дополнительно — построчная разбивка по валютам (TZS: … · USD: … · EUR: … · GBP: … · KES: …) в native-единицах.

Native-суммы считаем на клиенте: агрегируем `fin_wallet_tx` по `wallet_id`, конвертируем обратно через дневной курс из `fin_daily_rates` (или через сохранённое `amount_native`, если есть — уточню при реализации; если нет, используем current-day rate из `fin_daily_rates` fallback 2600 как в `fin_balance_snapshot`).

### 2. Объединение Balance → Wallets

- Вкладку `balance` из `OfficePage.tsx` удаляю, `DEFAULT_TAB` = `wallets`.
- В `FinancesWalletsPage.tsx` добавляю:
  - Кнопки **Reconcile Now** и **Close Month** (super_admin) в PageHeader — вместо ссылки «Reconciliation» на несуществующий больше таб.
  - Секцию **Breakdown (Expected)** над таблицей кошельков: Starting Float / Live / Slots / Other / Miss Chips / Miss Cards / − Expenses / − Collections / = Expected. Источник — тот же RPC `fin_balance_snapshot`.
  - KPI-плитку **Variance** (Expected − Grand TZS) в блоке KPI сверху рядом с Reconciliation.
- Убираем дублирующую KPI `Reconciliation` (Income − Expenses − Wallets), она подменяется формулой Variance из RPC (единая формула, соответствует Balance).
- Route `/office?tab=balance` → редирект на `/office?tab=wallets` (мягкий, чтобы сохранённые ссылки не ломались).
- `BalanceBanner` (в шапке Office) продолжает вести на `?tab=wallets`.

### 3. Технические детали

- Файлы: `src/pages/office/OfficePage.tsx`, `src/pages/finances/FinancesWalletsPage.tsx`. `BalanceTab.tsx` больше не подключается — файл оставляю на 1 итерацию для отката, удалим позже.
- `CloseMonthWizard` импортируем в Wallets из `src/pages/office/CloseMonthWizard.tsx`.
- Хук `useFinBalanceSnapshot` уже возвращает `wallets[]` с `ledger`/`physical` и `rates.usd_tzs` — используем его как единый источник для Breakdown и Grand Total. Второй запрос `useWalletBalancesAsOf` больше не нужен (упрощаем).
- Native-разбивка: группируем `snap.wallets` по `currency`, суммируем `ledger_native`. Если поля нет в RPC — добавлю его (одна миграция функции `fin_balance_snapshot`, без изменения схемы таблиц).
- Версию бампим до 1.3.442.

## Итог для пользователя

- Одна вкладка **Wallets** вместо двух — вся сверка кассы в одном месте.
- Каждый кошелёк виден в своей валюте + TZS-эквивалент.
- Внизу — Grand Total TZS и Grand Total USD, как в Budget, с курсом из Office Rates.
