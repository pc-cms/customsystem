# Стартовый флот Mwanza — новые значения на 01/08/2026

## Что меняем

| Кошелёк | Было | Станет |
|---|---|---|
| Safe TZS | 21 795 323 | 1 521 067 |
| Safe USD | 0 | 7 958 |
| Safe KES | 0 | 7 000 |

Остальные кошельки не трогаем:

| Кошелёк | Сумма |
|---|---|
| AirTell (TZS) | 263 984 |
| Halo (TZS) | 2 275 702 |
| M PESA (TZS) | 664 991 |
| Прочие (CRDB, NBC, Tigo, Main Phone, Safe Live, Safe Slots, Safe EUR/GBP, CRDB USD, NBC USD) | 0 |

## Новый Total (Starting Float)

- TZS всего: 1 521 067 + 263 984 + 2 275 702 + 664 991 = **4 725 744 TZS**
- USD: 7 958 × 2 600 = **20 690 800 TZS**
- KES: 119 000 × 17 = **2 023 000 TZS**

**Grand Total ≈ 27 439 544 TZS** (курсы из fin_daily_rates: USD 2600, KES 17)

Отдельно в валюте: **7 958 USD**, **119 000 KES**.

## Технические детали

- Обновление трёх строк `fin_wallets` (casino = Mwanza Cloud): поле `starting_float_amount`, дата `starting_float_date` остаётся 2026-08-01.
- Триггер `trg_fw_float_log` запишет изменение в лог автоматически.
- После обновления пересчитается `fin_balance_snapshot`: Variance = (Actual − Starting Float) − Expected, поэтому Variance по Mwanza за август изменится на разницу старого и нового флота.
