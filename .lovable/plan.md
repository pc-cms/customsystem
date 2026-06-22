# POS Phase 3C / 3D — Status

- **3C-1 IMPLEMENTED (v1.3.400)** — recipe-affecting modifiers backend + manager UI.
- **3C-2 IMPLEMENTED (v1.3.401)** — bottleneck availability view/RPC + waiter badges + manager breakdown.
- **3C-3 IMPLEMENTED (v1.3.402)** — cost snapshots on movements + `pos_cogs_report` RPC + `/pos/manager/cogs` page. No historical backfill.
- **3C-3 REVISED (v1.3.403)** — reframed from "COGS / gross margin" to "POS Cost Control". Payment-method cost allocation, role gate, waste-ready.
- **3D IMPLEMENTED (v1.3.404)** — operational control: waste/spoilage reasons, cost snapshots for waste, Excel export, historical backfill, `pos_save_stock_count` schema fix.
- **3D ACCEPTED** — tenant isolation assumption documented. Operational POS users inside a casino domain are trusted within that tenant scope. Role-level backend tightening for `pos_record_waste` is future hardening, not a blocker.

## 3C-1 delivered

### Tables
- `pos_modifier_recipe_effects` — modifier × ingredient × effect_type, optional `sellable_item_id` scope (NULL = global). Unique per `(modifier, scope, ingredient, effect_type)`. CHECK guards quantity/multiplier validity. RLS read=auth, write=manager/pos_manager/super_admin/surveillance.
- `pos_modifier_menu_items` — optional allow-list. Empty = unrestricted.
- `pos_order_item_modifiers.recipe_effects_snapshot jsonb` — frozen, filtered, resolved snapshot.

### Triggers / functions
- `pos_oim_allowlist_check` BEFORE INSERT on `pos_order_item_modifiers` → raises `MODIFIER_NOT_ALLOWED_FOR_ITEM` when allow-list excludes the parent item.
- `pos_order_item_modifiers_recompute` extended: writes `recipe_effects_snapshot` using item-specific-overrides-global rule, ordered remove → override → multiply → add.
- `pos_order_item_modifiers_guard` extended: allows `pos.system_recompute='on'` write to update only the snapshot column post-create.
- `pos_orders_stock_lifecycle` reads each modifier snapshot, folds effects into the base recipe (remove → override → multiply → add), emits `pos_modifier_no_base_recipe` for ad-hoc consumption on item without recipe. Reversal unchanged from 3B (idempotent mirror).

### Audit
- `pos_order_confirmed` payload now includes `modifier_effect_lines`.
- `pos_modifier_no_base_recipe` per order item when synthetic ad-hoc consumption occurs.

### Frontend
- `src/hooks/use-pos-modifier-effects.ts` — effects + allow-list CRUD.
- `src/components/pos/manager/PosModifierConfigDialog.tsx` — effects editor (global + per-item) and allow-list editor.
- `src/pages/pos/PosManagerModifiers.tsx` — added **Configure** action per modifier opening the dialog.

### Reasons unchanged from 3B
`sale`, `pos_recipe_consumption`, `order_void_reversal`, `pos_recipe_reversal`. No new movement reasons.

## Verification (DB logic)
- Allow-list empty → modifier attachable to any item.
- Allow-list non-empty + non-allowed item → `MODIFIER_NOT_ALLOWED_FOR_ITEM` at insert.
- Snapshot only contains effects scoped to the parent sellable item; specific overrides global per (ingredient, effect_type).
- `multiply_quantity=2` on espresso → coffee consumed = base × 2 per order qty.
- `add_quantity` on absent ingredient → new consumption line.
- `remove_ingredient` → ingredient not deducted.
- `override_quantity` → replaces base.
- Effect order deterministic (remove, override, multiply, add).
- Modifier on item without recipe + add/override → ad-hoc consumption + `pos_modifier_no_base_recipe` audit. multiply/remove on absent = no-op.
- Reversal mirrors stored movements; idempotent via `metadata->>'reverses'`.
- Editing effects after order confirmed has no impact on stored snapshot or reversal.
- Pending-lock on modifiers preserved.
- Z-report / payment_split / locations / problem orders / auto-close untouched.

## 3D delivered

### New / updated functions
- `pos_save_stock_count` — fixed column-name mismatch (`qty_delta`→`delta`, `ref_type`→`reference_type`, `ref_id`→`reference_id`, `performed_by`→`user_id`). Now writes `business_date`, `source_item_id`, `metadata`, `unit_cost_tzs_snapshot`, `cost_tzs_snapshot`, `cost_snapshot_missing`.
- `pos_record_waste(item_id, qty, reason, notes)` — new RPC. Reasons: `waste`, `spoilage`, `staff_consumption`, `damage`, `tasting`. Captures immutable cost snapshot, sets `business_date` to current business date. Authenticated users can call; bartenders/managers can record waste.
- `pos_backfill_cost_snapshots(casino_id, from, to, dry_run)` — manager-tier only. Returns row-level audit of what would change / what changed. Dry-run by default; uncheck to apply.
- `pos_cogs_report` updated to include waste/spoilage/staff_consumption/damage/tasting in `units_consumed` and `cogs_tzs`. Waste costs show in total consumed but are not allocated to any payment bucket (no associated tab).

### Frontend
- `src/hooks/use-pos-waste.ts` — `usePosRecordWaste` + `usePosBackfillCostSnapshots`.
- `src/components/pos/StockMovementDialog.tsx` — out-direction now shows 5 operational-reason buttons (Waste, Spoilage, Staff consumption, Damage, Tasting). Selecting one routes through `pos_record_waste` RPC so cost snapshot is captured. Free-text reason still works for non-waste removals.
- `src/pages/pos/PosManagerCogs.tsx` — added **Export Excel** button (downloads current grouped view) and **Dry-run backfill / Apply backfill** button with checkbox toggle. Uncosted banner now mentions backfill option.

### Verification
- Waste movement inserts `pos_inventory_movements` with `unit_cost_tzs_snapshot` and `cost_tzs_snapshot`.
- `cost_snapshot_missing` flagged when `avg_cost_tzs` is 0/missing.
- `pos_cost_snapshot_missing` activity log emitted on missing cost.
- Backfill dry-run returns preview rows; apply updates movement snapshots.
- Stock count movements now have full schema consistency with sales movements.
- Phase 1/2/3A/3B/3C-1/3C-2/3C-3 flows unchanged.

## Next (do not start yet)
- Phase 3E: per-location stock pools (deferred until requested).
- Phase 3F: suppliers, receiving, purchase approvals (deferred until requested).
- Payment redesign / comps wallet / credit limits / unit conversion / auto backfill all remain out of scope.
