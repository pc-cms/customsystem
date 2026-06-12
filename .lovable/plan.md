## Goal

1. Give each casino a per-denomination **visibility flag**, so 10M (and 5M, since it's also not used everywhere) only appear in the casino that actually has them.
2. Seed Mwanza: enable 10M, add it to Baccarat's `denominations` array, and emit **30 × 10M chips** into the float so Chip Conservation balances from day one.

## Design

### Schema change

Extend the existing per-casino table `chip_color_settings` with one column:

```sql
ALTER TABLE public.chip_color_settings
  ADD COLUMN is_visible boolean NOT NULL DEFAULT true;
```

PK is already `(casino_id, denomination)` — perfect for a visibility flag. No new table needed.

Backfill rule (data-only, in a separate insert):
- For **every casino**, upsert rows for 5_000_000 and 10_000_000 with `is_visible = false`.
- Then for **Mwanza only**, set both rows to `is_visible = true`.

Result: by default these two large denoms are hidden in all four casinos; Mwanza flips them back on.

### Frontend wiring

Single source of truth: extend `useChipColors()` to also return the visibility map, and add a helper `useVisibleChipDenoms()` that returns `CHIP_DENOMS` filtered by the per-casino visibility map. Fall back to "visible" when no row exists (safe default for any denom we add later without a backfill).

Replace direct `CHIP_DENOMS` usage in **operational / cage / report surfaces**:
- `FloatManagement.tsx` (Cashier/Safe columns + row iteration)
- `ChipColorSettings.tsx` (rows iteration; also add a "Visible" toggle per row, manager-only)
- `OpenShiftScreen.tsx`, `CloseShiftDialog.tsx`, `EditOpeningChipsDialog.tsx`
- `ActiveShiftView.tsx`, `CashCheckViewerDialog.tsx`, `ChipMovementReport.tsx`, `ReprintShiftDialog.tsx`, `ShiftClosingReport.tsx`, `OpeningDeltaConfirmDialog.tsx`
- `ChipEmissionDialog.tsx`
- `ChipDenomInput.tsx` (default `denoms` prop)
- `pages/MissChips.tsx` (column list)
- `pages/finances/FinancesDayClosingPage.tsx`, `FinancesOfficeSafePage.tsx`
- `components/business-days/ReportPanels.tsx`
- `hooks/use-chips.ts`, `use-shift.ts`, `use-cash-checks-by-date.ts`, `use-cage-slots.ts` — anywhere they iterate CHIP_DENOMS for current-casino aggregation.

Per-table surfaces (`ChipCountPanel`, `CloseTableWizard`, per-table columns in Float) already filter by `gaming_tables.denominations`, so they need no extra change — controlled per table.

### Data ops for Mwanza launch

Three steps after the migration lands:

1. Backfill visibility (insert):
   ```sql
   INSERT INTO chip_color_settings (casino_id, denomination, bg_color, edge_color, text_color, is_visible)
   SELECT c.id, d.denom, '#000000', '#FFFFFF', '#FFFFFF', (c.slug = 'mwanza')
     FROM casinos c
     CROSS JOIN (VALUES (5000000::bigint), (10000000::bigint)) AS d(denom)
   ON CONFLICT (casino_id, denomination)
   DO UPDATE SET is_visible = EXCLUDED.is_visible;
   ```
   (Existing color rows keep their colors; only `is_visible` is updated.)

2. Add 10M to Baccarat denominations (Mwanza):
   ```sql
   UPDATE gaming_tables
      SET denominations = denominations || ARRAY[10000000]::bigint[]
    WHERE casino_id = (SELECT id FROM casinos WHERE slug='mwanza')
      AND name = 'Baccarat'
      AND NOT (10000000 = ANY(denominations));
   ```

3. Emit 30 × 10M chips for Mwanza float (audited via `chip_emissions`):
   ```sql
   INSERT INTO chip_emissions (casino_id, denomination, quantity, reason, created_by)
   SELECT id, 10000000, 30, 'Initial introduction of 10M chips at launch', NULL
     FROM casinos WHERE slug='mwanza';
   ```
   (Column names confirmed before running; will check `\d chip_emissions` first.)

### What the user sees after this

- **Mwanza** Cage / Float / Reports / Chip Colors: full chip ladder including 5M and 10M; Baccarat is the only table where 10M is enterable.
- **Arusha / Dodoma / Mbeya**: no 5M or 10M rows anywhere — cage UI, float, reports, miss chips, business-day snapshots — exactly as before the chip was added.
- A manager in any casino can toggle "Visible" on any denom in Admin → Chip Colors if they later introduce/retire one.

## Impact recap (vs. previous global plan)

| Surface | Other casinos | Mwanza |
|---|---|---|
| Cage open/close shift | 10M & 5M hidden | both visible |
| Chip Movement report | hidden | visible |
| Miss Chips report column | hidden | visible |
| Admin → Chip Colors editor | row still listed but with a `Visible: off` switch (manager-only) | both on |
| Float baseline grid | Cashier/Safe rows hidden for 5M & 10M | visible; Baccarat column accepts 10M |
| Per-table screens | controlled by `gaming_tables.denominations` (no change) | Baccarat only for 10M |

## Risks / open points

- **Migration touches one table only** (`chip_color_settings`); `is_visible default true` keeps every existing casino's behaviour identical until step 1 backfill runs.
- **Chip Conservation**: step 3 emission must precede the first chip count in Mwanza, otherwise the system will flag 30 × 10M as missing.
- **Print reports**: hiding 5M/10M slightly reduces row count for non-Mwanza casinos — A4 layout still safe.
- **Sync (Mwanza on-prem node)**: `chip_color_settings`, `gaming_tables`, `chip_emissions` are already in `sync_outbox` registry — flows through `cms-sync` to the local server without extra work.
- **Auto version bump** because of the migration + data ops.

## Out of scope
- No new UI page; visibility editor is one extra column in the existing Chip Colors table.
- Other casinos' table denominations untouched.
