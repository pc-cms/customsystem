# ACE player/slot analytics — CMS foundation

Additive only. The working ACE finance collector, `player_statistics.py`, and Player Tracking stay untouched.

## 1. Database (one migration, `ace_*` prefix)

New tables, all with `created_at`/`updated_at`, RLS on, GRANTs, and super_admin-only write:

- `player_ace_identities` — player_id → casino_id + ace_player_id + ace_name, first/last seen, is_active, is_auto_created. `UNIQUE(casino_id, ace_player_id)`.
- `player_ace_cards` — identity_id, player_id, casino_id, card_number, first/last seen, is_active (full card history).
- `ace_player_transactions` — identity_id, casino_id, ace_player_id, egm_code, business_date, source_key, tx_type, amount, occurred_at, raw jsonb. `UNIQUE(casino_id, source_key)` for idempotent ingest.
- `ace_player_egm_daily` — identity × EGM × business day: in_amount, out_amount, drop_amount, handle_amount (nullable), games (nullable), first/last play, is_final.
- `ace_player_daily` — identity/player rollup per business day.
- `ace_egm_current` — casino, egm_code, position, state, linked identity, active_credit, raw jsonb, observed_at. `UNIQUE(casino_id, egm_code)`.
- `ace_jackpot_wins` — identity, casino, business_date, occurred_at, jackpot name, amount, egm_code, raw jsonb.
- `ace_egm_reports`, `ace_jackpot_reports` — casino, business_date/period, raw jsonb capture, source_key unique.

Functions:
- `ace_attach_identity(_player_id, _casino_id, _ace_player_id, _force boolean)` — attaches; if the ACE ID already belongs to another player, returns a conflict unless `_force`, in which case it reassigns and writes an audit row.
- `ace_unlink_identity(_identity_id)` — deactivates with audit.
- `ace_merge_auto_player(_auto_player_id, _survivor_id)` — moves identities, marks the auto `(ACE)` player merged through the existing `player_merges` pattern; historical rows stay attached to identities.
- `ace_player_stats(_from, _to, _casino_id)` — aggregated Players-tab rows (one row per CMS player, summed).

Data rules enforced in schema/functions: missing values stay NULL, Drop = IN, Handle never derived, Slot Result = IN − OUT.

Auto-created ACE players get `is_ace_auto` on `players` (new nullable boolean) so non-admin lists filter them out.

## 2. Ingest

One new edge function `ace-player-ingest`, same `x-ace-key` + SHA-256 + `ace_ingest_keys` location validation as the finance ingest, service-role writes. Payload groups: `heartbeat`, `players`, `transactions`, `egm_status`, `report`, `jackpots`. Idempotent upserts by source key. Finance ingest untouched.

## 3. Analytics → ACE page

- Sidebar entry `ACE` under ANALYTICS, route `/analytics/ace`, roles `["super_admin"]`, new module key `ace_analytics` in the permission matrix and route map.
- `src/pages/analytics/AceAnalytics.tsx` with tabs: Overview, Players, EGM Status, EGM Report, Jackpot Report.
- Filters: casino, business day / month / custom period, player, ACE ID, EGM.
- All tables use `SmartTable`; CSV via the existing export utility; explicit "no collector data yet" empty states.
- Hooks in `src/hooks/use-ace-players.ts`.

## 4. Player profile (`/players/:id`)

Conservative additions, all in new components:
- `Slots` tab: Slot Drop / Slot Handle (N/A when null) / Slot Result KPIs plus per-day and per-EGM breakdown. Existing table stats untouched; a TODO comment explains why no combined Total Result yet.
- `ACE IDs & Cards` section grouped by branch, with card history.
- `Jackpots` section: time, name, amount, EGM, branch.
- super_admin-only editor: add several ACE IDs at once (comma-separated, branch picked per entry, normalized to rows), unlink, reassign with a confirmation dialog when the ID is on another player.

## 5. Out of scope in this turn

- `player_statistics.py` stays disabled; no collector changes.
- Player Tracking UI unchanged apart from hiding ACE auto-created players from non-admins.
- No combined Total Result KPI, no charts, no monthly print layouts.
- Real ACE field names/endpoints stay in `raw` jsonb until the Linux probe reveals them.
