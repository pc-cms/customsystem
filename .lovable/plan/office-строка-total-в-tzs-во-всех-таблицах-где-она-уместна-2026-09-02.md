# Office: строка Total (в TZS) во всех таблицах, где она уместна

## Причина

Arusha, август 2026: комиссии = 51 291 971 TZS.

| Часть | Сумма |
|---|---|
| 18 записей в TZS | 47 335 113 |
| USD 1 000 × 2 500 («Container Deposit Refund») | 2 500 000 |
| USD 560.33 × 2 600 («Remaining balance») | 1 456 858 |

Во вкладке Transactions строка Total складывает поле суммы «как есть», смешивая доллары и шиллинги, поэтому показывает ~47 млн вместо 51,29 млн.

## Что делаем

Единое правило для всех денежных таблиц Office: **строка Total внизу списка, сумма пересчитана в TZS по курсу каждой записи**, сторно и сторнированные записи в итог не входят, рядом с числом подпись `TZS`.

| Вкладка | Сейчас | Станет |
|---|---|---|
| Transactions | Total смешивает валюты | Total в TZS (исправление) |
| Collections | итог только в плитках сверху | + строка Total в TZS внизу |
| JP | итог только в плитках | + строка Total в TZS внизу |
| Tips & Bonuses | итог только в плитках | + строка Total в TZS внизу |
| Cashless / Bank (Wallet grid) | Total уже есть | без изменений |
| Day Closings | Total уже есть | без изменений |
| Rates | итог не имеет смысла (курсы) | без изменений |

## Технические детали

- `src/pages/office/OtherIncomesTab.tsx` — `total` (строки 77–80) считать как `amount × (currency === 'TZS' ? 1 : fx_rate)`, пропуская строки с `reverses_id` / `reversed_by_id`; в footer-ячейке добавить суффикс `TZS`.
- `src/pages/office/CollectionsTab.tsx`, `JpTab.tsx`, `TipsBonusTab.tsx` — добавить `footerRows` в `SmartTable`, переиспользуя уже посчитанные `totals` (в них пересчёт по `fx_rate` уже есть); подпись первой ячейки `Total`, значение в колонке суммы.
- Стиль строки итога одинаковый во всех вкладках: `font-bold bg-muted/40 border-t border-border`, знак `+`/`−` и классы `cms-amount-positive` / `cms-amount-negative`.
- Расчёты Wallets / Monthly Report, RPC, схема и данные не меняются — только отображение.
- После успешного typecheck/build поднять версию: 1.3.724 → 1.3.725. Deploy не выполняем.
