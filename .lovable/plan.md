# Упростить форму Close Day

Убрать выбор бизнес-дня. Форма всегда работает с текущим (эффективным) бизнес-днём.

## Что меняется

- Удалить поле «Business date» и весь режим backfill (заголовок «Record day figures», подсказка «Day already closed…»).
- Дата фиксируется автоматически: текущий эффективный бизнес-день.
- Условия закрытия (кассы, слоты, столы, сессии) проверяются всегда, без исключений.
- Остаётся простая форма: чек-лист условий + Table Result (auto) + 5 полей цифр (Drop Slots, Net Win, CashDesk Win, Client Balance, JP) + свёрнутые Notes.
- Подтверждение менеджером — без изменений.

## Технические детали

- `src/components/pit/CloseBusinessDayButton.tsx`: убрать состояние `targetDate`, `effectiveDate`, `isBackfill`; использовать `currentDate` напрямую; в мутацию передавать `businessDate: currentDate`.
- RPC `close_business_day_with_figures` не трогаем — параметр даты остаётся, просто всегда передаётся текущий день.
- Поднять версию приложения.
