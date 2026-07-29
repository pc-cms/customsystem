## Да, всё понятно. Ломать ничего не будем

Ключевое: **Players Card Balance по умолчанию 0** — за все прошлые закрытые дни колонка = 0, значит все существующие цифры (Result, Balance, Variance, Monthly Report, закрытия смен) остаются **бит-в-бит теми же**. Новая логика включается только когда менеджер впервые введёт ненулевое значение.

### Что точно НЕ трогаем
- Закрытие смен кассы (Cage / Cage Slots) — кассиры поле не видят, их Variance не меняется.
- Закрытые (locked) дни — поле недоступно для правки, значение 0.
- Закрытые месяцы и уже сформированные Monthly Report — без изменений.
- Существующие кошельки и их транзакции — новых записей в `fin_wallet_tx` не создаём.

## Суть механики

Касса физически сдаёт **больше** денег, чем заработок: депозиты игроков на картах — реальные деньги в кассе, но не доход. Поэтому:

- **Result (заработок)** = Tables + (Slots − Players Card Balance)
- **Cash Desk / Balance** = ожидает полную сумму, т.е. карты возвращаются обратно строкой в Incomes → лишних денег в кассе не появляется, Variance = 0.

## Что вводит менеджер

**Office → Day Closings**, новая колонка **Players Card Balance**:
- вручную, одно число за бизнес-день, всегда ≥ 0 (это остаток на конец дня, не движение);
- пусто/не введено → 0;
- блокируется вместе с днём (`locked_at`).

## Формулы

День:
```
Day Result = Tables + (Slots − Players Card Balance)
```
Месячные Totals: вычитается **один раз** — последнее введённое значение месяца (не сумма по дням).

Balance snapshot (`fin_balance_snapshot`):
```
Incomes:
  Live Game        + tables
  Slots            + slots        (сырой, как приходит)
  Card Balance     + cards        ← новая информативная строка
  Other            + ...
  Miss chips/cards ...
Expected = Σ Incomes − Expenses − Collections
Variance = Actual − Starting Float − Expected
```
Slots в снапшоте остаётся сырым — касса сходится; вычет виден только в Result-отчётах.

## Отображение

- **Dashboard TV / Company Report**: строка называется просто **Slots**, значение уже за вычетом карт; объяснение («Slots − Players Card Balance» + сама сумма карт) — в тултипе.
- **Office → Wallets**: строка **Card Balance** в блоке Incomes рядом с Miss Chips / Miss Cards, с тултипом «Депозиты игроков на картах — деньги в кассе, но не заработок».

## Технические детали

1. Миграция: `ALTER TABLE public.fin_day_closing ADD COLUMN IF NOT EXISTS players_card_balance numeric NOT NULL DEFAULT 0` — старые строки автоматически 0.
2. `fin_balance_snapshot`: `v_card_balance` = последнее значение за период; добавить ключ `card_balance` в `v_incomes` со знаком плюс. `slots` не меняем.
3. `src/hooks/use-fin-balance.ts`: поле `incomes.card_balance` в типе + в `computeBalanceTotals`.
4. `src/pages/office/DayClosingsTab.tsx`: колонка ввода, эффективный Slots в строке дня, totals по last-value.
5. `src/hooks/use-fin.ts`: поле в типах и в upsert дня.
6. `src/hooks/use-boss-monthly-report.ts`: last-value вычет из Slots, вернуть `playersCards` для тултипа.
7. `src/components/boss/monthly-report-panel.tsx`: строка «Slots» с тултипом.
8. Поднять версию в `package.json`.

## Проверка после внедрения

Сверим Balance/Variance по Arusha и Mwanza за текущий месяц до и после — цифры должны совпасть, пока карты = 0.
