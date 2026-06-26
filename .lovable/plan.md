## Проблема

Вчера в Arusha → Slots Cage блоки **Cashless IN / OUT / FINAL** опять самопроизвольно перезаписали то, что кассир ввёл вручную. Это та же гонка, что была во Floor Attendance, но в другом компоненте.

## Где баг

`src/components/cage-slots/ActiveSlotsShiftView.tsx` — внутренний компонент `CashlessProvidersBlock` (≈ строки 1244–1263):

```text
useEffect(() => {
  if (initRef.current || disabled || !suggestions) return;
  ...
  next[p] = suggestion              // подставляет цифры из cashless_transactions
  onChange(next)
  onBlur?.(next)                    // → пишет в DB cage_slots_shifts.cashless_*_providers
}, [suggestions, disabled])
```

Сценарии перезаписи:
1. Кассир ввёл значения → ушёл со страницы → вернулся. Внутренний компонент **ремаунтится**, `initRef` обнуляется. Если в этот момент `suggestions` от `useCashlessSuggestions` пришли позже, чем родитель успел прокинуть свежий `values`, пустые ячейки заполняются "подсказкой" и `onBlur(next)` пишет в БД целиком объект — старые ручные цифры в провайдерах с `0` тоже затираются.
2. `disabled` переключается `true → false` (например, статус смены меняется при рефетче) — `initRef.current` ещё `false`, эффект срабатывает снова.
3. Родительский `useState(shift.cashless_in_providers || {})` инициализируется один раз. Если реалтайм обновил `shift`, локальный стейт остаётся старым — следующий blur записывает stale-данные поверх свежих.

## Решение

Ручной ввод — это **единственный источник истины**. Подсказки показываем как placeholder/hint, но никогда не пишем в БД автоматически.

### 1. Убрать авто-prefill из `CashlessProvidersBlock`
- Удалить `useEffect` с `initRef` + `onChange(next)` + `onBlur?.(next)`.
- Оставить только `suggestions` как **placeholder** в `NumberInput` (серым курсивом) — кассир видит подсказку, но если не введёт сам, в БД ничего не пишется.

### 2. Ресинк родительского состояния с DB
В `ActiveSlotsShiftView` для трёх блоков (`cashlessInProviders`, `cashlessOutProviders`, `cashlessFinalProviders`) добавить `useEffect`, который **сливает** свежие значения из `shift.cashless_*_providers` в локальный стейт, **только если у пользователя нет несохранённых правок**. Отслеживаем dirty-флаг (`useRef<Set<string>>`) и обновляем стейт по `shift.updated_at`.

```text
const dirtyIn = useRef(false);
useEffect(() => {
  if (dirtyIn.current) return;
  setCashlessInProviders({ ...emptyMobile(), ...(shift.cashless_in_providers || {}) });
}, [shift.cashless_in_providers, shift.updated_at]);
// onChange → dirtyIn.current = true
// после успешного onBlur/save → dirtyIn.current = false
```

### 3. Защита `recordMidCheck` / `confirmSubmitForReview`
Перед сохранением читать `cashless_*_providers` свежим запросом (как уже делается `fetchFreshTransfersAgg`) и мерджить с локальным стейтом, чтобы при закрытии смены не затереть параллельные правки.

## Файлы

- `src/components/cage-slots/ActiveSlotsShiftView.tsx` — удалить auto-prefill в `CashlessProvidersBlock`, добавить ресинк-эффекты с dirty-флагом для трёх блоков, защитить `recordMidCheck` и `confirmSubmitForReview`.
- `package.json` — поднять версию до `1.3.414`.

## Что НЕ меняется

- Логика баланса (`computeSlotsShiftBalance`), формулы CDR, отчёт, печатные формы — без изменений.
- Прочие компоненты Cashless (Live Game cage) — отдельный компонент, в этой задаче не трогаем (если нужно — отдельной задачей по аналогии).
