# UI Consistency & Responsive Audit — только отчёт, изменений не вносилось

## Executive summary

Аудит проведён по коду (`src/`, 174 страницы/подстраницы, 117 файлов с ручным `<table>`). Визуальный прогон в preview не выполнялся, поэтому все находки помечены как **code-level risk**, кроме тех, где код однозначен.

| Severity | Кол-во групп | Суть |
|---|---|---|
| Critical | 3 | Ноль отображается как `·` в деньгах; 66 локальных форматтеров вместо общих; native `type="number"` в финансовых формах |
| High | 6 | `Intl.NumberFormat`/`toLocaleString` для денег (12 файлов), `MoneyCell` рендерит `·`, PageHeader без `flex-wrap`, вложенные sticky в широких отчётах, 17 страниц без `PageShell`, 111 таблиц мимо `SmartTable` |
| Medium | 7 | Фиксированные `w-[...px]`/`min-w-[...]`, нереспонсивные `grid-cols-4/5/6/12`, `toFixed(1/2)` там, где ожидаются целые, разные высоты инпутов, `formatCurrency` vs `formatMoneyFull` |
| Low | 4 | `·` для дат/строк (это ок), декоративные `·`-разделители, `absolute` в Club-страницах, разнобой в admin-панелях |

## Глобальные корневые причины (важнее, чем отдельные страницы)

1. **Нет единой точки форматирования.** Сосуществуют `formatNumberSpaces` (545 вызовов), `formatCurrency` (165), `formatMoneyFull` (21), `formatSpaced` (19), плюс **66 локальных `const fmt = ...`** в отдельных файлах. Любая правила-правка не доезжает до всех экранов.
2. **Falsy-проверка вместо null-проверки.** Массовый паттерн `value ? fmt(value) : "·"` — реальный ноль неотличим от отсутствия данных. Это же зашито в общий `MoneyCell` (`empty ?? "·"`).
3. **Два «канона» ввода чисел.** Есть правильный `NumberInput` (72 файла), но параллельно 37 вхождений `type="number"` и 20 мест `Input + inputMode` с самописным парсингом.
4. **Оболочки страниц не обязательны.** `PageShell` использован в 93 из 110 корневых страниц; `SmartTable` — только в 6 местах при 117 файлах с ручным `<table>`.

## Сводная таблица находок

| Sev | Route/Module | File/Component | Проблема | Почему | Рекомендация (не выполнено) |
|---|---|---|---|---|---|
| Critical | Все таблицы денег | `src/components/ui/money-cell.tsx:34` | `empty ?? "·"` + falsy-паттерны у вызывающих | нет различия null/0 | `0` для числа, `·` только для `null/undefined` |
| Critical | Table Check | `components/tables/ChipCountPanel.tsx:416-450,638,662` | fill/credit/adjustment/delta = 0 → `·` | `fc.fill ? ... : "·"` | явная проверка `!= null` |
| Critical | Cage / Cash Check | `components/cage/CashCheckViewerDialog.tsx:63-94,255-364` | qty/in/out/net = 0 → `·` | falsy | то же |
| Critical | Office → Bank/Cashless | `pages/office/WalletDayGridTab.tsx:122,177,197,206` | нулевой день → `·` | falsy | то же |
| Critical | Финформы | `pages/finances/FinancesDayClosingPage.tsx:183,187` | `Input inputMode=decimal` + свой `formatAmountInput` | не `NumberInput` | перевести на `NumberInput` |
| High | Payroll (3 стр.) | `pages/payroll/*.tsx` | `Intl.NumberFormat("en-US").replace(/,/g," ")` | локальный форматтер | `formatNumberSpaces` |
| High | Staff Master | `pages/StaffMaster.tsx:36`, `components/staff-master/editable-cell.tsx:137` | то же + 4×`type="number"` | локальный форматтер + native input | общий форматтер + `NumberInput` |
| High | Admin (AM/FM/KYC/Shop) | `pages/admin/*.tsx` | `toLocaleString("fr-FR")` — узкий пробел U+202F | локаль-зависимо, ломает поиск/копирование | `formatNumberSpaces` |
| High | Admin Sync | `components/admin/SyncMirrorPanel.tsx:100-154` | голый `toLocaleString()` → **запятые** | нет replace | `formatNumberSpaces` |
| High | Admin Chips | `components/admin/ChipColorSettings.tsx:107` | `toLocaleString("en-US")` → запятые | нет replace | `formatChipLabel`/`formatNumberSpaces` |
| High | Dashboard TV | `components/boss/casino-double-block.tsx:106-108` | slots = 0 → `·` | `slotsAvailable ? ... : "·"` (частично оправдано) | различать «нет ACE» и «ноль» |
| High | Все страницы | `components/layout/PageHeader.tsx:53-56` | верхняя строка `flex justify-between` без `flex-wrap`, блок заголовка `shrink-0` | длинный title + context + actions + date | добавить `flex-wrap`, снять `shrink-0`, `min-w-0` |
| High | Monthly Report / Budget | `components/boss/monthly-report-panel.tsx`, `pages/finances/FinancesBudget*Page.tsx` (7-20 sticky) | вложенные sticky-колонки + фикс. `w-[112px]` | липкие ячейки внутри скролл-контейнера | одна sticky-ось, `minmax()` вместо px |
| High | 17 страниц | `Admin, Expenses, Cashless, Staff, TableResults, BossDashboard, BankChecks, Logs, budget/BudgetPage, cage/CageViewPage, flat/*, admin/*` | нет `PageShell` | своя вёрстка отступов | привести к `PageShell`+`PageHeader` |
| Medium | Player Statistics | `pages/PlayerStatistics.tsx` | 14 sticky, `w-[110px]`, `min-w-[28px]`, `visits \|\| "·"` (0 визитов → `·`) | плотная сетка | `SmartTable` + null-проверки |
| Medium | Pit / Staff / Breaklist | `pages/Pit.tsx`, `pages/Staff.tsx`, `components/pit/BreaklistGrid.tsx` | 19/9/9 sticky, `w-[180px]`, `type="number"` | широкие сетки | ограничить sticky, убрать native input |
| Medium | Reports/Graphics | `pages/Reports.tsx:510` | `value ? fmt(value) : "·"` в общей ячейке отчёта | falsy | null-проверка |
| Medium | Везде | `toFixed(1)` ×33, `toFixed(2)` ×12 | дробные там, где ожидаются целые TZS | нет общего правила | зафиксировать: проценты — 1 знак, деньги — 0 |
| Medium | Layout | 15 мест `grid-cols-4/5/6/12` без `md:`/`lg:` | схлопывание/переполнение на 1024 и 768 | нет брейкпоинтов | responsive-префиксы |
| Low | Payroll/POS/Logs | `·` для дат и строк | это не числа | оставить как есть |

## 1. Number formatting

- Канон правильный: `formatNumberSpaces` (`lib/currency.ts:72`) и `formatMoneyFull` (`lib/format-money.ts:9`) — оба дают пробел.
- **Прямые нарушения (запятые в UI):** `SyncMirrorPanel.tsx` (5 мест), `ChipColorSettings.tsx:107`.
- **Локале-зависимые:** `fr-FR` в `admin/AmBudgetPage`, `AmPerformancePage`, `FmTopupsPage`, `KycReviewsPage`, `ShopOrdersPage`, `PlayerGrantsHistoryDrawer` — реально дают U+202F/U+00A0, а не обычный пробел; `DataInventoryPanel` это лечит вручную, остальные — нет.
- **Дубли форматтеров:** 66 локальных `const fmt`, 9 файлов с `Intl.NumberFormat`.
- **Отрицательные:** `formatNumberSpaces` и `formatMoneyFull` дают `-1 000`; но локально встречаются `+`/`−` (U+2212) вручную (`CashCheckViewerDialog`) — разнобой символов минуса.

## 2. Zero display

Правило «ноль = `0`» противоречит текущей записи в памяти проекта («subtle dot `·` placeholders» в плотных сетках) — это нужно решить явно, иначе следующий агент откатит фикс.

Точные offender-паттерны:
- `x ? fmt(x) : "·"` — `ChipCountPanel`, `CashCheckViewerDialog`, `WalletDayGridTab`, `TableTracker:338,360`, `Groups:182,186`, `Reports:510`, `PosManagerPricing:174`, `PlayerStatistics:1276,1361,822`, `casino-double-block:106-108`.
- `x || "·"` — `HeadCountPanel:158`, `CloseShiftDialog:756`, `PosShiftReconciliation:193,213`.
- `MoneyCell` → `empty ?? "·"` (глобально).
- В инпутах: `formatSpacedValue(..., keepZero=false)` очищает поле при 0; `keepZero` используется только в `DayClosingsTab`.
- Корректные места (сохранить): `n !== 0 ? ... : "·"` и проверки `!= null` — здесь ноль уже отличим.

## 3. Numeric inputs

- Канон: `NumberInput` (`components/ui/number-input.tsx`) — пробелы при вводе, стрелочная навигация, `decimals`, `allowNegative`, `keepZero`. Используется в 72 файлах.
- **Нарушители native `type="number"`** (37 вхождений): `StaffMaster` (4), `Payroll` (2), `payroll/PayrollSettingsPage` (2), `admin/TableManagement` (2), `admin/TimeSettingsPanel` (2), `pos/manager/PosModifierConfigDialog` (2), `PosManagerRecipes/Modifiers/Locations`, `admin/PromoCodesPage`, `admin/PromoGrantsPage`, `reports/PromoExpiryReport`, `pit/BreaklistGrid`, `boss/monthly-report-panel`, `admin/FinCategoriesSettings`, `admin/ExpenseCategoriesSettings`, `admin/VerificationBonusSettings`, `pos/CategoryEditDialog`.
- **Свой парсинг поверх `Input`** (20 мест): `MonthlyTips`, `WeeklyBonus`, `PlayerStatistics`, `TableTracker`, `marketing/*`, `club/ClubRegister`, `finances/FinancesDayClosingPage`, `HeadCountPanel`, `CompBudgetCard`, `PlayerPreviewHeader`, `EditReprintShiftPage`.
- **Разнобой оформления:** `CashDenomInput` задаёт свои `h-7/h-9/h-10`, `InlineNumberCell` — `text-[11px] py-0`, shadcn `Input` — `h-10`; часть полей `bg-background`, часть прозрачные внутри ячеек.
- Рекомендация: три канонических варианта — `form` (h-10, filled), `cell` (h-7, dense, transparent + focus ring), `readonly` (без рамки, mono, right).

## 4. Responsive / overlap (code-level risk)

- **1440/1366 и ниже:** `PageHeader` без переноса (`shrink-0` на заголовке) — при длинном title + context + кнопках + датой правые элементы будут выдавливаться.
- **Вложенные sticky:** `FinancesBudgetPage` (20), `Pit` (19), `StaffMaster` (18), `PlayerStatistics` (14), `TableResults` (13) — sticky-заголовок + sticky-колонка внутри `overflow-x-auto` даёт z-index/наложение при горизонтальном скролле.
- **Фиксированные ширины:** `FinancesMonthlyReportPage` (5×`w-[110px]`+`w-[220px]`), `monthly-report-panel` (`w-[112px]`, `min-w-[128px]`), `WeeklyBonus` (`w-[156px]`×4), `Guests` (`min-w-[280px]`×2) — на 1280 суммарная ширина превышает контейнер.
- **Нереспонсивные сетки:** 15 мест `grid-cols-4/5/6/12` без брейкпоинтов — риск на 1024 и 768.
- **Намеренный горизонтальный скролл (ок):** 49 контейнеров `overflow-x-auto` — Player Statistics, Attendance, Budget, Monthly Report. Это не баг, но требует sticky-дисциплины.
- **Absolute:** `club/ClubShop` (6), `ClubBackdrop` (5), `cage-slots/ActiveSlotsShiftView` (4) — проверить на 768.

## 5. Design system

- `PageShell`/`PageHeader`/`FormGrid`/`ResponsiveDialog`/`SmartTable` существуют, но `SmartTable` применён лишь в 6 местах против 117 файлов с ручным `<table>` — прямое нарушение правила проекта для новых страниц (легаси-страницы им не покрыты).
- 17 страниц без `PageShell` → разные вертикальные отступы и ширины контента.
- Разные высоты ячеек: `py-1`, `py-1.5`, `py-2`, `px-2/px-3/px-4` в ручных таблицах.

## Quick wins (низкий риск регрессии)

1. Заменить `toLocaleString`/`Intl.NumberFormat` для денег на `formatNumberSpaces` — 12 файлов, чисто отображение.
2. Убрать 66 локальных `const fmt` в пользу общего импорта.
3. `MoneyCell`: `0 → "0"`, `·` только при `null/undefined`.
4. `PageHeader`: `flex-wrap` + `min-w-0` вместо `shrink-0`.
5. Заменить `value ? fmt : "·"` на `value == null ? "·" : fmt` — точечно, ~25 мест.

## Needs visual QA (нужен preview с данными и логином)

Dashboard, Dashboard TV (Company Report, desktop-режим), Cage Live, Cage Slots, Table Check (ChipCountPanel), Player Statistics, Reception, Expenses, Cashless, Transfers/Inter-Casino, Office → Day Closings / Bank / Cashless, Budget + Budget vs Actual, Daily Balance, Graphics, Staff Master, Rota/Pit, Attendance Monthly, Payroll, Admin → Users & Roles, Marketing/CRM, POS manager/waiter/bar — на 1920 / 1440 / 1280 / 1024 / 768.

## Предлагаемый порядок исправлений (3 волны) — НЕ реализовано

- **Волна 1 (глобальные, низкий риск):** единый форматтер, ноль = `0` в `MoneyCell` + топ-10 экранов, `PageHeader` wrap. Обязательно: обновить правило в памяти проекта про `·`.
- **Волна 2 (инпуты):** три канонических варианта `NumberInput`, миграция 37 native `type="number"` и 20 самописных парсеров; начать с Finance/Cage/Table Check.
- **Волна 3 (layout/DS):** sticky-рефакторинг широких отчётов, `minmax()` вместо фикс. px, responsive-сетки, перевод оставшихся страниц на `PageShell`, поэтапная миграция таблиц на `SmartTable`.

Изменений в коде, БД и настройках не производилось.
