/**
 * SlotsConsolidatedReport — printable A4 layout matching the paper
 * "ACE Slots Consolidating Cash Desk Report". No PP block.
 *
 * Pure presentational component — pass aggregated numbers in props.
 */
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateOnly } from "@/lib/format-date";

const CURRENCIES = ["TZS", "USD", "EUR", "GBP", "KES"] as const;
const PROVIDERS: Array<{ key: string; label: string }> = [
  { key: "MPESA",   label: "M Pesa" },
  { key: "TIGO",    label: "T Pesa" },
  { key: "HALOTEL", label: "H Pesa" },
  { key: "AIRTEL",  label: "Airtel Money" },
];

export type SlotsConsolidatedProps = {
  casinoName: string;
  businessDate: string;
  shiftType: string;                         // "day" | "night"
  cardsOpener: number;
  cardsCloser: number | null;
  systemShiftResult: number;
  /** Per-currency native amounts (NOT TZS-converted). */
  openerByCurrency: Record<string, number>;  // {TZS, USD, EUR, GBP, KES, OTHER_TZS}
  closerByCurrency: Record<string, number>;
  openerCashTotalTzs: number;
  closerCashTotalTzs: number;
  openerBankTzs?: number;          // native TZS in bank account
  openerBankUsd?: number;          // native USD in bank account
  openerBankTotalTzs?: number;     // bank TZS+USD converted to TZS
  closerBankTzs?: number;
  closerBankUsd?: number;
  closerBankTotalTzs?: number;
  openerCashlessByProvider: Record<string, number>;   // {MPESA, TIGO, HALOTEL, AIRTEL}
  closerCashlessByProvider: Record<string, number>;
  openerCashlessTotalTzs: number;
  closerCashlessTotalTzs: number;
  cashFlowFill: number;          // Ace Fill (in)
  cashFlowCredit: number;        // Collection (out)
  cashDeskCardsFill: number;     // optional
  cashDeskCardsCredit: number;   // optional
  missCards: number;             // count units, negative possible
  casinoExpenses: number;
  tipsCollection: number;
  tipsCollectionDay?: number;
  tipsCollectionEvening?: number;
  aceBalance: number;
  /** Per-provider IN / OUT transaction totals for the shift. */
  cashlessDepositByProvider: Record<string, number>;
  cashlessWithdrawByProvider: Record<string, number>;
  /** Fallback totals from the closing snapshot when provider detail is not stored. */
  cashlessDepositTotalTzs?: number;
  cashlessWithdrawTotalTzs?: number;
};

const Cell = ({ value, align = "right", emphasize = false }: { value: number | string; align?: "left" | "right" | "center"; emphasize?: boolean }) => {
  const display =
    typeof value === "number"
      ? (value === 0 ? "" : formatNumberSpaces(value))
      : value;
  return (
    <td className={`border border-black px-1.5 py-0.5 ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${emphasize ? "font-bold bg-gray-200" : ""}`}>
      {display}
    </td>
  );
};

const Row = ({ label, value, bold }: { label: string; value: number | string; bold?: boolean }) => (
  <tr>
    <td className={`border border-black px-1.5 py-0.5 ${bold ? "font-semibold bg-gray-100" : ""}`}>{label}</td>
    <Cell value={value} emphasize={bold} />
  </tr>
);

const SlotsConsolidatedReport = ({
  casinoName, businessDate, shiftType,
  cardsOpener, cardsCloser, systemShiftResult,
  openerByCurrency, closerByCurrency, openerCashTotalTzs, closerCashTotalTzs,
  openerBankTzs = 0, openerBankUsd = 0, openerBankTotalTzs = 0,
  closerBankTzs = 0, closerBankUsd = 0, closerBankTotalTzs = 0,
  openerCashlessByProvider, closerCashlessByProvider, openerCashlessTotalTzs, closerCashlessTotalTzs,
  cashFlowFill, cashFlowCredit, cashDeskCardsFill, cashDeskCardsCredit,
  missCards, casinoExpenses, tipsCollection, tipsCollectionDay = 0, tipsCollectionEvening = 0, aceBalance,
  cashlessDepositByProvider, cashlessWithdrawByProvider,
  cashlessDepositTotalTzs, cashlessWithdrawTotalTzs,
}: SlotsConsolidatedProps) => {
  const shiftLabel = shiftType.toUpperCase() === "DAY" ? "Day Shift" : "Night Shift";
  const providerDepositTotal = Object.values(cashlessDepositByProvider).reduce((s, v) => s + Number(v || 0), 0);
  const providerWithdrawTotal = Object.values(cashlessWithdrawByProvider).reduce((s, v) => s + Number(v || 0), 0);
  const depositTotal = providerDepositTotal || Number(cashlessDepositTotalTzs || 0);
  const withdrawTotal = providerWithdrawTotal || Number(cashlessWithdrawTotalTzs || 0);
  const openerTotal = openerCashTotalTzs + openerBankTotalTzs;
  const closerTotal = closerCashTotalTzs + closerBankTotalTzs;

  return (
    <div className="bg-white text-black p-2 flex flex-col" style={{ fontFamily: "Arial, sans-serif", fontSize: "14px", lineHeight: 1.3, width: "194mm", minHeight: "281mm", boxSizing: "border-box" }}>

      {/* ============ TITLE ROW ============ */}
      <table className="w-full border-collapse mb-1" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "22%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "22%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "20%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td className="border border-black px-1.5 py-0.5 font-bold text-lg" colSpan={4}>
              {casinoName} Slots Cash Desk Report
            </td>
            <td className="border border-black px-1.5 py-0.5 font-semibold text-center">Date</td>
            <td className="border border-black px-1.5 py-0.5 text-center">{fmtDateOnly(businessDate)}</td>
          </tr>
          <tr>
            <td className="border border-black px-1.5 py-0.5 font-semibold">Cards Opener</td>
            <td className="border border-black px-1.5 py-0.5 text-center font-bold">{cardsOpener}</td>
            <td className="border border-black px-1.5 py-0.5 font-semibold">Cards Closer</td>
            <td className="border border-black px-1.5 py-0.5 text-center font-bold">{cardsCloser ?? ""}</td>
            <td className="border border-black px-1.5 py-0.5 font-semibold text-center">Shift</td>
            <td className="border border-black px-1.5 py-0.5 text-center font-bold">{shiftLabel}</td>
          </tr>
        </tbody>
      </table>


      {/* ============ CASH FLOW: OPENER | CLOSER ============ */}
      <div className="mb-0.5" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
        {/* OPENER */}
        <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
          <colgroup><col style={{ width: "55%" }} /><col style={{ width: "45%" }} /></colgroup>
          <thead>
            <tr><th colSpan={2} className="border border-black bg-gray-200 px-1.5 py-0.5 text-left">Cash Flow Opener</th></tr>
          </thead>

          <tbody>
            {CURRENCIES.map(c => <Row key={c} label={c} value={Number(openerByCurrency[c] || 0)} />)}
            <Row label="Other in TZS" value={Number(openerByCurrency.OTHER_TZS || 0)} />
            <Row label="Total Cash" value={openerCashTotalTzs} bold />
            <Row label="Bank TZS" value={openerBankTzs} />
            <Row label="Bank USD" value={openerBankUsd} />
            <Row label="Total Bank (TZS)" value={openerBankTotalTzs} bold />
          </tbody>
          <tfoot>
            <tr>
              <td className="border border-black bg-gray-300 px-1.5 py-0.5 font-bold">Total Opener</td>
              <td className="border border-black bg-gray-300 px-1.5 py-0.5 text-right font-bold">{formatNumberSpaces(openerTotal)}</td>
            </tr>
          </tfoot>
        </table>

        {/* CLOSER */}
        <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
          <colgroup><col style={{ width: "55%" }} /><col style={{ width: "45%" }} /></colgroup>
          <thead>
            <tr><th colSpan={2} className="border border-black bg-gray-200 px-1.5 py-0.5 text-left">Cash Flow Closer</th></tr>
          </thead>
          <tbody>
            {CURRENCIES.map(c => <Row key={c} label={c} value={Number(closerByCurrency[c] || 0)} />)}
            <Row label="Other in TZS" value={Number(closerByCurrency.OTHER_TZS || 0)} />
            <Row label="Total Cash" value={closerCashTotalTzs} bold />
            <Row label="Bank TZS" value={closerBankTzs} />
            <Row label="Bank USD" value={closerBankUsd} />
            <Row label="Total Bank (TZS)" value={closerBankTotalTzs} bold />
          </tbody>
          <tfoot>
            <tr>
              <td className="border border-black bg-gray-300 px-1.5 py-0.5 font-bold">Total Closer</td>
              <td className="border border-black bg-gray-300 px-1.5 py-0.5 text-right font-bold">{formatNumberSpaces(closerTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ============ RIGHT METRICS / SYSTEM RESULT ============ */}
      <table className="w-full border-collapse mb-0.5" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td className="border border-black bg-gray-200 px-1.5 py-0.5 font-semibold">System Shift Result</td>
            <td className="border border-black px-1.5 py-0.5 text-right font-bold">{formatNumberSpaces(systemShiftResult)}</td>
            <td className="border border-black bg-gray-200 px-1.5 py-0.5 font-semibold">Casino Expenses</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{formatNumberSpaces(casinoExpenses)}</td>
          </tr>
          <tr>
            <td className="border border-black px-1.5 py-0.5">Cash Flow FILL</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{cashFlowFill ? formatNumberSpaces(cashFlowFill) : ""}</td>
            <td className="border border-black px-1.5 py-0.5">Tips CD · Day</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{tipsCollectionDay ? formatNumberSpaces(tipsCollectionDay) : ""}</td>
          </tr>
          <tr>
            <td className="border border-black px-1.5 py-0.5">Cash Flow CREDIT</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{cashFlowCredit ? formatNumberSpaces(cashFlowCredit) : ""}</td>
            <td className="border border-black px-1.5 py-0.5">Tips CD · Evening</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{tipsCollectionEvening ? formatNumberSpaces(tipsCollectionEvening) : ""}</td>
          </tr>
          <tr>
            <td className="border border-black px-1.5 py-0.5">Cash Desk Cards FILL</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{cashDeskCardsFill ? formatNumberSpaces(cashDeskCardsFill) : ""}</td>
            <td className="border border-black px-1.5 py-0.5">Miss Cards</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{missCards !== 0 ? missCards : ""}</td>
          </tr>
          <tr>
            <td className="border border-black px-1.5 py-0.5">Cash Desk Cards CREDIT</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{cashDeskCardsCredit ? formatNumberSpaces(cashDeskCardsCredit) : ""}</td>
            <td className="border border-black bg-gray-300 px-1.5 py-0.5 font-bold">Shift Balance</td>
            <td className="border border-black bg-gray-300 px-1.5 py-0.5 text-right font-bold">{formatNumberSpaces(aceBalance)}</td>
          </tr>
        </tbody>
      </table>

      {/* ============ CASH LESS SHIFT TRANSACTIONS ============ */}
      <table className="w-full border-collapse mb-0.5" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "24%" }} />
          <col style={{ width: "19%" }} />
          <col style={{ width: "19%" }} />
          <col style={{ width: "19%" }} />
          <col style={{ width: "19%" }} />
        </colgroup>
        <thead>
          <tr><th colSpan={5} className="border border-black bg-gray-200 px-1.5 py-0.5 text-left">Cash Less Shift Transactions</th></tr>
          <tr className="bg-gray-100">
            <th className="border border-black px-1.5 py-0.5 text-left">Provider</th>
            <th className="border border-black px-1.5 py-0.5 text-right">Deposit (IN)</th>
            <th className="border border-black px-1.5 py-0.5 text-right">Withdraw (OUT)</th>

            <th className="border border-black px-1.5 py-0.5 text-right">NET (IN − OUT)</th>
            <th className="border border-black px-1.5 py-0.5 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {PROVIDERS.map(p => {
            const i = Number(cashlessDepositByProvider[p.key] || 0);
            const o = Number(cashlessWithdrawByProvider[p.key] || 0);
            const n = i - o;
            const rawB = closerCashlessByProvider[p.key];
            const hasBalance = rawB !== null && rawB !== undefined && Number(rawB) !== 0;
            return (
              <tr key={p.key}>
                <td className="border border-black px-1.5 py-0.5">{p.label}</td>
                <td className="border border-black px-1.5 py-0.5 text-right">{i ? formatNumberSpaces(i) : ""}</td>
                <td className="border border-black px-1.5 py-0.5 text-right">{o ? formatNumberSpaces(o) : ""}</td>
                <td className="border border-black px-1.5 py-0.5 text-right font-semibold">
                  {n !== 0 ? (n > 0 ? "+" : "") + formatNumberSpaces(n) : ""}
                </td>
                <td className="border border-black px-1.5 py-0.5 text-right font-semibold">
                  {hasBalance ? formatNumberSpaces(Number(rawB)) : "—"}
                </td>
              </tr>
            );
          })}
          <tr>
            <td className="border border-black px-1.5 py-0.5 font-bold bg-gray-100">Total</td>
            <td className="border border-black px-1.5 py-0.5 text-right font-bold bg-gray-100">{formatNumberSpaces(depositTotal)}</td>
            <td className="border border-black px-1.5 py-0.5 text-right font-bold bg-gray-100">{formatNumberSpaces(withdrawTotal)}</td>
            <td className="border border-black px-1.5 py-0.5 text-right font-bold bg-gray-100">
              {(depositTotal - withdrawTotal) > 0 ? "+" : ""}{formatNumberSpaces(depositTotal - withdrawTotal)}
            </td>
            <td className="border border-black px-1.5 py-0.5 text-right font-bold bg-gray-100">
              {closerCashlessTotalTzs ? formatNumberSpaces(closerCashlessTotalTzs) : "—"}
            </td>
          </tr>
        </tbody>
      </table>



      {/* End-of-Day Mobile Money Balances removed — duplicates the M Pesa /
          T Pesa / H Pesa / Airtel rows already shown in Cash Flow Closer. */}



      {/* Spacer fills remaining A4 portrait height so signatures sit at the bottom */}
      <div className="flex-1" />

      {/* ============ SIGNATURES ============ */}
      <table className="w-full border-collapse mt-4">
        <tbody>
          <tr>
            <td className="px-1.5 py-0.5 w-1/2">
              <div className="font-semibold mb-0.5">Closing Shift Cashier:</div>
              <div>Name: ____________________________</div>
              <div className="mt-3">Signature: ________________________</div>
            </td>
            <td className="px-1.5 py-0.5 w-1/2">
              <div className="font-semibold mb-0.5">Closing Shift Manager:</div>
              <div>Name: ____________________________</div>
              <div className="mt-3">Signature: ________________________</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default SlotsConsolidatedReport;
