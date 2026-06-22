## Проблема

`shifts.balance` всегда промахивается на сумму **Cashless Balance** (например, −11 000 000 в Мванзе 19/06). Причина — рассинхрон формул:

- **TS-превью** (`src/lib/cage-balance.ts`) при закрытии смены показывает кассиру правильный баланс с включённым cashless.
- **DB-функция** `compute_shift_balance_from_row` (источник истины — пишет `cash_desk_result` и `balance` в `shifts`) исключает cashless из CDR.

После сохранения смены БД-триггер пересчитывает баланс без cashless → перекос ровно на величину `CashlessIn − CashlessOut`.

Логически верна TS-формула: cashless_in — это деньги, реально полученные заведением (на мобильный счёт) в обмен на фишки, которые потом формируют `tables_result`. Без cashless в CDR уравнение не закрывается.

## Что нужно сделать

### 1. Исправить DB-функцию (миграция)

В `public.compute_shift_balance_from_row(s shifts)` добавить cashless в CDR:

```sql
-- было:
v_cash_desk := v_delta_cash + v_expenses + v_collection - v_add_float
               + v_slots_out - v_slots_in;

-- станет:
v_cash_desk := v_delta_cash + v_expenses + v_collection - v_add_float
               + v_slots_out - v_slots_in
               + v_cashless_in - v_cashless_out;
```

Обновить комментарий в функции, чтобы он совпадал с реальной формулой.

### 2. Бэкфилл исторических смен

Перепрогнать `compute_shift_balance_from_row` для всех уже закрытых смен и записать новые `cash_desk_result` / `balance`:

```sql
UPDATE public.shifts s
SET cash_desk_result = (public.compute_shift_balance_from_row(s)->>'cash_desk_result')::bigint,
    balance          = (public.compute_shift_balance_from_row(s)->>'balance')::bigint
WHERE status = 'closed';
```

Затронет все казино (Arusha, Mwanza, Dodoma, Mbeya), но реальное изменение коснётся только смен с ненулевым cashless. В Arusha cashless почти не используется → balance не сдвинется.

### 3. Верификация

После миграции проверить, что:
- Смена Мванзы `b0ede990` (19/06): balance стал ≈ 0 (было −11M).
- Смена Мванзы `6acbf13e` (18/06, cashless Halo 200K): balance = −200 500 + 200 000 = −500 (мелкая чиповая недостача — нормально).
- Прочие смены Arusha без cashless не изменились.

### 4. Обновить документацию формулы

В `src/lib/cage-balance.ts` блок-комментарий уже корректен. Просто синхронизировать комментарий в DB-функции и обновить memory [Cash Desk Balance Formula] — в ней формула указана с cashless, так что правки memory не требуется, только подтверждение что DB теперь совпадает.

## Что НЕ трогаем

- Cage Slots (`compute_slots_shift_balance_from_row`) — другая формула, в ней cashless изначально не участвует (заданная политика).
- Tips — остаются полностью нейтральными.
- Mobile Balance (ручная сверка) — остаётся отдельной проверкой, в формулу не входит.
- UI закрытия смены — TS-формула уже правильная, изменений не требует.

## Риски

- Бэкфилл изменит исторический `balance` у всех смен с cashless. Это **исправление**, а не искажение — отчёты Daily Review / Finance станут корректными. Имеет смысл сделать одной транзакцией.
- Если где-то отчёт жёстко завязан на старое (некорректное) значение balance — может перестать «сходиться» с прошлыми ручными корректировками. Маловероятно, т.к. balance ≠ 0 как раз и был жалобой.

## После approve

Версию `package.json` бампну патчем (backend change).
