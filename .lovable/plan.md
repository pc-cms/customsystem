# Casino Monthly Balance — полный разбор

Ниже — фактическая логика таблицы, как она сейчас работает в коде (`src/pages/reports/DailyBalanceReport.tsx`, `src/hooks/use-daily-balance-report.ts`, подписи формул в `src/lib/monthly-balance-formulas.ts`). Никаких изменений пока не вносится — сначала подтверждение формул.

## Как устроена таблица

- Одна строка = один бизнес-день месяца (ролловер 07:00 EAT). Строки не суммируются между собой: потоки (Result, Expenses, Transfers, Office) — строго за день, остатки (Cage, Manager, Bank, Money) — снимок на конец дня.
- Незакрытый бизнес-день показывает `·` во всех колонках (данные скрыты до закрытия).
- Итоги внизу: FLOW-колонки суммируются за месяц, STOCK-колонки (Cage Casino, Cage Manager, Bank TZS/USD, Money, Balance) берут последний закрытый день. Строка Avg/day = Total / количество дней с данными.
- Всё в TZS; USD пересчитывается по дневному курсу `fin_daily_rates`, fallback 2600.
- Секции сворачиваются: видна головная колонка, стрелка раскрывает детали.

## Колонки и формулы

**Date | Fin Result** (закреплены слева)
- Fin Result = Casino Result − Expenses + (Office IN − Office OUT). Не включает Diff, Fees, Tips.

**Casino result**
- Casino Result = Live Game + Slots + Bar
- Live Game = `fin_day_closing.tables_result` (если нет — сумма `shifts.tables_result`)
- Slots = `fin_day_closing.slots_result` − `players_card_balance`
- Bar = Σ `pos_orders.total_tzs` (без void)
- Tips = типсы столов (`transactions` tips_live/floor/poker) + типсы слотов (`cage_slots_tips_cd`). Справочно, в Result не входят.

**Diff**
- Diff = Chip Diff + Slots Diff
- Chip Diff = Σ `closing_count.chip_miss_total` смен, закрытых в этот бизнес-день (как в отчёте Miss Chips)
- Slots Diff = `players_card_balance` дня

**Cage & transfers**
- Cage Casino = снимок на закрытие: наличные последней смены Live (total_tzs − chips_tzs) + cashless-провайдеры (in − out) + последняя closing-инвентаризация слотовой кассы. Фишки исключены.
- Internal Transfer = переводы Cage → Manager safe (входящая нога, сматченная с исходящей ногой кассы в тот же день по сумме)
- Cage Manager = остаток офисного сейфа на конец дня (стартовый флот + все проведённые движения)
- Bank Transfer = входящие переводы на банковские кошельки

**Bank**
- Bank = Bank TZS + Bank USD. Обе ячейки редактируемые: ручное значение (`fin_legacy_balance`) перебивает расчёт по кошелькам. Bank USD хранится в USD, отображается × курс дня.

**Expenses**
- Expenses = утверждённые расходы бизнес-дня (касса + офис), кроме void. Клик → матрица расходов.
- Fees = `fin_other_incomes` с source = 'fee'. В Fin Result и в Balance сейчас НЕ участвуют.

**Office**
- Office = (+) − (−)
- (+) Money IN = `fin_wallet_tx` kind = external_income (депозиты владельца)
- (−) Money OUT = `fin_wallet_tx` kind = collection (инкассации/изъятия)

**Balance**
- Money = Cage Casino + Cage Manager + Bank TZS + Bank USD (фактические деньги на конец дня)
- Balance = (Money вчера + Casino Result + Diff − Office net − Expenses) − Money сегодня. Контрольная величина, должна стремиться к 0.
- Money вчера для первого дня месяца = плитка Starting Balance (ручной ввод).

## Что я вижу как спорное — нужны ваши решения

1. **Знак Office в Balance.** Сейчас Office net вычитается из ожидаемой суммы. Депозит владельца (+) физически увеличивает деньги, значит он должен ожидаемую сумму увеличивать, а инкассация — уменьшать. По текущей формуле логика обратная и Balance будет уходить в минус ровно на сумму пополнений.
2. **Starting Balance хранится в localStorage браузера**, ключ `dbr-start-balance:<casino>:<месяц>`. У другого пользователя или в другом браузере — ноль, и первый день месяца ломает Balance. Логично перенести в БД (закрытие месяца `fin_month_closures` уже существует).
3. **Fees нигде не учитываются** — ни в Fin Result, ни в Balance. При этом это реальные деньги.
4. **Tips** тоже вне всех итогов, хотя физически уходят из кассы.
5. **Diff в Balance участвует со знаком «плюс»** — то есть Miss Chips трактуется как увеличение ожидаемых денег. Нужно подтвердить знак.
6. **Bank USD в итоге месяца** берётся по последнему дню × курс этого дня, курсовая разница нигде не показана.
7. **Cage Casino** берёт последнюю смену Live, но слотовая инвентаризация прибавляется — если за день было две слотовые смены, берётся только последняя. Подтвердить, что это корректно для всех казино.
8. **Внутренние переводы** матчатся по совпадению суммы в тот же день. Два перевода на одинаковую сумму или перевод через полночь смены не сматчатся.

## Вопросы

1. Balance должен сходиться к нулю как «касса — ожидание» (как Variance на Wallets), или это отдельный контроль? Совпадать с Variance в Wallets он сейчас не будет — там другая формула.
2. Office (+) — увеличивает или уменьшает ожидаемые деньги?
3. Fees и Tips включать в Fin Result / Balance?
4. Starting Balance переносим в БД (общий для всех) или оставляем ручным локальным?
5. Fin Result должен включать Diff?
