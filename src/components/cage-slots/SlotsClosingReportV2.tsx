/**
 * SlotsClosingReportV2 — "Style A — Clear Cards" printable Slots Cash Desk
 * closing report (page 1 of the new 4-page set).
 *
 * Accepts the same props as the legacy SlotsConsolidatedReport plus the new
 * Closing Record fields, so switching layouts is a one-line swap.
 */
import { CURRENCIES } from "@/lib/currency";
import { PRINT_REPORT_ACCENTS_CSS } from "@/lib/print-report-accents";
import { useAuth } from "@/lib/auth-context";
import { useReportWallets, withExtraKeys, normalizeProviderMap } from "@/components/cage/report-v2/wallet-rows";
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
  /** Canonical slots result (slots_result); falls back to systemShiftResult. */
  slotsResult?: number | null;
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
    cardsFill = 0, cardsCredit = 0, closingCardValue = 0, slotsResult,
  } = props;
  const { casinoId } = useAuth();
  const liveWallets = useReportWallets(casinoId);
  // Frozen snapshots carry their own wallet labels so a reprint never renames rows.
  const wallets = ((props as any).wallets as typeof liveWallets) || liveWallets;
  const depByProv = normalizeProviderMap(cashlessDepositByProvider as any);
  const wdByProv = normalizeProviderMap(cashlessWithdrawByProvider as any);
  const endByProv = normalizeProviderMap(closerCashlessByProvider as any);

  const providers = withExtraKeys(wallets.providers, depByProv, wdByProv, endByProv);
  const depTotal = Object.values(depByProv).reduce((s, v) => s + Number(v || 0), 0)
    || Number(cashlessDepositTotalTzs || 0);
  const wdTotal = Object.values(wdByProv).reduce((s, v) => s + Number(v || 0), 0)
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

  const bankCurrencyOf = (key: string) => (key.endsWith("_USD") ? "USD" : key.endsWith("_EUR") ? "EUR" : "TZS");
  const bankRate = (key: string) => {
    const cur = bankCurrencyOf(key);
    return cur === "TZS" ? 1 : Number(rates[cur] || 0);
  };
  const bankChannel = (ch: any, key: string) => ch?.[key] || { in: 0, out: 0, final: 0 };
  const bankOpening = (ch: any, key: string) => Number(bankChannel(ch, key).final || 0);
  const bankIn = (ch: any, key: string) => Number(bankChannel(ch, key).in || 0);
  const bankOut = (ch: any, key: string) => Number(bankChannel(ch, key).out || 0);
  const bankClosing = (ch: any, key: string) => bankOpening(ch, key) + bankIn(ch, key) - bankOut(ch, key);

  // FROZEN RULE: print every wallet, even at 0.
  const bankKeys = withExtraKeys(wallets.banks, openerBankChannels as any, closerBankChannels as any);

  const computedOpenerBankTotalTzs = bankKeys.reduce(
    (s, b) => s + bankOpening(openerBankChannels, b.key) * bankRate(b.key), 0,
  );
  const computedCloserBankTotalTzs = bankKeys.reduce(
    (s, b) => s + bankClosing(closerBankChannels, b.key) * bankRate(b.key), 0,
  );

  const totalMoney = Number(closerCashTotalTzs || 0) + computedCloserBankTotalTzs + (depTotal - wdTotal);
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
              <SumRow label="Bank" value={num(computedOpenerBankTotalTzs)} />
              <SumRow label="Total Opening" value={num(Number(openerCashTotalTzs) + computedOpenerBankTotalTzs)} strong />
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
              <SumRow label="Bank" value={num(computedCloserBankTotalTzs)} />
              <SumRow label="Total Closing" value={num(Number(closerCashTotalTzs) + computedCloserBankTotalTzs)} strong />
            </tbody>
          </table>
        </Card>
      </div>

      <KpiStrip
        items={[
          { label: "System Result", value: signed(Number(slotsResult ?? systemShiftResult ?? 0)), strong: true },
          { label: "Cash Flow Fill", value: num(cashFlowFill) },
          { label: "Cash Flow Credit", value: num(cashFlowCredit) },
          { label: "Expenses", value: num(casinoExpenses) },
          { label: "Tips", value: num(tipsCollection) },
          { label: "Total Money", value: num(totalMoney), strong: true },
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
            const opening = bankOpening(openerBankChannels, b.key);
            const inn = bankIn(closerBankChannels, b.key);
            const out = bankOut(closerBankChannels, b.key);
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
            open: num(computedOpenerBankTotalTzs),
            inn: "",
            out: "",
            net: "",
            close: "",
            rate: "",
            tzs: num(computedCloserBankTotalTzs),
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
            const i = Number(depByProv[p.key] || 0);
            const o = Number(wdByProv[p.key] || 0);
            const end = endByProv[p.key];
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
