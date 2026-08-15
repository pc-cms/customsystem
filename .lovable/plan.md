# Кошельки Dodoma по образцу Arusha

## Что делаем

В Dodoma сейчас нет ни одного кошелька. Копируем полный набор из Arusha — 16 кошельков с теми же названиями, типами и валютами, с нулевыми балансами.

## Список кошельков

| Кошелёк | Тип | Валюта |
|---|---|---|
| Safe TZS | Cash | TZS |
| Safe USD | Cash | USD |
| Safe EUR | Cash | EUR |
| Safe GBP | Cash | GBP |
| Safe KES | Cash | KES |
| Safe Live | Safe | TZS |
| Safe Slots | Safe | TZS |
| CRDB TZS | Bank | TZS |
| CRDB USD | Bank | USD |
| NBC TZS | Bank | TZS |
| NBC USD | Bank | USD |
| M PESA | Mobile money | TZS |
| AirTell | Mobile money | TZS |
| Tigo | Mobile money | TZS |
| Halo | Mobile money | TZS |
| Main Phone | Mobile money | TZS |

## Стартовые значения

- Стартовый флот (Starting float) — 0 по каждому кошельку.
- Дата стартового флота не проставляется — её задаст менеджер при первом физическом пересчёте.
- Все кошельки активны, порядок сортировки повторяет Arusha (наличные и мобильные сверху, затем сейфы, затем банки).

Когда будут реальные остатки по Dodoma — заносим их через физический пересчёт в разделе Wallets, чтобы движение попало в историю корректно.

## Технические детали

- Вставка 16 строк в `fin_wallets` с casino_id Dodoma, поля `starting_float_amount = 0`, `is_active = true`, `sort_order` как в Arusha.
- Уникальность по паре казино + название, повторный запуск дублей не создаст.
- Балансы кошельков считаются из журнала движений, поэтому отдельно обнулять ничего не нужно.
