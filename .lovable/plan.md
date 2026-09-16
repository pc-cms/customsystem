# ACE Analytics — audit and redesign proposal

No code was changed. Findings below come from reading the actual files and the database schema.

## 1. Current structure

| Part | File |
| --- | --- |
| Page + all five tabs | `src/pages/analytics/AceAnalytics.tsx` (461 lines, single file) |
| All queries/mutations | `src/hooks/use-ace-players.ts` |
| Player profile block | `src/components/players/PlayerAceSlots.tsx` |
| Route gate | `src/lib/route-module-map.ts` → module `ace_analytics` (`src/lib/modules.ts`, group "Reports"), super_admin only |
| Ingest | `supabase/functions/ace-player-ingest/index.ts` |
| Aggregation | RPC `ace_player_stats(_from,_to,_casino_id)` |

Tables in use: `player_ace_identities`, `player_ace_cards`, `ace_player_egm_daily`, `ace_player_daily`, `ace_egm_current`, `ace_jackpot_wins`, `ace_egm_reports`, `ace_jackpot_reports`, `ace_ingest_keys`.

## 2. What each tab shows today

Shared filter strip (branch, date from, date to, player text, ACE ID text, EGM text) sits above the tabs and applies to all of them, though several tabs ignore parts of it.

- **Overview** — 4 counters (identities, EGMs, transactions, jackpot wins), a collector-key table (location, branch, active, last seen), and two one-line "latest report" labels. No money at all.
- **Players** — `ace_player_stats` rows: player, ACE IDs, cards, EGMs, Drop, Handle, IN, OUT, Slot Result, Games, Jackpots, Last activity. Sortable via SmartTable, Excel export, name link to `/players/:id`. No totals row, no Avg Bet, no per-day drilldown.
- **EGM Status** — current snapshot per machine: EGM, branch, position, state, player, active credit, game, avg bet, last bet, session games, last seen. Filtered only by the EGM text box. No auto-refresh, no state grouping, no totals, no "as of" freshness indicator.
- **EGM Report** — a list of *report captures*, not report content: branch, period label, business day, captured at, and a row count. `rows_data` (the actual 12 ACE rows) is never rendered. Export writes only that metadata.
- **Jackpot Report** — jackpot wins table plus the same capture-list table underneath.

## 3. UX problems found in the code

- **Report tabs are dead ends.** The only way to "load a report" is to look at a row count; `rows_data` has no viewer. This is exactly the reported "no way to select/load a report".
- **Filters are a 5-column form of raw inputs**, not the project's `FilterBar` pattern; date range is two naked `<input type=date>` with no presets (Today / Yesterday / This month) used elsewhere in the CMS.
- **Filters lie.** `egmQuery` filters both Players and EGM Status; `playerQuery`/`aceQuery` do nothing on three tabs; the date range does not apply to EGM Status at all (it is a live snapshot).
- **Sorting is inconsistent** — Players has sort values on most columns, Overview/report tables have none, EGM Status has partial ones. Text columns (ACE IDs, cards, EGMs) are unsortable comma blobs.
- **No totals anywhere.** SmartTable supports `footerRows`; none of the ACE tables use it.
- **Loading/empty states are wrong.** The empty text still says "the ACE collector … is not connected", which is false now and reads as a broken page.
- **No density/grouping** — everything renders as an equal-weight full-width table in `PageSection`; no KPI strip with money, so the page shows no result figure anywhere.
- **No realtime affordance** on EGM Status (30 s staleTime, no refetch interval, no "last observed" banner).

## 4. Functional gaps

- **No current vs closed distinction.** `ace_player_egm_daily.is_final` exists and is populated, but the UI never shows or filters on it, so users cannot tell live from settled figures.
- **No report selection.** No period picker, no per-period drilldown, no report content viewer. `ace_egm_reports` stores `period_label`, `period_from/to`, `business_date`, `rows_data`, `raw_data` — everything needed is already there; there is no `period_id` column (period lives inside `source_key`/label).
- **No consolidated slots report.** Nothing aggregates a branch/day into Drop / Handle / IN / OUT / Result / Games / Avg Bet / Players / EGMs / JP paid. No multi-branch comparison.
- **No drilldowns** — player row → per-day/per-EGM, EGM → players on it, jackpot → player, all missing on the analytics page (only the player profile has a per-EGM table).
- **Export** exists for Players and report metadata only, using `downloadXlsx`; report content and any consolidated view have none.
- **Jackpot wins are not linked to identities** (all `identity_id` NULL from `report_jp`, which carries no player name) — the "ACE player" column is therefore always "—" for report-sourced wins.

## 5. The top ACE ID mechanism

There is no ACE ID linking control on `/analytics/ace` — the top strip only has *filter* inputs labelled "ACE ID" and "EGM". The real linking UI lives in `PlayerAceSlots.tsx` on the player profile: a comma-separated ACE ID field + branch select + Add, calling `ace_attach_identity`, with a conflict dialog offering "Move it here", and per-identity Unlink.

Why it confuses:
- On the analytics page, an input labelled "ACE ID" next to "Branch" looks like a linking form but only filters.
- On the profile, the field mixes two concepts (several IDs at once, one branch for all of them) with no validation, no preview of what will be linked, and no indication which IDs already exist.
- Unlink is a ghost icon button with no confirmation, while linking has one.
- Auto-created `(ACE)` players appear in the Players tab with an "ACE" badge but there is no merge action anywhere in the UI, even though `ace_merge_auto_player` exists in the hook file.

## 6. Proposed information architecture

Reuse `PageHeader` + `FilterBar` + `PageSection` + `SmartTable` (with `footerRows`, `stickyHeader`) and the drill-panel pattern (`DrillHeader`/`DrillTable`) already used in Finance.

```text
ACE (Slots)
  Consolidated   <- default landing: KPI strip + branch/day matrix
  Players        <- per-player table + drill panel (day x EGM)
  EGM Live       <- realtime floor state
  Reports        <- period picker + report content viewer (EGM / Jackpot)
  Jackpots       <- wins log
  System         <- collector keys, last seen, ingest freshness (today's Overview)
```

- Filter bar becomes mode-aware: **Live (today)** vs **Closed day / period**, branch multi-select, date presets, then contextual search.
- "Overview" as it exists today is operational plumbing → moves to **System**; its slot becomes the Consolidated report.
- EGM Report and Jackpot Report merge into one **Reports** workspace (report type selector + period list + content viewer), since both are the same shape (`rows_data` keyed by original ACE headers).

## 7. Tab contents

- **Consolidated** — KPI strip (Drop, Handle, IN, OUT, Slot Result, Games, Avg Bet, Active Credits, Players, EGMs, JP paid) + one row per branch with a totals footer; Live/Closed toggle; export.
- **Players** — same metrics per player, sortable, totals footer, Avg Bet column, `is_final` badge, row click opens a side drill panel with day × EGM rows and that player's jackpots.
- **EGM Live** — floor state grouped by state (Playing / Idle / Offline), active credit total in the footer, 15–30 s refresh with "observed at" stamp, filter by state/branch, click → players seen on that machine.
- **Reports** — left: report list (type, branch, period label, business day, captured); right: rendered `rows_data` table with original ACE headers verbatim, plus export. Historical, immutable, never recomputed.
- **Jackpots** — wins log with branch/date/EGM/name/amount, totals footer, link to player when an identity exists.
- **System** — collector keys, last heartbeat per branch, staleness warning, latest capture per report type.

## 8. Consolidated Slots report

Single-branch/day and multi-branch use the same row shape:

| Field | Source | Rule |
| --- | --- | --- |
| Drop | Σ `ace_player_egm_daily.drop_amount` | Drop = IN, never derived |
| Handle | Σ `handle_amount` | ACE `total_in` only; null when absent |
| IN / OUT | Σ `in_amount` / `out_amount` | explicit 0 stays 0 |
| Slot Result | IN − OUT | casino perspective; never mixed with table Result |
| Games | Σ `games` | null when absent |
| Avg Bet | Handle ÷ Games | shown only when both present, else N/A |
| Active Credits | Σ `ace_egm_current.active_credit` | live only; N/A in closed mode |
| Players | distinct identities with activity | |
| EGM count | distinct `egm_code` with activity (live: machines seen) | |
| Jackpot paid | Σ `ace_jackpot_wins.amount` | informational; already inside OUT, never added to Result |

Modes:
- **Live (current business day)** — aggregates today's `ace_player_egm_daily` rows + `ace_egm_current`, refreshes on an interval, labelled provisional while `is_final = false`.
- **Closed / historical** — aggregates rows for the chosen closed business days and shows the matching ACE report captures as the authoritative snapshot; report content renders from stored `rows_data`, never recalculated.

No combined Table+Slot total, no combined Total Drop.

## 9. Frontend-only vs backend work

Frontend only (current data suffices):
- New IA/tabs, FilterBar with presets and Live/Closed mode, sorting everywhere, totals footers, corrected empty/loading text.
- Consolidated aggregation computed client-side from `ace_player_egm_daily` + `ace_egm_current` + `ace_jackpot_wins` for a single day or a short range.
- Reports workspace: period list and `rows_data` viewer (data already stored).
- Drill panels, Avg Bet, `is_final` badges, EGM Live refresh interval, exports.
- Clearer link/unlink UI on the player profile + a merge action for `(ACE)` players (RPC already exists).

Needs backend work:
- A `ace_consolidated_stats(_from,_to,_casino_id)` RPC once ranges grow beyond a few days (client-side summing will not scale over months).
- Optional `ace_egm_day_stats` RPC for per-machine daily aggregates (per-EGM day rows are only per identity today).
- Linking report-sourced jackpot wins to identities (needs `get_jackpot_wins` in the collector run or a matching rule) — collector change, out of scope unless approved.

## 10. Phased plan

1. **Phase 1 — make it usable (frontend only).** FilterBar with presets + Live/Closed mode, fix empty/loading copy, sorting + totals footers on every table, Reports workspace with a working `rows_data` viewer, Overview → System.
2. **Phase 2 — Consolidated tab.** KPI strip + branch/day table with the metric set above, live and closed modes, export.
3. **Phase 3 — drilldowns.** Player → day × EGM + jackpots panel, EGM Live grouping and machine → players panel, jackpot → player link.
4. **Phase 4 — identity UX.** Rework linking on the player profile (validation, preview, confirm on unlink) and surface merge for auto-created `(ACE)` players.
5. **Phase 5 — backend scale.** `ace_consolidated_stats` RPC and optional per-EGM daily RPC for long ranges.

Collector, cron and the finance path are untouched throughout.
