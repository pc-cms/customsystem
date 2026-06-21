
# POS Phase 2 — Approved Implementation

Order of operations: **(1) DB migration → wait for approval → (2) frontend + version bump**.

## 1. Database migration (single file)

**New columns on `pos_orders`:**
`notes text`, `is_problem bool default false`, `problem_reason text`, `problem_marked_at timestamptz`, `problem_marked_by uuid`, `force_closed_at timestamptz`, `force_closed_by uuid`, `force_close_reason text`, `closed_by_system bool default false`, `auto_closed_at timestamptz`.

**Functions + triggers:**

- `pos_tabs_require_player()` — BEFORE INSERT on `pos_tabs`. Raises `PLAYER_REQUIRED_FOR_NEW_TAB` whenever `NEW.player_id IS NULL`, regardless of `walkin_label`. INSERT-only, so historical walk-in rows stay intact.
- `pos_orders_force_close_guard()` — BEFORE UPDATE on `pos_orders`. If `OLD.force_closed_at IS NULL AND NEW.force_closed_at IS NOT NULL AND OLD.status = 'pending'`, raises `FORCE_CLOSE_NOT_ALLOWED_FOR_PENDING` with hint *"Pending orders must be accepted by bartender or voided, not force-closed."* Sets actor + `closed_by_system=false` for allowed statuses, advances status to `served` when force-closing.
- `pos_orders_auto_close_on_ready()` — BEFORE UPDATE OF status on `pos_orders`. When `OLD.status='preparing' AND NEW.status='ready'`, rewrites NEW to `status='served'`, sets `ready_at`, `served_at`, `closed_by_system=true`, `auto_closed_at`. Phase 1 `pos_orders_stock_lifecycle` (AFTER UPDATE) only deducts when `OLD.status='pending'`, so no double-deduct.
- `pos_orders_audit_manager_actions()` — AFTER UPDATE. Inserts `pos_order_marked_problem`, `pos_order_force_closed`, `pos_order_auto_closed` rows into activity log.
- `pos_player_search(_casino_id uuid, _q text)` RPC — `STABLE SECURITY DEFINER SET search_path=public`. Trigram + ILIKE over `players.first_name/last_name/nickname/phone/id_number` and `player_cards.card_number/rfid_uid`. Returns id, names, nickname, category, masked phone, casino_id, card_matched flag. **No money fields.** Limit 30. `GRANT EXECUTE TO authenticated`.

No table creates → no new GRANTs needed for tables.

## 2. Frontend

**New:**
- `src/hooks/use-pos-player-search.ts`
- `src/components/pos/manager/OrderActionsMenu.tsx`, `MarkProblemDialog.tsx`, `ForceCloseDialog.tsx`
- `src/pages/pos/PosManagerProblemOrders.tsx` (route `/pos/manager/problem-orders`)

**Edited:**
- `NewTabDialog.tsx` — single search input replaces walk-in form. Submit disabled until a player row is selected.
- `MenuPanel.tsx` — 📝 icon on each tile opens note prompt (persists to next add).
- `ActiveTabPanel.tsx` — show + edit notes while order is `pending`; lock once `preparing`.
- `PlayerPosStatusBadge.tsx` — adds 4th `unknown` state (grey `—`, no toast).
- `use-pos-player-status.ts` — `retry:1`, `throwOnError:false`, error → `unknown`.
- `use-pos-orders.ts` — accept `notes` on add.
- `use-pos-bar-orders.ts` — join `waiter:profiles!waiter_user_id(display_name)`; add `notes`; add `useMarkOrderProblem`, `useForceCloseOrder` mutations (FE guard: throws before request if `status==='pending'` for force-close).
- `PosBar.tsx` (OrderCard) — render `👤 {waiter}`, italic note, problem highlight; `⋮` menu (manager only) hides *Force close* when status is `pending`.
- `PosManager.tsx` + `App.tsx` — register `/pos/manager/problem-orders` route + sidebar entry.
- `package.json` — patch version bump.

## 3. Verification queries to run after migration

```sql
-- (a) Insert with NULL player_id must fail
INSERT INTO pos_tabs(casino_id, opened_by) VALUES (...);                  -- expect PLAYER_REQUIRED_FOR_NEW_TAB
INSERT INTO pos_tabs(casino_id, opened_by, walkin_label) VALUES (...);    -- expect same error

-- (b) Historical walk-in rows still readable
SELECT count(*) FROM pos_tabs WHERE player_id IS NULL;

-- (c) Force-close blocked on pending
UPDATE pos_orders SET force_closed_at=now(), force_close_reason='x'
 WHERE status='pending' LIMIT 1;                                          -- expect FORCE_CLOSE_NOT_ALLOWED_FOR_PENDING

-- (d) Auto-close: simulate preparing→ready, expect served + closed_by_system=true + auto_closed_at set

-- (e) Stock invariant: count sale movements per order before/after auto-close + force-close — exactly one
```

## 4. Risks / manual QA notes

- Force-close guard relies on `OLD.status` snapshot — must run **before** auto-close trigger (BEFORE UPDATE ordering by name alphabetically; the guard name `trg_pos_orders_force_close_guard` sorts before `trg_pos_orders_auto_close`). Verified manually after push.
- Auto-close fires only on explicit `ready` transition by bartender; will not retro-close orders that were left in `preparing` before deploy.
- `pos_player_search` is cross-casino on the player base (per Core rule "global player base"); UI shows the player's home-casino chip so the waiter knows it's not a local member.
- No automatic "POS Guest" provisioning — front-line staff must register a player first (existing reception flow).
- Status pill heuristic remains a placeholder until `players.credit_limit` / `comps_balance` columns land.
- No backfill of historical walk-in tabs into players; they remain `player_id IS NULL` and read-only.
- Z-report and `useClosePosTab` payment_split untouched — re-tested via existing report.

Phase 3 (recipes, modifiers, POS locations, suppliers, purchase approvals, receiving, payment redesign) **not started**.
