/**
 * Immutable printable-report snapshots.
 *
 * Canon: once a shift is closed, its printed pack must never change. Every
 * figure of the 4-sheet pack is frozen once into `report_snapshots` and every
 * later preview / print / reprint renders that stored payload — no live
 * recomputation, so preview and paper can never disagree.
 *
 * Rows in `report_snapshots` cannot be updated or deleted (DB trigger). A
 * re-closed shift simply gets a new revision; the old one stays in history.
 */
import { supabase } from "@/integrations/supabase/client";
import { BANK_CHANNELS } from "@/components/cage/CageHelpers";
import type { LiveShiftReportData } from "@/components/cage/report-v2/use-live-shift-report-data";
import { loadLiveShiftReportData } from "@/components/cage/report-v2/use-live-shift-report-data";
import type { ReportWallets } from "@/components/cage/report-v2/wallet-rows";
import { normalizeProviderKey } from "@/components/cage/report-v2/wallet-rows";
import { CHIP_DENOMS } from "@/lib/currency";

export type SnapshotType = "live_closing" | "slots_closing" | "chips_movement" | "total_closing";

export type LiveReportFrozen = LiveShiftReportData & { wallets: ReportWallets };

export type ChipsReportFrozen = {
  fillByDenom: Record<number, number>;
  creditByDenom: Record<number, number>;
  denoms: number[];
};

export type TotalReportFrozen = {
  data: any;
  wallets: ReportWallets;
};

const DEFAULT_BANKS = BANK_CHANNELS.map(c => ({ key: c.key, label: `${c.bank} ${c.currency}` }));
const DEFAULT_PROVIDERS = [
  { key: "MPESA", label: "M-Pesa" },
  { key: "TIGO", label: "Tigo Pesa" },
  { key: "HALOTEL", label: "HaloPesa" },
  { key: "AIRTEL", label: "Airtel Money" },
];

const bankKeyOfCode = (code: string) => code.replace(/^BANK_/, "");

/** Wallet registry rows, resolved once so printed labels stay frozen too. */
export const loadReportWallets = async (casinoId: string): Promise<ReportWallets> => {
  const { data } = await supabase
    .from("fin_wallets")
    .select("name, canonical_code, wallet_group, kind, currency, is_active")
    .eq("casino_id", casinoId)
    .eq("is_active", true)
    .order("name");

  const banks: Array<{ key: string; label: string }> = [];
  const providers: Array<{ key: string; label: string }> = [];
  (data || []).forEach((w: any) => {
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

  const dedupe = <T extends { key: string }>(list: T[]) => {
    const seen = new Set<string>();
    return list.filter(r => (seen.has(r.key) ? false : (seen.add(r.key), true)));
  };

  return {
    banks: banks.length ? dedupe(banks) : DEFAULT_BANKS,
    providers: providers.length ? dedupe(providers) : DEFAULT_PROVIDERS,
  };
};

/** Fill / credit chips per denomination for one Live Game shift. */
export const loadChipsMovementData = async (
  shiftId: string,
  denoms: number[] = CHIP_DENOMS as unknown as number[],
): Promise<ChipsReportFrozen> => {
  const { data } = await supabase
    .from("cage_transfers")
    .select("transfer_type, chips")
    .eq("shift_id", shiftId)
    .in("transfer_type", ["fill", "credit"]);

  const fillByDenom: Record<number, number> = {};
  const creditByDenom: Record<number, number> = {};
  (data || []).forEach((r: any) => {
    const target = r.transfer_type === "fill" ? fillByDenom : creditByDenom;
    Object.entries((r.chips || {}) as Record<string, number>).forEach(([d, q]) => {
      target[Number(d)] = (target[Number(d)] || 0) + (Number(q) || 0);
    });
  });

  return { fillByDenom, creditByDenom, denoms };
};

type SnapshotRow = {
  id: string;
  revision: number;
  captured_at: string;
  payload: any;
};

/** Latest (current) snapshot for a report, or null when never frozen. */
export const fetchSnapshot = async (
  casinoId: string,
  reportType: SnapshotType,
  sourceKey: string,
): Promise<SnapshotRow | null> => {
  const { data } = await supabase
    .from("report_snapshots")
    .select("id, revision, captured_at, payload")
    .eq("casino_id", casinoId)
    .eq("report_type", reportType)
    .eq("source_key", sourceKey)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SnapshotRow | null) ?? null;
};

export const saveSnapshot = async (args: {
  casinoId: string;
  reportType: SnapshotType;
  sourceKey: string;
  businessDate: string;
  asOf?: string | null;
  payload: any;
}): Promise<SnapshotRow | null> => {
  const { data, error } = await supabase
    .from("report_snapshots")
    .insert({
      casino_id: args.casinoId,
      report_type: args.reportType,
      source_key: args.sourceKey,
      business_date: args.businessDate,
      as_of: args.asOf ?? null,
      payload: args.payload,
    } as any)
    .select("id, revision, captured_at, payload")
    .maybeSingle();
  if (error) {
    console.warn("[report-snapshots] failed to freeze report", args.reportType, error);
    return null;
  }
  return (data as SnapshotRow | null) ?? null;
};

/**
 * Read the frozen payload, or freeze it now from live data (used both when a
 * shift is closed and for the one-time backfill of already-closed shifts).
 */
export const getOrCreateSnapshot = async <T>(args: {
  casinoId: string;
  reportType: SnapshotType;
  sourceKey: string;
  businessDate: string;
  asOf?: string | null;
  /** Only freeze when the underlying period is final. */
  freeze: boolean;
  build: () => Promise<T>;
}): Promise<{ payload: T; frozen: boolean; revision: number | null; capturedAt: string | null }> => {
  const existing = await fetchSnapshot(args.casinoId, args.reportType, args.sourceKey);
  if (existing) {
    return {
      payload: existing.payload as T,
      frozen: true,
      revision: existing.revision,
      capturedAt: existing.captured_at,
    };
  }

  const payload = await args.build();
  if (!args.freeze) return { payload, frozen: false, revision: null, capturedAt: null };

  const saved = await saveSnapshot({ ...args, payload });
  return {
    payload: (saved?.payload as T) ?? payload,
    frozen: !!saved,
    revision: saved?.revision ?? null,
    capturedAt: saved?.captured_at ?? null,
  };
};

/** Build (not save) the Live Game sheet payload for a shift. */
export const buildLiveReportPayload = async (opts: {
  casinoId: string;
  shiftId: string;
  businessDate: string;
  tables: Array<{ id: string; name: string; is_archived?: boolean | null }>;
}): Promise<LiveReportFrozen> => {
  const [data, wallets] = await Promise.all([
    loadLiveShiftReportData(opts),
    loadReportWallets(opts.casinoId),
  ]);
  return { ...data, wallets };
};
