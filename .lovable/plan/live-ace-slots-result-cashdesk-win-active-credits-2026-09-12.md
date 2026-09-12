# Live ACE Slots Result: CashDesk Win − Active Credits

Меняем live-формулу слотов на дашбордах: было `net_win − active_credits`, станет `win_cashdesk − active_credits`. Закрытые дни и Monthly Report не трогаем — там уже `cashdesk_win − players_card_balance`.

## Что меняем

1. **`src/lib/boss-display-metrics.ts`** — в `deriveDisplayedToday` live ACE результат считается как `winCashdesk − activeCredits` (если `winCashdesk` отсутствует в live-снимке — ACE-результат считается недоступным и берётся fallback на закрытый день, как сейчас при устаревших данных). Обновляем комментарии-«канон» в шапке файла.
2. **`src/pages/Dashboard.tsx`** — тот же расчёт для операционного дашборда (строки 294–295): `winCashdesk − activeCredits`.
3. **Тесты `src/test/boss-display-metrics.test.ts`** — обновляем ожидания: live результат = CashDesk Win − Active Credits (NetWin больше не используется для отображения).

## Что НЕ меняем

- Закрытые дни / Monthly Report: формула `cashdesk_win − players_card_balance` остаётся.
- Запись в `fin_day_closing` при закрытии дня (NetWin как системный результат хранится как есть).
- Подсказку «Credits …» и показ CashDesk Win отдельной строкой на Dashboard — остаются.

## Технические детали

- Поле `win_cashdesk` уже приходит в live-снимке ACE (`ace_finance_snapshots`, `period_id = 0`) и уже прокинуто в `AceLiveSlots.winCashdesk` — схему и ingest не меняем.
- Проверка: `bunx vitest run src/test/boss-display-metrics.test.ts`, typecheck, build.
