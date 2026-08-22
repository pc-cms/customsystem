/**
 * LAB SCREEN 1 — Statistics / Live Game.
 * Source: identical to Reports → Live Game (`compute_daily_diff` RPC, filtered
 * to CLOSED business days via `business_day_closures`), plus the closed live
 * shift of each business day for the "Closed" time column.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useClosedBusinessDates } from "@/hooks/use-business-day-closure";
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
import { MONTH_NAMES, NO_DATA, amount, holdOf, labDate, percent, signed, tone } from "../format";

type Row = {
  date: string;
  drop: number;
  result: number;
  hold: number | null;
  playerResult: number;
  miss: number;
  balance: number;
  closedAt: string | null;
};

const eatBizDate = (iso: string) => {
  const d = new Date(iso);
  const hh = parseInt(
    d.toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", hour12: false }),
    10,
  );
  const tgt = hh < 7 ? new Date(d.getTime() - 86400_000) : d;
  return tgt.toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
};

const eatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export default function LiveGameLab() {
  const { casinoId } = useAuth();
  const { period, from, to } = useLabPeriod();
  const [density, setDensity] = useState<CrlDensity>("compact");

  const { data: closedSet } = useClosedBusinessDates(from, to);

  const { data: raw = [], isLoading } = useQuery({
    queryKey: ["crl-daily-diff", casinoId, from, to],
    enabled: !!casinoId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("compute_daily_diff", {
        _casino_id: casinoId,
        _from: from,
        _to: to,
      });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: shiftByDate = {} } = useQuery({
    queryKey: ["crl-daily-diff-shifts", casinoId, from, to],
    enabled: !!casinoId,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const fromIso = businessDayHourUTC(from, 7);
      const toDate = new Date(to + "T00:00:00Z");
      toDate.setUTCDate(toDate.getUTCDate() + 1);
      const toIso = businessDayHourUTC(toDate.toISOString().slice(0, 10), 7);
      const { data, error } = await supabase
        .from("shifts")
        .select("id, closed_at")
        .eq("casino_id", casinoId)
        .not("closed_at", "is", null)
        .gte("closed_at", fromIso)
        .lt("closed_at", toIso)
        .order("closed_at", { ascending: true })
        .limit(1000);
      if (error) throw error;
      const rec: Record<string, string> = {};
      (data || []).forEach((s: any) => {
        rec[eatBizDate(s.closed_at)] = s.closed_at;
      });
      return rec;
    },
  });

  const rows: Row[] = useMemo(() => {
    if (!closedSet) return [];
    return raw
      .filter((r: any) => closedSet.has(r.business_date))
      .map((r: any) => {
        const drop = Number(r.drop_r || 0);
        const result = Number(r.result || 0);
        const playerResult = Number(r.player_result || 0);
        const miss = Number(r.miss || 0);
        return {
          date: r.business_date,
          drop,
          result,
          hold: holdOf(result, drop),
          playerResult,
          miss,
          balance: result + playerResult - miss,
          closedAt: shiftByDate[r.business_date] ?? null,
        };
      });
  }, [raw, closedSet, shiftByDate]);

  const totals = useMemo(() => {
    const t = rows.reduce(
      (a, r) => ({
        drop: a.drop + r.drop,
        result: a.result + r.result,
        playerResult: a.playerResult + r.playerResult,
        miss: a.miss + r.miss,
        balance: a.balance + r.balance,
      }),
      { drop: 0, result: 0, playerResult: 0, miss: 0, balance: 0 },
    );
    return { ...t, hold: holdOf(t.result, t.drop), days: rows.length };
  }, [rows]);

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
      total: () => "TOTAL",
    },
    {
      key: "closed",
      label: "Closed",
      width: 84,
      date: true,
      align: "center",
      sortable: true,
      sortValue: (r) => r.closedAt ?? null,
      render: (r) => (r.closedAt ? eatTime(r.closedAt) : <span className="crl-faint">{NO_DATA}</span>),
    },
    {
      key: "drop",
      label: "Drop",
      numeric: true,
      divider: true,
      sortable: true,
      sortValue: (r) => r.drop,
      render: (r) => amount(r.drop),
      total: () => amount(totals.drop),
    },
    {
      key: "result",
      label: "Table Result",
      numeric: true,
      sortable: true,
      sortValue: (r) => r.result,
      render: (r) => <span className={tone(r.result)}>{signed(r.result)}</span>,
      total: () => <span className={tone(totals.result)}>{signed(totals.result)}</span>,
    },
    {
      key: "hold",
      label: "Hold %",
      numeric: true,
      width: 92,
      sortable: true,
      sortValue: (r) => r.hold,
      render: (r) => <span className={r.hold == null ? "crl-faint" : ""}>{percent(r.hold)}</span>,
      total: () => percent(totals.hold),
    },
    {
      key: "playerResult",
      label: "Player Result",
      numeric: true,
      divider: true,
      sortable: true,
      sortValue: (r) => r.playerResult,
      render: (r) => <span className={tone(r.playerResult)}>{signed(r.playerResult)}</span>,
      total: () => <span className={tone(totals.playerResult)}>{signed(totals.playerResult)}</span>,
    },
    {
      key: "miss",
      label: "Chip Difference",
      numeric: true,
      sortable: true,
      sortValue: (r) => r.miss,
      render: (r) => <span className={tone(r.miss)}>{signed(r.miss)}</span>,
      total: () => <span className={tone(totals.miss)}>{signed(totals.miss)}</span>,
    },
    {
      key: "balance",
      label: "Gaming Balance",
      numeric: true,
      divider: true,
      sortable: true,
      sortValue: (r) => r.balance,
      render: (r) => <span className={tone(r.balance)}>{signed(r.balance)}</span>,
      total: () => <span className={tone(totals.balance)}>{signed(totals.balance)}</span>,
    },
  ];

  return (
    <ControlRoomShell
      title="Statistics · Live Game"
      context={`Closed business days · ${MONTH_NAMES[period.month - 1]} ${period.year}`}
      actions={<PeriodControl />}
    >
      <KpiStrip
        columns={6}
        items={[
          { label: "Closed Days", value: totals.days === 0 ? "0" : String(totals.days) },
          {
            label: "Avg Drop / Day",
            value: amount(totals.days ? Math.round(totals.drop / totals.days) : 0),
          },
          { label: "Drop", value: amount(totals.drop) },
          { label: "Table Result", value: signed(totals.result), tone: tone(totals.result) },
          { label: "Hold", value: percent(totals.hold) },
          { label: "Gaming Balance", value: signed(totals.balance), tone: tone(totals.balance) },
        ]}
      />

      <Toolbar
        left={<span className="crl-badge">{rows.length} rows</span>}
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
        emptyTitle="No closed business days"
        emptyHint="Live Game only lists days that were closed by a manager."
      />
    </ControlRoomShell>
  );
}
