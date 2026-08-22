/**
 * LAB SCREEN 3 — Statistics / Miss Chips.
 * Same source as the production Miss Chips screen:
 * closed `shifts.closing_count.chip_miss_by_denom` / `chip_miss_total`,
 * bucketed into EAT business days.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useVisibleChipDenoms } from "@/hooks/use-chip-colors";
import ChipToken from "@/components/ChipToken";
import { businessDateOf } from "@/lib/business-day";
import { format, addDays } from "date-fns";
import {
  ControlRoomShell,
  DensityToggle,
  KpiStrip,
  PeriodControl,
  Toolbar,
  useLabPeriod,
} from "../ControlRoomShell";
import ControlRoomTable, { type CrlColumn, type CrlDensity } from "../ControlRoomTable";
import { MONTH_NAMES, NO_DATA, amount, labDate, signed, tone } from "../format";

type Row = {
  date: string;
  byDenom: Record<number, number>;
  total: number;
};

export default function MissChipsLab() {
  const { casinoId } = useAuth();
  const { period, from, to } = useLabPeriod();
  const [density, setDensity] = useState<CrlDensity>("compact");

  const visibleDenoms = useVisibleChipDenoms();
  const denoms = useMemo(() => [...visibleDenoms].sort((a, b) => b - a), [visibleDenoms]);

  const fromIso = `${from}T04:00:00Z`;
  const toIso = `${format(addDays(new Date(to + "T00:00:00"), 1), "yyyy-MM-dd")}T04:00:00Z`;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["crl-miss-chips", casinoId, fromIso, toIso],
    enabled: !!casinoId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("shifts")
        .select("opened_at, closing_count")
        .eq("casino_id", casinoId)
        .eq("status", "closed")
        .gte("opened_at", fromIso)
        .lt("opened_at", toIso)
        .order("opened_at", { ascending: false });
      if (error) throw error;

      const map = new Map<string, Row>();
      (data || []).forEach((s: any) => {
        const cc = s.closing_count || {};
        const by = (cc.chip_miss_by_denom || {}) as Record<string, number>;
        const date = businessDateOf(s.opened_at);
        const cur = map.get(date) || { date, byDenom: {}, total: 0 };
        Object.entries(by).forEach(([d, q]) => {
          const dn = Number(d);
          if (!dn) return;
          cur.byDenom[dn] = (cur.byDenom[dn] || 0) + Number(q);
        });
        cur.total += Number(cc.chip_miss_total ?? 0);
        map.set(date, cur);
      });
      return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
    },
  });

  const summary = useMemo(() => {
    const by: Record<number, number> = {};
    let total = 0;
    let daysWithMiss = 0;
    let events: Record<number, number> = {};
    rows.forEach((r) => {
      let touched = false;
      denoms.forEach((d) => {
        const v = r.byDenom[d];
        if (v) {
          by[d] = (by[d] || 0) + v;
          events[d] = (events[d] || 0) + 1;
          touched = true;
        }
      });
      if (touched || r.total !== 0) daysWithMiss += 1;
      total += r.total;
    });
    const topDenom = Object.entries(events).sort((a, b) => b[1] - a[1])[0];
    return { by, total, daysWithMiss, topDenom: topDenom ? Number(topDenom[0]) : null };
  }, [rows, denoms]);

  const columns: CrlColumn<Row>[] = [
    {
      key: "date",
      label: "Date",
      width: 118,
      date: true,
      sticky: true,
      sortable: true,
      sortValue: (r) => r.date,
      render: (r) => labDate(r.date),
      total: () => "PERIOD",
    },
    ...denoms.map<CrlColumn<Row>>((d, i) => ({
      key: `d-${d}`,
      label: <ChipToken denom={d} />,
      align: "center" as const,
      numeric: true,
      width: 82,
      divider: i === 0,
      sortable: true,
      sortValue: (r: Row) => r.byDenom[d] ?? 0,
      render: (r: Row) => {
        const v = r.byDenom[d];
        // No miss event recorded for this denomination → `·`
        if (!v) return <span className="crl-faint">{NO_DATA}</span>;
        return <span className={tone(v)}>{signed(v)}</span>;
      },
      total: () => {
        const v = summary.by[d];
        if (!v) return <span className="crl-faint">{NO_DATA}</span>;
        return <span className={tone(v)}>{signed(v)}</span>;
      },
    })),
    {
      key: "total",
      label: "Total TZS",
      numeric: true,
      divider: true,
      width: 140,
      sortable: true,
      sortValue: (r) => r.total,
      // Calculated total: an exact zero must render as `0`.
      render: (r) => <span className={tone(r.total)}>{signed(r.total)}</span>,
      total: () => <span className={tone(summary.total)}>{signed(summary.total)}</span>,
    },
  ];

  return (
    <ControlRoomShell
      title="Statistics · Miss Chips"
      context={`Cage chip count delta · ${MONTH_NAMES[period.month - 1]} ${period.year}`}
      actions={<PeriodControl />}
    >
      <KpiStrip
        columns={4}
        items={[
          { label: "Period", value: `${labDate(from)} – ${labDate(to)}`, hint: "Business days" },
          { label: "Days With Miss", value: String(summary.daysWithMiss) },
          { label: "Total Miss TZS", value: signed(summary.total), tone: tone(summary.total) },
          {
            label: "Most Frequent Denom",
            value: summary.topDenom == null ? NO_DATA : amount(summary.topDenom),
            hint: summary.topDenom == null ? "No miss events" : "By number of days",
          },
        ]}
      />

      <Toolbar
        left={<span className="crl-badge">{rows.length} days</span>}
        right={<DensityToggle value={density} onChange={setDensity} />}
      />

      <ControlRoomTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.date}
        initialSort={{ key: "date", dir: "desc" }}
        density={density}
        showTotals
        loading={isLoading}
        emptyTitle="No closed shifts with miss chips"
        emptyHint="Nothing was recorded in this period."
      />
    </ControlRoomShell>
  );
}
