import { CURRENCIES } from "@/lib/currency";

import DrillTable, { type DrillRow } from "@/components/reports/DrillTable";

export interface CashDenomRow {
  currency: string;
  denomination: number;
  quantity: number;
  tzs: number;
}

/** Fixed provider order for the mobile-money block. */
export const MOBILE_ORDER = ["AirTell", "Tigo", "Halo", "Mpesa"] as const;

/** Normalises provider keys coming from cage snapshots ("AirTel", "M PESA"…). */
const canonProvider = (name: string) => {
  const k = name.toLowerCase().replace(/[^a-z]/g, "");
  if (k.startsWith("air")) return "AirTell";
  if (k.startsWith("tigo") || k.startsWith("mix")) return "Tigo";
  if (k.startsWith("halo") || k.startsWith("hal")) return "Halo";
  if (k.includes("pesa")) return "Mpesa";
  return name;
};

/** Mobile money per provider — every provider listed, even at zero. */
export const MobileMoneyTable = ({
  amounts,
  title = "Mobile money",
}: { amounts: Record<string, number>; title?: string }) => {
  const agg: Record<string, number> = Object.fromEntries(MOBILE_ORDER.map((p) => [p, 0]));
  Object.entries(amounts || {}).forEach(([k, v]) => {
    const p = canonProvider(k);
    agg[p] = (agg[p] || 0) + (Number(v) || 0);
  });
  const names = [...MOBILE_ORDER, ...Object.keys(agg).filter((n) => !(MOBILE_ORDER as readonly string[]).includes(n))];
  const total = Object.values(agg).reduce((s, v) => s + v, 0);

  return (
    <DrillTable
      title={title}
      rows={names.map((n) => ({ label: n, units: agg[n] || 0, rate: 1, tzs: agg[n] || 0 }))}
      total={total}
    />
  );
};

/**
 * Cage money summarised per currency — no denomination breakdown.
 * Every supported currency is listed, even when the amount is zero:
 *   CUR | amount (original) | rate | TZS total
 */
const CurrencyCashTable = ({
  rows,
  title = "Cash by currency",
  totalLabel = "Total",
  total,
  mobile,
}: {
  rows: CashDenomRow[];
  title?: string;
  totalLabel?: string;
  total?: number;
  /** Optional mobile-money block rendered under the currency table. */
  mobile?: Record<string, number>;
}) => {
  const agg: Record<string, { amount: number; tzs: number }> = {};
  rows.forEach((r) => {
    const a = (agg[r.currency] ??= { amount: 0, tzs: 0 });
    a.amount += (r.denomination || 0) * (r.quantity || 0);
    a.tzs += r.tzs || 0;
  });

  const currencies = [
    ...CURRENCIES,
    ...Object.keys(agg).filter((c) => !(CURRENCIES as readonly string[]).includes(c)),
  ];

  const drillRows: DrillRow[] = currencies.map((cur) => {
    const a = agg[cur] ?? { amount: 0, tzs: 0 };
    return {
      label: `Cash ${cur}`,
      units: a.amount,
      rate: cur === "TZS" ? 1 : a.amount ? a.tzs / a.amount : 0,
      tzs: a.tzs,
      muted: !a.amount && !a.tzs,
    };
  });

  return (
    <div className="space-y-3">
      <DrillTable title={title} rows={drillRows} totalLabel={totalLabel} total={total} />
      {mobile && <MobileMoneyTable amounts={mobile} />}
    </div>
  );
};



export default CurrencyCashTable;
