# POS Phase 3A — Revised (7 corrections applied)

Scope is strictly additive. No change to Phase 1 stock lifecycle, payment_split, Z-report, cash drawer, comps, purchases, suppliers, receiving, credit limits, or payment redesign. Recipe tables are inert in 3A (engine switch deferred to 3B).

## 1. Database migration (single file)

### New tables — RLS enabled, GRANT SELECT/INSERT/UPDATE/DELETE TO authenticated + GRANT ALL TO service_role; policies mirror existing `pos_menu_items` (casino_id within user's accessible casinos)

- **`pos_locations`** — id, casino_id, name, type (`bar|coffee|vip_service|other`), is_active default true, sort_order int default 0, timestamps. UNIQUE (casino_id, name).
- **`pos_modifiers`** — id, casino_id, name, price_tzs_delta bigint default 0, is_active default true, sort_order int default 0, timestamps. UNIQUE (casino_id, name).
- **`pos_order_item_modifiers`** — id, order_item_id FK→pos_order_items ON DELETE CASCADE, modifier_id FK→pos_modifiers (nullable for snapshot survival when archived), modifier_name_snapshot text NOT NULL, price_tzs_delta_snapshot bigint NOT NULL default 0, created_at. Index on order_item_id. RLS via parent order's casino_id.
- **`pos_recipes`** — id, casino_id, sellable_item_id FK→pos_menu_items, name, is_active default true, timestamps. UNIQUE partial index (casino_id, sellable_item_id) WHERE is_active.
- **`pos_recipe_items`** — id, recipe_id FK→pos_recipes ON DELETE CASCADE, ingredient_item_id FK→pos_menu_items, quantity numeric NOT NULL CHECK (>0), unit text, waste_percent numeric default 0 CHECK (0–100), timestamps.

### New columns (all nullable, additive)
- `pos_orders.pos_location_id uuid REFERENCES pos_locations(id)`
- `pos_tabs.pos_location_id uuid REFERENCES pos_locations(id)`
- `pos_shifts.pos_location_id uuid REFERENCES pos_locations(id)`

### Default Main Bar — every active casino (Correction 5)
- Backfill INSERT `Main Bar` (`type='bar'`, `sort_order=0`) for every row in `casinos` where `is_active = true` (or no `is_active` column → all rows), `ON CONFLICT (casino_id, name) DO NOTHING`.
- Helper RPC `pos_get_or_create_default_location(_casino_id uuid) RETURNS uuid` — SECURITY DEFINER, returns id of `Main Bar`, creating if missing. Called by frontend on POS open to guarantee a valid default exists.

### Triggers

**A. Pre-insert location inheritance (Correction 4)**
- `pos_tabs_set_location_trigger` — BEFORE INSERT on `pos_tabs`: if `NEW.pos_location_id IS NULL`, set to `pos_get_or_create_default_location(NEW.casino_id)`.
- `pos_orders_set_location_trigger` — BEFORE INSERT on `pos_orders`: if `NEW.pos_location_id IS NULL`, copy from `pos_tabs.pos_location_id`; if still NULL, fall back to `pos_get_or_create_default_location(NEW.casino_id)`. New orders never stay NULL going forward; historical NULLs untouched and rendered as "Main Bar" by UI.

**B. Modifier total recompute — quantity-aware (Correction 1)**

Formula:
```
line_total_tzs = (unit_price_tzs + COALESCE(sum(price_tzs_delta_snapshot), 0)) * qty
```
Per-unit modifier delta (e.g. qty 3 × Extra Milk +500 = +1500). Documented in trigger comment.

- `pos_order_item_modifiers_recompute_line_total()` — AFTER INSERT/UPDATE/DELETE on `pos_order_item_modifiers`: recompute the parent `pos_order_items.line_total_tzs` using the formula above. UPDATE flows through with a `current_setting('pos.system_recompute', true) = 'on'` GUC so the immutability trigger lets it pass (Correction 3).

**C. Modifier edit window — pending only, enforced server-side (Correction 2)**
- `pos_order_item_modifiers_guard()` — BEFORE INSERT/UPDATE/DELETE: load parent order via `pos_order_items → pos_orders`; raise `MODIFIERS_LOCKED_AFTER_PENDING` unless `pos_orders.status = 'pending'` AND parent `pos_tabs.closed_at IS NULL`. Frontend mirrors by hiding the +/- mod buttons after pending.

**D. Existing `pos_order_items` immutability (Correction 3)**

Pre-flight inspection step in the migration (using a DO block + `pg_get_functiondef`) verifies the current immutability trigger. Required outcome:
- If it blocks all UPDATE → replace with a thin wrapper that **allows UPDATE of `line_total_tzs` only when `current_setting('pos.system_recompute', true) = 'on'`** AND `OLD.order_id = NEW.order_id` AND every other column unchanged. All other columns remain immutable for every role.
- If it already permits trusted updates → no change.
- The recompute trigger sets the GUC (`PERFORM set_config('pos.system_recompute', 'on', true)`) immediately before its UPDATE and clears it after. Normal users (no GUC) still get the immutability error.

This keeps historical totals safe while letting modifier attach/detach during `pending` recompute the line.

**E. Phase 1 stock lifecycle — unchanged.** It triggers on `pos_orders.status` transitions, not on `line_total_tzs`. Verified single-deduction invariant preserved.

### Recipes are inert (Correction 7)
- Tables + UI only. No consumption of recipes by stock-deduction trigger in 3A.
- No mass auto-generation. A manager-only "Create default 1:1 recipe" button on the recipe page calls a dedicated mutation for one sellable item at a time.

### Archive-only, no hard delete (Correction 6)
- All manager UIs use `is_active = false`. The migration adds no `ON DELETE` cascade that could remove modifiers/recipes/locations referenced by orders. `pos_order_item_modifiers.modifier_id` is nullable + ON DELETE SET NULL, but the UI never deletes — snapshots stay readable regardless.

## 2. Frontend changes

### New hooks
- `use-pos-locations.ts` — list/create/update/archive; calls `pos_get_or_create_default_location` on POS open.
- `use-pos-modifiers.ts` — list/create/update/archive; attach/detach modifiers on an order item (only while order is `pending`; FE guard matches DB guard).
- `use-pos-recipes.ts` — read/write recipes + items; "create default 1:1 recipe" mutation per item.

### New manager pages (+ register in `PosManager.tsx`, `App.tsx`, sidebar)
- `/pos/manager/locations` — `PosManagerLocations.tsx`
- `/pos/manager/modifiers` — `PosManagerModifiers.tsx`
- `/pos/manager/recipes` — `PosManagerRecipes.tsx` (sellable item picker + ingredient grid + "Uses legacy direct deduction" badge when no active recipe)

### Waiter (MenuPanel, ActiveTabPanel, NewTabDialog)
- `NewTabDialog` — optional location dropdown, default = Main Bar (from `pos_get_or_create_default_location`).
- `MenuPanel` — item tile gets "+ mods" affordance opening a sheet (multi-select modifiers with deltas) alongside existing 📝 note flow. Submits modifiers along with `pos_order_items` insert.
- `ActiveTabPanel` — renders modifier chips per item; +/- mod controls visible **only while order status = pending** and tab not closed; otherwise read-only.

### Bar (`PosBar`)
- Top filter chips: All / per-location (built from `pos_locations`). Filters `useBarOrders` by `pos_location_id`. NULL historical orders surface under "Main Bar".
- Order card shows: location chip, waiter name, player name, free-text note, modifier chips with `+ delta` per unit.

### Version bump
- `package.json` patch bump.

## 3. Verification matrix (post-push)

1. Phase 1: waiter→bar→ready→served still single stock deduction.
2. Phase 2: `pos_tabs` insert with NULL `player_id` still blocked; pending force-close still blocked.
3. `Main Bar` exists for every active casino; `pos_get_or_create_default_location` is idempotent.
4. New tab without explicit location → trigger fills Main Bar; new order under that tab inherits the tab's location; Bar filter shows it.
5. Modifier attach while `pending`: line_total = `(unit + Σdelta) * qty`; tab total + Z-report match.
6. Modifier attach attempt after status moves to `preparing` → DB raises `MODIFIERS_LOCKED_AFTER_PENDING`; FE controls hidden.
7. Direct UPDATE of `pos_order_items.line_total_tzs` by an authenticated user (no GUC) → still blocked by immutability trigger. Recompute trigger path succeeds.
8. Recipe created for an item → stock still deducts via legacy path (no double-deduct); badge shows "Uses legacy direct deduction" until 3B.
9. RLS: casino A user cannot SELECT casino B's locations/modifiers/recipes/order_item_modifiers.
10. Archive a modifier/location/recipe → set `is_active=false`; old orders still render snapshot name + delta.
11. `payment_split` and Z-report totals unchanged on a normal close.
12. No DELETE issued against any existing table; no destructive UPDATE.

## 4. Phase 3B preview (NOT in this phase)
- Recipe-aware stock deduction with fallback to legacy when no active recipe.
- Recipe-affecting modifiers (e.g. "double shot").
- Per-location stock pools.
- Purchase approvals, suppliers, receiving, credit limits, comps wallet, payment redesign.

## Order of operations
1. Push DB migration → wait for approval and successful run.
2. Push frontend (hooks, manager pages, MenuPanel/ActiveTabPanel/NewTabDialog/PosBar edits, route registration, version bump).
3. Return implementation report covering every item in the acceptance list.
