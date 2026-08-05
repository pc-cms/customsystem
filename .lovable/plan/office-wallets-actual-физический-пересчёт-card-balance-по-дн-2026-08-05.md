# Office · Wallets: Actual = физический пересчёт, Card Balance по дням

## Итоговая формула

```text
Expected = Starting Float
         + Live + Slots + JP + Card Balance (сумма по дням)
         + Other Incomes (±)
         − Missed Chips (±)  − Missed Cards (±)
         − Расходы (касса: только за закрытые бизнес-дни; офис: сразу)
         − Collections

Actual   = сумма физических пересчётов всех кошельков (Grand TZS)
Variance = Actual − Expected   → должен быть 0
```

## 1. Card Balance — суммой по дням

Сейчас в RPC `fin_balance_snapshot` берётся `players_card_balance` последнего дня с ненулевым значением (`ORDER BY business_date DESC LIMIT 1`). Это неверно: card balance — это дневная разница, значит за период нужна сумма всех дней. Меняем на `SUM(players_card_balance)` за период и добавляем `card_balance` в дневной массив `daily`, чтобы он был виден в Daily audit.

## 2. Actual = только физический пересчёт

Убираем из `fin_balance_snapshot` прибавление движений после пересчёта: Actual кошелька = последний `cash_count_snapshots.physical_total`. Если пересчёта не было — стартовый флот. Транзакции остаются только записью для аудита.

## 3. Автопересчёт после каждой транзакции

Любая операция (Money In / Money Out / Transfer / офисный расход, списанный с кошелька) автоматически создаёт новый физический пересчёт кошелька: берём последний count по купюрам и применяем к нему купюры операции (плюс — для прихода, минус — для расхода/transfer_out). Получается новый snapshot, Actual и Variance пересчитываются сразу, без ручных действий.

- Если у операции нет разбивки по купюрам (нал без деноминаций или безнал), пишем snapshot по сумме: `предыдущий total ± сумма`.
- Если пересчёта раньше не было, отправной точкой служит стартовый флот кошелька.
- Ручной пересчёт остаётся полностью равноправным: менеджер может в любой момент вбить купюры руками — это перекрывает автоснимок. Важен только последний по времени count.
- Автоснимок помечается в базе (`source = 'auto'`) и виден в UI как «авто после операции», чтобы отличать его от ручного пересчёта.

## 4. Missed Chips / Missed Cards — проверка знака

Правило: не хватает фишек (miss > 0 — в кассе денег больше) → Expected уменьшается; фишек больше нормы (miss < 0) → Expected увеличивается. Сверяем знак с отчётом Miss Chips по тем же дням Арушы и Мванзы и при расхождении правим только знак в RPC.

## 5. Расходы и Starting Float

Правило фиксируем в подписи Breakdown: касса (Live/Slots) — только за закрытые бизнес-дни; офис — сразу. Collections — отдельная строка, уменьшает Expected. Starting Float переносим в Expected отдельной строкой «Starting Float» и убираем его вычитание из Actual.

## 6. UI Breakdown

Порядок строк: Starting Float · Live · Slots · JP · Card Balance · Other Incomes (±) · Missed Chips (−) · Missed Cards (−) · Expenses (−) · Collections (−) · **Expected** · **Actual (Total Wallets)** · **Variance**. У каждой строки короткая подпись-источник. В карточке кошелька — время и тип последнего пересчёта (ручной / авто).

## Технические детали

- `fin_balance_snapshot`: `v_card_balance` → `SUM(players_card_balance)` за период + поле `card_balance` в `daily`; убрать CTE `post` (движения после пересчёта) из `actual_native` / `actual_tzs`; при необходимости поправить знак `v_missed_chips` / `v_missed_cards`.
- Новая функция `public.fin_autocount_after_tx()` + триггер `AFTER INSERT/UPDATE/DELETE ON fin_wallet_tx` (игнорирует строки `kind='adjustment'` и `ref_table='cash_count'`): формирует новый `cash_count_snapshots` от последнего count по купюрам.
- Колонка `source text default 'manual'` в `cash_count_snapshots`.
- `src/hooks/use-fin-balance.ts` → `computeBalanceTotals`: Starting Float в Expected, Actual без вычета флота.
- `src/pages/finances/FinancesWalletsPage.tsx`: порядок строк Breakdown, подписи, метка источника последнего пересчёта.
- Поднять версию в `package.json`.

## Проверка

Пересчитать Мванзу и Арушу за август: показать построчно Expected / Actual / Variance до и после, сверить Card Balance по дням и Missed Chips с отчётом Miss Chips.
