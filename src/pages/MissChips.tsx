import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { CHIP_DENOMS } from "@/lib/currency";
import { useVisibleChipDenoms } from "@/hooks/use-chip-colors";
import ChipToken from "@/components/ChipToken";
import { format, addDays } from "date-fns";
import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, DTHead, DTBody, DTRow, DTHeader, DTCell } from "@/components/ui/data-table";
import { MoneyCell } from "@/components/ui/money-cell";
import { useMoneyMode, useMoneyDisplayMode } from "@/components/ui/data-table-toolbar";
import { fmtDateOnly } from "@/lib/format-date";
import { DateRangePresets, type DatePreset, presetRange } from "@/components/ui/date-range-presets";

interface ShiftMissRow {
  business_date: string;
  opened_at: string;
  closed_at: string | null;
  by_denom: Record<number, number>;
  total_tzs: number;
}

const eatBusinessDate = (iso: string): string => {
  const t = new Date(iso).getTime() - 3 * 3600 * 1000 - 5 * 3600 * 1000;
  return new Date(t).toISOString().slice(0, 10);
};

interface MissChipsProps {
  embedded?: boolean;
  embeddedFrom?: string;
  embeddedTo?: string;
}

const MissChips = ({ embedded = false, embeddedFrom, embeddedTo }: MissChipsProps = {}) => {
  const { casinoId } = useAuth();
  const initial = useMemo(() => presetRange("month"), []);
  const [preset, setPreset] = useState<DatePreset>("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [localMode, MoneyToggle] = useMoneyMode("miss-chips");
  const parentMode = useMoneyDisplayMode();
  const mode = embedded ? parentMode : localMode;
  const visibleDenoms = useVisibleChipDenoms();
  // Denominations descending; filtered by per-casino visibility.
  const DENOMS_DESC = useMemo(() => [...visibleDenoms].sort((a, b) => b - a), [visibleDenoms]);

  // Query window — convert from/to (or embedded override) into UTC bucket
  // boundaries (EAT business day starts at 05:00 EAT = 02:00 UTC).
  const effFrom = embedded && embeddedFrom ? embeddedFrom : from;
  const effTo = embedded && embeddedTo ? embeddedTo : to;
  const fromIso = `${effFrom}T02:00:00Z`;
  const toIso = `${format(addDays(new Date(effTo + "T00:00:00"), 1), "yyyy-MM-dd")}T02:00:00Z`;
  const periodLabel = `${fmtDateOnly(effFrom)} – ${fmtDateOnly(effTo)}`;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["miss-chips-daily", casinoId, fromIso, toIso],
    queryFn: async (): Promise<ShiftMissRow[]> => {
      if (!casinoId) return [];
      const { data, error } = await supabase
        .from("shifts")
        .select("opened_at, closed_at, closing_count")
        .eq("casino_id", casinoId)
        .eq("status", "closed")
        .gte("opened_at", fromIso)
        .lt("opened_at", toIso)
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((s: any) => {
        const cc = s.closing_count || {};
        const by = (cc.chip_miss_by_denom || {}) as Record<string, number>;
        const byDenom: Record<number, number> = {};
        Object.entries(by).forEach(([d, q]) => {
          const dn = Number(d);
          const qn = Number(q);
          if (dn) byDenom[dn] = (byDenom[dn] || 0) + qn;
        });
        return {
          business_date: eatBusinessDate(s.opened_at),
          opened_at: s.opened_at,
          closed_at: s.closed_at,
          by_denom: byDenom,
          total_tzs: Number(cc.chip_miss_total ?? 0),
        };
      });
    },
    enabled: !!casinoId,
  });

  const dailyRows = useMemo(() => {
    const m = new Map<string, ShiftMissRow>();
    rows.forEach((r) => {
      const ex = m.get(r.business_date);
      if (!ex) {
        m.set(r.business_date, { ...r, by_denom: { ...r.by_denom } });
      } else {
        Object.entries(r.by_denom).forEach(([d, q]) => {
          const dn = Number(d);
          ex.by_denom[dn] = (ex.by_denom[dn] || 0) + q;
        });
        ex.total_tzs += r.total_tzs;
      }
    });
    return Array.from(m.values()).sort((a, b) => b.business_date.localeCompare(a.business_date));
  }, [rows]);

  const monthSum = useMemo(() => {
    const by: Record<number, number> = {};
    let total = 0;
    dailyRows.forEach((r) => {
      DENOMS_DESC.forEach((d) => {
        if (r.by_denom[d]) by[d] = (by[d] || 0) + r.by_denom[d];
      });
      total += r.total_tzs;
    });
    return { by, total };
  }, [dailyRows]);

  // Period nav handled by DateRangePresets below.

  const totalCols = DENOMS_DESC.length + 2;

  const Body = (
    <PageSection
      title={embedded ? undefined : `Daily breakdown (${dailyRows.length})`}
      titleRight={embedded ? undefined : <MoneyToggle />}
      card={false}
    >
        <DataTable>
          <DTHead>
            <DTRow>
              <DTHeader type="date">Date</DTHeader>
              {DENOMS_DESC.map((d) => (
                <DTHeader key={d} type="int">
                  <div className="flex justify-center"><ChipToken denom={d} /></div>
                </DTHeader>
              ))}
              <DTHeader type="money">Total TZS</DTHeader>
            </DTRow>
          </DTHead>
          <DTBody>
            {isLoading && (
              <DTRow>
                <DTCell colSpan={totalCols} className="text-center py-6 text-muted-foreground">Loading…</DTCell>
              </DTRow>
            )}
            {!isLoading && dailyRows.length === 0 && (
              <DTRow>
                <DTCell colSpan={totalCols} className="text-center py-6 text-muted-foreground">
                  No closed shifts with miss chips in this month
                </DTCell>
              </DTRow>
            )}
            {dailyRows.map((r) => (
              <DTRow key={r.business_date}>
                <DTCell type="date">{fmtDateOnly(r.business_date)}</DTCell>
                {DENOMS_DESC.map((d) => {
                  const v = r.by_denom[d] ?? 0;
                  const color = v > 0 ? "cms-amount-positive" : v < 0 ? "cms-amount-negative" : "text-muted-foreground";
                  return (
                    <DTCell key={d} type="int" className={cn("text-center", color)}>
                      {v === 0 ? "·" : (v > 0 ? `+${v}` : String(v))}
                    </DTCell>
                  );
                })}
                <DTCell type="money">
                  <MoneyCell value={r.total_tzs || null} mode={mode} signed empty="·" className="font-semibold" />
                </DTCell>
              </DTRow>
            ))}
            {dailyRows.length > 0 && (
              <DTRow className="border-t-2 border-border bg-muted/40 font-semibold">
                <DTCell type="date">MONTH SUM</DTCell>
                {DENOMS_DESC.map((d) => {
                  const v = monthSum.by[d] ?? 0;
                  const color = v > 0 ? "cms-amount-positive" : v < 0 ? "cms-amount-negative" : "text-muted-foreground";
                  return (
                    <DTCell key={d} type="int" className={cn("text-center font-semibold", color)}>
                      {v === 0 ? "·" : (v > 0 ? `+${v}` : String(v))}
                    </DTCell>
                  );
                })}
                <DTCell type="money">
                  <MoneyCell value={monthSum.total} mode={mode} signed className="font-bold text-base" />
                </DTCell>
              </DTRow>
            )}
        </DTBody>
      </DataTable>
    </PageSection>
  );

  if (embedded) return Body;

  return (
    <PageShell>
      <PageHeader
        icon={Coins}
        title="Miss Chips"
        subtitle={`Daily cage chip count delta · ${periodLabel}`}
        date
        centerSlot={
          <DateRangePresets
            preset={preset}
            from={from}
            to={to}
            onChange={(n) => { setPreset(n.preset); setFrom(n.from); setTo(n.to); }}
          />
        }
      >
        <MoneyCell value={monthSum.total} mode={mode} signed className="text-base font-semibold" />
        <span className="text-[10px] text-muted-foreground ml-1">TZS</span>
      </PageHeader>
      {Body}
    </PageShell>
  );
};

export default MissChips;
