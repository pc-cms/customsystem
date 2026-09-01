# Finance UI: календарь, размещение кнопок, единый Close Month

## 1. Месяц — простой выпадающий список
`PeriodPicker` перестаёт быть поповером с сеткой месяцев и Custom range. Вместо него — обычный dropdown (Select) со списком месяцев («August 2026», «July 2026» …) за последние 24 месяца плюс ближайшие месяцы вперёд. Custom range убирается; период всегда календарный месяц (расчёты уже работают по from/to месяца, формулы не меняются).

## 2. Единое место Close Month
- Кнопки Open Month / Close Month остаются только на вкладке **Report**. На остальных вкладках Finance их в шапке нет.
- Правая часть шапки: `[кнопки вкладки] [Close Month — только Report] [СТАТУС] [Месяц]`. Дропдаун месяца — крайний правый элемент.
- Логика открытия/закрытия месяца, права и аудит — без изменений, только место кнопки.

## 3. Статус месяца
Бейдж OPEN / CLOSED / NOT OPENED получает ту же высоту (h-8) и вертикальные отступы, что и кнопка месяца, чтобы визуально стоять в одну линию.

## 4. Кнопки вкладок в шапке (слева от статуса)
- **Report**: XLSX и Close Month слева от статуса.
- **Transactions**: «Add Transaction» слева от статуса.
- **Jackpots**: одна универсальная кнопка «Add JP» слева от статуса; выбор IN (Contribution) / OUT (Payout) переносится внутрь диалога переключателем. Данные и расчёты JP не меняются.

Для этого в общей шапке появляется второй слот-портал: действия рендерятся в строке шапки перед статусом, а не отдельной второй строкой.

## 5. Кнопки под плитками
- **Collections**: «Return (IN)» и «Add Collection (OUT)» переезжают из шапки под плитки Collected / Returned / Net.
- **Wallets**: «Closing Inbox», «Add Wallet», «Adjust Float», «Count All» переезжают из шапки под KPI-плитки.

## 6. Collections — фильтр категорий
Так как категория только одна, выпадающий фильтр «All categories» убирается. Фильтры по кошельку и направлению (All / Collected / Returned) остаются.

## 7. Wallets — строка Count business day
Строка делится на две колонки по половине экрана:
- левая: «Count business day» + поле даты + подпись «Saved into … · window …» + Reset;
- правая: кнопки действий Wallets (из пункта 5), выровненные вправо.

Поле даты получает корректную ширину/паддинг, чтобы иконка календаря не налезала на границу ячейки.

## Техническая часть
- `src/components/office/PeriodPicker.tsx` — замена popover на shadcn `Select`; `OfficePeriod` сохраняет форму `{mode:"month", year, month, from, to}`.
- `src/components/office/office-shell.tsx` — новый портал `OfficeHeaderActions` (внутри правой части строки), проп для показа Open/Close Month только на Report, порядок элементов, размер бейджа статуса.
- `src/pages/office/OfficePage.tsx` — передаёт в shell признак «вкладка Report» для месячного контроля.
- `src/pages/finances/FinancesMonthlyReportPage.tsx`, `src/pages/office/OtherIncomesTab.tsx`, `src/pages/office/JpTab.tsx` — перевод действий в `OfficeHeaderActions`; в JpTab объединение двух кнопок в одну с выбором направления в диалоге.
- `src/pages/office/CollectionsTab.tsx` — кнопки под плитки, удаление фильтра категорий.
- `src/pages/finances/FinancesWalletsPage.tsx` — кнопки под KPI, двухколоночная строка Count business day, ширина date input.

Расчёты, RPC, схема, права и данные не затрагиваются. После правок — typecheck и production build, версия поднимается до 1.3.722.
