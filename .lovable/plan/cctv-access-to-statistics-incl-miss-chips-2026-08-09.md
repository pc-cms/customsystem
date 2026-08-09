# CCTV access to Statistics (incl. Miss Chips)

Give the `surveillance` (CCTV) role read-only access to the Statistics section with full history, so Miss Chips and the other tabs are visible.

## What changes

1. Sidebar: add `surveillance` to the roles allowed to see the Statistics entry (`/reports`).
2. Role defaults in the database: add rows for the `surveillance` role
   - `reports`: view = yes, write = no, day depth = All time
   - `miss_chips`: view = yes, write = no, day depth = All time
3. Date-depth guard: include `surveillance` in the historical-access list used by the reports filter so the date range is not clamped to today.

No write actions are granted — CCTV can only read reports.

## Technical details

- `src/components/layout/AppSidebar.tsx` line 85: add `"surveillance"` to the roles array of the `/reports` item.
- Migration: insert into `role_module_defaults` (`role`, `module_key`, `can_view`, `can_write`, `day_horizon`) for `surveillance` / `reports` and `surveillance` / `miss_chips`, with upsert on conflict so re-running is safe. Route access is enforced by `RoleGuard` via `src/lib/route-module-map.ts` (`/reports` → `reports`, `/miss-chips` → `miss_chips`), so these rows are what unlock both the tabbed page and the standalone Miss Chips route.
- Verify `src/hooks/use-business-day-filter.ts` and `src/lib/role-access.ts` already treat `surveillance` as "all history" (they do), so no clamping fix is expected; adjust only if a check is missing.
- Bump app version.
