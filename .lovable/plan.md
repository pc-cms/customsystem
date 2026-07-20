## Что добавляем

Новая вкладка **Monthly Report** на странице `/boss-dashboard` — переключатель рядом с текущими Auto/Columns/Rows. Отчёт повторяет структуру Excel-файла из скриншота, период = текущий месяц (MTD), автообновление 30 сек. Все данные — из БД автоматически. Casino set: **Arusha, Mwanza, Dodoma, Mbeya**.

## Дизайн (ключевое)

Крупный TV-friendly отчёт под 75" с чёткой иерархией:

**Палитра (использует существующие boss-casino токены)**
- Фон панелей: `bg-card/40` со стеклянной подложкой, тонкая рамка `border-white/10`
- Заголовки казино: цвета `hsl(var(--boss-casino-1..4))` — Arusha, Mwanza, Dodoma, Mbeya получают закреплённые цвета (легенда как в StackedShareBar)
- Числа: `font-mono tabular-nums`, отрицательные — `cms-amount-negative` (красный), положительные — обычным цветом; Balance/Total — жирным
- Разделители тысяч — пробелом (`fmtMoney`)

**Выделение сегодняшнего дня (главное)**
- Строка сегодняшнего дня в дневной таблице:
  - фон `bg-primary/15` с левым бордером `border-l-4 border-primary`
  - жирный текст, увеличенный шрифт (на 1 пресет выше)
  - слева от даты — маленький пульсирующий индикатор `● TODAY` (badge, `animate-pulse`)
  - строка «прилипает» к области видимости (sticky) при прокрутке — так на TV босс всегда видит текущий день
- Незакрытые дни (нет `fin_day_closing`) — приглушённо (`text-muted-foreground`) с точкой-плейсхолдером `·`
- Будущие дни месяца — не рендерим

**Читабельность**
- Zebra-striping (`odd:bg-white/[0.02]`)
- Sticky header у дневной таблицы
- Sticky нижняя строка `TOTAL` (сумма по месяцу)
- Разделители недель — тонкая линия каждые 7 строк
- Правое выравнивание всех чисел, левое — только у даты и метки
- Крупные разделы разделены заголовками с uppercase tracking (как в существующих Boss-панелях)

**TV-режим**
- Работает с текущими пресетами шрифта S/M/L/XL и полноэкранным F
- Внутренние отступы адаптированы под overscan (уже есть в BossDashboard)
- Дневная таблица занимает правую половину, сводка — левую; на узких экранах — вертикально

## Раскладка

### Блок 1 — Верхняя сводка (слева)

Стеклянная панель, таблица `metric × (Arusha | Mwanza | Dodoma | Mbeya | Total)`:

| Строка | Источник |
|---|---|
| Estimated Expenses | `fin_budget` за текущий месяц |
| Result (Live + Slots) | Σ (`tables_result` + `slots_result`) из `fin_day_closing` MTD |
| Other incomes | Σ `fin_other_incomes.amount_tzs` MTD |
| Collection | Σ `expenses.amount` где категория='collection' MTD |
| **Extra Expenses** (James GB / Debts / TRA / Unplanned / ACE CMS / Bonus 5%) | `expenses` по подкатегориям; Bonus = Result × 5% |
| Expected Profit | Result − Estimated − Extra − Collection + Other |
| **SAFE** | Σ балансов `fin_wallets` (Safe TZS/USD/EUR/GBP/KES → TZS по курсу дня) |
| **Balance (current month)** | Result + Other − (Estimated + Extra + Collection) |
| Overruns | max(0, факт. Expenses − Estimated) |
| Total | SAFE + Balance |
| in USD | Total / rate USD |

Секция Extra Expenses — сворачиваемая (по умолчанию раскрыта на TV), строки чуть меньшего размера.

### Блок 2 — Дневная таблица (справа)

Колонки: `Date | JC Result | Arusha | Mwanza | Dodoma | Mbeya | Collection | Balance`

- Строка на каждый день от 1-го до сегодня включительно
- **Сегодня** — с подсветкой (см. выше)
- Balance — нарастающий итог, знак и цвет через `cms-amount-negative`/`cms-amount-positive`
- Внизу sticky-строка `TOTAL` — жирным

## Технические детали

**Новые файлы:**
- `src/hooks/use-boss-monthly-report.ts` — один хук, возвращает `{ summary, daily }`, `refetchInterval: 30_000`
- `src/components/boss/MonthlyReportPanel.tsx` — панель со сводкой + дневной таблицей
- `src/components/boss/MonthlyDayRow.tsx` — строка дня с выделением today

**Изменения:**
- `src/pages/BossDashboard.tsx` — добавить таб "Report" в переключатель макета
- Расширить дефолтный casino set Boss TV до Mbeya

**SQL:** запросы клиентские через supabase-js, без миграций и без новых таблиц. Все нужные таблицы уже есть: `fin_day_closing`, `fin_other_incomes`, `expenses`, `fin_budget`, `fin_wallets`, `fin_daily_rates`.

## Что НЕ делаем

- Не создаём новых таблиц/миграций
- Не трогаем логику Office Balance / Day Closings
- Экспорт в Excel/print — на следующей итерации
