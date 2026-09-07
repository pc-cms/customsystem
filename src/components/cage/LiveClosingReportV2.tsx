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
import { useReportWallets, withExtraKeys } from "./report-v2/wallet-rows";
import type { Tables } from "@/integrations/supabase/types";
import {
  A4_CLASS, A4_STYLE, Card, CardTable, KpiStrip, PageFooter, ReportHeader, Signatures,
  buildReportId, num, signed,
} from "./report-v2/primitives";
import { useLiveShiftReportData } from "./report-v2/use-live-shift-report-data";
import { useTotalDrop } from "@/lib/drop-source";
import { useReportSnapshot } from "@/hooks/use-report-snapshot";
import { buildLiveReportPayload, type LiveReportFrozen } from "@/lib/report-snapshots";



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
  const reportCasinoId = ((shift as any)?.casino_id as string | undefined) || casinoId;
  const signCashier = cashierName || (shift as any)?.cashier_name || undefined;
  const signManager = managerName || (shift as any)?.manager_name || undefined;

  // Closed shift -> print the immutable snapshot (frozen on first open).
  const isClosed = !!(shift as any)?.closed_at;
  const { payload: snapshot } = useReportSnapshot<LiveReportFrozen>({
    casinoId: reportCasinoId,
    reportType: "live_closing",
    sourceKey: shift?.id,
    businessDate,
    asOf: (shift as any)?.closed_at ?? null,
    freeze: isClosed,
    enabled: isClosed,
    build: () => buildLiveReportPayload({
      casinoId: reportCasinoId as string,
      shiftId: shift.id,
      businessDate,
      tables,
    }),
  });

  const { rows, cashlessIO, totalDrop: frozenDrop } = useLiveShiftReportData({
    casinoId: reportCasinoId, shiftId: shift?.id, businessDate, tables,
    frozen: snapshot,
  });
  // Canon: per-table Drop is never printed; Total Drop = player_day_drop_cache.
  const { data: liveTotalDrop } = useTotalDrop({
    casinoId: reportCasinoId, fromDate: businessDate,
  });
  const totalDrop = snapshot ? frozenDrop : liveTotalDrop;



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

  const bankCurrencyOf = (key: string) => (key.endsWith("_USD") ? "USD" : key.endsWith("_EUR") ? "EUR" : "TZS");
  const bankRate = (key: string) => {
    const cur = bankCurrencyOf(key);
    return cur === "TZS" ? 1 : Number(exchangeRates[cur] || 0);
  };
  const bankChannel = (b: any, key: string) => b?.channels?.[key] || { in: 0, out: 0, final: 0 };
  const bankOpening = (b: any, key: string) => Number(bankChannel(b, key).final || 0);
  const bankIn = (b: any, key: string) => Number(bankChannel(b, key).in || 0);
  const bankOut = (b: any, key: string) => Number(bankChannel(b, key).out || 0);
  const bankClosing = (b: any, key: string) => bankOpening(b, key) + bankIn(b, key) - bankOut(b, key);
  const bankTotalTzs = (b: any) =>
    bankKeys.reduce((s, k) => s + bankClosing(b, k.key) * bankRate(k.key), 0);
  const bankTotalOpeningTzs = (b: any) =>
    bankKeys.reduce((s, k) => s + bankOpening(b, k.key) * bankRate(k.key), 0);
  const liveWallets = useReportWallets(reportCasinoId);
  const wallets = snapshot?.wallets || liveWallets;
  // FROZEN RULE: print every wallet, even at 0.
  const bankKeys = withExtraKeys(wallets.banks, openerBank?.channels, closerBank?.channels);

  const providers = withExtraKeys(wallets.providers, cashlessIO.inByProv, cashlessIO.outByProv);
  const clIn = Object.values(cashlessIO.inByProv).reduce((s, v) => s + v, 0);
  const clOut = Object.values(cashlessIO.outByProv).reduce((s, v) => s + v, 0);

  const openerCashTzs = cashTzs(openerCash);
  const closerCashTzs = cashTzs(closerCash);
  const openerBankTotalTzs = bankTotalOpeningTzs(openerBank);
  const closerBankTotalTzs = bankTotalTzs(closerBank);
  const totalMoney = closerCashTzs + closerBankTotalTzs + (clIn - clOut);

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
            { key: "dropEmpty", label: "Drop", align: "right", width: "10%" },
            { key: "cl", label: "Closing", align: "right" },
            { key: "to", label: "Turnover", align: "right" },
            { key: "res", label: "Result", align: "right" },
          ]}
          rows={rows.map(r => ({
            t: r.name,
            op: num(r.op), fl: num(r.fl), cr: num(r.cr), cl: num(r.cl),
            dropEmpty: "", to: num(r.drop), res: signed(r.res),
          }))}
          footer={{
            t: "Total",
            op: num(totals.op), fl: num(totals.fl), cr: num(totals.cr), cl: num(totals.cl),
            dropEmpty: "", to: num(totalDrop || 0), res: signed(resultTable || totals.res),
          }}

        />
      </Card>

      <div className="grid grid-cols-2 gap-1.5">
        <Card title="Cash Flow Opening">
          <CardTable cols={cashCols} rows={cashRows(openerCash)} />
          <table className="rv2-table rv2-sumtable">
            <tbody>
              <SumRow label="Total Cash" value={num(openerCashTzs)} />
              <SumRow label="Bank" value={num(openerBankTotalTzs)} />
              <SumRow label="Total Opening" value={num(openerCashTzs + openerBankTotalTzs)} strong />
            </tbody>
          </table>
        </Card>
        <Card title="Cash Flow Closing">
          <CardTable cols={cashCols} rows={cashRows(closerCash)} />
          <table className="rv2-table rv2-sumtable">
            <tbody>
              <SumRow label="Total Cash" value={num(closerCashTzs)} />
              <SumRow label="Bank" value={num(closerBankTotalTzs)} />
              <SumRow label="Total Closing" value={num(closerCashTzs + closerBankTotalTzs)} strong />
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

      <Card title="Bank Accounts">
        <CardTable
          cols={[
            { key: "acc", label: "Account", width: "22%" },
            { key: "cur", label: "Currency", width: "10%" },
            { key: "open", label: "Opening", align: "right" },
            { key: "inn", label: "In", align: "right" },
            { key: "out", label: "Out", align: "right" },
            { key: "net", label: "Net", align: "right" },
            { key: "close", label: "Closing", align: "right" },
            { key: "rate", label: "Rate", align: "right" },
            { key: "tzs", label: "Closing TZS", align: "right" },
          ]}
          rows={bankKeys.map(b => {
            const cur = bankCurrencyOf(b.key);
            const rate = bankRate(b.key);
            const opening = bankOpening(openerBank, b.key);
            const inn = bankIn(closerBank, b.key);
            const out = bankOut(closerBank, b.key);
            const closing = opening + inn - out;
            return {
              acc: b.label,
              cur,
              open: num(opening),
              inn: num(inn),
              out: num(out),
              net: signed(inn - out),
              close: num(closing),
              rate: rate ? num(rate) : "—",
              tzs: num(closing * rate),
            };
          })}
          footer={{
            acc: "Total",
            cur: "",
            open: num(openerBankTotalTzs),
            inn: "",
            out: "",
            net: "",
            close: "",
            rate: "",
            tzs: num(closerBankTotalTzs),
          }}
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
  <tr className={strong ? "rv2-sum-strong" : ""}>
    <td className="rv2-l rv2-sum-label">{label}</td>
    <td className="rv2-r">{value}</td>
  </tr>
);

export default LiveClosingReportV2;
