/**
 * Day balance snapshot — freezes the money held in the safes / bank at the
 * moment a business day is closed, so the Casino Monthly Balance row stays
 * stable even though the wallets keep moving afterwards.
 *
 * Business rule: we always close YESTERDAY. On 05/08 the day being recorded is
 * 04/08, which rolled over at 07:00 EAT. The snapshot may be re-recorded any
 * time during the current business day (upsert on casino + date).
 */
import { invalidateFinance } from "@/lib/fin-invalidate";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { businessDateOf } from "@/lib/business-day";
import { signedWalletTxTzs } from "@/lib/wallet-tx-sign";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const CAGE_KINDS = new Set(["safe", "cage_table", "cage_slot", "main_cash"]);
const isOfficeKind = (k: string) =>
  k === "cash" || k === "mobile_money" || k === "office_safe" || String(k).endsWith("_reserve");
const isBankKind = (k: string) => k === "bank" || k === "bank_account";

/** Business day currently being closed = the one before today's business day. */
export const dayToRecord = (now: Date = new Date()): string => {
  const today = businessDateOf(now.toISOString());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** Existing snapshot for a business date (null when never recorded). */
export const useDayBalanceSnapshot = (businessDate: string) => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["fin-day-balance-snapshot", activeCasinoId, businessDate],
    enabled: !!activeCasinoId && !!businessDate,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fin_day_balance_snapshot")
        .select("business_date, data, updated_at")
        .eq("casino_id", activeCasinoId)
        .eq("business_date", businessDate)
        .maybeSingle();
      if (error) throw error;
      return data as { business_date: string; data: any; updated_at: string } | null;
    },
  });
};

/**
 * Records (or overwrites) the money held at the end of a business day.
 *
 * A wallet can be recounted ten times a day: what lands in the Casino Monthly
 * Balance is the state at the moment RECORD is pressed — the last physical
 * count of every wallet on or before that business date. Once recorded, the
 * money columns of that CMB row are LOCKED: later recounts belong to the
 * current day and can no longer move a day that was already recorded.
 */
export const useRecordDayBalance = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async (businessDate: string) => {
      if (!activeCasinoId) throw new Error("No casino selected");
      const sb = supabase as any;
      const [{ data: wallets, error: wErr }, { data: counts, error: cErr }] = await Promise.all([
        sb.from("fin_wallets")
          .select("id, name, kind, currency")
          .eq("casino_id", activeCasinoId),
        sb.from("fin_wallet_counts_view_dummy_never") // placeholder replaced below
          .select("*").limit(0),
      ]);
      if (wErr) throw wErr;
      void cErr;

      const { data: snaps, error: sErr } = await sb
        .from("cash_count_snapshots")
        .select("wallet_id, physical_total, physical_total_tzs, created_at, business_date")
        .eq("casino_id", activeCasinoId)
        .lte("business_date", businessDate)
        .order("created_at", { ascending: true });
      if (sErr) throw sErr;

      /** Last physical count of each wallet on or before the recorded day. */
      const last: Record<string, { tzs: number; units: number }> = {};
      (snaps ?? []).forEach((c: any) => {
        if (!c.wallet_id) return;
        last[c.wallet_id] = {
          tzs: num(c.physical_total_tzs) || num(c.physical_total),
          units: num(c.physical_total),
        };
      });

      let cage = 0, manager = 0, bankTzs = 0, bankUsd = 0;
      const detail: any[] = [];
      (wallets ?? []).forEach((w: any) => {
        const c = last[w.id];
        const v = c?.tzs ?? 0;
        const bucket = isBankKind(w.kind) ? "bank" : isOfficeKind(w.kind) ? "office" : "cage";
        detail.push({
          name: w.name,
          kind: w.kind,
          currency: w.currency || "TZS",
          units: c?.units ?? 0,
          tzs: v,
          bucket,
          mobile: w.kind === "mobile_money" || /airtel|airtell|tigo|halo|mpesa|m-pesa|pesa/i.test(w.name || ""),
        });
        if (!c) return;
        if (bucket === "cage") cage += v;
        else if (bucket === "office") manager += v;
        else if ((w.currency || "TZS") === "TZS") bankTzs += v;
        else bankUsd += v;
      });

      const { data: auth } = await supabase.auth.getUser();
      const { data: existing } = await sb
        .from("fin_day_balance_snapshot")
        .select("data")
        .eq("casino_id", activeCasinoId)
        .eq("business_date", businessDate)
        .maybeSingle();

      const { error } = await sb.from("fin_day_balance_snapshot").upsert(
        {
          casino_id: activeCasinoId,
          business_date: businessDate,
          data: {
            ...(existing?.data || {}),
            money_locked: true,
            recorded_at: new Date().toISOString(),
            cage_casino: cage,
            cage_manager: manager,
            bank_tzs: bankTzs,
            bank_usd: bankUsd,
            money_total: cage + manager + bankTzs + bankUsd,
            money_detail: detail,
          },
          recorded_by: auth?.user?.id ?? null,
        },
        { onConflict: "casino_id,business_date" },
      );
      if (error) throw error;
      return businessDate;
    },
    onSuccess: (date) => {
      toast.success(`Balance recorded for ${date}`);
      invalidateFinance(qc);
    },
    onError: (e: any) => toast.error(e.message),
  });
};

