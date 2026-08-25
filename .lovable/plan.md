# Read-only forensic audit: Mbeya wallet variance

## Scope
Perform a read-only investigation of the reported Mbeya Office Wallets / Balance variance discrepancy. No code, database data, migrations, functions, Edge Functions, RLS, settings, or project files will be changed during the audit.

## Questions to answer
1. Confirm the exact Mbeya casino id.
2. Identify the likely manager account/profile for Sveta and her role/casino assignment without exposing secrets.
3. Trace the Office Wallets/Balance rendering path for manager vs super_admin:
   - route/page/component
   - hooks
   - RPCs/queries
   - React Query keys
   - casino-context and active casino selection
   - any persisted scope/cache behavior
4. Determine whether manager and super_admin call the same backend calculation with the same casino id, dates, timezone, and scope.
5. Produce the current Mbeya reconciliation breakdown for current business day and previous closed business day:
   - expected wallet balance
   - actual physical balance
   - variance
   - opening/base balance
   - included wallet transactions/inflows/outflows
   - card/cashless contribution
   - open-day/open-shift contribution
   - closed-day contribution
   - FX/rounding contribution
6. Inspect the authoritative variance formula in `fin_balance_snapshot`, `computeBalanceTotals`, and any current replacement paths.
7. Audit every writer to Day Closings slot fields and classify each as:
   - A: ACE Collector / ingest / apply closed report
   - B: explicit manual Office/Day Closings input
   - C: cashier/slot shift close or other automatic source
   - D: migration/backfill/cron/trigger
8. Confirm exactly how open business day/open shifts participate in wallet reconciliation, while distinguishing this from Day Closings persistence.

## Read-only investigation steps

### 1. Code path trace
Read the Office/Wallets/Balance pages, router/sidebar entries, finance hooks, casino context, auth/profile logic, query persister, and invalidation helpers. Map the full UI-to-RPC flow and React Query keys.

### 2. Backend schema/function trace
Read production database definitions for:
- `fin_balance_snapshot`
- `fin_day_closing`
- `ace_apply_closed_report`
- ACE finance ingest/apply functions
- wallet transaction tables and cash count snapshot tables
- policies/grants only as needed to explain manager vs super_admin differences

### 3. User/casino scope checks
Run read-only queries to identify:
- Mbeya casino row/id/location code/subdomain
- Sveta profile and role assignments
- her accessible casino/group memberships if present
- any role or policy differences that can change rows returned

### 4. Numeric reconciliation
Run read-only SQL for Mbeya using the same date window/business-day logic as the UI/RPC. Compare:
- direct RPC output
- underlying wallet/cash-count/transaction/day-closing rows
- current business day vs previous closed day
- cashless/card balance rows
- FX rates and rounding effects

### 5. Manager vs super_admin discrepancy analysis
Compare expected parameters and data visibility for both roles. Check for:
- role-dependent client filtering
- casino-context fallback/selection differences
- missing casino id/date/scope in query keys
- persisted IndexedDB/localStorage cache risks
- realtime invalidation gaps
- RLS-visible data differences

### 6. Day Closings source audit
Search code, migrations, SQL functions, triggers, Edge Functions, and deploy scripts for writes to slot-related Day Closings columns. Classify each writer and flag any category C path that writes cashier/slots-close values into Day Closings.

## Deliverable
Return a concise, evidence-heavy report in Russian with:
- confirmed root causes
- actual Mbeya reconciliation numbers
- why super_admin and Sveta differ
- exact variance formula in plain English and math/SQL terms
- all Day Closings writers and whether they comply with ACE/manual-only rule
- suspicious code/query/cache items ranked Critical/High/Medium
- recommended fix plan only, with no implementation
