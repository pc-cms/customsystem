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
 * Records (or overwrites) the safes / bank balances as of the end of a business
 * day. Cage figures are NOT stored — they already come from the immutable shift
 * closing counts.
 */
export const useRecordDayBalance = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async (businessDate: string) => {
      if (!activeCasinoId) throw new Error("No casino selected");
      const sb = supabase as any;
      const [{ data: wallets, error: wErr }, { data: tx, error: tErr }] = await Promise.all([
        sb.from("fin_wallets")
          .select("id, kind, currency, starting_float_amount, starting_float_date")
          .eq("casino_id", activeCasinoId),
        sb.from("fin_wallet_tx")
          .select("wallet_id, kind, amount, amount_tzs")
          .eq("casino_id", activeCasinoId)
          .not("posted_at", "is", null)
          .lte("business_date", businessDate),
      ]);
      if (wErr) throw wErr;
      if (tErr) throw tErr;

      const byId: Record<string, any> = {};
      let manager = 0, bankTzs = 0, bankUsd = 0;
      (wallets ?? []).forEach((w: any) => {
        byId[w.id] = w;
        const floatDate = w.starting_float_date ? String(w.starting_float_date).slice(0, 10) : "";
        if (!num(w.starting_float_amount) || (floatDate && floatDate > businessDate)) return;
        const v = num(w.starting_float_amount);
        if (isOfficeKind(w.kind)) manager += v;
        else if (isBankKind(w.kind)) {
          if ((w.currency || "TZS") === "TZS") bankTzs += v; else bankUsd += v;
        }
      });
      (tx ?? []).forEach((t: any) => {
        const w = byId[t.wallet_id];
        if (!w) return;
        const v = signedWalletTxTzs(t);
        if (isOfficeKind(w.kind)) manager += v;
        else if (isBankKind(w.kind)) {
          if ((w.currency || "TZS") === "TZS") bankTzs += v; else bankUsd += v;
        } else if (CAGE_KINDS.has(w.kind)) {
          // cage wallets are informational here — the report uses closing counts
        }
      });

      const { data: auth } = await supabase.auth.getUser();
      const { error } = await sb.from("fin_day_balance_snapshot").upsert(
        {
          casino_id: activeCasinoId,
          business_date: businessDate,
          data: { cage_manager: manager, bank_tzs: bankTzs, bank_usd: bankUsd },
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
