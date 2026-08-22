/**
 * LAB SCREEN 5 — Dashboard TV / Monthly executive report.
 * Reuses `useBossMonthlyReport` (RPC `boss_monthly_report`) unchanged.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBossMonthlyReport, type CasinoRef } from "@/hooks/use-boss-monthly-report";
import { ControlRoomShell, KpiStrip, MonthStepper, Toolbar, useLabPeriod } from "../ControlRoomShell";
import ControlRoomTable, { type CrlColumn } from "../ControlRoomTable";
import { MONTH_NAMES, amount, signed, tone } from "../format";

type MetricRow = {
  key: string;
  label: string;
  per: Record<string, number>;
  total: number;
  emphasis?: boolean;
};

export default function DashboardReportLab() {
  const { period } = useLabPeriod();

  const { data: casinos = [] } = useQuery({
    queryKey: ["crl-casinos"],
    staleTime: 300_000,
    queryFn: async (): Promise<CasinoRef[]> => {
      const { data, error } = await supabase.from("casinos").select("id, name, slug").order("name");
      if (error) throw error;
      return (data || []) as CasinoRef[];
    },
  });

  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (casinos.length && selected.length === 0) setSelected(casinos.map((c) => c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casinos]);

  const active = useMemo(() => casinos.filter((c) => selected.includes(c.id)), [casinos, selected]);
  const { data: report, isLoading } = useBossMonthlyReport(active, {
    year: period.year,
    month: period.month,
  });

  const s = report?.summary;

  const rows: MetricRow[] = useMemo(() => {
    if (!s) return [];
    const mk = (key: string, label: string, per: Record<string, number>, total: number, emphasis = false) => ({
      key,
      label,
      per,
      total,
      emphasis,
    });
    return [
      mk("tables", "Tables Result", s.tables, s.totals.tables),
      mk("slots", "Slots Result", s.slots, s.totals.slots),
      mk("result", "Result (Live + Slots)", s.result, s.totals.result, true),
      mk("other", "Other Incomes", s.other, s.totals.other),
      mk("estimated", "Estimated Expenses", s.estimated, s.totals.estimated),
      mk("extras", "Extra Expenses", s.extrasTotal, s.totals.extras),
      mk("bonus5", "Bonus 5%", s.bonus5, s.totals.bonus5),
      mk("collection", "Collection", s.collection, s.totals.collection),
    ];
  }, [s]);

  const columns: CrlColumn<MetricRow>[] = useMemo(
    () => [
      {
        key: "label",
        label: "Metric",
        width: 240,
        sticky: true,
        render: (r) => <span style={{ fontWeight: r.emphasis ? 600 : 400 }}>{r.label}</span>,
      },
      ...active.map<CrlColumn<MetricRow>>((c) => ({
        key: c.id,
        label: c.name,
        numeric: true,
        width: 160,
        render: (r: MetricRow) => {
          const v = r.per?.[c.id] ?? 0;
          return <span className={tone(v)}>{signed(v)}</span>;
        },
      })),
      {
        key: "total",
        label: "Company",
        numeric: true,
        divider: true,
        width: 170,
        render: (r) => (
          <span className={tone(r.total)} style={{ fontWeight: 600 }}>
            {signed(r.total)}
          </span>
        ),
      },
    ],
    [active],
  );

  const maxResult = useMemo(
    () => Math.max(1, ...active.map((c) => Math.abs(s?.result?.[c.id] ?? 0))),
    [active, s],
  );

  return (
    <ControlRoomShell
      title="Dashboard · Monthly Report"
      context={`Executive rollup · ${MONTH_NAMES[period.month - 1]} ${period.year}`}
      actions={<MonthStepper />}
    >
      <KpiStrip
        columns={5}
        items={[
          { label: "Result", value: signed(s?.totals.result ?? 0), tone: tone(s?.totals.result ?? 0) },
          { label: "Estimated Expenses", value: amount(s?.totals.estimated ?? 0) },
          {
            label: "Expected Profit",
            value: signed(s?.totals.expectedProfit ?? 0),
            tone: tone(s?.totals.expectedProfit ?? 0),
            hint: `${s?.totals.daysElapsed ?? 0} / ${s?.totals.daysInMonth ?? 0} days`,
          },
          {
            label: "Forecast Result",
            value: signed(s?.totals.forecastResult ?? 0),
            tone: tone(s?.totals.forecastResult ?? 0),
          },
          { label: "Balance", value: signed(s?.totals.balance ?? 0), tone: tone(s?.totals.balance ?? 0) },
        ]}
      />

      <div className="crl-panel" style={{ padding: "14px 16px", marginBottom: 14 }}>
        <div className="crl-panel-head" style={{ border: "none", padding: "0 0 10px" }}>
          Result by casino
        </div>
        {active.length === 0 ? (
          <div className="crl-kpi-hint">No casinos selected.</div>
        ) : (
          active.map((c) => {
            const v = s?.result?.[c.id] ?? 0;
            const pct = Math.min(100, (Math.abs(v) / maxResult) * 100);
            return (
              <div key={c.id} className="crl-bar-row">
                <div className="crl-bar-label">{c.name}</div>
                <div className="crl-bar-track">
                  <div
                    className={`crl-bar-fill ${v < 0 ? "is-negative" : ""}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className={`crl-num crl-bar-value ${tone(v)}`}>{signed(v)}</div>
              </div>
            );
          })
        )}
      </div>

      <Toolbar
        left={<span className="crl-badge">{active.length} casinos</span>}
        right={
          <div className="crl-seg">
            {casinos.map((c) => (
              <button
                key={c.id}
                type="button"
                className={selected.includes(c.id) ? "is-active" : ""}
                onClick={() =>
                  setSelected((sel) =>
                    sel.includes(c.id) ? sel.filter((x) => x !== c.id) : [...sel, c.id],
                  )
                }
              >
                {c.name}
              </button>
            ))}
          </div>
        }
      />

      <ControlRoomTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.key}
        density="comfortable"
        loading={isLoading}
        emptyTitle="No report data"
        emptyHint="No closed business days for this month yet."
      />
    </ControlRoomShell>
  );
}
