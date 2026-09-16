# ACE Collector

Small Python 3 agent that runs on the local casino Ubuntu server, logs into the
local **ACE** system, reads the Manager → Finance consolidation report and pushes
five metrics to the Casino System cloud API.

Supported: Ubuntu 20.04 / 22.04 / 24.04 LTS.

---

## 1. Install

```bash
tar -xzf ace-collector-server.tar.gz
cd ace-collector
sudo ./install.sh
```

The installer asks for:

| Question | Default |
|---|---|
| ACE base URL | `https://192.168.1.191` |
| ACE username | `Taras` |
| ACE password | *(hidden)* |
| Casino System API URL | `https://rpehngjvwcnipvkouluu.supabase.co/functions/v1/ace-finance-ingest` |
| `x-ace-key` | *(hidden)* |
| Location code | `arusha` |

Everything is written to **`/etc/ace-collector.env`** (`root:acecollector`, mode `0640`).
No secret is stored in the archive or in the repository.

`ACE_VERIFY_TLS=false` by default — the local ACE server uses a self-signed certificate.

---

## 1b. Update an existing installation

```bash
tar -xzf ace-collector-server.tar.gz
cd ace-collector
sudo ./update.sh
```

`update.sh` never touches `/etc/ace-collector.env`, never asks for credentials
and preserves `/opt/ace-collector/.ace-session.json`. It refreshes application
code, dependencies, logrotate and the cron entry (every minute).
Running `sudo ./install.sh` on a server that already has a config automatically
delegates to `update.sh`.

---


## 2. What it collects

From `POST /users/manager/report_c.php` with
`class_report=Report_Current`, `type_report=report_consolidation`, `period_id`,
`p=1`, `table=`, `maxRow=30`, `order=`, `order_dir=`:

1. **ΔTotal Drop** → `total_drop`
2. **NET WIN** → `net_win`
3. **WIN, CashDesk** → `win_cashdesk`
4. **Cashless Money → Difference** (TD whose `title` contains *Change of card accounts balance*) → `cashless_money_difference`
5. **Jackpot Slip → OUT / paid** (row *Jackpot Slip*, TD whose `title` contains *All Paid and Reversal Slips for the Period*) → `jackpot_slip_out`

Login is `POST /login.php` with fields `login`, `password`, `text_uid`,
`select_lang=1`, `lang_name=1` (English). Manager → Finance is emulated with
`POST /users/manager/manager.php` (`form_manager_name=`, `button_current_control=`).

---

## 3. What it sends

**Every run (every 5 minutes) — LIVE:**

```json
{
  "location_code": "arusha",
  "period_id": 0,
  "period_label": "...",
  "total_drop": 0,
  "net_win": 0,
  "win_cashdesk": 0,
  "cashless_money_difference": 0,
  "jackpot_slip_out": 0
}
```

**Runs between 08:00 (inclusive) and 12:00 (exclusive), `Africa/Dar_es_Salaam` — CLOSED:**
the same payload for the latest closed ACE period (`period_id != 0`) plus

```json
{ "business_date": "YYYY-MM-DD", "closed_at_local": "<ACE period label>" }
```

`business_date` is parsed directly from the ACE period label.

Header: `x-ace-key: <key from /etc/ace-collector.env>`.

API answers `live_updated`, `closing_recorded` or `already_recorded`.
HTTP 200 with `ok: true` is treated as success.

### Day Closing mapping (cloud side)

| ACE field | Casino System Day Closing |
|---|---|
| `total_drop` | Drop Slots |
| `net_win` | Net Win |
| `win_cashdesk` | CashDesk Win |
| `cashless_money_difference` | Client Balance |
| `jackpot_slip_out` | dedicated ACE field — **not** JP (IN) |

---

## 4. No local queue

There is no database, queue or buffer. If ACE or the API is unreachable, the
error is logged and the next cron run simply retries with current values.

---

## 5. Cron

`/etc/cron.d/ace-collector`:

```
* * * * * acecollector /usr/bin/flock -n /run/lock/ace-collector.lock /opt/ace-collector/run.sh >> /var/log/ace-collector/collector.log 2>&1
@reboot     acecollector sleep 30 && /usr/bin/flock -n /run/lock/ace-collector.lock /opt/ace-collector/run.sh >> /var/log/ace-collector/collector.log 2>&1
```

`flock -n` guarantees runs never overlap.

---

## 6. Testing

```bash
sudo -u acecollector /opt/ace-collector/run.sh --health --verbose
sudo -u acecollector /opt/ace-collector/run.sh --live-only
sudo -u acecollector /opt/ace-collector/run.sh --closing-only --force-closing
sudo -u acecollector /opt/ace-collector/run.sh --dry-run --force-closing
```

`--dry-run` collects and logs the payload without POSTing.
`--force-closing` ignores the 08:00–12:00 window.

---

## 7. Logs

```
/var/log/ace-collector/collector.log
tail -f /var/log/ace-collector/collector.log
```

Logrotate: daily, 14 rotations, compressed.

---

## 8. ACE Analytics (players / EGM / jackpots) — MANUAL ONLY

The analytics collector is **code-only and disabled**. Cron is NOT changed by
this feature: `run.sh` without any `--analytics-*` flag behaves exactly as
before (finance only). Nothing analytics-related runs automatically.

Ingest endpoint: `ACE_PLAYER_API_URL`
(default `https://rpehngjvwcnipvkouluu.supabase.co/functions/v1/ace-player-ingest`).
The **same** `ACE_INGEST_KEY` and `LOCATION_CODE` are reused; `CASINO_API_URL`
for finance is untouched. Branch-aware env/session files keep working as-is.

### Dry-run test (posts nothing)

```bash
sudo -u acecollector /opt/ace-collector/run.sh --analytics-dry-run --verbose
```

This logs a summary of players/daily rows, EGM status rows and jackpot wins and
**POSTs nothing**.

### Activation (after a successful manual dry-run)

```bash
# one real analytics cycle
sudo -u acecollector /opt/ace-collector/run.sh --analytics-once --verbose

# accounting reports only (latest closed period, or an explicit one)
sudo -u acecollector /opt/ace-collector/run.sh --analytics-reports-only --verbose
sudo -u acecollector /opt/ace-collector/run.sh --analytics-reports-only --period-id 8340
```

### Historical analytics backfill (manual only)

This mode is independent from finance history and returns before any finance
ingest client is created. It skips the newest/current player game period, never
collects historical EGM-current status or transactions, and uses only the
idempotent analytics ingest kinds.

```bash
# Read-only inventory; sends nothing to Casino System
/opt/ace-collector/run.sh --analytics-history-scan --from 2026-09-01 --to 2026-09-17 --verbose

# Closed player periods, player-aware jackpots, and closed EGM/JP reports
/opt/ace-collector/run.sh --analytics-backfill-from 2026-09-01 --to 2026-09-17 --verbose
```

The caller should use the same instance environment, session file and `flock`
lock as that branch's existing collector invocation. Historical daily rows are
sent with `is_final=true`; the open period remains owned by `--analytics-once`.

Only after these pass should anyone consider adding a **separate** cron entry —
and it must never create a second concurrent login loop.

### Sources used

| Job | Source | Status |
|---|---|---|
| `jobs/player_statistics.py` | `/api/bonusreport/get_game_periods_dates/` + `/api/bonusreport/get_opt_trips_tree/` | verified |
| `jobs/egm_status.py` modern | `ace.Api("egms.getegmlist")` -> POST `/aceapi/` JSON-RPC | **verified primary** |
| `jobs/egm_status.py` | `/users/manager/egms.php` (server-rendered) | verified fallback (used when the modern call fails) |
| `jobs/accounting_reports.py` | `report_c.php` `report_game_automat` / `report_jp` | verified |
| `jobs/jackpot_wins.py` | `/api/bonusreport/get_jackpot_wins/` | verified |
| `jobs/transactions.py` | account transactions | **disabled stub** — no verified list API |

### Data rules enforced in code

* Slot Drop = IN (always); ACE drop fields stay in `raw_data` only
* Handle = verified ACE `total_in` (betting turnover, TOTAL IN in the ACE player
  report); absent `total_in` stays NULL. Guessed fields (`handle`, `turnover`,
  `total_bet`, `total_in_result`) are never mapped
* Games = verified `games_played` (legacy `games` only as fallback)
* EGM live credit: CMS canonical `active_credit` = `meters.etl_current_credits *
  meters.etl_denom / 100` (fresh ETL meter). The ACE UI/JS value
  (`currentmeters.currentcredits * etl_denom / 100`) is NOT canonical — it can be
  years stale — and is kept only in `raw_data` as `ace_ui_credit` /
  `currentmeters_credit`, together with `meter_date` (`etl_date`) and
  `currentmeters_updated` for staleness diagnostics

* one daily row per ACE player: nested child trip rows under `data` are not
  traversed once the parent player row is found
* player id = `ptr_id` (verified); a bare `id` is the trip id and is never used
* explicit `0` stays `0`, absent stays `null`
* every source row is preserved verbatim in `raw_data`
* business dates come from the ACE period, never the calendar day
* all ACE calls are read-only reports/APIs — nothing is written to ACE

### Tests

```bash
cd /opt/ace-collector && python3 -m unittest discover -s tests -v
```

---

## 9. Shared building blocks

Authentication (`ace_collector/ace_client.py`), configuration
(`ace_collector/config.py`) and the finance API client (`ace_collector/api.py`)
are shared by both the finance job and the analytics jobs, so there is exactly
one ACE login/session per run. The analytics jobs add
`ace_collector/analytics_api.py` (ace-player-ingest) and
`ace_collector/analytics_parser.py` (parsers/normalizers) on top of them.

---

## 10. Layout

```
ace-collector/
├── install.sh
├── run.sh
├── collector.py
├── requirements.txt
├── README.md
├── ace_collector/
│   ├── __init__.py
│   ├── config.py
│   ├── logging_setup.py
│   ├── ace_client.py
│   ├── parser.py
│   └── api.py
├── ace_collector/
│   ├── analytics_api.py
│   └── analytics_parser.py
└── jobs/
    ├── __init__.py
    ├── player_statistics.py
    ├── egm_status.py
    ├── accounting_reports.py
    ├── jackpot_wins.py
    └── transactions.py
```
