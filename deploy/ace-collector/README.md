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

## 8. Future: Player Statistics

`jobs/player_statistics.py` is a **placeholder only**. The authentication
(`ace_collector/ace_client.py`), configuration (`ace_collector/config.py`) and
API client (`ace_collector/api.py`) modules are deliberately generic so the
future player-statistics job can reuse the same authenticated ACE session and
the same config/secret file without any duplication.

---

## 9. Layout

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
└── jobs/
    ├── __init__.py
    └── player_statistics.py
```
