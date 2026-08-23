# Add Inter-Casino tab to Office

## Goal
Make the existing **New Transfer** dialog for inter-casino transfers reachable from the UI by adding the `FinancesInterCasinoPage` as a new tab inside `/office`.

## Current state
- The dialog lives in `src/pages/finances/FinancesInterCasinoPage.tsx`.
- The page is fully functional (uses `useInterCasinoTransfers`, `useSendInterCasino`, etc.) but has **no route** and **no sidebar/tab link**.
- `/office` renders tabs via `OfficeShell` and query param `?tab=...`.
- The `/office` route is already guarded by `RoleGuard` for `super_admin`, `manager`, `finance_manager`, `shift_manager`.

## Changes

### 1. `src/pages/office/OfficePage.tsx`
- Add lazy import:
  ```tsx
  const FinancesInterCasinoPage = lazy(() => import("@/pages/finances/FinancesInterCasinoPage"));
  ```
- Add `{ value: "inter-casino", label: "Inter-Casino" }` to the `TABS` array.
- Render the page inside the existing `Suspense` block:
  ```tsx
  {tab === "inter-casino" && <FinancesInterCasinoPage />}
  ```
- Hide the period selector for this tab (it is not period-scoped):
  ```tsx
  showPeriod={tab !== "rates" && tab !== "inter-casino"}
  ```

### 2. No `App.tsx` changes needed
The `/office` route already maps any `?tab=...` value to `OfficePage`. Adding the tab value to the internal `TABS` array is sufficient.

### 3. No role/RLS changes needed
The page relies on the same `useCasino` context and existing RLS/RPC permissions (`fin_inter_casino_transfers`, `fin_inter_casino_send`, etc.). It will inherit the `/office` route guard.

## QA
- `tsgo` typecheck must pass.
- Open `/office?tab=inter-casino` and confirm:
  - Tab appears and is active.
  - "New Transfer" button opens the dialog.
  - Source wallet list is filtered to the active casino.
  - Destination casino list shows other accessible casinos.
  - Existing transfer history and incoming/outgoing actions render.

## Files changed
- `src/pages/office/OfficePage.tsx`
