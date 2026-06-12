## Revised plan — universal chip visibility + per-casino seed values

Same two fixes as before, plus a data-ops step to seed `chip_color_settings.is_visible` for 5M / 10M across all four casinos using your matrix.

### Visibility matrix (assuming the 4th line meant **Mbeya**, not Mwanza again)

| Casino  | 10M | 5M  |
|---------|-----|-----|
| Mwanza  | ON  | OFF |
| Arusha  | OFF | ON  |
| Dodoma  | OFF | OFF |
| Mbeya   | OFF | OFF |

If the 4th line was a typo and you actually want a different setting for Mbeya — or wanted to override Mwanza again — tell me before I run it.

## Fix 1 — RLS on `chip_color_settings` (migration)

`super_admin` / `admin` currently can't flip the Visible toggle (your screenshot: `new row violates row-level security policy`). Replace the manager-only INSERT/UPDATE policies:

```sql
DROP POLICY "Managers insert chip colors" ON public.chip_color_settings;
DROP POLICY "Managers update chip colors" ON public.chip_color_settings;

CREATE POLICY "Admins/managers insert chip colors"
  ON public.chip_color_settings FOR INSERT
  WITH CHECK (
    casino_id = get_user_casino_id(auth.uid())
    AND (
      has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "Admins/managers update chip colors"
  ON public.chip_color_settings FOR UPDATE
  USING (
    casino_id = get_user_casino_id(auth.uid())
    AND (
      has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );
```

Bump `package.json` (auto-bump rule for backend changes).

## Fix 2 — Seed per-casino 5M / 10M visibility (data op)

One `INSERT … ON CONFLICT (casino_id, denomination) DO UPDATE SET is_visible = EXCLUDED.is_visible` per casino × denomination according to the matrix. Existing `body_color` / `edge_color` / `text_color` rows are left untouched; only `is_visible` is written. After this:

- Mwanza Chip Count grid shows 10M column (only Baccarat has it in `denominations`), 5M column gone.
- Arusha shows 5M column, no 10M.
- Dodoma & Mbeya show neither.

## Fix 3 — Apply visibility filter to Chip Count + Close Table (frontend only)

Two surfaces still bypass the visibility map and read raw `gaming_tables.denominations`:

1. **`src/components/tables/ChipCountPanel.tsx`** — use `useVisibleChipDenoms()` to intersect `t.denominations` for both the column header set and each row's inputs.
2. **`src/components/tables/CloseTableWizard.tsx`** — same intersection on `current.denominations` (lines 93, 116, 133, 295).

No data migration, no changes to `gaming_tables.denominations`, no server-trigger changes.

## End result — single source of truth

Admin → Chip Colors → `Visible` toggle (per casino) instantly governs every UI surface: Cage IN/OUT, Open/Close shift, Active shift, Float grid, Chip Movement report, Miss Chips report, Cash Check viewer, **Chip Count grid**, **Close Table wizard**.

## Out of scope
- No edits to `gaming_tables.denominations`.
- No new dedicated 10M/5M switch — the existing per-denomination Visible switch is the universal control.
