# Office · Wallets: приведение Breakdown к описанной логике

## Итоговая формула

```text
Expected = Starting Float
         + Live Tables + Slots + JP + Card Balance   (из Day Closings)
         + Other Incomes (±)
         − Missed Chips (±)  − Missed Cards (±)
         − Расходы (касса: только за закрытые бизнес-дни; офис: сразу)
         − Collections

Actual   = сумма физических пересчётов всех кошельков (Grand TZS)
Variance = Actual − Expected   → должен быть 0
```

## Что меняем

### 1. Actual = только физический пересчёт

Сейчас Actual = последний physical count + все проведённые движения после него. По вашей логике движения (Money In / Money Out / Transfer / расход) — это только запись для аудита, а деньги в кошельке определяются исключительно пересчётом. Убираем прибавление движений: Actual кошелька = последний physical count на конец периода. Если пересчёта никогда не было — берём стартовый флот кошелька как отправную точку.

Следствие: после расхода Variance «поедет», пока не сделан новый пересчёт — это и есть контроль, как вы и описали.

### 2. Starting Float — как income, а не вычет из Actual

Сейчас фронт вычитает стартовый флот из Actual. Переносим его в Expected отдельной строкой «Starting Float (начало месяца)». Математически Variance тот же, но в Breakdown видно правильно: Actual = Total Wallets, Expected включает флот.

### 3. Missed Chips / Missed Cards — перепроверка знака

Сейчас RPC берёт `chip_miss_total` и `cards_miss` с обратным знаком, а фронт их прибавляет — итого они вычитаются из Expected. Правило, которое зафиксируем и проверим на реальных данных Арушы и Мванзы за август:

- фишек не хватает (miss > 0, деньги «лишние» в кассе) → Expected уменьшается на эту сумму;
- фишек больше нормы (miss < 0) → Expected увеличивается.

Сверим знак с тем, что показывает закрытие дня / отчёт Miss Chips по тем же дням, чтобы цифра совпадала один в один, и при расхождении поправим только знак в RPC (без изменения источника).

### 4. Расходы

Правило остаётся и фиксируется в подписи к строке Breakdown: касса (Live/Slots) — только за бизнес-дни, у которых есть закрытие; офис — мгновенно. Collections — отдельная строка, уменьшает Expected.

### 5. Card Balance

Сейчас берётся значение последнего дня с ненулевым балансом, а не сумма за период. Это отдельная строка Breakdown; при проверке по Мванзе сверим, какое поведение даёт ноль, и приведём к нему.

### 6. UI Breakdown

Строки в порядке формулы: Starting Float · Live · Slots · JP · Card Balance · Other Incomes (±) · Missed Chips (−) · Missed Cards (−) · Expenses (−) · Collections (−) · **Expected** · **Actual (Total Wallets)** · **Variance**. У каждой строки — короткая подпись-источник.

## Технические детали

- `fin_balance_snapshot`: убрать CTE `post` (движения после пересчёта) из `actual_native` / `actual_tzs`; оставить фолбэк на стартовый флот; при необходимости поправить знак `v_missed_chips` / `v_missed_cards`.
- `src/hooks/use-fin-balance.ts` → `computeBalanceTotals`: добавить `starting_float.grand_tzs` в Expected и убрать вычитание флота из Actual.
- `src/pages/finances/FinancesWalletsPage.tsx`: строки Breakdown в порядке формулы, подпись про кассовые/офисные расходы.
- Поднять версию в `package.json`.

## Проверка

Пересчитать Мванзу и Арушу за август: показать построчно Expected, Actual и Variance до и после, и сверить Missed Chips с отчётом Miss Chips за те же дни.
