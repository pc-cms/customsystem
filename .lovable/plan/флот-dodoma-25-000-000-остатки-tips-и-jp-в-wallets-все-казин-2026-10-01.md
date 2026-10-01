# Флот Dodoma 25 000 000 + остатки Tips и JP в Wallets (все казино)

## Что сейчас
- В Dodoma флот на открытие октября стоит 27 539 647 вместо 25 000 000.
- В Wallets строка Missed Chips уже включает остаток прошлых месяцев (+1 287 000), а строки Tips & Bonuses и JP за октябрь показывают 0: их остатки в Wallets не переносятся. Перенос есть только на вкладках Tips и JP.
- Остатки на 01/10 (сумма за все прошлые месяцы): Dodoma Tips 841 500, JP 656 387; Mwanza Tips 1 045 474, JP 1 485 636; Arusha Tips 131 000, JP 1 545 099; Mbeya 0 и 0.

## Что сделаю
1. **Dodoma, флот октября = 25 000 000**: Safe Live 9 000 000 → 6 460 353 (−2 539 647). Меняется открытие месяца и стартовый флот кошелька Safe Live. Изменение пишется в журнал флота.
2. **Wallets во всех казино**: при выборе целого месяца строки Tips & Bonuses (±) и JP (±) включают остаток с прошлых месяцев, так же как Missed Chips. Остаток Tips — только Tips, Bonuses не переносятся. Expected и Variance учитывают эти суммы.
3. Проверю расчётом для всех четырёх казино, что в Wallets за октябрь Tips и JP равны START на вкладках Tips и JP.

## Что не меняется
- Записи Tips и JP, кассы, данные ACE и выплаты JP.
- Периоды, которые не равны целому месяцу, считаются как раньше.

## Технические детали
- Данные: UPDATE fin_month_opening (Dodoma 2026/10): opening_float_tzs = 25 000 000, в wallet_balances сумма Safe Live = 6 460 353. UPDATE fin_wallets Safe Live (Dodoma): starting_float_amount = 6 460 353.
- Миграция fin_balance_snapshot: при whole-month окне v_tips_bonus += fin_carry(casino,'tips', start) и v_jp += fin_carry(casino,'jp', start). Строки дневного аудита не меняются.
- Один typecheck и один build в конце.
