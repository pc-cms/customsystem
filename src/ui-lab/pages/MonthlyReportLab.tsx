/**
 * LAB SCREEN 8 — Office / Monthly Report.
 * Reuses `useMonthlyReport` (same hook/formulas as FinancesMonthlyReportPage):
 * plan vs actual per category and group, Grand TZS = TZS + USD × avg rate.
 * Read-only: no cell editors, no import, no export actions.
 */
import { useMemo, useState } from "react";
import { useMonthlyReport, type ReportCategory } from "@/hooks/use-fin-monthly-report";
import { ControlRoomShell, DensityToggle, KpiStrip, MonthStepper, Toolbar, useLabPeriod } from "../ControlRoomShell";
import ControlRoomTable, { type CrlColumn, type CrlDensity } from "../ControlRoomTable";
import { MONTH_NAMES, NO_DATA, amount, percent, signed, tone } from "../format";

type Row = {
  key: string;
  label: string;
  kind: "group" | "category";
  plan_tzs: number;
  plan_usd: number;
  plan_grand: number;
  actual_tzs: number;
  actual_usd: number;
  actual_grand: number;
  remain_grand: number;
};

const fromCategory = (c: ReportCategory, groupCode: string): Row => ({
  key: `${groupCode}:${c.id}`,
  label: c.name,
  kind: "category",
  plan_tzs: c.plan_month_tzs,
  plan_usd: c.plan_month_usd,
  plan_grand: c.plan_month_grand_tzs,
  actual_tzs: c.actual_tzs,
  actual_usd: c.actual_usd,
  actual_grand: c.actual_grand_tzs,
  remain_grand: c.remain_grand_tzs,
});

export default function MonthlyReportLab() {
  const { period } = useLabPeriod();
  const [density, setDensity] = useState<CrlDensity>("compact");

  const { data: report, isLoading } = useMonthlyReport({
    year: period.year,
    month: period.month,
    ytd: false,
    scope: "",
  });

  const rows: Row[] = useMemo(() => {
    if (!report) return [];
    const out: Row[] = [];
    report.groups.forEach((g) => {
      out.push({
        key: `g:${g.code}`,
        label: g.name,
        kind: "group",
        plan_tzs: g.totals.plan_month_tzs,
        plan_usd: g.totals.plan_month_usd,
        plan_grand: g.totals.plan_month_grand_tzs,
        actual_tzs: g.totals.actual_tzs,
        actual_usd: g.totals.actual_usd,
        actual_grand: g.totals.actual_grand_tzs,
        remain_grand: g.totals.remain_grand_tzs,
      });
      g.categories.forEach((c) => out.push(fromCategory(c, g.code)));
    });
    return out;
  }, [report]);

  const grand = report?.grand;
  const spentPct =
    grand && grand.plan_month_grand_tzs
      ? (grand.actual_grand_tzs / grand.plan_month_grand_tzs) * 100
      : null;

  const columns: CrlColumn<Row>[] = [
    {
      key: "label",
      label: "Category",
      group: "",
      width: 250,
      sticky: true,
      render: (r) => (
        <span
          style={{
            fontWeight: r.kind === "group" ? 600 : 400,
            paddingLeft: r.kind === "group" ? 0 : 14,
            textTransform: r.kind === "group" ? "uppercase" : "none",
            letterSpacing: r.kind === "group" ? "0.06em" : undefined,
            fontSize: r.kind === "group" ? 11 : undefined,
          }}
        >
          {r.label}
        </span>
      ),
      total: () => "GRAND TOTAL",
    },
    {
      key: "plan_tzs",
      label: "TZS",
      group: "Plan",
      numeric: true,
      divider: true,
      render: (r) => signed(r.plan_tzs),
      total: () => signed(grand?.plan_month_tzs ?? 0),
    },
    {
      key: "plan_usd",
      label: "USD",
      group: "Plan",
      numeric: true,
      render: (r) => signed(r.plan_usd),
      total: () => signed(grand?.plan_month_usd ?? 0),
    },
    {
      key: "plan_grand",
      label: "Grand TZS",
      group: "Plan",
      numeric: true,
      render: (r) => signed(r.plan_grand),
      total: () => signed(grand?.plan_month_grand_tzs ?? 0),
    },
    {
      key: "actual_tzs",
      label: "TZS",
      group: "Actual",
      numeric: true,
      divider: true,
      render: (r) => signed(r.actual_tzs),
      total: () => signed(grand?.actual_tzs ?? 0),
    },
    {
      key: "actual_usd",
      label: "USD",
      group: "Actual",
      numeric: true,
      render: (r) => signed(r.actual_usd),
      total: () => signed(grand?.actual_usd ?? 0),
    },
    {
      key: "actual_grand",
      label: "Grand TZS",
      group: "Actual",
      numeric: true,
      render: (r) => signed(r.actual_grand),
      total: () => signed(grand?.actual_grand_tzs ?? 0),
    },
    {
      key: "remain_grand",
      label: "Remain",
      group: "Balance",
      numeric: true,
      divider: true,
      render: (r) => <span className={tone(r.remain_grand)}>{signed(r.remain_grand)}</span>,
      total: () => (
        <span className={tone(grand?.remain_grand_tzs ?? 0)}>{signed(grand?.remain_grand_tzs ?? 0)}</span>
      ),
    },
    {
      key: "spent",
      label: "Spent",
      group: "Balance",
      numeric: true,
      width: 88,
      render: (r) =>
        r.plan_grand ? percent((r.actual_grand / r.plan_grand) * 100) : <span className="crl-faint">{NO_DATA}</span>,
      total: () => percent(spentPct),
    },
  ];

  return (
    <ControlRoomShell
      title="Office · Monthly Report"
      context={`Plan vs actual · ${MONTH_NAMES[period.month - 1]} ${period.year}`}
      actions={<MonthStepper />}
    >
      <KpiStrip
        columns={6}
        items={[
          { label: "Income Live", value: signed(report?.incomes.live_game ?? 0) },
          { label: "Income Slots", value: signed(report?.incomes.slots ?? 0) },
          { label: "Income Other", value: signed(report?.incomes.other ?? 0) },
          {
            label: "Income Total",
            value: signed(report?.incomes.total ?? 0),
            tone: tone(report?.incomes.total ?? 0),
          },
          { label: "Actual Grand TZS", value: signed(grand?.actual_grand_tzs ?? 0) },
          {
            label: "USD Rate",
            value: report?.usd_rate ? amount(report.usd_rate) : NO_DATA,
            hint: "Avg of period",
          },
        ]}
      />

      <Toolbar
        left={<span className="crl-badge">{report?.groups.length ?? 0} groups</span>}
        right={<DensityToggle value={density} onChange={setDensity} />}
      />

      <ControlRoomTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.key}
        rowClass={(r) => (r.kind === "group" ? "crl-row-group" : "")}
        density={density}
        showTotals
        loading={isLoading}
        emptyTitle="No budget data"
        emptyHint="No categories or expenses recorded for this month."
      />
    </ControlRoomShell>
  );
}
