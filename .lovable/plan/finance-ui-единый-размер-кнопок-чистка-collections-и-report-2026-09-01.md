# Finance UI: единый размер кнопок, чистка Collections и Report

Цель: выровнять все кнопки шапки Office/Finance по высоте статуса и месяца, убрать лишние фильтры в Collections и дублирующий заголовок/статус в Monthly Report.

## 1. Единый размер кнопок в шапке

Файл: `src/components/office/office-shell.tsx`

- Статус месяца и dropdown месяца уже `h-8`. Все кнопки, рендеримые через `OfficeHeaderActions` (Add Collection, Add Income, Add JP, Closing Inbox, Add Wallet, Adjust Float и др.), а также Close/Open Month приводятся к той же высоте `h-8` и одинаковому `text-xs`.
- Реализация централизованно: контейнер header actions в office-shell получает класс-нормализатор (`[&_button]:h-8 [&_button]:text-xs`), чтобы кнопки всех вкладок не «плясали» независимо от их собственного `size`.
- Проверить вкладки: Collections, Other Incomes, JP, Wallets, Day Closings, Report — одинаковая высота всех элементов справа.

## 2. Collections: убрать фильтры и Flat

Файл: `src/pages/office/CollectionsTab.tsx`

- Удалить ряд чипов фильтра All / Collected / Returned (`FILTERS`, состояние `filter`).
- Удалить кнопку Flat / By category (`grouped`, `setGrouped`) и весь режим группировки `byCategory` — таблица всегда плоская.
- Wallet-фильтр (Select) остаётся — он фильтрует по кошелькам, не по категориям.
- Плитки Collected (OUT) / Returned (IN) / Net Collected не трогаем.

## 3. Monthly Report: убрать «Month Summary» и дубль статуса

Файл: `src/pages/finances/FinancesMonthlyReportPage.tsx`

- Убрать заголовок секции `Month Summary` и чип статуса Open/Closed в `titleRight` (статус уже есть в общей шапке) — KPI-плитки остаются без обёртки-заголовка.
- Карточку «Month Summary · Income» внутри трёх summary-карт НЕ удалять — это блок цифр, не дубль статуса.

## Проверка

- `bunx tsgo --noEmit` и `npm run build`.
- Версию не поднимаем (только по запросу). Deploy не выполняется. Расчёты, RPC, данные и permissions не меняются.
