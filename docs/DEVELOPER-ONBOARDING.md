# CMS — Product & Technical Onboarding Guide

> **Audience:** product specialists and full-stack developers taking over the Casino Management System (CMS).
> **Version:** 1.3.609
> **Date:** 13/08/2026
> **Read this first:** `docs/ACCESS-MATRIX.md` and `mem://index.md` contain the latest role-by-module details and project memory.

---

## 1. What is CMS?

CMS is an **operational platform for managing land-based casinos in real time**. It covers the full daily cycle: cashier shifts, live gaming tables, player tracking, pit & dealer management, finance, HR/payroll, bar POS, a player club app, warehouse/storage, and surveillance visibility.

### Core philosophy
- **Manual entry only.** No AI or automated business decisions. The system records what humans enter and verifies it.
- **Immutable data.** Deletion is forbidden almost everywhere. Corrections are made by posting new transactions.
- **Audit-first.** Every material action leaves an auditable trail, ideally via database triggers, not UI code.
- **Casino-level isolation.** Every tenant is a separate casino; data is isolated by `casino_id` and enforced by RLS.

### Where the product is used
- Multi-location casino groups (Tanzania, with plans to expand).
- Cloud primary instance + optional on-prem nodes per location.
- Subdomain-per-casino routing (`arusha.casinosystem.app`, `mwanza.casinosystem.app`, etc.).

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, Vite 5, TypeScript 5, Tailwind CSS 3, shadcn/ui, Radix UI primitives |
| **State / Data** | TanStack React Query 5, React Query Persist Client, IndexedDB offline cache |
| **Routing** | React Router 6 |
| **Forms & Validation** | React Hook Form + Zod |
| **Charts / Motion** | Recharts, GSAP / `motion` |
| **PDF / Excel** | jsPDF + jspdf-autotable, ExcelJS |
| **Backend** | Lovable Cloud / Supabase: PostgreSQL, Auth, Edge Functions, Realtime, Storage |
| **PWA** | Vite PWA plugin, Workbox, per-casino manifests, offline queue |
| **Testing** | Vitest, Playwright, React Testing Library |
| **Deployment** | Lovable preview + published URLs, on-prem Docker Compose |

### Key versions
- React 18.3.1
- Vite 5.4.19
- TypeScript 5.8.3
- Tailwind 3.4.17
- Supabase JS 2.100.1
- TanStack Query 5.83.0

---

## 3. Architecture & Topology

```text
                        Cloud Supabase (authoritative)
                                  ^
                                  | sync (outbox / inbox, idempotent)
                 ┌────────────────┼────────────────┐
                 │                │                │
             Arusha            Dodoma           Mbeya       ← optional on-prem nodes
            (LAN: cashiers, pit, reception, finance)
                 +
            Cloudflare Tunnel for remote support
```

### Multi-tenancy
- Every user belongs to one primary casino via `profiles.casino_id`.
- All data queries are scoped by `useCasino().activeCasinoId`.
- **Subdomain always wins:** `mwanza.casinosystem.app` resolves to the Mwanza casino. RLS enforces access; the app never shows data from another casino by accident.
- Cross-casino views are only available on the `premier` subdomain for `super_admin`, `finance_manager`, `boss`, and `general_manager`.

### Subdomain routing

| Hostname | Effect |
|----------|--------|
| `arusha.casinosystem.app` | Active casino = Arusha |
| `mwanza.casinosystem.app` | Active casino = Mwanza |
| `dodoma.casinosystem.app` | Active casino = Dodoma |
| `mbeya.casinosystem.app` | Active casino = Mbeya |
| `premier.casinosystem.app` | Summary / cross-casino mode (network roles only) |
| `casinosystem.app` | B2B landing page (no login) |
| `arusha.local` / IP | On-prem install; pinned via `runtime-config.json` |

### On-prem aliases
- `mwz` → `mwanza`, `aru` → `arusha`, `dod` → `dodoma`, `mbi` → `mbeya`.

### Business logic location
- **Authoritative business logic lives in PostgreSQL** (triggers + RPC functions), not in the UI.
- The frontend sends raw inputs and reads computed results.
- Examples: wallet balance updates, chip conservation enforcement, table result calculations, budget locks, audit logging.

### Offline-first model
- Binary online/offline state for cashier terminals.
- Write-and-sync: transactions are queued locally and sent when online.
- Exponential backoff: 1s → 2s → 4s → ... → 16s for retries.
- React Query `networkMode: "offlineFirst"` keeps the UI usable without connectivity.

### Timezone
- **Strictly Africa/Dar_es_Salaam (EAT, UTC+3).**
- Business day rollover at **07:00 EAT**.
- Forgotten business days are auto-closed at **09:00 EAT** the next morning.

---

## 4. Roles & Permissions

Roles are stored in a **separate `public.user_roles` table**, never on `profiles`. This is a security-critical rule.

### App roles

| Role | Code | Scope | Typical access |
|------|------|-------|--------------|
| Super Admin | `super_admin` | Network | Full access, all casinos, admin panel |
| Boss | `boss` | Network (read) | Dashboard TV, all-casino summary reports |
| General Manager | `general_manager` | Network (limited) | Summary reports, no HR/Blank Forms, no bank/cashless/transfers |
| Finance Manager | `finance_manager` | Network | All casinos finance, transfers, payroll, budgets |
| Manager | `manager` | One casino | Full operational + financial access inside their casino |
| Shift Manager | `shift_manager` | One casino | Operational parity with manager, but financial surfaces remain gated |
| Pit | `pit` | One casino | Live floor, tables, current-shift data only |
| Cashier | `cashier` | One casino | Cage live game write access |
| Cashier Slots | `cashier_slots` | One casino | Cage slots write access |
| Reception | `reception` | One casino | Player registration, check-in, blacklist |
| HR | `hr` | One casino | Staff master, attendance, payroll, warnings; no finance |
| Surveillance | `surveillance` | One casino | Read-only observation, CCTV, statistics, some tags |
| Account Manager | `account_manager` | One casino | Premier club / promo player management |
| POS Manager | `pos_manager` | One casino | Bar POS manager functions |
| POS Bartender | `pos_bartender` | One casino | Bar POS bartender |
| POS Waiter | `pos_waiter` | One casino | Bar POS waiter |

### Financial visibility scope

| Scope | Roles | What they see |
|-------|-------|---------------|
| `all` | `manager`, `finance_manager`, `surveillance`, `super_admin`, `boss`, `general_manager` | Lifetime player financials, all-time data, cross-casino summaries |
| `shift` | `pit`, `shift_manager` | Only the current business day / shift unless Manager Override is active |
| `none` | `cashier`, `reception`, `hr` | No lifetime player KPIs; see only what their own UI requires |

### Capability model
High-level capabilities in `src/lib/role-access.ts`:
- `manage.ops` — operational management (shift manager, manager, GM, super admin).
- `manage.core` — core management (manager, GM, super admin).
- `manage.finance` — financial management (finance manager, GM, super admin).
- `view.all_casinos` — cross-casino visibility (super admin, finance manager, boss, GM, surveillance).
- `manage.roles` — user/role management (super admin only).

### Permission Matrix
- Module visibility is controlled by `role_module_defaults` (baseline per role) plus per-user overrides.
- Resolved via `effective_module_perms` RPC and enforced in `src/lib/route-module-map.ts`.
- **Important:** the matrix is a UI gate; RLS is the actual security boundary.

### Manager Override
- Session-level toggle requiring a manager password or RFID.
- Lifts operational restrictions for `pit`, `cashier`, `reception`, `shift_manager`.
- Logs every activation with the manager's ID.
- Does **not** change financial visibility scope (`boss` is a read-only role).

---

## 5. Module Catalog (Sidebar Sections)

Sidebar sections are the current UX grouping. Each entry maps to a `ModuleKey` in `src/lib/modules.ts`.

### OVERVIEW
- **Dashboard** — daily KPIs, active players, open tables, shift status.
- **Dashboard TV** — large-screen read-only dashboard for `boss` / `super_admin`.

### PIT (Live floor operations)
- **Player Tracking** — active players, statistics, table assignment.
- **Table Check** — hourly table results tracker with full keyboard navigation.
- **Break List** — dealer break schedule 18:00 → 05:00.
- **Tables Tracking** — open/close tables, current chip stack.
- **Pit Book** — operational notes and events.
- **CCTV Reports** — incidents and surveillance observations.

### ANALYTICS
- **Statistics** — reports and dashboards.
- **Graphics** — charts and visual analytics.
- **Groups** — player groups for analytics.

### STAFF
- **Rota** — schedules for Live, Floor, Security, Office, Management.
- **Attendance** — daily attendance for the same groups.
- **Employee List** — floor staff listing.

### MANAGEMENT
- **Cage View** — read-only cage history for managers/surveillance.
- **Expenses** — cage and office expenses.
- **Tips & Bonuses** — weekly bonus, monthly tips, live game tips.

### FINANCE
- **Office** — daily review, wallets, cash count, budget, JP, other incomes, monthly close.
- **Casino Monthly Balance** — consolidated per-casino monthly report with frozen-day snapshots.
- **Office Monthly Balance** — consolidated office-level monthly report.
- **Expenses · Casino** — casino expense matrix.
- **Expenses · Office** — office expense matrix.

### CASHIER
- **Cage Live Game** — transactional cashier surface (write only for `cashier`).
- **Cage Slots** — slots cashier surface (write only for `cashier_slots`).
- **Bank** — bank checks and transfers.
- **Cashless** — mobile money / e-wallet transactions.
- **Transfers** — inter-casino / internal transfers (limited roles).
- **Blank Forms** — printable operational forms.

### RECEPTION
- **Blacklist** — player blacklist and financial blocks.
- **Guests** — in-casino guests list.
- **Reception** — player check-in / registration.

### HR
- **Warnings** — staff warning records.
- **Staff Master** — canonical HR employee registry (replaces legacy Employees).
- **Attendance (Month)** — monthly attendance summary.
- **Payroll** — payroll periods, settings, bank export.

### CRM
- **Player CRM** — player relationship management and segmentation.

### MARKETING
- **Promo Campaigns** — marketing campaigns.

### BAR (POS)
- **Bar Manager** — POS manager surface.
- **Bar Reports** — POS reports.
- **Bar · Player Analytics** — player spending analytics.
- **Bar · Stock Counts** — inventory counts.

### PROMO (Premier Club / AM)
- **Promo Codes** — promo code management.
- **Promo Grants** — wallet grants and bonuses.
- **Lotteries** — lottery management.
- **Shop Catalog / Orders** — club shop.
- **KYC Reviews** — player verification.
- **My AM Budget / AM Performance** — account manager tools.
- **FM Top-ups** — finance manager top-ups.
- **Reports** — issuance, redemptions, expiry, codes, cashback, lottery sales, AM budget.

### SYSTEM
- **Import Reports** — import external reports (e.g., competitor OCR).
- **Logs** — activity audit logs.
- **Admin** — users, permissions, sync, network, license.

---

## 6. Key Business Rules

### Money & formatting
- **Thousand separator:** space (`1 250 000`), never comma.
- **Date format:** `DD/MM/YYYY` everywhere.
- **Currencies:** TZS, USD, EUR, GBP, KES — sorted largest to smallest left-to-right.
- **TZS denominations:** 10,000, 5,000, 2,000, 1,000.

### Drop
- **Per-table Drop:** raw sum of IN transactions (`type in ('in','buy')`, `cancelled_at IS NULL`) for the current open table/shift.
- **Total Drop:** sum of peak values from `player_day_drop_cache`.
- These two sums are independent and may differ by design.
- Hourly Drop is recorded from Player Tracking.

### Variance / Casino Balance
- Formula: `Variance = (Actual − Starting Float) − Expected`.
- Negative chip variance means **more money than expected** (inverted sign convention).
- Positive/negative financial totals use `cms-amount-positive` / `cms-amount-negative`.

### Wallet balance
- The balance of a wallet is **strictly the latest physical cash count snapshot** (`cash_count_snapshots`).
- It does **not** accumulate ledger transactions.
- Multiple recounts are allowed; only the latest recorded snapshot counts.
- A physical count can be saved as `0` for an empty wallet.
- The **Record** button fixes the count and writes it into the Casino Monthly Balance snapshot table.

### Chip Conservation Law
- `Initial = Inventory + Floor`.
- Violation blocks shift close.
- **Miss** is tracked separately as a cage delta; it is not part of the conservation equation.

### Expenses timing
- **Cage / cashier expenses:** posted after the business day is closed.
- **Office expenses & missed cards:** posted immediately.
- **Tips:** never affect cage desk balance or shift balance; kept outside drawer cash count.

### Jackpot (JP)
- JP can be positive or negative.
- JP amount is included in the Expected balance calculation.
- A separate JP page exists for JP payout expenses.

### Business day
- Rollover at **07:00 EAT**.
- Manual close from Cage; **Close Day** button visible to all managers and above, always requires manager password.
- Forgotten days auto-close at **09:00 EAT**.
- Data entered "the next day" belongs to the previous business day until 07:00 EAT.

### Table results
- Live table result = latest chip count snapshot vs baseline, **not** a tracker accumulation.
- Table result is kept in sync with the shift closing via database trigger.

### Players
- Terminology: **Player** (no Guest / Client).
- Ranks from lowest: `Normal` (N), then Gold, Platinum, Diamond.
- New players = 1–3 total visits.
- Cards and accounts are never deleted.
- Player merges are allowed for managers; merged players keep their IDs for audit.

### Audit & logging
- Action logs are written by **database triggers**, not from UI code.
- `logAction()` in new UI code is forbidden.
- Use `tg_activity_log` and related audit tables.

---

## 7. Data Model Overview

### Operational
- `casinos` — casino settings, cage_float, branding, timezone pins.
- `profiles` — user → casino mapping, display name, disabled_at.
- `user_roles` — role assignments (separate from profiles).
- `user_casino_access` — per-user cross-casino access overrides.
- `shifts` — cashier shifts with opening/closing figures and results.
- `transactions` — buy-in, cash-out, fill, credit, tips, etc.
- `transaction_cancellations` — void / cancellation records.
- `expenses` — cage and operational expenses.
- `gaming_tables` — table registry, float, baseline, status.
- `chip_inventory`, `chip_baseline`, `chip_snapshots`, `chip_transfers` — chip tracking.
- `cash_counts` — cashier cash counts.
- `cage_slots_shifts`, `cage_slots_transfers`, `cage_slots_cash_counts` — slots cage.
- `cashless_transactions` — mobile money / bank transactions.
- `bank_checks` — bank check records.
- `table_tracker`, `table_head_count`, `table_daily_results`, `table_day_drop_cache` — table data.
- `player_day_drop_cache` — total drop cache.

### Financial
- `fin_wallets` — 10 ledger wallets per casino.
- `fin_wallet_tx` — immutable wallet ledger.
- `fin_day_closing` — daily closing figures (live, slots, cash desk, JP, etc.).
- `fin_day_balance_snapshot` — frozen daily balance snapshots for CMB.
- `fin_month_closures` — monthly close records.
- `fin_month_start` — starting balance per month.
- `fin_categories` / `fin_main_categories` — unified expense/income categories.
- `fin_other_incomes` — other income entries (positive/negative).
- `fin_excel_imports` — imported financial data.
- `cash_count_snapshots` — physical wallet count snapshots.

### Players & Visits
- `players`, `player_cards`, `player_tags`, `player_groups`, `group_members`.
- `casino_visits`, `client_sessions` — visits and gaming sessions.
- `player_merges` — merge audit.
- `player_notes`, `player_crm`, `player_position_history`, `player_daily_*` — player intelligence.
- `kyc_reviews` — KYC verification queue.

### Staff & HR
- `employees` — legacy staff registry (migrating to Staff Master).
- `dealers`, `pit_rota`, `breaklist`, `breaklist_logs` — pit/dealers.
- `staff_rota`, `staff_attendance`, `management_rota`, `management_attendance` — rota/attendance.
- `staff_warnings`, `employee_role_history`, `employee_playlist_notes` — HR records.
- `payroll_periods`, `payroll_entries`, `payroll_settings` — payroll.
- `attendance_hours`, `attendance_holidays` — attendance calculation.

### Club / Promo / POS
- `club_accounts`, `club_otp_codes`, `club_daily_spend_limits` — club player accounts.
- `promo_codes`, `promo_grants`, `promo_redemptions`, `promo_campaign_*` — promo engine.
- `lotteries`, `lottery_tickets` — lottery.
- `shop_items`, `shop_orders`, `shop_stock_movements` — club shop.
- `am_budgets`, `am_budget_ledger` — account manager budgets.
- `pos_*` — bar POS tables (orders, tabs, inventory, recipes, stock counts, purchases).

### Audit & Sync
- `activity_logs` — audit trail.
- `activity_logs_archive` — archived audit logs.
- `incidents`, `incidents_audit`, `cctv_observations` — incidents and surveillance.
- `sync_outbox`, `sync_inbox_log`, `sync_peer_health`, `sync_snapshot_state`, `sync_table_registry` — sync engine.
- `cloud_clone_*`, `onprem_channels` — cloud / on-prem pairing.

---

## 8. Development Conventions

### Design system (mandatory)
- Use **semantic tokens** from `src/index.css` (HSL variables). Never hardcode `text-white`, `bg-black`, `bg-[#...]`.
- Primary brand color: **gold** (`--primary: 38 55% 72%`).
- Fonts: Inter (body), IBM Plex Mono (data/grids), Faberge/Cinzel (brand serif).
- Density modes: `comfort`, `compact`, `touch` — controlled by `[data-density]` on `<html>`.
- Required wrappers: `PageShell`, `PageHeader`, `PageSection`, `FormGrid`, `ResponsiveDialog`, `DataTable` / `SmartTable`.
- Mobile: bottom **Drawers**, not modals.

### Tables
- **New pages must use `SmartTable`** (`src/components/ui/smart-table.tsx`). It auto-virtualizes >200 rows and supports permission-gated columns.
- Hand-written `<table>` or `DataTable + map` is forbidden.
- Permission-gated columns via `column.hidden(ctx)`.

### Numbers & dates
- Use `formatMoney` / `formatNumber` for all financial display.
- Use `fmtDate`, `fmtDateTime`, `fmtDateOnly` for dates.
- `NumberInput` component enforces space-separated thousands and numeric parsing.
- High-density grids use monospaced fonts and `·` placeholders.

### Performance
- All search inputs debounced 200–250 ms.
- Use `startTransition` for tab switching.
- High-churn data excluded from IndexedDB persistence.
- Module-based prefetch (`use-prefetch.ts`) and modular realtime subscriptions.

### Code style
- **UI strings in English only.** No Russian or other languages in user-facing text.
- Internal comments may be in Russian/English as needed.
- Avoid `console.log` in production paths; use `console.error` for diagnostics.
- Bigint in database for financial totals; use `string` or safe arithmetic helpers on the client.

### Security rules
- Never store roles in `profiles` or check admin status via localStorage/sessionStorage.
- Always use `has_role()` SECURITY DEFINER function in RLS policies.
- Never modify `auth`, `storage`, `realtime`, `supabase_functions`, or `vault` schemas.
- Never touch auto-generated files: `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`, `supabase/config.toml` project-level settings.

---

## 9. Deployment & Operations

### Lovable Cloud (default)
- Frontend auto-deployed by Lovable.
- Backend: migrations from `supabase/migrations/`, Edge Functions from `supabase/functions/`.
- Database changes must go through the **migration tool** (approval workflow).
- Every `CREATE TABLE` in `public` must be followed by `GRANT` statements in the same migration.
- RLS policies are required for every user-facing table.

### On-prem deployment
- Self-contained Docker Compose stack in `deploy/docker-compose.yml`.
- Install via `https://casinosystem.app/install` or `sudo casino-update`.
- Pairing with Cloud via 8-character code approved by `super_admin` in Admin → Network.
- Services: PostgreSQL, PostgREST, Nginx, `cms-sync`, `cms-updater`, `gotrue`, `realtime`, `storage`, `cms-frontend`.
- Remote access via Cloudflare Tunnel.

### Versioning
- App version is in `package.json` (currently 1.3.609).
- Auto-bump patch version on any backend change (migration, edge function, RPC/RLS/trigger).
- Pure UI cosmetic tweaks may skip the bump.
- Service Worker is refreshed at login to ensure users get the latest frontend.

### Backup & restore
- See `deploy/ARCHIVE-RESTORE.md` and `deploy/backup/backup.sh`.
- Offsite backups to Cloud Storage via `upload-backup` edge function when configured.

---

## 10. Classic Foot-Guns (Do NOT Do)

- Do **not** store roles on `profiles`.
- Do **not** edit `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`, or `supabase/config.toml` project settings.
- Do **not** modify `auth`, `storage`, `realtime`, `supabase_functions`, or `vault` schemas.
- Do **not** use `ALTER DATABASE` in migrations.
- Do **not** write action logs from UI code (`logAction()` is forbidden).
- Do **not** sum `gaming_tables.closing_result` for P&L; use `shifts.tables_result`.
- Do **not** write `cash_result` into `daily_summaries.tables_result`.
- Do **not** use `getBusinessDate()` as the primary source; use `useEffectiveBusinessDate()` / RPC `get_current_business_date`.
- Do **not** show Pit Bosses in the Breaklist grid.
- Do **not** allow anonymous sign-ups or auto-confirm email.
- Do **not** put Russian or other languages in user-facing strings.
- Do **not** hardcode admin checks on the client.
- Do **not** create tables without `GRANT` statements and RLS policies.
- Do **not** use tables without permission-gated column hiding in SmartTable.
- Do **not** accumulate wallet balances from transactions; use the latest snapshot.

---

## 11. Entry Points for New Developers

This is the recommended reading order for the first two days. Read top to bottom — every
later file assumes the concepts introduced by the earlier ones.

### 11.1 `src/App.tsx` — the spine of the application

Everything starts here. The file wires together five concerns:

- **Provider stack.** `QueryClientProvider` → `ThemeProvider` → `AuthProvider` →
  `CasinoProvider` → `TooltipProvider` → `BrowserRouter`. The order matters: casino
  resolution depends on the authenticated profile, and every data hook depends on both.
- **QueryClient configuration.** Offline-first defaults: `networkMode: "offlineFirst"`,
  long `staleTime` for reference data, retry with exponential backoff, and a persister
  (`src/lib/query-persister.ts`) that dehydrates the cache into IndexedDB. High-churn
  query keys are denylisted from persistence so a stale drop/tracker value never
  survives a reload.
- **Route table.** Every page is `React.lazy()`-loaded so the initial bundle stays small.
  Route chunks are warmed by `usePrefetchCriticalData` based on the user's allowed
  modules — a cashier never downloads the finance chunks.
- **`RoleGuard`.** A wrapper that resolves the current route to a module via
  `route-module-map.ts`, checks the effective permission set, and redirects to the
  user's landing route when access is denied. Guards are declarative; never re-implement
  access checks inside a page.
- **Global singletons.** Realtime subscriptions (`useRealtimeSubscriptions`), business-day
  watcher, sync engine and the PWA update notifier are mounted exactly once here. Never
  mount them again in `AppLayout` or a page — duplicates cause double invalidations.

### 11.2 `src/lib/auth-context.tsx` — identity

Answers "who is logged in, and what may they do". Responsibilities:

- Holds `session`, `user`, `profile`, `roles[]`, `casinoId`, `loading`.
- Subscribes to `supabase.auth.onAuthStateChange` **before** calling `getSession()` — the
  reverse order causes missed events and stuck loading states.
- **Manager Override**: a password-gated, time-boxed elevation. The password check runs
  server-side in the `verify-manager` Edge Function; the client only stores a flag plus
  expiry. Override is never persisted across a full sign-out.
- **Cache isolation**: on sign-in/sign-out and on casino change, the React Query cache and
  the IndexedDB persister namespace are cleared/rekeyed so a Mbeya cashier can never see
  cached Arusha data on a shared device.
- **Token hygiene**: refresh is owned by a single elected tab (`auth-leader.ts`, Web Locks)
  and all `/auth/v1/token` calls are coalesced by `auth-throttle.ts`. Both are installed in
  `main.tsx` before React mounts. This exists because casinos run 5–10 devices behind one
  public IP and were tripping Supabase's per-IP rate limit.

### 11.3 `src/lib/casino-context.tsx` — tenancy

Answers "which casino am I looking at".

- Resolves the active casino from, in priority order: on-prem `runtime-config.json`,
  the hostname/subdomain (`mwanza.`, `arusha.`, `mbeya.`, `club.`, `premier.`), then the
  user's `profiles.casino_id`.
- **Summary mode**: on the `premier` host, network roles (`boss`, `general_manager`,
  `finance_manager`, `super_admin`) get a cross-casino aggregate view. Pages must handle
  `isSummaryMode` explicitly — `casinoId` is `null` there.
- **Casino switching** for multi-casino users flushes scoped queries and rewrites the
  persisted cache namespace.
- Use `useDataScope()` (`src/hooks/use-data-scope.ts`) in pages instead of reading auth and
  casino separately — it distinguishes "still booting" from "genuinely empty" and prevents
  the "No data found" flash on cold start.

### 11.4 `src/lib/role-access.ts` — coarse-grained access

Three primitives, all pure functions over `roles: string[]`:

- `getFinancialScope(roles)` → `"all" | "shift" | "none"`. Controls whether a user sees
  lifetime financials, only the current business day, or nothing at all.
- `getPrimaryRole(roles)` / `getPrimaryRoleLabel(roles)` — the UI must **never** render a
  list of roles; it renders exactly one, chosen by a fixed priority order.
- `ROLE_CAPABILITIES` + `hasCapability(roles, cap)` — capabilities are `manage.ops`,
  `manage.core`, `manage.finance`, `view.all_casinos`, `manage.roles`. This map mirrors the
  `public.role_capabilities` table. Roles are independent entities, never aliases of each
  other: two roles may share capabilities today and diverge tomorrow by editing this map
  and the table, without touching a single call site.

### 11.5 `src/lib/modules.ts` + `src/lib/route-module-map.ts` — fine-grained access

- `modules.ts` is the **catalog**: every functional area of the app as a stable module key,
  grouped by sidebar section, with a human label and default depth. It is the vocabulary
  shared by the sidebar, the guards, the permission matrix UI and the DB defaults in
  `role_module_defaults`.
- `route-module-map.ts` maps URL paths to module keys. `RoleGuard`, prefetching and the
  sidebar all consult it, so adding a page means: add the module key, add the route map
  entry, add the sidebar item — in that order.
- Effective permissions = `role_module_defaults` for the user's roles, overlaid with
  per-user overrides on `user_casino_access`. Overrides can both grant and revoke.

### 11.6 `src/hooks/use-*.ts` — the data layer (~120 files)

One file per domain (`use-players`, `use-transactions`, `use-tables`, `use-expenses`,
`use-dealers`, `use-shift`, `use-fin-*`, `use-pos-*`, …). Conventions:

- Query keys are arrays starting with the domain and always including `casinoId` and, where
  relevant, the business date. Never fetch without the casino in the key.
- Mutations use the offline-capable wrapper (`src/lib/offline-mutation.ts`) so a write made
  with no connectivity lands in the outbox and replays automatically.
- Invalidation is centralised per domain (`invalidateFinance`, `invalidateEmployees`, …)
  and debounced, so a realtime burst does not trigger dozens of refetches.
- `src/hooks/use-casino-data.ts` is a barrel re-export kept for backwards compatibility —
  add new hooks to the domain file, not to the barrel.

### 11.7 `src/components/layout/` — the shell

- `AppLayout.tsx` — sidebar + scroll container, full-width route list, `Suspense` skeletons,
  offline/licence banners, mobile header. Explicitly does **not** mount realtime.
- `AppSidebar.tsx` — the navigation source of truth: sections, items, permission gating,
  collapsed state (persisted in `localStorage`), and the mobile drawer.
- `PageShell.tsx` / `PageHeader.tsx` — standard page frame: title, subtitle, actions slot,
  consistent spacing and print behaviour.
- `FilterBar.tsx`, `TablePanel.tsx`, `WizardShell.tsx`, `InlineEditor.tsx` — reusable
  building blocks for list pages, multi-step flows and inline edits.

### 11.8 `src/components/ui/smart-table.tsx` — the canonical table

Config-driven grid used by every new list page. Key API:

- `ColumnDef<T>` — `key`, `header`, `render`, `align`, `width`, `sortable`, `footer`, and
  `hidden(ctx: TableCtx)` for permission-gated columns.
- `SmartTableProps<T>` — data, columns, sorting (`SortState`), row key, row click, sticky
  header, density, empty state, loading skeleton, export hooks.
- Auto-virtualises above ~200 rows; below that it renders plainly so printing works.
- Hand-rolled `<table>` markup or `DataTable + map` is forbidden in new code.

### 11.9 `docs/ACCESS-MATRIX.md`

The full role × menu × depth matrix, kept in sync with `role_module_defaults`. Read it
before changing any permission; update it in the same commit as the change.

### 11.10 `docs/ONBOARDING.md`

The older developer onboarding. Still useful for historical context and some setup steps,
but where it disagrees with this document, **this document wins**.

### 11.11 `mem://index.md` — project memory

Non-obvious business rules that are not derivable from the code: drop source of truth,
chip conservation, tips neutrality, cashless manual balances, formatting rules, and a list
of explicitly rejected ideas. Treat entries as hard requirements.

### 11.12 `deploy/README.md` — on-prem

Installation, pairing a local box to the cloud, Docker Compose stack, Nginx, sync nodes,
licence and fleet agents, backup/restore. Companion docs: `deploy/HA-SETUP.md`,
`deploy/MIGRATION-v2.md`, `deploy/ARCHIVE-RESTORE.md`, `deploy/REMOTE-ACCESS.md`.

### 11.13 `supabase/functions/` — Edge Functions (~45)

Grouped by purpose:

- **User management**: `create-user`, `admin-list-users`, `admin-update-user`,
  `disable-user`, `reset-user-password`.
- **Authorisation**: `verify-manager` (Manager Override and Close Day password checks).
- **OCR / import**: `ocr-document`, `bank-check-ocr`, `import-report-ocr`,
  `fin-excel-import`, `fin-balance-import`.
- **Club / player app**: `club-login-password`, `club-send-otp`, `club-verify-otp`,
  `club-register-player`, `club-submit-kyc`, `club-cancel-kyc`, `club-wallet`,
  `club-shop-order`, `club-buy-ticket`, `club-redeem-code`, `club-update-profile`,
  `cashier-redeem-by-qr`.
- **Promo**: `promo-generate-codes`, `promo-expire`.
- **Cloud ↔ on-prem**: `cloud-clone-*`, `cloud-schema-export`, `cloud-seed-export`,
  `cloud-snapshot-build`, `cloud-parity-counts`, `mirror-parity`, `peer-mesh`,
  `register-onprem-channel`, `installer-*`, `upload-backup`.
- **Fleet / licence**: `fleet-heartbeat`, `fleet-incident-forward`, `verify-license`,
  `report-health`, `endpoint-smoke-test`.
- **Branding**: `casino-branding`, `casino-manifest` (per-subdomain PWA manifest & theme).

Edge Functions are deployed automatically; they are the only place where the service role
key is used, and it must never be logged or returned.

### 11.14 `supabase/migrations/` — schema history (600+ files)

The migrations are the authoritative history of both schema **and** business logic: wallet
triggers, table-result recalculation, overdraft guards, budget locks, business-day closure
RPCs and audit triggers all live here. When a number in the UI looks wrong, grep the
migrations for the trigger or RPC that produces it before touching the frontend.

---

## 12. Deep Dive: How a Casino Day Actually Flows

A narrative walkthrough that ties the modules together. This is the mental model a new
developer needs before touching finance code.

**07:00 EAT — the business day rolls over.** Every timestamp is bucketed into a business
date by the DB helper `get_current_business_date()`. Anything recorded at 03:00 belongs to
the *previous* calendar date. The frontend must use `useEffectiveBusinessDate()`; the raw
`getBusinessDate()` helper is a fallback only.

**Shift opens.** A cashier opens a cage shift with a starting float — a physical count of
cash and chips. This float is the anchor for every later variance calculation. Chips leave
the cage to the tables as Fills; they come back as Credits. Both are logged as transactions
and both print on the shift closing report.

**Players arrive.** Reception checks in a player (or registers a new one), which creates a
`casino_visits` row. Every buy-in at a table is an IN transaction: this is **Drop**.
Per-table Drop is the raw sum of `in`/`buy` transactions with `cancelled_at IS NULL`. Total
Drop for the casino is *not* the sum of those rows — it is the sum of per-player peaks from
`player_day_drop_cache`, because a player recycling chips between tables would otherwise be
counted many times. The two numbers legitimately differ; that is by design and documented
in `src/lib/drop-source.ts`.

**Pit runs the floor.** Rota assigns dealers to tables per hour, Breaklist rotates them,
Attendance records who actually showed up, Table Tracker snapshots head counts and average
bets per hour, Pit Book records narrative notes and Incidents capture anything abnormal
(with CCTV references). None of this is inferred — every value is typed in by a human, on
purpose.

**Tables close.** Each table is counted at close. The result is `current − baseline`,
adjusted by fills, credits and any manual chip adjustment. Table results roll up into
`shifts.tables_result` — never sum `gaming_tables.closing_result` yourself for P&L.

**Cage closes.** The cashier counts the drawer. Cash Desk Result (CDR) is the drawer delta.
Tips are deliberately excluded from CDR and from the shift balance — they are tracked in
their own ledger and paid out separately. Miss Chips (unaccounted chips) surface here as a
cage delta, kept separate from the Chip Conservation identity
`Initial = Inventory + Floor`.

**Day closes.** A manager presses Close Day (roles: `manager`, `shift_manager`,
`general_manager`, `super_admin`, gated by `verify-manager`). This writes `fin_day_closing`
with live-game and slots figures, slot drop, cash desk, difference and JP. If nobody
closes manually, an automatic closure fires at 09:00 EAT — the manual closure always takes
precedence. Cash expenses that were entered during the day post to the wallets **only** at
this moment; office and card expenses post immediately.

**Wallets and variance.** A wallet's balance is *strictly* the latest physical count
snapshot (`cash_count_snapshots`) — never an accumulation of transactions. Counts entered
before the rollover belong to the previous business date, and the Wallets page exposes an
explicit "Counting for [date]" selector plus a **Record** button that freezes the day's
figures into `fin_day_balance_snapshot`. Variance is then
`(Actual − Starting Float) − Expected`, with chip signs inverted: a negative chip figure
means there is *more* money, not less. The Casino Monthly Balance (CMB) report reads the
frozen snapshots, so a later recount cannot silently rewrite history.

**Reports.** CMB (per casino) and OMB (office) roll up into the Company view. Monthly
closure (`fin_close_month`) locks the period. Everything printable goes through the blank
generators in `src/lib/blanks/`, which produce clean, ink-friendly PDFs with the same
numbers the screen shows.

**Audit.** No record is ever deleted or silently edited. Corrections are new transactions,
cancellations are `cancelled_at` marks, and every mutation is written to `activity_logs` by
the `tg_activity_log` database trigger — never by UI code.

**Offline.** If the network drops, writes queue in the outbox and the UI keeps working
against the persisted cache. Reconnection replays the queue with exponential backoff
(1s → 16s). On on-prem installs the local Postgres node syncs with the cloud through
`sync_outbox`; the cloud is authoritative unless a node has been explicitly promoted, and
replicas are forced into read-only mode both in the UI (`use-readonly-mode.ts`) and by the
`_enforce_replication_mode` trigger.

---

## 13. Glossary


| Term | Meaning |
|------|---------|
| **Pit** | Live game floor (dealers, tables, rota, breaklist) |
| **Cage** | Cashier desk (chips, cash, transfers, shift open/close) |
| **Baseline** | Reference chip count at table open; result = current − baseline |
| **Drop** | Total IN money per table or per player/day |
| **NEP** | Net Equivalent Play — true player exposure after recycled chips |
| **Drop R / Drop V** | External vs Recycled drop (NEP split) |
| **Miss** | Unaccounted chips after shift close |
| **Float** | Fixed pool of cage chips, managed by manager |
| **Business day** | 07:00 EAT → 06:59:59 EAT next day; closes manually or auto at 09:00 |
| **Manager Override** | Password-gated session lift for high-stakes actions |
| **Summary mode** | `premier` subdomain cross-casino view for network roles |
| **CMB** | Casino Monthly Balance report |
| **OMB** | Office Monthly Balance report |
| **JP** | Jackpot (can be positive or negative) |
| **CDR** | Cash Desk Result (cashier shift delta) |
| **Variance** | Difference between expected and actual cash/chip position |
| **SmartTable** | Virtualized, permission-aware canonical table component |

---

*End of document. Keep this guide updated when roles, modules, or business rules change.*
