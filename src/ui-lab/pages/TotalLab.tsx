/**
 * LAB SCREEN 2 — Statistics / Total.
 * Same authoritative sources as Reports → Total:
 *   Drop Tables   → player_day_drop_cache.peak
 *   Result Tables → shifts.tables_result (closed shifts, EAT business day)
 *   Drop Slots    → fin_day_closing.drop_slots, fallback cage_slots_shifts.manual_drop_slots
 *   Result Slots  → fin_day_closing.net_win
 * Read-only: no inline editors, no backfill actions.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fetchPaged } from "@/lib/fetch-paged";
import { businessDayHourUTC } from "@/lib/business-day";
import {
  ControlRoomShell,
  DensityToggle,
  KpiStrip,
  PeriodControl,
  Toolbar,
  useLabPeriod,
} from "../ControlRoomShell";
import ControlRoomTable, { type CrlColumn, type CrlDensity } from "../ControlRoomTable";
import { MONTH_NAMES, amount, holdOf, labDate, percent, signed, tone } from "../format";

type Row = {
  date: string;
  dropTables: number;
  tablesResult: number;
  dropSlots: number;
  slotsResult: number;
};

const eatDate = (iso: string) => {
  const d = new Date(iso);
  const hh = parseInt(
    d.toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", hour12: false }),
    10,
  );
  const tgt = hh < 7 ? new Date(d.getTime() - 86400_000) : d;
  return tgt.toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
};

export default function TotalLab() {
  const { casinoId } = useAuth();
  const { period, from, to } = useLabPeriod();
  const [density, setDensity] = useState<CrlDensity>("compact");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["crl-total", casinoId, from, to],
    enabled: !!casinoId,
    staleTime: 30_000,
    queryFn: async (): Promise<Row[]> => {
      const fromIso = businessDayHourUTC(from, 7);
      const toDate = new Date(to + "T00:00:00Z");
      toDate.setUTCDate(toDate.getUTCDate() + 1);
      const toStr = toDate.toISOString().slice(0, 10);
      const toIso = businessDayHourUTC(toStr, 7);

      const [live, slots, drop, closings] = await Promise.all([
        fetchPaged<any>((f, t) =>
          supabase
            .from("shifts")
            .select("id, closed_at, tables_result")
            .eq("casino_id", casinoId)
            .eq("status", "closed")
            .gte("closed_at", fromIso)
            .lt("closed_at", toIso)
            .range(f, t),
        ),
        fetchPaged<any>((f, t) =>
          supabase
            .from("cage_slots_shifts")
            .select("id, business_date, manual_drop_slots")
            .eq("casino_id", casinoId)
            .eq("status", "closed")
            .gte("business_date", from)
            .lt("business_date", toStr)
            .range(f, t),
        ),
        fetchPaged<any>((f, t) =>
          supabase
            .from("player_day_drop_cache")
            .select("business_date, peak")
            .eq("casino_id", casinoId)
            .gte("business_date", from)
            .lt("business_date", toStr)
            .range(f, t),
        ),
        fetchPaged<any>((f, t) =>
          supabase
            .from("fin_day_closing")
            .select("business_date, net_win, drop_slots")
            .eq("casino_id", casinoId)
            .gte("business_date", from)
            .lt("business_date", toStr)
            .range(f, t),
        ),
      ]);

      const map: Record<string, Row> = {};
      const row = (d: string) =>
        (map[d] ||= { date: d, dropTables: 0, tablesResult: 0, dropSlots: 0, slotsResult: 0 });

      live.forEach((s: any) => {
        if (!s.closed_at) return;
        row(eatDate(s.closed_at)).tablesResult += Number(s.tables_result || 0);
      });
      slots.forEach((s: any) => {
        row(s.business_date).dropSlots += Number(s.manual_drop_slots || 0);
      });
      closings.forEach((c: any) => {
        if (!c.business_date) return;
        const r = row(c.business_date);
        r.slotsResult = Number(c.net_win || 0);
        const aceDrop = Number(c.drop_slots || 0);
        if (aceDrop !== 0) r.dropSlots = aceDrop;
      });
      drop.forEach((t: any) => {
        if (!t.business_date) return;
        row(t.business_date).dropTables += Number(t.peak || 0);
      });

      return Object.values(map);
    },
  });

  const totals = useMemo(() => {
    const t = rows.reduce(
      (a, r) => ({
        dropTables: a.dropTables + r.dropTables,
        tablesResult: a.tablesResult + r.tablesResult,
        dropSlots: a.dropSlots + r.dropSlots,
        slotsResult: a.slotsResult + r.slotsResult,
      }),
      { dropTables: 0, tablesResult: 0, dropSlots: 0, slotsResult: 0 },
    );
    const totalDrop = t.dropTables + t.dropSlots;
    const totalResult = t.tablesResult + t.slotsResult;
    return {
      ...t,
      totalDrop,
      totalResult,
      holdTables: holdOf(t.tablesResult, t.dropTables),
      holdSlots: holdOf(t.slotsResult, t.dropSlots),
      totalHold: holdOf(totalResult, totalDrop),
    };
  }, [rows]);

  const columns: CrlColumn<Row>[] = [
    {
      key: "date",
      label: "Business Day",
      group: "",
      width: 130,
      date: true,
      sticky: true,
      sortable: true,
      sortValue: (r) => r.date,
      render: (r) => labDate(r.date),
      total: () => "TOTAL",
    },
    {
      key: "dropTables",
      label: "Drop",
      group: "Tables",
      numeric: true,
      divider: true,
      sortable: true,
      sortValue: (r) => r.dropTables,
      render: (r) => amount(r.dropTables),
      total: () => amount(totals.dropTables),
    },
    {
      key: "tablesResult",
      label: "Result",
      group: "Tables",
      numeric: true,
      sortable: true,
      sortValue: (r) => r.tablesResult,
      render: (r) => <span className={tone(r.tablesResult)}>{signed(r.tablesResult)}</span>,
      total: () => <span className={tone(totals.tablesResult)}>{signed(totals.tablesResult)}</span>,
    },
    {
      key: "holdTables",
      label: "Hold",
      group: "Tables",
      numeric: true,
      width: 84,
      sortable: true,
      sortValue: (r) => holdOf(r.tablesResult, r.dropTables),
      render: (r) => percent(holdOf(r.tablesResult, r.dropTables)),
      total: () => percent(totals.holdTables),
    },
    {
      key: "dropSlots",
      label: "Drop",
      group: "Slots",
      numeric: true,
      divider: true,
      sortable: true,
      sortValue: (r) => r.dropSlots,
      render: (r) => amount(r.dropSlots),
      total: () => amount(totals.dropSlots),
    },
    {
      key: "slotsResult",
      label: "Result",
      group: "Slots",
      numeric: true,
      sortable: true,
      sortValue: (r) => r.slotsResult,
      render: (r) => <span className={tone(r.slotsResult)}>{signed(r.slotsResult)}</span>,
      total: () => <span className={tone(totals.slotsResult)}>{signed(totals.slotsResult)}</span>,
    },
    {
      key: "holdSlots",
      label: "Hold",
      group: "Slots",
      numeric: true,
      width: 84,
      sortable: true,
      sortValue: (r) => holdOf(r.slotsResult, r.dropSlots),
      render: (r) => percent(holdOf(r.slotsResult, r.dropSlots)),
      total: () => percent(totals.holdSlots),
    },
    {
      key: "totalResult",
      label: "Total Result",
      group: "Overall",
      numeric: true,
      divider: true,
      sortable: true,
      sortValue: (r) => r.tablesResult + r.slotsResult,
      render: (r) => {
        const v = r.tablesResult + r.slotsResult;
        return <span className={tone(v)}>{signed(v)}</span>;
      },
      total: () => <span className={tone(totals.totalResult)}>{signed(totals.totalResult)}</span>,
    },
  ];

  const splitCard = (title: string, drop: number, result: number, hold: number | null) => (
    <div className="crl-panel" style={{ padding: "12px 14px" }}>
      <div className="crl-kpi-label">{title}</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0,1fr))",
          gap: 10,
          marginTop: 8,
        }}
      >
        <div>
          <div className="crl-kpi-label">Drop</div>
          <div className="crl-kpi-value" style={{ fontSize: 18 }}>{amount(drop)}</div>
        </div>
        <div>
          <div className="crl-kpi-label">Result</div>
          <div className={`crl-kpi-value ${tone(result)}`} style={{ fontSize: 18 }}>{signed(result)}</div>
        </div>
        <div>
          <div className="crl-kpi-label">Hold</div>
          <div className="crl-kpi-value" style={{ fontSize: 18 }}>{percent(hold)}</div>
        </div>
      </div>
    </div>
  );

  return (
    <ControlRoomShell
      title="Statistics · Total"
      context={`Tables and slots rollup · ${MONTH_NAMES[period.month - 1]} ${period.year}`}
      actions={<PeriodControl />}
    >
      <KpiStrip
        columns={3}
        items={[
          { label: "Total Drop", value: amount(totals.totalDrop) },
          { label: "Total Result", value: signed(totals.totalResult), tone: tone(totals.totalResult) },
          { label: "Total Hold", value: percent(totals.totalHold) },
        ]}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0,1fr))",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {splitCard("Tables", totals.dropTables, totals.tablesResult, totals.holdTables)}
        {splitCard("Slots", totals.dropSlots, totals.slotsResult, totals.holdSlots)}
      </div>

      <Toolbar
        left={<span className="crl-badge">{rows.length} business days</span>}
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
        emptyTitle="No business days"
        emptyHint="No tables or slots activity recorded for this period."
      />
    </ControlRoomShell>
  );
}
