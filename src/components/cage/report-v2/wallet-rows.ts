/**
 * Report row labels sourced from the casino wallet registry (Office > Wallets),
 * so printed cash-desk reports use exactly the same names and grouping
 * (CASH -> BANKS -> MOBILE MONEY) as the wallets screen.
 *
 * Office-only wallets (safes, digital wallets, Selcom float) never appear on
 * cash-desk reports.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BANK_CHANNELS } from "@/components/cage/CageHelpers";

export type ReportRowDef = { key: string; label: string };

/** Canonical cashless provider key used by every report block. */
export const normalizeProviderKey = (raw: string | null | undefined): string => {
  const k = String(raw || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!k) return "";
  if (k.startsWith("AIR")) return "AIRTEL";
  if (k.startsWith("TIGO") || k.startsWith("TPESA") || k.startsWith("MIX")) return "TIGO";
  if (k.startsWith("HAL")) return "HALOTEL";
  if (k.startsWith("MAIN")) return "MAINPHONE";
  if (k.includes("PESA")) return "MPESA";
  return k;
};

/** Re-key a provider map onto canonical keys, summing collisions. */
export const normalizeProviderMap = (
  m: Record<string, number> | null | undefined,
): Record<string, number> => {
  const out: Record<string, number> = {};
  Object.entries(m || {}).forEach(([k, v]) => {
    const key = normalizeProviderKey(k);
    if (!key) return;
    out[key] = (out[key] || 0) + Number(v || 0);
  });
  return out;
};

/** Bank channel key used in the cashdesk snapshots, derived from a wallet code. */
const bankKeyOfCode = (code: string) => code.replace(/^BANK_/, "");

const DEFAULT_BANKS: ReportRowDef[] = BANK_CHANNELS.map(c => ({
  key: c.key,
  label: `${c.bank} ${c.currency}`,
}));

const DEFAULT_PROVIDERS: ReportRowDef[] = [
  { key: "MPESA", label: "M-Pesa" },
  { key: "TIGO", label: "Tigo Pesa" },
  { key: "HALOTEL", label: "HaloPesa" },
  { key: "AIRTEL", label: "Airtel Money" },
];

export type ReportWallets = {
  banks: ReportRowDef[];
  providers: ReportRowDef[];
};

/** Wallet-driven labels for the Bank Accounts and Cashless report blocks. */
export const useReportWallets = (casinoId: string | null | undefined): ReportWallets => {
  const { data } = useQuery({
    queryKey: ["report-wallets", casinoId],
    enabled: !!casinoId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("fin_wallets")
        .select("name, canonical_code, wallet_group, kind, currency, is_active")
        .eq("casino_id", casinoId as string)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const rows = (data || []) as Array<{
    name: string; canonical_code: string | null; wallet_group: string | null; kind: string | null;
  }>;

  const banks: ReportRowDef[] = [];
  const providers: ReportRowDef[] = [];
  rows.forEach(w => {
    const code = w.canonical_code || "";
    const group = w.wallet_group || "";
    const kind = w.kind || "";
    if (group === "banks" || kind === "bank" || (kind === "selcom" && code !== "SELCOM_FLOAT_TZS")) {
      if (!code || code === "SELCOM_FLOAT_TZS") return;
      banks.push({ key: bankKeyOfCode(code), label: w.name });
      return;
    }
    if (group === "mobile_money" || kind === "mobile_money") {
      const key = normalizeProviderKey(code.replace(/^MM_/, "").replace(/_TZS$/, "") || w.name);
      if (key) providers.push({ key, label: w.name });
    }
  });

  const dedupe = (list: ReportRowDef[]) => {
    const seen = new Set<string>();
    return list.filter(r => (seen.has(r.key) ? false : (seen.add(r.key), true)));
  };

  return {
    banks: banks.length ? dedupe(banks) : DEFAULT_BANKS,
    providers: providers.length ? dedupe(providers) : DEFAULT_PROVIDERS,
  };
};

/** Append rows present in the data but missing from the wallet registry. */
export const withExtraKeys = (
  base: ReportRowDef[],
  ...maps: Array<Record<string, unknown> | null | undefined>
): ReportRowDef[] => {
  const extra = new Set<string>();
  maps.forEach(m => Object.keys(m || {}).forEach(k => {
    if (!base.some(b => b.key === k)) extra.add(k);
  }));
  return [...base, ...[...extra].map(k => ({ key: k, label: k.replace(/_/g, " ") }))];
};
