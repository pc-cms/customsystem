import { useEffect, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { Input } from "@/components/ui/input";
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
    rows.forEach((r) => m.set(`${r.business_date}|${r.currency}`, Number(r.rate_to_tzs)));
    return m;
  }, [rows]);

  return (
    <PageShell>
      <PageHeader
        icon={TrendingUp}
        title="Rates"
        subtitle="Per-casino daily FX → TZS · Office-owned"
      >
        <FinanceCasinoSwitcher allowNetwork={false} />
      </PageHeader>

      <PageSection bodyClassName="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 w-32">Date</th>
              {CURRENCIES.map((c) => (
                <th key={c} className="text-right px-3 py-2 w-40">
                  {c} → TZS
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => (
              <tr
                key={date}
                className={cn(
                  "border-t border-border",
                  date === today && "bg-primary/5",
                )}
              >
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                  {fmtDate(date)}
                  {date === today && (
                    <span className="ml-2 text-[10px] uppercase text-primary">today</span>
                  )}
                </td>
                {CURRENCIES.map((c) => (
                  <RateCell
                    key={c}
                    date={date}
                    currency={c}
                    value={byKey.get(`${date}|${c}`) ?? null}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
    const n = Number(draft);
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
    <td className="px-3 py-2 text-right">
      <Input
        type="number"
        inputMode="decimal"
        step="0.000001"
        value={display}
        placeholder={value == null ? "·" : ""}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={cn(
          "text-right font-mono h-8",
          value == null && "text-muted-foreground",
          draft !== "" && "ring-1 ring-primary/40",
        )}
      />
      {value != null && (
        <div className="text-[10px] text-muted-foreground mt-0.5 pr-1">
          {formatNumberSpaces(value)}
        </div>
      )}
    </td>
  );
}
