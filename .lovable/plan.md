
## Cash Desk Live Game — концептуальные изменения

Две независимые доработки в `ActiveShiftView.tsx`:
1. **IN-форма**: стол становится необязательным, есть свитч сворачивания секции стола.
2. **Cash Check**: toggle Old / New в шапке блока Check; в New — экран с ожидаемыми и фактическими значениями по каждому номиналу.

---

### 1. IN-форма — стол опциональный

- Над кнопками столов — маленький переключатель `Switch` "Table" (по умолчанию **ON**, состояние в `useState`, без persist).
- Когда OFF — вся секция "2. Table" скрывается, `tableId` очищается.
- Валидация: убрать проверку `!tableId` из `handleSubmit`. Условие остаётся: `!playerId || tzsAmount <= 0`.
- В payload `table_id: tableId || null`.
- Cash-Out (`OutForm`): добавляется, как и просили, выбор валюты + сумма cash, которую выдаём. Currency (TZS/USD/EUR/GBP/KES) + `NumberInput`, TZS-эквивалент по `exchangeRates`. Payload расширяется полями `payout_currency`, `payout_amount` (в meta chips или в `chips._meta`, чтобы не менять схему `transactions`). Chips по-прежнему обязательны и передаются как раньше; `amount` = TZS-сумма выданных денег (равна сумме фишек, если TZS; в валюте — TZS-эквивалент).

---

### 2. Новый интерфейс Cash Check (toggle Old / New)

Toggle-свитч `Old | New` в шапке блока `CashCheckForm` (локальный `useState`, дефолт **Old**, без persist). Old рендерит текущий `CashCountGrid` без изменений. New — новый компонент `CashCheckNewGrid`.

#### 2.1 Логика expected

Считается на клиенте из данных смены (без миграций):

- **Opening snapshot**: `cash_counts` этой смены с `count_type='open'` (или первая запись `is_opening`). Из него берём `denominations.chips` и `denominations.cash[<currency>]`.
- **Transactions**: все `transactions` этой смены (`shift_id`), тип `in` и `out`.
  - Для каждой tx с `chips` — раскладка по номиналам суммируется:
    - `in` → фишки **уходят** к игроку → `expectedChips[d] -= qty`
    - `out` → фишки **приходят** в кассу → `expectedChips[d] += qty`
  - Для денег:
    - `in`: если `chips._meta.original_currency` задана — используем её и `original_amount` (разложение по номиналам не даётся, поэтому храним expected как **суммарное значение по валюте**, а не по номиналам). Если валюта TZS — то же самое, expected TZS увеличивается на `amount`.
    - `out`: `payout_currency` + `payout_amount` уменьшают expected по этой валюте.
- **Купюрное разложение expected для денег**: реального разложения по номиналам мы не знаем (кассир сдаёт/принимает произвольными купюрами). Поэтому expected для наличных отображается **только как сумма по валюте**, а counted — покупюрно (кассир вводит по номиналам). Variance по деньгам = `Σcounted - expected` в валюте.
  → Это единственный компромисс, вытекающий из отсутствия покупюрных данных в транзакциях. Фишки — покупюрно с двух сторон.

Хук: `useExpectedCheckState(shiftId)` — читает opening snapshot + `transactions` и возвращает `{ expectedChips: Record<number,number>, expectedCashByCurrency: Record<string, number> }`. Инвалидируется при новых транзакциях.

#### 2.2 Компонент `CashCheckNewGrid`

Три колонки как в старом, но каждая строка = "expected | actual":

```text
Chips (TZS)
┌───────────────────────────────────────────────┐
│ [chip 10 000]  exp: 42   [input 42]   ✓       │
│ [chip 5 000]   exp: 31   [input 30]   −1      │
│ ...                                           │
└───────────────────────────────────────────────┘

TZS Cash
┌───────────────────────────────────────────────┐
│ Expected (сумма)          TZS 3 250 000       │
│ 10 000  · · [input]                           │
│  5 000  · · [input]                           │
│ ...                                           │
│ Counted total  TZS 3 240 000   diff −10 000   │
└───────────────────────────────────────────────┘
```

- **Chips**: рядом с каждым чипом — серый expected (locked, read-only), input actual, справа мини-дельта (`+2` / `−1` / `✓`). Стилизация как в старом `ChipDenomInput`, но с extra колонкой expected.
- **Cash per currency**: expected — одна строка сверху секции (общая сумма). Ниже — покупюрный ввод (текущий `CashDenomInput`), внизу — Counted / Diff.
- **Banks / Mobile / Cashless**: оставляем как в Old — эти блоки к концепции expected/actual не относятся.

#### 2.3 Двойной статус Balanced

Считаем **две метрики**:

- `moneyVsChips = counted_total_tzs − expected_balance` (текущий diff — это и есть "баланс кассы").
- `perCellVariance = Σ|chipDiff[d]| > 0 || Σ|cashDiff[currency]| > 0` — есть ли хоть одно расхождение по строке.

Отображение (после нажатия Record Check):

- `moneyVsChips === 0 && !perCellVariance` → **зелёный** "Balanced" ✓
- `moneyVsChips === 0 && perCellVariance` → **красный** "Balanced · variance" — сумма сошлась, но есть перекос в конкретных фишках/купюрах (например, записали tx неправильно: денег +X, фишек −X — общий 0, но по строкам разъезд)
- `moneyVsChips !== 0` → красный `+/− TZS ...` (как сейчас)

В сохраняемом `cash_counts.denominations.totals` добавляются поля: `expected_chips`, `expected_cash_by_currency`, `chip_variance` (по номиналам), `cash_variance` (по валютам), `balanced_by_totals`, `balanced_by_cells`. Схема БД не меняется (jsonb).

Просмотрщик `CashCheckViewerDialog` в этой итерации **не трогаем** (Old-совместимый режим сохранения). Позже добавим ветку рендера, если понадобится.

---

### Технические детали

- **Файлы**:
  - `src/components/cage/ActiveShiftView.tsx` — свитч Table в `InForm`, toggle Old/New в `CashCheckForm`, currency в `OutForm`.
  - `src/components/cage/CashCheckNewGrid.tsx` — **новый** компонент с expected/actual сеткой.
  - `src/hooks/use-expected-check-state.ts` — **новый** хук расчёта expected из opening cash_count + transactions.
- **Без миграций БД**: expected хранится в `cash_counts.denominations.totals` (jsonb).
- **Совместимость**: старые чеки читаются как раньше; новые сохраняются в тот же формат + доп. поля в `totals`.
- **Мелочи**: если opening snapshot не найден — expected = 0 по всему, показать subtle warning "Opening snapshot missing".

---

### Открытые допущения

- Купюрный expected для наличных = агрегат по валюте, не по номиналам (см. 2.1). Если позже добавим покупюрное разложение в `transactions.chips._meta.cash_denoms` — переключим на построчный expected без изменений в UI.
- Toggle Old/New живёт только в стейте компонента (без localStorage), как договорились.
- Cash-Out в валюте: расширяем `chips._meta` полями `payout_currency`, `payout_amount`; поле `transactions.amount` остаётся TZS-эквивалентом.
