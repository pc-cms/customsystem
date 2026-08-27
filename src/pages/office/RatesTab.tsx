import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { NumberInput } from "@/components/ui/number-input";
import { useFinDailyRates, useUpsertFinDailyRate, useEnsureDailyRates } from "@/hooks/use-fin-daily-rates";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDate } from "@/lib/format-date";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CURRENCIES = ["USD", "EUR", "GBP", "KES"] as const;
const DAYS = 30;

function buildDates(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const dd = new Date(d);
    dd.setUTCDate(d.getUTCDate() - i);
    out.push(dd.toISOString().slice(0, 10));
  }
  return out;
}

export default function RatesTab() {
  const dates = useMemo(() => buildDates(DAYS), []);
  const from = dates[dates.length - 1];
  const to = dates[0];
  const today = dates[0];
  const { data: rows = [] } = useFinDailyRates(from, to);
  const ensure = useEnsureDailyRates();

  // Auto-carry today's rate from the most recent prior day so the row is
  // never blank. Managers can override before first cage/slots transaction.
  useEffect(() => {
    ensure.mutate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const byKey = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(`${r.business_date}|${r.currency}`, Math.round(Number(r.rate_to_tzs))));
    return m;
  }, [rows]);

  return (
    <PageShell>
      {/* Today's rates as headline cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {CURRENCIES.map((c) => {
          const cur = byKey.get(`${today}|${c}`) ?? null;
          const prev = byKey.get(`${dates[1]}|${c}`) ?? null;
          const diff = cur != null && prev != null ? cur - prev : 0;
          return (
            <div
              key={c}
              className="rounded-lg border border-border bg-card/60 px-4 py-3 flex flex-col gap-1"
            >
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {c} → TZS
              </div>
              <div className="font-mono text-xl tabular-nums">
                {cur == null ? <span className="text-muted-foreground">0</span> : formatNumberSpaces(cur)}
              </div>
              <div
                className={cn(
                  "inline-flex items-center gap-1 text-[11px] font-mono",
                  diff > 0 && "cms-amount-positive",
                  diff < 0 && "cms-amount-negative",
                  diff === 0 && "text-muted-foreground",
                )}
              >
                {diff > 0 ? <ArrowUpRight className="w-3 h-3" /> : diff < 0 ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                {diff === 0 ? "no change" : formatNumberSpaces(Math.abs(diff))}
              </div>
            </div>
          );
        })}
      </div>

      <PageSection bodyClassName="p-0">
        <div className="overflow-x-auto">
          <SmartTable<{ date: string }>
            data={dates.map((date) => ({ date }))}
            rowKey={(r) => r.date}
            scroll={false}
            stickyHeader
            virtualize={false}
            bare
            rowClassName={(r) =>
              r.date === today ? "bg-primary/5 border-l-2 border-l-primary" : undefined
            }
            columns={[
              {
                key: "date",
                header: "Date",
                type: "date",
                style: { width: 150 },
                sortValue: (r) => r.date,
                accessor: (r) => (
                  <span className="font-mono text-xs whitespace-nowrap">
                    {fmtDate(r.date)}
                    {r.date === today && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-primary">today</span>
                    )}
                  </span>
                ),
              },
              ...CURRENCIES.map((c) => ({
                key: c,
                header: `${c} → TZS`,
                type: "money" as const,
                headerClassName: "text-right",
                cellClassName: "text-right",
                sortValue: (r: { date: string }) => byKey.get(`${r.date}|${c}`) ?? null,
                accessor: (r: { date: string }) => (
                  <RateCell date={r.date} currency={c} value={byKey.get(`${r.date}|${c}`) ?? null} />
                ),
              })),
            ]}
          />
        </div>
      </PageSection>
    </PageShell>
  );
}


function RateCell({
  date,
  currency,
  value,
}: {
  date: string;
  currency: string;
  value: number | null;
}) {
  const upsert = useUpsertFinDailyRate();
  const [draft, setDraft] = useState<string>("");
  const display = draft !== "" ? draft : value != null ? String(value) : "";

  const commit = async () => {
    if (draft === "") return;
    const n = Math.round(Number(draft));
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Invalid rate");
      return;
    }
    if (value != null && n === value) {
      setDraft("");
      return;
    }
    try {
      await upsert.mutateAsync({ business_date: date, currency, rate_to_tzs: n });
      setDraft("");
      toast.success(`${currency} ${fmtDate(date)} saved`);
    } catch {
      /* toast handled in hook */
    }
  };

  return (
    <NumberInput
      decimals={0}
      value={display}
      placeholder={value == null ? "·" : ""}
      onValueChange={(v) => setDraft(v == null ? "" : String(v))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={cn(
        "text-right font-mono tabular-nums h-8 bg-transparent border-transparent hover:border-border focus:border-primary",
        value == null && "text-muted-foreground",
        draft !== "" && "ring-1 ring-primary/40 border-primary/40",
      )}
    />
  );
}

