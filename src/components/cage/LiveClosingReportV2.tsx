/**
 * LiveClosingReportV2 — "Style A — Clear Cards" printable Live Game Cash Desk
 * closing report (page 2 of the new 4-page set).
 *
 * Same props as the legacy ShiftClosingReport, plus the new Closing Record
 * fields, so the print dialogs can swap layouts with a single flag.
 */
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { CURRENCIES } from "@/lib/currency";
import { PRINT_REPORT_ACCENTS_CSS } from "@/lib/print-report-accents";
import { BANK_CHANNELS } from "@/components/cage/CageHelpers";
import type { Tables } from "@/integrations/supabase/types";
import {
  A4_CLASS, A4_STYLE, Card, CardTable, KpiStrip, PageFooter, ReportHeader, Signatures,
  buildReportId, num, signed,
} from "./report-v2/primitives";
import { useLiveShiftReportData } from "./report-v2/use-live-shift-report-data";
import { resolveProviders } from "@/components/cage-slots/SlotsClosingReportV2";

export type LiveClosingReportV2Props = {
  shift: Tables<"shifts">;
  tables: Tables<"gaming_tables">[];
  closingCount: any;
  openingFloat: any;
  exchangeRates: Record<string, number>;
  totalExpenses: number;
  missTotal: number;
  resultTable: number;
  balance: number;
  businessDate: string;
  tipsTotal?: number;
  cashierName?: string;
  managerName?: string;
  casinoName?: string;
  reportStatus?: string;
  adjustmentRef?: string | null;
};

const LiveClosingReportV2 = ({
  shift, tables, closingCount, openingFloat, exchangeRates,
  totalExpenses, missTotal, resultTable, balance, businessDate,
  tipsTotal = 0, cashierName, managerName, casinoName = "Casino",
  reportStatus = "DRAFT — GBT APPROVAL PENDING",
  adjustmentRef,
}: LiveClosingReportV2Props) => {
  const { casinoId } = useAuth();
  const signCashier = cashierName || (shift as any)?.cashier_name || undefined;
  const signManager = managerName || (shift as any)?.manager_name || undefined;
  const { rows, cashlessIO } = useLiveShiftReportData({
    casinoId, shiftId: shift?.id, businessDate, tables,
  });

  const totals = useMemo(() => rows.reduce(
    (a, r) => ({
      op: a.op + r.op, fl: a.fl + r.fl, cr: a.cr + r.cr,
      cl: a.cl + r.cl, drop: a.drop + r.drop, res: a.res + r.res,
    }),
    { op: 0, fl: 0, cr: 0, cl: 0, drop: 0, res: 0 },
  ), [rows]);

  const cashTotal = (cash: Record<string | number, number> | undefined) =>
    cash ? Object.entries(cash).reduce((s, [d, q]) => s + Number(d) * (Number(q) || 0), 0) : 0;

  const openerCash = (openingFloat?.cash || {}) as Record<string, Record<string | number, number>>;
  const closerCash = (closingCount?.cash || {}) as Record<string, Record<string | number, number>>;
  const openerBank = (openingFloat?.bank || {}) as any;
  const closerBank = (closingCount?.bank || {}) as any;

  const cashRows = (src: Record<string, Record<string | number, number>>) =>
    CURRENCIES.map(c => {
      const qty = cashTotal(src[c]);
      const rate = c === "TZS" ? 1 : Number(exchangeRates[c] || 0);
      return { currency: c, rate: rate ? num(rate) : "—", qty: num(qty), tzs: num(qty * rate) };
    });

  const cashTzs = (src: Record<string, Record<string | number, number>>) =>
    CURRENCIES.reduce((s, c) => s + cashTotal(src[c]) * (c === "TZS" ? 1 : Number(exchangeRates[c] || 0)), 0);

  const bankValue = (b: any, key: string) => {
    const e = b?.channels?.[key];
    if (!e) return 0;
    const moved = Number(e.in || 0) !== 0 || Number(e.out || 0) !== 0;
    return moved ? Number(e.in || 0) - Number(e.out || 0) : Number(e.final || 0);
  };
  const bankKeys = [
    ...BANK_CHANNELS.map(c => ({ key: c.key, label: `${c.bank} ${c.currency}` })),
    ...Object.keys({ ...(openerBank?.channels || {}), ...(closerBank?.channels || {}) })
      .filter(k => !BANK_CHANNELS.some(c => c.key === k))
      .map(k => ({ key: k, label: k.replace(/_/g, " ") })),
  ];
  const bankTotal = (b: any) =>
    Number(b?.tzs || 0) + Number(b?.usd || 0) * Number(exchangeRates["USD"] || 0);

  const providers = resolveProviders(cashlessIO.inByProv, cashlessIO.outByProv);
  const clIn = Object.values(cashlessIO.inByProv).reduce((s, v) => s + v, 0);
  const clOut = Object.values(cashlessIO.outByProv).reduce((s, v) => s + v, 0);

  const openerCashTzs = cashTzs(openerCash);
  const closerCashTzs = cashTzs(closerCash);
  const totalMoney = closerCashTzs + bankTotal(closerBank) + (clIn - clOut);

  const cashCols = [
    { key: "currency", label: "Currency", width: "28%" },
    { key: "rate", label: "Rate", align: "right" as const, width: "20%" },
    { key: "qty", label: "Quantity", align: "right" as const, width: "26%" },
    { key: "tzs", label: "Amount TZS", align: "right" as const, width: "26%" },
  ];

  return (
    <div className={`${A4_CLASS} bg-white text-black p-2 flex flex-col`} style={A4_STYLE}>
      <style>{PRINT_REPORT_ACCENTS_CSS}</style>

      <ReportHeader
        title="Live Game Cash Desk Closing Report"
        reportId={buildReportId("LCD", businessDate, shift?.id)}
        status={reportStatus}
        businessDate={businessDate}
        cashier={signCashier}
        manager={signManager}
      />

      <Card title="Gaming Tables">
        <CardTable
          cols={[
            { key: "t", label: "Table", width: "22%" },
            { key: "op", label: "Opening", align: "right" },
            { key: "fl", label: "Fill", align: "right" },
            { key: "cr", label: "Credit", align: "right" },
            { key: "cl", label: "Closing", align: "right" },
            { key: "dr", label: "Turnover (Drop)", align: "right" },
            { key: "res", label: "Result", align: "right" },
          ]}
          rows={rows.map(r => ({
            t: r.name,
            op: num(r.op), fl: num(r.fl), cr: num(r.cr), cl: num(r.cl),
            dr: num(r.drop), res: signed(r.res),
          }))}
          footer={{
            t: "Total",
            op: num(totals.op), fl: num(totals.fl), cr: num(totals.cr), cl: num(totals.cl),
            dr: num(totals.drop), res: signed(resultTable || totals.res),
          }}
        />
      </Card>

      <div className="grid grid-cols-2 gap-1.5">
        <Card title="Cash Flow Opening">
          <CardTable cols={cashCols} rows={cashRows(openerCash)} />
          <table className="w-full border-collapse">
            <tbody>
              <SumRow label="Total Cash" value={num(openerCashTzs)} />
              <SumRow label="Bank" value={num(bankTotal(openerBank))} />
              <SumRow label="Total Opening" value={num(openerCashTzs + bankTotal(openerBank))} strong />
            </tbody>
          </table>
        </Card>
        <Card title="Cash Flow Closing">
          <CardTable cols={cashCols} rows={cashRows(closerCash)} />
          <table className="w-full border-collapse">
            <tbody>
              <SumRow label="Total Cash" value={num(closerCashTzs)} />
              <SumRow label="Bank" value={num(bankTotal(closerBank))} />
              <SumRow label="Total Closing" value={num(closerCashTzs + bankTotal(closerBank))} strong />
            </tbody>
          </table>
        </Card>
      </div>

      <KpiStrip
        items={[
          { label: "Tables Result", value: signed(resultTable), strong: true },
          { label: "Fill", value: num(totals.fl) },
          { label: "Credit", value: num(totals.cr) },
          { label: "Expenses", value: num(totalExpenses) },
          { label: "Tips", value: num(tipsTotal) },
          { label: "Chip Difference", value: signed(missTotal) },
        ]}
      />

      <Card title="Bank Accounts (movement / balance per channel)">
        <CardTable
          cols={[
            { key: "acc", label: "Account", width: "40%" },
            { key: "open", label: "Opening", align: "right" },
            { key: "close", label: "Closing", align: "right" },
          ]}
          rows={bankKeys.map(b => ({
            acc: b.label,
            open: num(bankValue(openerBank, b.key)),
            close: num(bankValue(closerBank, b.key)),
          }))}
          footer={{ acc: "Total", open: num(bankTotal(openerBank)), close: num(bankTotal(closerBank)) }}
        />
      </Card>

      <Card title="Cashless Shift Transactions">
        <CardTable
          cols={[
            { key: "p", label: "Provider", width: "34%" },
            { key: "in", label: "In", align: "right" },
            { key: "out", label: "Out", align: "right" },
            { key: "net", label: "Net", align: "right" },
          ]}
          rows={providers.map(p => {
            const i = Number(cashlessIO.inByProv[p.key] || 0);
            const o = Number(cashlessIO.outByProv[p.key] || 0);
            return { p: p.label, in: num(i), out: num(o), net: signed(i - o) };
          })}
          footer={{ p: "Total", in: num(clIn), out: num(clOut), net: signed(clIn - clOut) }}
        />
      </Card>

      <Card title="Closing Record">
        <CardTable
          cols={[
            { key: "tm", label: "Total Money", align: "right", width: "22%" },
            { key: "bal", label: "Shift Balance", align: "right", width: "22%" },
            { key: "adj", label: "Adjustment / Incident Reference" },
          ]}
          rows={[{ tm: num(totalMoney), bal: signed(balance), adj: adjustmentRef || (shift as any)?.adjustment_ref || "-" }]}
        />
      </Card>

      <Signatures left="Closing Cashier" right="Closing Manager" leftName={signCashier} rightName={signManager} />
      <PageFooter casinoName={casinoName} page={2} total={4} />
    </div>
  );
};

const SumRow = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <tr className={strong ? "bg-gray-200 font-bold" : "bg-gray-50"}>
    <td className="border border-black px-1.5 py-0.5 uppercase text-[8.5px] tracking-wide">{label}</td>
    <td className="border border-black px-1.5 py-0.5 text-right font-mono tabular-nums">{value}</td>
  </tr>
);

export default LiveClosingReportV2;
