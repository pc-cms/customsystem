Полный аудит. Хук `useSessionState` уже есть; он сохраняет per-user + per-path в sessionStorage (живёт до закрытия вкладки). Сейчас на него переведены: Reports, Reception, Groups, Expenses, Blacklist, BankChecks, Guests, Logs, MonthlyTips, PlayerProfile, PlayerStatistics, StaffMaster, TableResults, TableTracker, Transfers, CrmPlayers, MarketingCampaigns, Cashless.

## Что переведу (frontend-only, без backend)

Цель: для каждой страницы — таб + фильтры + поиск + сортировка + date preset/range перевести с `useState` на `useSessionState`. Не трогаю: формы ввода, модалки, выбранные строки, операционные drafts.

### Player Tracking / Manager-facing
1. `src/pages/Pit.tsx` — таб, фильтры, период.
2. `src/pages/Incidents.tsx` — search, type/severity/status/staff фильтры, date preset, сортировка.
3. `src/pages/Dashboard.tsx` — только селекторы периода/таб, если есть.
4. `src/pages/Staff.tsx`, `src/pages/EmployeePlaylist.tsx` — поиск/сортировки/таб.
5. `src/pages/MissChips.tsx` — month picker, сортировки.

### Tips
6. `src/pages/tips/ClubPokerTipsTab.tsx`, `src/pages/tips/FloorTipsTab.tsx` — preset+from+to.
7. `src/pages/TipsAndBonuses.tsx` — таб, period.

### Cage / Tables
8. `src/pages/cage/CageClosingsPage.tsx` — date preset/диапазон, фильтры, сортировка.
9. `src/pages/Tables.tsx` (если есть фильтры/сортировки) — таб/поиск.

### Reports (все которые ещё на useState)
10. `src/pages/reports/AmBudgetReport.tsx`
11. `src/pages/reports/CashbackReport.tsx`
12. `src/pages/reports/FloorTipsReport.tsx`
13. `src/pages/reports/PokerTipsReport.tsx`
14. `src/pages/reports/LotterySalesReport.tsx`
15. `src/pages/reports/PromoCodesReport.tsx`
16. `src/pages/reports/PromoIssuanceReport.tsx`
17. `src/pages/reports/PromoRedemptionsReport.tsx`
— везде preset/from/to + любые фильтры/сортировки.

### Admin
18. `src/pages/admin/KycReviewsPage.tsx`
19. `src/pages/admin/PromoGrantsPage.tsx`
20. `src/pages/admin/ShopOrdersPage.tsx`
21. `src/pages/admin/SyncLogPage.tsx`

### Finances
22. `src/pages/finances/FinancesAliasesPage.tsx`
23. `src/pages/finances/FinancesAuditLogPage.tsx`
24. `src/pages/finances/FinancesExpensesPage.tsx`
25. `src/pages/finances/FinancesWalletsPage.tsx`

### POS
26. `src/pages/pos/PosCharges.tsx`
27. `src/pages/pos/PosManagerInventory.tsx`
28. `src/pages/pos/PosManagerMenu.tsx`
29. `src/pages/pos/PosShiftReconciliation.tsx`

### Marketing
30. `src/pages/marketing/MarketingCampaignDetail.tsx`

## Правила конвертации (единообразно)

- Ключи: префикс по странице, например `pt:tab`, `incidents:search`, `cage-cls:preset`. Это даёт человекочитаемый namespace внутри уже существующего per-user/per-path неймспейса хука.
- `Set<...>` фильтры храним как массив (`useSessionState<T[]>`) + локальная `useMemo`-обёртка в `Set` + `setX` через `setArr(prev => Array.from(updater(new Set(prev))))` — как сделано в PlayerStatistics.
- Sort: пара (`sortKey`, `sortDir`) — два независимых ключа, либо один объект `{key, dir}`.
- Date preset: триплет (`preset`, `from`, `to`) — три ключа, как в Reports.
- Не трогаем: значения форм, drafts модалок, выбранного игрока/строку, временные UI-стейты (open/close popover), inline-edit поля.
- Версия `package.json` не бампается (чисто frontend UI state).

## Verification

Сценарий после внедрения:
- Открыть страницу, поставить сортировку/фильтр/preset → уйти в любой другой модуль → вернуться → состояние сохранено.
- Logout → login другим юзером → видит свой пустой/дефолтный набор (изоляция по userId уже встроена в хук).
- Закрытие вкладки → всё чистится (sessionStorage).

Если ок — приступаю и пройдусь по всем 30 файлам.