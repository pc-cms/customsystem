/**
 * Universal money drill — every money column of the Casino Monthly Balance
 * (Cage Casino / Cage Manager / Bank / Money) opens the SAME panel:
 *
 *   CASH            TZS / USD / EUR / GBP / KES
 *   MOBILE MONEY    AirTell / Tigo / Halo / M-Pesa (+ Other)
 *   BANK            per account
 *
 * Every figure comes from one source only — the last physical wallet count on
 * or before the report date — so the panel total always equals the cell.
 */
import DrillTable, { DrillRow } from "@/components/reports/DrillTable";
import type { MoneyWallet, MoneyBucket } from "@/hooks/use-daily-balance-report";

const CURRENCIES = ["TZS", "USD", "EUR", "GBP", "KES"];
const PROVIDERS = ["AirTell", "Tigo", "Halo", "M-Pesa"];

/** Provider names are written differently per casino — normalise to 4 channels. */
const providerOf = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("airtel")) return "AirTell";
  if (n.includes("tigo")) return "Tigo";
  if (n.includes("halo")) return "Halo";
  if (n.includes("pesa")) return "M-Pesa";
  return "Other";
};

const MoneyDrill = ({
  wallets,
  buckets,
  currency,
  totalLabel,
  total,
}: {
  wallets: MoneyWallet[];
  /** Which money buckets belong to the clicked column. */
  buckets: MoneyBucket[];
  /** Bank columns only: keep TZS ("TZS") or every other currency ("FX"). */
  currency?: "TZS" | "FX";
  totalLabel: string;
  total: number;
}) => {
  const list = wallets.filter((w) => {
    if (!buckets.includes(w.bucket)) return false;
    if (!currency) return true;
    const isTzs = (w.currency || "TZS") === "TZS";
    return currency === "TZS" ? isTzs : !isTzs;
  });

  const cash = list.filter((w) => !w.mobile && w.bucket !== "bank");
  const mobile = list.filter((w) => w.mobile && w.bucket !== "bank");
  const bank = list.filter((w) => w.bucket === "bank");

  const cashRows: DrillRow[] = CURRENCIES.map((cur) => {
    const rows = cash.filter((w) => (w.currency || "TZS") === cur);
    const units = rows.reduce((s, w) => s + w.units, 0);
    const tzs = rows.reduce((s, w) => s + w.tzs, 0);
    return { label: cur, units, rate: cur === "TZS" ? 1 : units ? tzs / units : 0, tzs };
  });
  // Currencies that exist in the casino but are not in the fixed list.
  cash
    .filter((w) => !CURRENCIES.includes(w.currency || "TZS"))
    .forEach((w) => cashRows.push({ label: w.currency, units: w.units, tzs: w.tzs }));

  const mobileNames = [...PROVIDERS, "Other"];
  const mobileRows: DrillRow[] = mobileNames
    .map((p) => {
      const rows = mobile.filter((w) => providerOf(w.name) === p);
      const tzs = rows.reduce((s, w) => s + w.tzs, 0);
      return { label: p, units: tzs, rate: 1, tzs };
    })
    .filter((r) => r.label !== "Other" || r.tzs !== 0);

  const bankRows: DrillRow[] = bank.map((w) => ({
    label: w.name,
    units: w.units || w.tzs,
    rate: (w.currency || "TZS") === "TZS" ? 1 : w.units ? w.tzs / w.units : 0,
    tzs: w.tzs,
  }));

  const cashTotal = cashRows.reduce((s, r) => s + r.tzs, 0);
  const mobileTotal = mobileRows.reduce((s, r) => s + r.tzs, 0);

  return (
    <div className="space-y-3">
      {!!cash.length && (
        <DrillTable title="Cash" rows={cashRows} totalLabel="Cash" total={cashTotal} />
      )}
      {!!mobile.length && (
        <DrillTable
          title="Mobile money"
          rows={mobileRows}
          totalLabel="Mobile money"
          total={mobileTotal}
        />
      )}
      {!!bank.length && (
        <DrillTable
          title="Bank"
          rows={bankRows}
          totalLabel="Bank"
          total={bankRows.reduce((s, r) => s + r.tzs, 0)}
        />
      )}
      <DrillTable
        title="Summary"
        rows={[
          { label: "Cash", units: cashTotal, rate: 1, tzs: cashTotal },
          { label: "Mobile money", units: mobileTotal, rate: 1, tzs: mobileTotal },
          ...(bank.length
            ? [{
                label: "Bank",
                units: bankRows.reduce((s, r) => s + r.tzs, 0),
                rate: 1,
                tzs: bankRows.reduce((s, r) => s + r.tzs, 0),
              }]
            : []),
        ]}
        totalLabel={totalLabel}
        total={total}
      />
    </div>
  );
};

export default MoneyDrill;
