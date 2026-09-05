/**
 * SlotsClosingReportV2 — "Style A — Clear Cards" printable Slots Cash Desk
 * closing report (page 1 of the new 4-page set).
 *
 * Accepts the same props as the legacy SlotsConsolidatedReport plus the new
 * Closing Record fields, so switching layouts is a one-line swap.
 */
import { CURRENCIES } from "@/lib/currency";
import { PRINT_REPORT_ACCENTS_CSS } from "@/lib/print-report-accents";
import { BANK_CHANNELS } from "@/components/cage/CageHelpers";
import {
  A4_CLASS, A4_STYLE, Card, CardTable, KpiStrip, PageFooter, ReportHeader, Signatures,
  buildReportId, num, signed,
} from "@/components/cage/report-v2/primitives";
import type { SlotsConsolidatedProps } from "./SlotsConsolidatedReport";

const BASE_PROVIDERS: Array<{ key: string; label: string }> = [
  { key: "MPESA", label: "M-Pesa" },
  { key: "TIGO", label: "T-Pesa" },
  { key: "HALOTEL", label: "H-Pesa" },
  { key: "AIRTEL", label: "Airtel Money" },
];

export type SlotsClosingReportV2Props = SlotsConsolidatedProps & {
  /** Currency → TZS rate. Missing rates render as "—". */
  rates?: Record<string, number>;
  cashierName?: string | null;
  managerName?: string | null;
  shiftId?: string | null;
  reportStatus?: string;
  taxableWinnings?: number;
  jackpotCount?: number;
  winningsTaxRate?: number;
  adjustmentRef?: string | null;
  cardsFill?: number;
  cardsCredit?: number;
  closingCardValue?: number;
};

/** Union of the fixed provider list and any extra provider present in data. */
export const resolveProviders = (...maps: Array<Record<string, number> | null | undefined>) => {
  const extra = new Set<string>();
  maps.forEach(m => Object.keys(m || {}).forEach(k => {
    if (!BASE_PROVIDERS.some(p => p.key === k)) extra.add(k);
  }));
  return [...BASE_PROVIDERS, ...[...extra].map(k => ({ key: k, label: k }))];
};

const SlotsClosingReportV2 = (props: SlotsClosingReportV2Props) => {
  const {
    casinoName, businessDate, shiftType, rates = {},
    cardsOpener, cardsCloser, systemShiftResult,
    openerByCurrency, closerByCurrency, openerCashTotalTzs, closerCashTotalTzs,
    openerBankTotalTzs = 0, closerBankTotalTzs = 0,
    openerBankChannels, closerBankChannels,
    closerCashlessByProvider, closerCashlessTotalTzs,
    cashFlowFill, cashFlowCredit, casinoExpenses, tipsCollection, aceBalance,
    cashlessDepositByProvider, cashlessWithdrawByProvider,
    cashlessDepositTotalTzs, cashlessWithdrawTotalTzs,
    cashierName, managerName, shiftId,
    reportStatus = "DRAFT — GBT APPROVAL PENDING",
    taxableWinnings = 0, jackpotCount = 0, winningsTaxRate = 0.15, adjustmentRef,
    cardsFill = 0, cardsCredit = 0, closingCardValue = 0,
  } = props;

  const providers = resolveProviders(cashlessDepositByProvider, cashlessWithdrawByProvider, closerCashlessByProvider);
  const depTotal = Object.values(cashlessDepositByProvider || {}).reduce((s, v) => s + Number(v || 0), 0)
    || Number(cashlessDepositTotalTzs || 0);
  const wdTotal = Object.values(cashlessWithdrawByProvider || {}).reduce((s, v) => s + Number(v || 0), 0)
    || Number(cashlessWithdrawTotalTzs || 0);

  const cashRows = (byCur: Record<string, number>) =>
    CURRENCIES.map(c => {
      const qty = Number(byCur?.[c] || 0);
      const rate = c === "TZS" ? 1 : Number(rates[c] || 0);
      return {
        currency: c,
        rate: rate ? num(rate) : "—",
        qty: num(qty),
        tzs: num(qty * rate),
      };
    });

  const bankValue = (ch: Record<string, { in?: number; out?: number; final?: number }> | null | undefined, key: string) => {
    const e = ch?.[key];
    if (!e) return 0;
    const moved = Number(e.in || 0) !== 0 || Number(e.out || 0) !== 0;
    return moved ? Number(e.in || 0) - Number(e.out || 0) : Number(e.final || 0);
  };

  const bankKeys = [
    ...BANK_CHANNELS.map(c => ({ key: c.key, label: `${c.bank} ${c.currency}` })),
    ...Object.keys({ ...(openerBankChannels || {}), ...(closerBankChannels || {}) })
      .filter(k => !BANK_CHANNELS.some(c => c.key === k))
      .map(k => ({ key: k, label: k.replace(/_/g, " ") })),
  ];

  const totalMoney = Number(closerCashTotalTzs || 0) + Number(closerBankTotalTzs || 0) + (depTotal - wdTotal);
  const winningsTax = Math.round(Number(taxableWinnings || 0) * Number(winningsTaxRate || 0));

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
        title="Slots Cash Desk Closing Report"
        reportId={buildReportId("SCD", businessDate, shiftId || businessDate)}
        status={reportStatus}
        businessDate={businessDate}
        cashier={cashierName}
        manager={managerName}
        shiftLabel={String(shiftType || "").toUpperCase() === "DAY" ? "Day" : "Night"}
      />

      <KpiStrip
        items={[
          { label: "Cards Opening", value: num(cardsOpener) },
          { label: "Cards Fill", value: num(cardsFill) },
          { label: "Cards Credit", value: num(cardsCredit) },
          { label: "Cards Closing", value: cardsCloser == null ? "—" : num(cardsCloser) },
          { label: "Closing Card Value", value: num(closingCardValue) },
          { label: "Card Difference", value: signed(props.missCards) },
        ]}
      />

      <div className="grid grid-cols-2 gap-1.5">
        <Card title="Cash Flow Opening">
          <CardTable
            cols={cashCols}
            rows={cashRows(openerByCurrency)}
            footer={null}
          />
          <table className="rv2-table rv2-sumtable">
            <tbody>
              <SumRow label="Total Cash" value={num(openerCashTotalTzs)} />
              <SumRow label="Bank" value={num(openerBankTotalTzs)} />
              <SumRow label="Total Opening" value={num(Number(openerCashTotalTzs) + Number(openerBankTotalTzs))} strong />
            </tbody>
          </table>
        </Card>

        <Card title="Cash Flow Closing">
          <CardTable
            cols={cashCols}
            rows={cashRows(closerByCurrency)}
            footer={null}
          />
          <table className="rv2-table rv2-sumtable">
            <tbody>
              <SumRow label="Total Cash" value={num(closerCashTotalTzs)} />
              <SumRow label="Bank" value={num(closerBankTotalTzs)} />
              <SumRow label="Total Closing" value={num(Number(closerCashTotalTzs) + Number(closerBankTotalTzs))} strong />
            </tbody>
          </table>
        </Card>
      </div>

      <KpiStrip
        items={[
          { label: "System Result", value: signed(systemShiftResult), strong: true },
          { label: "Cash Flow Fill", value: num(cashFlowFill) },
          { label: "Cash Flow Credit", value: num(cashFlowCredit) },
          { label: "Expenses", value: num(casinoExpenses) },
          { label: "Tips", value: num(tipsCollection) },
          { label: "Total Money", value: num(totalMoney), strong: true },
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
            open: num(bankValue(openerBankChannels, b.key)),
            close: num(bankValue(closerBankChannels, b.key)),
          }))}
          footer={{
            acc: "Total",
            open: num(openerBankTotalTzs),
            close: num(closerBankTotalTzs),
          }}
        />
      </Card>

      <Card title="Cashless Shift Transactions">
        <CardTable
          cols={[
            { key: "p", label: "Provider", width: "28%" },
            { key: "in", label: "In", align: "right" },
            { key: "out", label: "Out", align: "right" },
            { key: "net", label: "Net", align: "right" },
            { key: "end", label: "End Day", align: "right" },
          ]}
          rows={providers.map(p => {
            const i = Number(cashlessDepositByProvider?.[p.key] || 0);
            const o = Number(cashlessWithdrawByProvider?.[p.key] || 0);
            const end = closerCashlessByProvider?.[p.key];
            return {
              p: p.label,
              in: num(i),
              out: num(o),
              net: signed(i - o),
              end: end == null ? "—" : num(Number(end)),
            };
          })}
          footer={{
            p: "Total",
            in: num(depTotal),
            out: num(wdTotal),
            net: signed(depTotal - wdTotal),
            end: closerCashlessTotalTzs ? num(closerCashlessTotalTzs) : "—",
          }}
        />
      </Card>

      <Card title="Closing Record">
        <CardTable
          cols={[
            { key: "bal", label: "Shift Balance", align: "right", width: "18%" },
            { key: "adj", label: "Adjustment / Incident Reference", width: "34%" },
            { key: "win", label: "Taxable Winnings Paid", align: "right" },
            { key: "jp", label: "Jackpot Count", align: "right", width: "14%" },
            { key: "tax", label: `Winnings Tax ${Math.round(Number(winningsTaxRate || 0) * 100)}%`, align: "right" },
          ]}
          rows={[{
            bal: signed(aceBalance),
            adj: adjustmentRef || "-",
            win: num(taxableWinnings),
            jp: num(jackpotCount),
            tax: num(winningsTax),
          }]}
        />
      </Card>

      <Signatures left="Closing Cashier" right="Closing Manager" leftName={cashierName} rightName={managerName} />
      <PageFooter casinoName={casinoName} page={1} total={4} />
    </div>
  );
};

const SumRow = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <tr className={strong ? "rv2-sum-strong" : ""}>
    <td className="rv2-l rv2-sum-label">{label}</td>
    <td className="rv2-r">{value}</td>
  </tr>
);

export default SlotsClosingReportV2;
