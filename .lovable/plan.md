# Автоматический учёт доходов казино в кошельках

## Проблема

Источник цифр — **Day Closings**: в `fin_day_closing` за каждый день лежат `tables_result` (Live) и `slots_result`. Именно они и должны попадать в кошельки как приход IN. Сейчас этого не происходит:

- **Expected** берёт Live из `table_daily_results`, Slots — из `fin_day_closing`.
- **Actual** — только остатки кошельков (`fin_wallets` + `fin_wallet_tx`), проводок по результату дня нет.

Кошельки `Safe Live` и `Safe Slots` есть во всех трёх казино (Arusha, Mwanza, Mbeya), но их остаток = 0. Отсюда постоянный минус в Variance (Мванза, закрытие 01/08: Live 16 065 000 + Slots 28 897 403 — ни одна из этих сумм в кошельки не пришла).

## Что сделаем

### 1. Единый источник — Day Closing

Live-результат в балансе тоже берётся из `fin_day_closing.tables_result` (как и Slots), а не из `table_daily_results`. Так экран Day Closings и Wallets всегда показывают одну и ту же цифру.

### 2. Привязка кошелька-приёмника

Добавим кошельку признак источника автопоступления: `Safe Live` принимает результат столов, `Safe Slots` — результат слотов. Проставим для всех казино, где эти кошельки уже есть.

### 3. Приход IN при закрытии дня

При сохранении/закрытии Day Closing в нужном кошельке создаётся приход:

```text
fin_day_closing.tables_result  ->  Money In в "Safe Live"
fin_day_closing.slots_result   ->  Money In в "Safe Slots"
```

Правила:
- Одна проводка на казино + дата + источник (без дублей).
- При правке Day Closing проводка **пересчитывается**, при удалении строки закрытия — убирается.
- Нулевой результат проводку не создаёт; отрицательный проводится с минусом — это нормально.
- Проводка помечается служебным признаком: вручную её редактировать нельзя, только через Day Closing.


### 4. Коллекции = перевод, а не расход

Инкассация (Collection) — это перемещение денег из кассы в офисный сейф, а не расход. Такая операция создаёт пару проводок **Transfer**: `Safe Live` / `Safe Slots` → `Safe TZS` (или выбранный кошелёк) и не уменьшает Expected дважды.

### 5. Backfill за август

Пересчитаем проводки по всем существующим Day Closings августа для Arusha, Mwanza, Mbeya, чтобы Variance сошёлся уже сейчас.

### 6. Отображение

- В Day Closings рядом с Live/Slots видно, что приход проведён в кошелёк.
- В таблице транзакций кошельков автопроводки получают понятный тип: `Live result` / `Slots result`.

## Технические детали

- Новая колонка `fin_wallets.auto_income_source text` (`'live' | 'slots' | NULL`) + частичный уникальный индекс на (casino_id, auto_income_source).
- Функция `fin_sync_gaming_income(p_casino_id uuid, p_date date)`: читает `fin_day_closing.tables_result` / `slots_result` за дату и делает upsert/delete строк в `fin_wallet_tx` с `ref_table = 'fin_day_closing'`, `ref_id = <id закрытия>`, `kind = 'income'`, `note = 'Live result' / 'Slots result'`, `business_date = дата`.
- Триггер AFTER INSERT/UPDATE/DELETE на `fin_day_closing`, вызывающий эту функцию.
- Защитный триггер на `fin_wallet_tx`: строки с `ref_table = 'fin_day_closing'` нельзя менять вручную.
- `fin_balance_snapshot`: `incomes.live_game` берётся из `fin_day_closing.tables_result` вместо `table_daily_results`; `collections_total` перестаёт вычитаться из Expected.
- Коллекции: триггер на `expenses` для категорий Collection создаёт пару `transfer_out` / `transfer_in` вместо `expense`.
- Backfill: вызов `fin_sync_gaming_income` по всем существующим закрытиям августа.
- `src/pages/finances/FinancesWalletsPage.tsx` — читаемая подпись типа для автопроводок.
- Версия → 1.3.493.
