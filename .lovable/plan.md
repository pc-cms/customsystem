# ACE Collector — экспорт закрытых отчётов за 01–25.08.2026 (read-only)

## Что показала проверка кода

- Исполняемый файл: `/opt/ace-collector/run.sh` → `/opt/ace-collector/venv/bin/python3 /opt/ace-collector/collector.py`.
- Поддерживаемые флаги `collector.py` (полный список из `argparse`): `--health`, `--live-only`, `--closing-only`, `--force-closing`, `--dry-run`, `--verbose/-v`.
- **Исторического CLI нет.** `run_closing()` умеет брать только один период — самый свежий закрытый (`latest_closed_period()` = первый элемент списка с `period_id != 0`). Ни диапазона дат, ни `--period-id`, ни экспорта в файл не существует. Придумывать флаги нельзя.
- Поэтому нужен одноразовый скрипт, использующий уже установленные модули пакета: `ace_collector.config.Config`, `ace_collector.ace_client.AceClient`, `ace_collector.parser.parse_periods / parse_consolidation / business_date_from_label`.
- Ingest не вызывается: `IngestApi` в скрипте не импортируется вообще, значит POST в Supabase невозможен.

## Про запросы

ACE отдаёт отчёт только через `POST /users/manager/report_c.php` (плюс `POST /users/manager/manager.php` для входа в контекст Manager → Finance) — чистого GET у отчёта нет. Это read-only запросы (выборка отчёта), ничего в ACE не изменяют, что подтверждается кодом `AceClient.consolidation_html()`. Используются штатные методы клиента, никаких кастомных запросов.

## Маппинг сдвига даты

`business_date_from_label()` уже реализует правило: закрытый отчёт ACE с датой D покрывает бизнес-день D − 1 день (`_apply_rollover`).

```text
ACE label 02.08.2026  ->  business_date 2026-08-01
ACE label 03.08.2026  ->  business_date 2026-08-02
...
ACE label 26.08.2026  ->  business_date 2026-08-25
```

Скрипт фильтрует **по business_date** в диапазоне `2026-08-01 .. 2026-08-25`, то есть фактически по отчётам ACE от 02.08 до 26.08 — ровно то смещение, о котором говорит пользователь. Имя файла оставляем как запрошено: `ace_closed_2026-08-02_to_2026-08-25.txt`.

## Команда для выполнения на сервере

Запускать под пользователем `acecollector` (у него есть доступ к `/etc/ace-collector.env` и к `.ace-session.json`):

```bash
sudo -u acecollector /opt/ace-collector/venv/bin/python3 - <<'PY'
import sys
sys.path.insert(0, "/opt/ace-collector")
from ace_collector.config import Config
from ace_collector.ace_client import AceClient
from ace_collector.parser import parse_periods, parse_consolidation, business_date_from_label

START, END = "2026-08-01", "2026-08-25"
OUT = "/opt/ace-collector/ace_closed_2026-08-02_to_2026-08-25.txt"

cfg = Config.load()
client = AceClient(cfg)
periods = [(pid, lbl) for pid, lbl in parse_periods(client.report_page_html()) if pid != 0]

rows = []
for pid, label in periods:
    bd = business_date_from_label(label)
    if not bd or not (START <= bd <= END):
        continue
    try:
        r = parse_consolidation(client.consolidation_html(pid), pid, label)
    except Exception as exc:
        rows.append(f"{bd}\tperiod_id={pid}\tlabel={label!r}\tERROR: {exc}")
        continue
    rows.append(
        f"{bd}\tperiod_id={pid}\tlabel={label!r}\t"
        f"total_drop={r.total_drop}\tnet_win={r.net_win}\twin_cashdesk={r.win_cashdesk}\t"
        f"cashless_money_difference={r.cashless_money_difference}\t"
        f"jackpot_slip_out={r.jackpot_slip_out}\tactive_credits={r.active_credits}"
    )

rows.sort()
header = (
    f"# ACE closed reports | casino={cfg.location_code} | ace={cfg.ace_base_url}\n"
    f"# business_date range {START}..{END} (ACE report date = business_date + 1 day)\n"
    "# business_date\tperiod_id\tlabel\tmetrics\n"
)
with open(OUT, "w", encoding="utf-8") as fh:
    fh.write(header + "\n".join(rows) + "\n")
print(f"written {len(rows)} rows -> {OUT}")
PY
```

Проверка результата:

```bash
sudo cat /opt/ace-collector/ace_closed_2026-08-02_to_2026-08-25.txt
```

## Гарантии безопасности

- Никаких импортов `ace_collector.api` / `IngestApi` — POST в `ace-finance-ingest` физически не выполняется.
- Только чтение отчётов ACE штатными методами клиента; никаких форм сохранения/закрытия периодов ACE не отправляется.
- Файлы проекта, БД, миграции, docs и memory не меняются — это разовая команда на сервере.
- Если какого-то периода нет в селекторе ACE (не закрыт / не хранится), он просто отсутствует в выводе; строка `ERROR:` означает изменившуюся структуру отчёта для конкретного дня.

## Если нужно больше

Опционально можно тем же способом дописать сырой HTML каждого периода в отдельный файл для аудита — скажите, и добавлю в скрипт `open(f"/opt/ace-collector/raw_{bd}.html","w").write(html)`.
