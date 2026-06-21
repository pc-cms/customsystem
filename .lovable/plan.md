
# POS Phase 1 — Implementation Plan

## Status

The **database migration is already approved & applied** (you saw the migration approval pop-up). The remaining work is **frontend wiring** for the new server logic + a version bump. Approve this plan and I'll make those edits in build mode.

---

## What the migration already did (live in DB)

1. `pos_orders.stock_deducted_at` column added (idempotency guard).
2. `pos_inventory_movements` enriched with `casino_id`, `business_date`, `reference_type`, `reference_id` + indexes.
3. `pos_order_items_after_insert` rewritten — **no longer deducts stock**; only recomputes order total.
4. New trigger `pos_orders_stock_lifecycle`:
   - On status `pending → preparing/ready/served`: inserts one `pos_inventory_movements` row per tracked item (`reason='sale'`, `reference_type='pos_order'`), sets `stock_deducted_at`, logs `pos_order_confirmed` to `activity_logs`, and logs `pos_stock_negative` for any item that went < 0.
   - On status `→ void`: if `stock_deducted_at` was set, inserts reversal movements (`reason='order_void_reversal'`); always logs `pos_order_voided` with `stock_restored` flag.
5. New trigger `pos_tabs_validate_close` blocks close when `payment_split.player_charge > 0` or `comp_player > 0` and `player_id IS NULL`, with error codes `PLAYER_CHARGE_REQUIRES_PLAYER` / `COMP_PLAYER_REQUIRES_PLAYER`.
6. Audit triggers added: `pos_tabs_audit` (open/close/void), `pos_orders_audit_insert` (create), `pos_player_charges_audit` (create/settle/void), `pos_inventory_audit_insert` (manual adjustments only — sale/void are audited via the lifecycle trigger), `pos_comp_override_audit`.
7. New RPC `pos_player_status(_player_id, _casino_id)` returns `'allowed' | 'warning' | 'approval'` without numeric balances. Logic: `approval` if `pos_comp_budget_status.is_over`; `warning` if ≥3 open charges OR comp budget ≥80% used OR any open charge; else `allowed`.
8. `pos_orders.void_reason` is marked deprecated via column comment. Code uses `voided_reason` consistently; the duplicate column is preserved so existing rows are not lost.

All new functions use `SET search_path TO 'public'`. The 432 linter warnings are pre-existing project-wide and not introduced by this migration.

---

## Frontend changes pending (need build mode)

### New files
- `src/hooks/use-pos-player-status.ts` — thin React-Query wrapper over the `pos_player_status` RPC, 60s stale.
- `src/components/pos/PlayerPosStatusBadge.tsx` — pill (Allowed / Warning / Need Approval) with icon. Renders nothing for walk-in tabs. **No numeric data shown to waiters.**

### Edited files
- `src/components/pos/waiter/MenuPanel.tsx`
  - Out-of-stock tile **no longer disabled**; gets a red `Out · allowed` chip and a warning-coloured stock badge. Bartender confirm will still go through and DB will log `pos_stock_negative`.
- `src/components/pos/waiter/ActiveTabPanel.tsx`
  - Add `<PlayerPosStatusBadge>` next to the tab label (player tabs only).
- `src/components/pos/waiter/NewTabDialog.tsx`
  - Show the status badge next to each player row in the search results so the waiter sees the state **before** opening the tab.
- `src/components/pos/waiter/CloseBillDialog.tsx`
  - Map the new DB error codes (`PLAYER_CHARGE_REQUIRES_PLAYER`, `COMP_PLAYER_REQUIRES_PLAYER`) to friendly toast messages instead of the raw SQL string. The pre-existing client-side guards remain (defence in depth).
- `package.json` — bump version (`1.3.395 → 1.3.396`, patch — backend change rule).

### Files NOT touched
- Payment flow (`useClosePosTab`, `pos_tabs_after_close_comp`, `pos_tab_emit_player_charge`) is untouched per Phase 1 scope.
- No changes to RLS, Z-report, purchases, reports, shifts, or PosLayout.

---

## Acceptance checks I'll run after build-mode edits

| Check | How |
|---|---|
| Adding item does not move stock | Inspect `pos_menu_items.stock_qty` before + after `useAddPosOrder`; expect unchanged |
| Bartender Start deducts exactly once | Press Start twice (second is no-op via guard); expect single `pos_inventory_movements` `sale` row |
| Sale movement carries full reference | Query `pos_inventory_movements WHERE reference_type='pos_order'` for the order id |
| Void after confirm restores stock | `useVoidPosOrder` then verify reversal row + `stock_qty` back to original |
| Void before confirm has no inventory side-effect | `useVoidPosOrder` on a `pending` order — expect zero new movements |
| Out-of-stock tile is clickable | Click + confirm; expect `pos_stock_negative` row in `activity_logs` |
| `player_charge` without player blocked | Walk-in tab → close with charge > 0; expect toast with friendly text |
| `voided_reason` consistent | All FE writes still use `voided_reason` for orders, `void_reason` for tabs/charges |
| `activity_logs` rows present | One row per: tab open/close/void, order create/confirm/void, charge create/settle/void, manual stock adjustment, comp override |
| Existing flow untouched | Open shift → tabs → orders → bar advance → close bill → Z-report renders |

---

## Known limitations carried into Phase 2+

- Status pill thresholds (≥3 open / ≥80% budget) are placeholders until `players.comps_balance` / `credit_limit` / `debt_limit` exist.
- No order-level audit on Started/Ready/Served *individually* — only the first deduction event is logged. We can split if needed.
- Manager force-close, reversal of a closed tab, recipes, modifiers, locations, purchase requests/approvals, daily-close screen, printable shift report — all deferred to later phases as agreed.
- The `pos_inventory_movements` immutable-row trigger applies only to UPDATE/DELETE; new INSERTs with the enriched columns are unblocked.
- `pos_orders.void_reason` column kept; safe to drop in a later cleanup migration once we confirm zero readers in older offline replicas.

---

Approve and I'll make the four file edits + add the two new files + bump `package.json`.
