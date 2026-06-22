
## 1. Почему меню разные: diff прав Аруша vs Мванза

Код сайдбара (`src/components/layout/AppSidebar.tsx → NAV_ITEMS`) **одинаков** для всех казино — разница на 100% в назначенных ролях и одном персональном override'е.

### Кассирские пользователи (раздел CASHIER)

| Пользователь | Назначенные роли | Что фактически видит |
|---|---|---|
| **Arusha · Cashier** | `cashier` | Cage Live Game, Cashless, Expenses |
| **Mwanza · Live Game** | `cashier` + **`reception`** | то же самое **+ Dashboard, Reception, Guests, Blacklist** |
| **Arusha · Cashier Slots** | `cashier_slots` + override (`cage=hidden`, `cage_slots=visible`) | Cage Slots, Cashless, Transfers, Expenses |
| **Mwanza · Slots** | `cashier_slots` + **`reception`** (без override) | то же **+ Dashboard, Reception, Guests, Blacklist** |

**Корень расхождения:**
- В Мванзе кассирам дополнительно навешана роль `reception` → подтягивается весь блок RECEPTION и Dashboard.
- В Аруше «Cashier Slots» имеет явный per-user override (скрыт `cage`, открыт `cage_slots`); в Мванзе таких overrides нет.

### Менеджеры/Pit/HR/Surveillance
Полностью совпадают между казино — `manager`, `shift_manager`, `pit`, `hr`, `surveillance`, `finance_manager` дают одинаковый набор пунктов.

### Что я предлагаю сделать с расхождением
Это конфиг БД, не код. Два варианта (решим после диффа — отдельным шагом):
- (A) Снять роль `reception` с Mwanza `Live Game` и `Slots` (выровнять под Арушу).
- (B) Добавить роль `reception` пользователю Arusha `Cashier`/`Cashier Slots` (выровнять под Мванзу).

В рамках текущего плана конфигурацию НЕ трогаю — только показываю diff. Скажешь какой вариант — сделаю отдельной миграцией.

## 2. Чистка пункта `Transfers` в сайдбаре

Сейчас:

```ts
{ to: "/transfers", label: "Transfers",
  roles: ["super_admin", "manager", "shift_manager", "cashier_slots", "finance_manager"], ... }
```

Стало:

```ts
{ to: "/transfers", label: "Transfers",
  roles: ["super_admin", "cashier_slots"], ... }
```

Эффект:
- Manager / Shift Manager / Finance Manager **больше не видят пункт `Transfers`** в сайдбаре.
- Историю переводов они смотрят через `Cage View` и `Reports → Live Game / Slots` — там данные те же.
- Сама страница `/transfers` остаётся живой (cashier_slots/super_admin), URL-доступ для менеджера не блокируется на уровне роутера (только пункт в меню скрыт).

### Файл, который меняю
- `src/components/layout/AppSidebar.tsx` — одна строка в `NAV_ITEMS`.

Версия `package.json` не бампается (правка чисто UI, без backend-изменений).

## 3. Дубликат формы Transfers в Cage Slots под чеком

Я не трогаю в этом плане:
- `Transfers` отдельной страницей (`/transfers`) и
- секция `Transfers` внутри активной смены Cage Slots (`src/components/cage-slots/ActiveSlotsShiftView.tsx → SlotsTransfersForm`)

Ты явно выбрал только пункт «убрать Transfers у менеджеров». Если дубликат формы внутри Cage Slots тоже надо снести (или наоборот, оставить ввод только там и убрать форму с `/transfers`) — скажи в одной строке после применения, сделаю вторым шагом.

## 4. Что НЕ меняется

- `NAV_ITEMS` для остальных пунктов.
- Сами страницы `/transfers`, `ActiveSlotsShiftView`, форма ввода.
- RLS, миграции, ролевые дефолты, user_module_permissions.
- Версия приложения.
