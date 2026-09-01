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
В шапке появляется второй слот-портал `OfficeHeaderActions` — действия вкладки рендерятся в строке шапки перед статусом:
- **Report**: XLSX и Close Month слева от статуса.
- **Transactions**: «Add Transaction» слева от статуса.
- **Jackpots**: одна универсальная кнопка «Add JP»; выбор IN (Contribution) / OUT (Payout) переносится внутрь диалога переключателем. Данные и расчёты JP не меняются.
- **Collections**: одна универсальная кнопка «Add Collection»; выбор Return (IN) / Collected (OUT) — переключателем в диалоге. Расчёты не меняются.
- **Wallets**: «Closing Inbox», «Add Wallet», «Adjust Float» слева от статуса.

## 5. Wallets
- Кнопка **Count All удаляется** полностью (и действие `countAllStale` вместе с ней). Существующие детали Stale Counts и ручной счёт по кошелькам остаются.
- Строка «Count business day» становится одной строкой на всю ширину: «Count business day» + поле даты + подпись «Saved into … · window …» + Reset. Поле даты получает корректную ширину/паддинг, чтобы иконка календаря не налезала на границу ячейки.

## 6. Collections — фильтр категорий
Категория только одна — выпадающий фильтр «All categories» убирается. Фильтры по кошельку и направлению (All / Collected / Returned) остаются.

## Техническая часть
- `src/components/office/PeriodPicker.tsx` — замена popover на shadcn `Select`; `OfficePeriod` сохраняет форму `{mode:"month", year, month, from, to}`.
- `src/components/office/office-shell.tsx` — новый портал `OfficeHeaderActions` (внутри правой части строки), показ Open/Close Month только на Report, порядок элементов, размер бейджа статуса; старый портал `OfficeActions` сохраняется для вкладок, которым он нужен.
- `src/pages/office/OfficePage.tsx` — передаёт в shell признак «вкладка Report» для месячного контроля.
- `src/pages/finances/FinancesMonthlyReportPage.tsx`, `src/pages/office/OtherIncomesTab.tsx`, `src/pages/office/JpTab.tsx`, `src/pages/office/CollectionsTab.tsx` — перевод действий в `OfficeHeaderActions`; в JpTab и Collections объединение двух кнопок в одну с выбором направления в диалоге.
- `src/pages/finances/FinancesWalletsPage.tsx` — кнопки в шапку, удаление Count All, однострочный блок Count business day, ширина date input.

Расчёты, RPC, схема, права и данные не затрагиваются. После правок — typecheck и production build, версия поднимается до 1.3.722.
