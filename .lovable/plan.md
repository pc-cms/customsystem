## Цель

Убрать дублирование «Safe» и «Wallets» — оставить единый экран Wallets, где:
- каждая строка = один кошелёк (cash / safe / bank / cashless / cage / external);
- клик по строке = разворот с покупюрным вводом для любой валюты;
- кнопка Reconciliation = ссылка на Balance-таб (никакого отдельного экрана свёрки);
- Starting Float редактируется только карандашиком (как сейчас).

## Изменения

### 1. БД — миграция (переименование сейфов)

```sql
UPDATE public.fin_wallets
SET name = 'Safe ' || currency
WHERE kind = 'safe';
```

Один UPDATE, идемпотентный. Никаких схемных изменений. Пользователь потом сможет вручную переименовать в диалоге.

### 2. OfficePage — убрать таб Safe

`src/pages/office/OfficePage.tsx`:
- удалить пункт `{ value: "safe", label: "Safe" }` из TABS;
- удалить lazy-импорт `FinancesOfficeSafePage` и его ветку в Suspense;
- если `?tab=safe` в URL — редирект на `wallets` (safe-fallback в парсере).

Файл `src/pages/finances/FinancesOfficeSafePage.tsx` остаётся в репо на всякий (можно удалить позже), но не подключён нигде — все ссылки уходят.

### 3. FinancesWalletsPage — раскрывающиеся строки + покупюрный ввод

`src/pages/finances/FinancesWalletsPage.tsx`, секция «WALLETS TABLE»:

- перевести таблицу на аккордеон: каждая строка кошелька имеет `▸` слева, клик = раскрытие;
- в раскрытой панели:
  - `CashDenomInput` (уже используется в Safe-странице) с `denoms = CASH_DENOMS[w.currency] || CASH_DENOMS.TZS` — работает для всех валют, включая bank/cashless/cage (там просто вводится одно число «total», см. ниже);
  - **fallback для bank / cashless / external** (у них нет купюр): вместо `CashDenomInput` — одно поле `Amount` + `Note`;
  - две кнопки: **Save Physical Count** и **Cancel**;
- кнопка «Pencil» (карандаш) продолжает открывать диалог редактирования кошелька — там правится Name / Kind / Currency / Starting Float. Никаких физических остатков в этом диалоге.

### 4. Сохранение физического остатка

Сейчас `physical` в `BalanceSnapshot.wallets` берётся из RPC `fin_balance_snapshot`. Ту же логику, что использует `FinancesOfficeSafePage` (insert в `fin_audit_log` с `action='office_safe_reconciliation'` и `meta.lines`), переносим в новый inline-разворот на Wallets-странице:

- функция `saveWalletCount(wallet, denomsMap | totalAmount, note)` пишет одну строку в `fin_audit_log` с одной wallet в `meta.lines` (RPC уже читает эту таблицу для physical);
- после сохранения — invalidate `fin-wallet-bal-asof`, `fin-balance-snapshot`;
- toast «Physical count saved».

Никаких новых таблиц, никаких изменений в RPC.

### 5. Balance-таб — кнопка / ссылка Reconciliation

На `BalanceTab` уже есть «Reconcile Now» (refetch). Оставляем как есть.
На `FinancesWalletsPage` в PageHeader добавляем кнопку **Reconciliation** → `navigate('/office?tab=balance')`. Никакого нового диалога.

### 6. WalletsCompactTable (Balance-таб)

Оставляем как есть — она читает те же `snap.wallets`, а строки теперь именуются `Safe TZS`, `Safe USD`, `CRDB TZS`, `Airtel Cashless` и т.д. автоматически из БД.

## Что НЕ трогаем

- RPC `fin_balance_snapshot` — без изменений.
- `CASH_DENOMS` — уже есть для TZS/USD/EUR/GBP/KES.
- Права: редактирование Starting Float остаётся у manager / finance_manager / super_admin.
- Логика Balance / Expected / Variance — без изменений.

## Файлы

**Миграция**
- новая миграция: UPDATE fin_wallets → `Safe {CURRENCY}`.

**Код**
- `src/pages/office/OfficePage.tsx` — убрать таб Safe.
- `src/pages/finances/FinancesWalletsPage.tsx` — аккордеон-строки, inline `CashDenomInput` / Amount, save-функция, кнопка Reconciliation в шапке.

## Открытые допущения (принято по умолчанию, скажи если не так)

- Для bank / cashless / external / cage (kind ≠ 'cash' и ≠ 'safe') в раскрытии показываем одно поле «Amount», без купюр — реальных купюр там нет.
- Физический остаток пишется в `fin_audit_log` (тот же контракт, что у существующей Safe-страницы) — RPC `fin_balance_snapshot` уже это читает.
- Кнопка «Reconciliation» на Wallets — просто навигация на Balance-таб, без модалок.
