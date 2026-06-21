# POS Phase 3C — Preflight Plan (Revised after corrections 1–8)

**Status: planning only. Do NOT implement yet.**

Recommended delivery: **split into 3C-1 / 3C-2 / 3C-3** to keep each migration small and reversible.

---

## 0. Current state (verified)

- `pos_modifiers(id, casino_id, name, price_tzs_delta, is_active, sort_order)` — flat, casino-scoped, no link to items or ingredients.
- `pos_order_item_modifiers(order_item_id, modifier_id, modifier_name_snapshot, price_tzs_delta_snapshot)` — already snapshots name + price.
- `pos_recipes(casino_id, sellable_item_id, is_active)` + `pos_recipe_items(recipe_id, ingredient_item_id, quantity, unit, waste_percent)`.
- `pos_menu_items.{stock_qty, avg_cost_tzs, low_threshold}`.
- `pos_inventory_movements.{source_item_id, metadata}` (from 3B) — reversal is idempotent via `metadata->>'reverses'`.
- `pos_orders_stock_lifecycle()` does deduct on `pending → preparing/ready/served` and mirror-reversal on `void`. Modifiers ignored for stock today.

---

## A. Recipe-affecting modifiers (Phase 3C-1)

### A1. Schema

**New: `pos_modifier_recipe_effects`**

```
id                  uuid pk
casino_id           uuid not null
modifier_id         uuid not null fk → pos_modifiers
sellable_item_id    uuid     null fk → pos_menu_items   -- Correction 1
ingredient_item_id  uuid not null fk → pos_menu_items
effect_type         text not null   -- 'add_quantity'|'multiply_quantity'
                                    --  |'override_quantity'|'remove_ingredient'
quantity            numeric         -- required for add/override
multiplier          numeric         -- required for multiply, > 0
unit                text            -- informational
waste_percent       numeric not null default 0
sort_order          int     not null default 0
created_at, updated_at
unique (modifier_id, COALESCE(sellable_item_id,'00000000-0000-0000-0000-000000000000'::uuid),
        ingredient_item_id, effect_type)
CHECK ((effect_type='multiply_quantity' AND multiplier IS NOT NULL AND multiplier > 0)
    OR (effect_type IN ('add_quantity','override_quantity') AND quantity IS NOT NULL AND quantity >= 0)
    OR (effect_type='remove_ingredient'))
```

`sellable_item_id IS NULL` → global effect for this modifier. Non-null → item-specific.

**Effect resolution rule (Correction 1, definitive):**

For a given `(modifier, sellable_item)` pair:

1. Load effects WHERE `modifier_id = M` AND `(sellable_item_id IS NULL OR sellable_item_id = S)`.
2. Group by `(ingredient_item_id, effect_type)`.
3. **If any item-specific row exists for that group, drop all global rows in the same group.** Item-specific wins.
4. Apply remaining effects to the working ingredient list in this order:
   - `remove_ingredient`
   - `override_quantity`
   - `multiply_quantity`
   - `add_quantity`
5. Within the same `effect_type` group, ties broken by `sort_order, created_at`.

This means a manager can write "Double shot: coffee ×2 globally; for Latte coffee ×1.5 instead" by inserting both rows — Latte's specific row overrides the global one only for Latte.

### A2. Allow-list — `pos_modifier_menu_items`

```
modifier_id   uuid not null fk → pos_modifiers
menu_item_id  uuid not null fk → pos_menu_items
casino_id     uuid not null
created_at    timestamptz default now()
primary key (modifier_id, menu_item_id)
```

**Correction 2 — server-side enforcement (mandatory):**

New trigger `pos_oim_allowlist_check` BEFORE INSERT on `pos_order_item_modifiers`:

```
v_count := SELECT count(*) FROM pos_modifier_menu_items WHERE modifier_id = NEW.modifier_id;
IF v_count > 0 THEN
  IF NOT EXISTS (
    SELECT 1
      FROM pos_order_items oi
      JOIN pos_modifier_menu_items a
        ON a.modifier_id = NEW.modifier_id
       AND a.menu_item_id = oi.item_id
     WHERE oi.id = NEW.order_item_id
  ) THEN
    RAISE EXCEPTION 'MODIFIER_NOT_ALLOWED_FOR_ITEM'
      USING HINT = 'This modifier is restricted to a specific menu item set.';
  END IF;
END IF;
```

Existing 3A pending-only modifier lock (`pos_order_item_modifiers_guard`) stays unchanged — modifiers still editable only while parent order is `pending` and tab is open.

### A3. Snapshot — `pos_order_item_modifiers.recipe_effects_snapshot jsonb`

**Correction 3 — snapshot only filtered & resolved effects.**

Extend `pos_order_item_modifiers_recompute()` to also compute:

```
-- Determine sellable_item_id of the parent order item
SELECT oi.item_id INTO v_sellable
  FROM pos_order_items oi WHERE oi.id = NEW.order_item_id;

-- Pull candidate effects (item-specific + global)
WITH candidates AS (
  SELECT e.*, (e.sellable_item_id IS NOT NULL) AS is_specific
    FROM pos_modifier_recipe_effects e
   WHERE e.modifier_id = NEW.modifier_id
     AND (e.sellable_item_id IS NULL OR e.sellable_item_id = v_sellable)
),
ranked AS (   -- for each (ingredient, effect_type), keep specific over global
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY ingredient_item_id, effect_type
           ORDER BY is_specific DESC, sort_order, created_at
         ) AS rn
  FROM candidates
)
SELECT jsonb_agg(jsonb_build_object(
  'effect_id',           id,
  'modifier_id',         NEW.modifier_id,
  'modifier_name',       NEW.modifier_name_snapshot,
  'sellable_item_scope', sellable_item_id,         -- null = global, else item-specific
  'ingredient_item_id',  ingredient_item_id,
  'effect_type',         effect_type,
  'quantity',            quantity,
  'multiplier',          multiplier,
  'waste_percent',       waste_percent,
  'unit',                unit
) ORDER BY sort_order, created_at)
INTO v_snap
FROM ranked WHERE rn = 1;

UPDATE pos_order_item_modifiers
   SET recipe_effects_snapshot = v_snap
 WHERE id = NEW.id;
```

If manager edits effects later → already-attached row keeps its old snapshot. If waiter removes+re-adds while order still pending → new snapshot.

### A4. Deduction algorithm (replaces only the recipe branch of `pos_orders_stock_lifecycle`)

Per order item with active recipe:

```
base := array of { ingredient_id, qty, waste }  -- from pos_recipe_items
FOR each modifier_row on this order_item (stable order by created_at):
  FOR each effect in modifier_row.recipe_effects_snapshot
      (apply in order: remove, override, multiply, add):
    case effect_type:
      remove_ingredient    → drop matching ingredient_id from base
      override_quantity    → set qty := effect.quantity
      multiply_quantity    → qty := qty * effect.multiplier
      add_quantity         → if ingredient in base: qty += effect.quantity
                             else: insert new line { ingredient_id, effect.quantity, effect.waste_percent }
FOR each surviving line:
  final := qty * (1 + waste/100) * order_item.qty
  INSERT pos_inventory_movements ( reason='pos_recipe_consumption',
    source_item_id=sellable, item_id=ingredient,
    metadata = { recipe_id, order_item_id, parent_qty, recipe_qty,
                 modifier_effects:[...effects that touched this ingredient...] }
  )
```

**Modifier on item without base recipe (audited fallback):**
If no active recipe but modifier snapshot contains `add_quantity` or `override_quantity` lines → create ad-hoc `pos_recipe_consumption` rows for those lines and emit `pos_modifier_no_base_recipe` audit. `remove_ingredient` / `multiply_quantity` against absent base are no-ops.

Double-deduct prevention: existing `stock_deducted_at IS NULL` gate is unchanged. Modifier pending-lock prevents snapshot mutation after confirm.

### A5. Reversal — UNCHANGED from 3B

Mirror-by-stored-row using `(metadata->>'reverses')::uuid` idempotency. Works automatically for modifier-affected rows because each stored row already carries its own metadata.

### A6. Audit additions

- `pos_modifier_no_base_recipe` — emitted once per order item that produced ad-hoc consumption.
- `pos_order_confirmed` payload gains `modifier_effect_lines` (count of consumption rows attributable to modifiers).
- `pos_stock_negative` already includes `source_item_id`; optionally include `applied_modifier_ids` array.

---

## B. Bottleneck availability indicator (Phase 3C-2)

### B1. View — `v_pos_item_availability`

Columns:

```
sellable_item_id, casino_id,
has_recipe                 boolean,
recipe_empty               boolean,     -- recipe exists but no recipe_items
sellable_stock_qty         numeric,
portions_available         numeric,
bottleneck_ingredient_id   uuid,
bottleneck_ingredient_name text,
bottleneck_remaining       numeric,
status                     text         -- 'ok'|'low'|'out'|'negative'|'untracked'|'config_error'
```

### B2. Edge-case rules (Correction 6, definitive)

| Condition | status | portions_available | Notes |
|---|---|---|---|
| No active recipe, `stock_qty IS NOT NULL` | legacy: `ok` / `low` (≤ `COALESCE(low_threshold,0)`) / `out` (=0) / `negative` (<0) | `stock_qty` | uses sellable directly |
| No active recipe, `stock_qty IS NULL` | `untracked` | NULL | |
| Active recipe with **zero** items, sellable `stock_qty IS NOT NULL` | treat as legacy direct (status from sellable) | `stock_qty` | recipe_empty=true |
| Active recipe with zero items, sellable `stock_qty IS NULL` | `config_error` | NULL | recipe_empty=true |
| Active recipe, any ingredient `stock_qty IS NULL` | `untracked` | NULL | safest signal |
| Active recipe, any ingredient `stock_qty < 0` | `negative` | min portions (may be 0 or negative) | |
| Active recipe, `portions_available <= 0` | `out` | 0 | |
| Active recipe, `portions_available <= COALESCE(low_threshold,0)` (sellable's threshold interpreted as portions) | `low` | computed | |
| Otherwise | `ok` | computed | |

`portions_available = floor(min over ingredients of ing.stock_qty / (recipe_qty * (1 + waste/100)))`.

Bottleneck view uses **base recipe only**, NOT modifier effects (modifier mix is per-order, not stockable in advance). Documented in UI.

Sale is **never blocked** by status (Correction 6 final rule). All non-ok statuses are warnings.

### B3. Manager detail — RPC `pos_item_availability_detail(item_id uuid)`

Returns per-ingredient breakdown:

```
ingredient_item_id, ingredient_name,
recipe_qty, waste_percent, required_per_portion,
ingredient_stock_qty, portions_from_this_ingredient,
is_bottleneck boolean
```

### B4. RBAC

- Waiter UI: only `status` + `portions_available` badge. No raw ingredient stock.
- Manager UI: full breakdown via the detail RPC.

### B5. Performance

- Indexes: `pos_recipes(casino_id, sellable_item_id) WHERE is_active`, `pos_recipe_items(recipe_id)`.
- Realtime: `usePosItemAvailability(casinoId)` debounces 300 ms on `pos_inventory_movements` INSERT.

---

## C. COGS reporting (Phase 3C-3)

### C1. Cost snapshot columns

`ALTER TABLE pos_inventory_movements ADD COLUMN unit_cost_tzs_snapshot numeric, cost_tzs_snapshot numeric` — nullable for legacy rows.

### C2. Snapshot rules (Correction 5, definitive)

| Movement | unit_cost_tzs_snapshot | cost_tzs_snapshot |
|---|---|---|
| `sale` (legacy direct) | `sellable.avg_cost_tzs` at deduct time | `ABS(delta) * unit_cost_tzs_snapshot` (positive) |
| `pos_recipe_consumption` | `ingredient.avg_cost_tzs` at deduct time | `ABS(delta) * unit_cost_tzs_snapshot` (positive) |
| `order_void_reversal` | copy from original `m.unit_cost_tzs_snapshot` | `-original.cost_tzs_snapshot` (negative) |
| `pos_recipe_reversal` | copy from original | `-original.cost_tzs_snapshot` (negative) |

Net COGS over consumption + reversal of the same original row = 0.

**NULL/0 handling:** if `avg_cost_tzs` is NULL or 0 at deduct time → store `unit_cost_tzs_snapshot = 0`, `cost_tzs_snapshot = 0` (Correction 5 recommendation: 0 for math). Emit `pos_cost_snapshot_missing` audit. Reports surface an `uncosted_movements_count` column so the gap is visible without affecting arithmetic.

Reversal copies the original's snapshot **as-is** — even if original was 0, reversal is also 0 → still nets correctly.

### C3. RPC — `pos_cogs_report` (Correction 4)

```
pos_cogs_report(
  _casino_id        uuid,
  _from_date        date,
  _to_date          date,
  _pos_location_id  uuid default null,
  _group_by         text default 'sellable_item',
                    -- 'sellable_item'|'ingredient'|'location'|'day'
  _legacy_mode      text default 'exclude'   -- 'exclude'|'estimate'|'flag_only'
) returns table (
  group_key                uuid_or_text,
  group_label              text,
  units_consumed_net       numeric,
  cogs_tzs_net             numeric,
  gross_sales_tzs          bigint,
  gross_margin_tzs         numeric,
  gross_margin_pct         numeric,
  uncosted_movements_count int,
  legacy_movements_count   int
)
```

**Method (movement netting, NOT status filtering):**

```
movements := SELECT m.*, o.business_date, o.pos_location_id
  FROM pos_inventory_movements m
  JOIN pos_orders o ON o.id = m.reference_id
 WHERE m.reference_type = 'pos_order'
   AND m.reason IN ('sale','pos_recipe_consumption',
                    'order_void_reversal','pos_recipe_reversal')
   AND o.business_date BETWEEN _from AND _to
   AND o.casino_id = _casino_id
   AND (_pos_location_id IS NULL OR o.pos_location_id = _pos_location_id)

units_consumed_net := SUM(-m.delta)                    -- consumption negative, reversal positive → net
cogs_tzs_net       := SUM(COALESCE(m.cost_tzs_snapshot,0))
                                                       -- consumption positive, reversal negative → net
```

Voided orders cancel themselves because both consumption and reversal rows live in the same date range. No `o.status <> 'void'` filter.

**Gross sales (separate query, not from movements):**

```
gross_sales_tzs := SUM(oi.line_total_tzs)
  FROM pos_order_items oi
  JOIN pos_orders o ON o.id = oi.order_id
 WHERE o.casino_id = _casino_id
   AND o.business_date BETWEEN _from AND _to
   AND o.status <> 'void'             -- sales explicitly excludes voids
   AND (_pos_location_id IS NULL OR o.pos_location_id = _pos_location_id)
   AND (group join key matches)
```

`gross_margin_tzs = gross_sales_tzs - cogs_tzs_net`.

**Legacy rows handling (`_legacy_mode`):**
- `exclude` (default): skip movements with `cost_tzs_snapshot IS NULL`. Report `legacy_movements_count`.
- `estimate`: substitute current `avg_cost_tzs` for NULL snapshots, flag as estimate.
- `flag_only`: include as 0 and report count.

No automatic backfill (Correction 7).

### C4. Z-report and payment_split — UNCHANGED

They read `pos_orders` / `pos_order_items` totals only.

---

## D. Migration plan — split (Correction 8)

### Phase 3C-1 (modifiers — backend + manager UI)

1. `CREATE TABLE pos_modifier_recipe_effects` (+ GRANT + RLS + CHECK + unique).
2. `CREATE TABLE pos_modifier_menu_items` (+ GRANT + RLS).
3. `ALTER TABLE pos_order_item_modifiers ADD COLUMN recipe_effects_snapshot jsonb`.
4. `CREATE OR REPLACE FUNCTION pos_order_item_modifiers_recompute` — also write snapshot.
5. `CREATE FUNCTION + TRIGGER pos_oim_allowlist_check` BEFORE INSERT on `pos_order_item_modifiers`.
6. `CREATE OR REPLACE FUNCTION pos_orders_stock_lifecycle` — recipe branch applies snapshot; cost snapshot columns NOT yet required (write NULL).
7. Manager UI: modifier editor — recipe effects (global + per item) + allow-list.
8. Waiter UI: existing modifier sheet unchanged.
9. Version bump (patch). Tests per §F.

### Phase 3C-2 (availability)

1. Indexes: `pos_recipes(casino_id, sellable_item_id) WHERE is_active`.
2. `CREATE VIEW v_pos_item_availability` + GRANT.
3. `CREATE FUNCTION pos_item_availability_detail(item_id uuid)` SECURITY DEFINER + role check (manager only for full detail).
4. Hooks: `usePosItemAvailability`, `usePosItemAvailabilityDetail`.
5. Waiter menu badge; Manager menu bottleneck panel.
6. Version bump. Tests per §F.

### Phase 3C-3 (COGS)

1. `ALTER TABLE pos_inventory_movements ADD COLUMN unit_cost_tzs_snapshot numeric, cost_tzs_snapshot numeric`.
2. `CREATE OR REPLACE FUNCTION pos_orders_stock_lifecycle` — populate cost snapshots on consumption + copy/negate on reversal.
3. `CREATE FUNCTION pos_cogs_report(...)`.
4. Optional opt-in SQL script `cogs_legacy_backfill.sql` documented in `docs/` — manager runs manually, never automatic (Correction 7).
5. Page `/pos/manager/cogs` with date range, group-by, location filter, legacy-mode selector.
6. Version bump. Tests per §F.

---

## E. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Item-specific override rule misunderstood by manager | UI shows "overrides global" badge when both exist; release notes document precedence. |
| `multiply_quantity` with 0 or negative | DB CHECK rejects. UI validator mirrors. |
| Allow-list trigger blocks legitimate sale due to typo | Manager sees explicit `MODIFIER_NOT_ALLOWED_FOR_ITEM` error; allow-list rows easy to add. |
| Snapshot rule edge: modifier removed + re-added captures NEW snapshot mid-pending | Documented; matches existing modifier-edit semantics. |
| Bottleneck view perf on 1000+ items | View narrows by `is_active` recipes; client passes casino_id; debounce realtime. |
| `untracked` masks low signal | Document. Manager can mark ingredient tracked by initializing `stock_qty`. |
| Avg cost 0 for ingredients never purchased | Snapshot 0 (not NULL), audit, surfaces via `uncosted_movements_count`. |
| Reversal copies 0-cost from original | Acceptable — net is still 0. |
| Legacy pre-3C-3 movements have NULL cost | Report's `_legacy_mode` makes behavior explicit. |
| COGS double-counting if status filter added back | Removed (Correction 4). Movement-netting is the rule. |
| Phase 3C-1 ships before 3C-3 → snapshot cols NULL on new rows | Acceptable; 3C-3 begins populating going forward. |

---

## F. Test plan (per sub-phase)

**3C-1**
1. Allow-list empty → modifier attachable to any item.
2. Allow-list non-empty → API insert on non-allowed item raises `MODIFIER_NOT_ALLOWED_FOR_ITEM`.
3. Snapshot contains only effects matching global ∪ item-specific scope; item-specific overrides global per `(ingredient, effect_type)`.
4. `multiply_quantity=2` on espresso → coffee consumed = base × 2.
5. `add_quantity` extra-milk → milk consumed = base + delta (or new line if absent).
6. `remove_ingredient` → ingredient not consumed.
7. `override_quantity` → ingredient consumed = override.
8. Two modifiers stack deterministically (remove → override → multiply → add; sort_order ties).
9. Modifier on item with no recipe → ad-hoc consumption + `pos_modifier_no_base_recipe` audit.
10. Edit `pos_modifier_recipe_effects` after order confirmed → reversal uses old snapshot.
11. Remove + re-add modifier while still pending → fresh snapshot captured.
12. Pending-lock still prevents post-confirm modifier edits.
13. Reversal idempotent — second void attempt creates no extra rows.

**3C-2**
14. Legacy item (no recipe, stock=5, low=3) → `ok`; (stock=3) → `low`; (stock=0) → `out`; (stock=-1) → `negative`; (stock=NULL) → `untracked`.
15. Recipe empty + sellable trackable → behaves like legacy.
16. Recipe empty + sellable untracked → `config_error`.
17. Any ingredient stock NULL → `untracked`.
18. Any ingredient stock negative → `negative`.
19. Cappuccino milk-3 / coffee-20 → `portions_available=3, bottleneck=milk`.
20. Waiter call returns no raw ingredient stock; manager detail RPC returns full breakdown.
21. Sale of `out`/`negative` item still succeeds (warning only).

**3C-3**
22. Consumption movement stores correct `unit_cost_tzs_snapshot` & `cost_tzs_snapshot = ABS(delta) * unit_cost`.
23. Reversal movement stores copy of unit cost and negated `cost_tzs_snapshot`.
24. COGS for voided order nets to 0 via movement signs (no status filter).
25. COGS `by sellable_item` groups via `source_item_id`.
26. COGS `by ingredient` groups via `item_id`.
27. COGS `by location` groups via `o.pos_location_id`.
28. `_legacy_mode='exclude'` skips NULL-cost rows; `legacy_movements_count` reflects them.
29. `_legacy_mode='estimate'` substitutes current avg_cost; result clearly flagged.
30. `avg_cost_tzs = 0` ingredient → snapshot 0, `uncosted_movements_count` increments, audit emitted.
31. Gross sales = SUM(line_total_tzs) over non-void orders only.

**Regression (each sub-phase)**
32. Phase 1/2/3A/3B verifications still pass.
33. Z-report and payment_split unchanged.
34. Stock count UI still functional.

---

## G. Out of scope (reaffirmed)

Per-location stock pools • suppliers • purchase approvals • receiving • inventory redesign • credit limits • comps wallet • payment redesign • unit conversion engine • automatic historical cost backfill • modifier groups / required-pick-one semantics • cleanup of `pos_save_stock_count` column naming.

---

**Plan ready. Awaiting your explicit go-ahead. Recommended order: 3C-1 first.**
