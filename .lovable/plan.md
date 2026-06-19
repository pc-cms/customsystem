## Цель

Унифицировать **все** пикеры дат в приложении к единому виду:

**Кнопки:** `Day` · `Week` · `Month` · `Year` · `Custom`

- `Week` = последние 7 дней начиная с **Воскресенья** (Sun→Sat), а не «последние 7 дней от сегодня»
- `Month` = текущий календарный месяц (1‑е → последнее число)
- `Year` = текущий календарный год (1 янв → 31 дек)
- `Day` = сегодня (бизнес‑день)
- `Custom` = два календарных попапа From / To

Убрать «7 дней назад» и «30 дней назад» как пресеты — это сейчас в `presetRange()` в `date-range-presets.tsx` и в кастомных месячных навигаторах с `‹ ›`.

## Что меняется (1 общий компонент + замены)

### 1. `src/components/ui/date-range-presets.tsx` — обновить

- `presetRange("week")` → текущая неделя Sun..Sat (через `startOfWeek(d, { weekStartsOn: 0 })` / `endOfWeek`)
- `presetRange("month")` → `startOfMonth..endOfMonth` (не «−29 дней»)
- `presetRange("year")` → `startOfYear..endOfYear` (не «−364 дня»)
- `presetRange("day")` → сегодня (как есть)
- Календарь в `Custom` уже использует shadcn `Calendar` — добавим проп `weekStartsOn={0}` чтобы воскресенье было первым днём.
- Внутри попапов оставить навигацию `‹ ›` влево/вправо для быстрого перехода на предыдущий/следующий период того же типа (Day → −1 день, Week → −1 неделя, Month → −1 месяц, Year → −1 год). Это закрывает кейсы текущих самописных навигаторов.

### 2. Заменить самописные «месяц‑навигаторы» на `DateRangePresets`

Сейчас в этих файлах своя пара `‹ Month Name ›` без выбора Day/Week/Year:

- `src/pages/tips/LiveGameTipsTab.tsx`
- `src/pages/tips/FloorTipsTab.tsx`
- `src/pages/tips/ClubPokerTipsTab.tsx`
- `src/pages/reports/PokerTipsReport.tsx`
- `src/pages/reports/FloorTipsReport.tsx`
- `src/pages/MonthlyTips.tsx`
- `src/pages/MissChips.tsx`
- `src/pages/cage/CageClosingsPage.tsx`

Заменяем на `<DateRangePresets preset from to onChange />` с дефолтом `month`. Хуки (`useTipsByRange`, `useMonthlyTips` и т.п.) уже принимают `from`/`to` строки — просто передаём новые значения.

Исключение: **Live Game Tips** работает в окне «16 → 15 следующего месяца» (Period 16‑15), это специальный бухгалтерский период — оставляем как есть, помечаем `Custom`‑режимом с заблокированными границами, либо оставляем самописный навигатор только тут. **Уточнение нужно — см. вопрос ниже.**

### 3. Места уже на `DateRangePresets` — только пересчёт пресетов
Автоматически подхватят новое поведение Week/Month/Year:
- `src/pages/Reports.tsx`
- `src/pages/PlayerStatistics.tsx`
- `src/pages/PlayerProfile.tsx`
- `src/pages/Groups.tsx`
- `src/pages/WeeklyBonus.tsx`
- `src/pages/finances/FinancesWalletsPage.tsx`
- `src/pages/BankChecks.tsx`
- `src/pages/TableResults.tsx`
- `src/pages/tips/LotteryTab.tsx`
- `src/components/cage/CageHistoryView.tsx`

### 4. `src/components/ui/date-navigator.tsx` (для одиночной даты)
- Календарь внутри → `weekStartsOn={0}` (визуально воскресенье первое).
- Логика «бизнес‑день» не трогается.

### 5. `src/components/ui/calendar.tsx`
- Прокинуть проп `weekStartsOn` (по умолчанию `0`), чтобы все попап‑календари по умолчанию начинались с воскресенья.

## Что НЕ трогаем

- `useMonthlyTips`, `getPeriodStart16` — это банковский 16→15 период для финансов, не календарный месяц.
- Бизнес‑день логика (`useEffectiveBusinessDate`, 07:00 EAT).
- Role‑gates (`useBusinessDayFilter`, `canSeePlayerFinancials`) — операционные страницы (Cage, ActiveShift, Tables) по‑прежнему заперты на «сегодня».
- Версия `package.json` — только UI, бэкенда нет, без bump.

## Тех. детали

```ts
// новая логика presetRange
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, format } from "date-fns";
const iso = (d: Date) => format(d, "yyyy-MM-dd");
case "day":   return { from: iso(today), to: iso(today) };
case "week":  return { from: iso(startOfWeek(today, { weekStartsOn: 0 })), to: iso(endOfWeek(today, { weekStartsOn: 0 })) };
case "month": return { from: iso(startOfMonth(today)), to: iso(endOfMonth(today)) };
case "year":  return { from: iso(startOfYear(today)), to: iso(endOfYear(today)) };
case "all":   // оставляем для обратной совместимости, но кнопку убираем из UI
```

UI пресетов: `Day · Week · Month · Year · Custom` (убираем `All`).

## Вопрос перед реализацией

**Live Game Tips** сейчас идёт по бухгалтерскому окну «16 число → 15 следующего месяца» (синхронизирован с Monthly Tips). Это специальное окно, не календарный месяц. Что делаем?

- (A) Оставляем самописный навигатор 16→15 только на Live Game Tips (исключение).
- (B) Унифицируем под Month (1‑е → последнее) — тогда сумма перестанет совпадать с Monthly Tips «collected» подсказкой.
- (C) Унифицируем, но Monthly Tips тоже переводим на календарный месяц.

По умолчанию выберу **(A)** если не уточнишь.
