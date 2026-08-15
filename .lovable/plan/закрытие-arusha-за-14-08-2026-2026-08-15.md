# Закрытие Arusha за 14/08/2026

В `fin_day_closing` нет строки для Arusha за 14/08 (авто-закрытие прошло без цифр). Вношу день вручную.

## Данные

| Поле | Значение | Источник |
|---|---|---|
| Tables Result (Live Game) | −3 586 000 | Cash Desk Report Arusha 14/08 |
| Drop Slots | 25 381 730 | ваши данные |
| Net Win (Slots) | 552 750 | ваши данные |
| Cash Desk Win | 448 071 | ваши данные |
| JP | 20 249 | ваши данные |
| Clients (Card Balance) | −33 430 | ваши данные |

`slots_result` заполняю значением Cash Desk Win (448 071) — так же, как в уже закрытых днях Arusha/Mbeya/Mwanza.
JP записываю в `income_lines` строкой JP = 20 249, как в остальных днях.

## Технически

- INSERT в `public.fin_day_closing` для casino Arusha, business_date 2026-08-14 (через insert-инструмент, не миграция).
- После записи проверю, что день отображается в Office → Day Closings и попадает в Wallets/Balance и CMB.

Строку не блокирую (`locked_at` оставляю пустым), чтобы менеджер мог поправить цифры.
