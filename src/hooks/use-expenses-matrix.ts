/**
 * Expenses matrix — categories (rows) × days of one month (columns).
 *
 * Feeds the "Expenses by category" report opened from the Expenses column of
 * Casino Monthly Balance. All figures in TZS, voided expenses excluded.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { fetchPaged } from "@/lib/fetch-paged";

export interface ExpenseItem {
  id: string;
  date: string;
  amount: number;
  description: string | null;
  wallet: string | null;
}

export interface ExpenseCategoryRow {
  code: string;
  label: string;
  /** day (YYYY-MM-DD) → amount TZS */
  byDay: Record<string, number>;
  total: number;
}

export interface ExpensesMatrix {
  rows: ExpenseCategoryRow[];
  /** `${code}|${day}` → the individual expenses behind a cell. */
  items: Record<string, ExpenseItem[]>;
  days: string[];
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const monthDays = (month: string): string[] => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
};

export const useExpensesMatrix = (month: string) => {
  const { activeCasinoId } = useCasino();
  const days = monthDays(month);
  const from = days[0];
  const to = days[days.length - 1];

  return useQuery({
    queryKey: ["expenses-matrix", activeCasinoId, month],
    enabled: !!activeCasinoId && !!month,
    staleTime: 30_000,
    queryFn: async (): Promise<ExpensesMatrix> => {
      const sb = supabase as any;
      const casino = activeCasinoId!;

      const [cats, rows, wallets] = await Promise.all([
        fetchPaged<any>((a, b) =>
          sb.from("expense_categories").select("code, label, active")
            .eq("casino_id", casino).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("expenses")
            .select("id, business_date, amount, amount_tzs, category, category_code, description, wallet_id, voided_at")
            .eq("casino_id", casino)
            .gte("business_date", from).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("fin_wallets").select("id, name").eq("casino_id", casino).range(a, b)),
      ]);

      const walletName: Record<string, string> = {};
      wallets.forEach((w: any) => { walletName[w.id] = w.name; });

      const label: Record<string, string> = {};
      cats.forEach((c: any) => { label[c.code] = c.label || titleCase(c.code); });

      const byCode: Record<string, ExpenseCategoryRow> = {};
      const items: Record<string, ExpenseItem[]> = {};

      const ensure = (code: string) =>
        (byCode[code] ??= { code, label: label[code] || titleCase(code), byDay: {}, total: 0 });

      // Every configured category is listed, even with no spend this month.
      cats.filter((c: any) => c.active !== false).forEach((c: any) => ensure(c.code));

      rows.filter((e: any) => !e.voided_at).forEach((e: any) => {
        const code = e.category_code || e.category || "other";
        const day = String(e.business_date).slice(0, 10);
        const v = e.amount_tzs != null ? num(e.amount_tzs) : num(e.amount);
        const r = ensure(code);
        r.byDay[day] = (r.byDay[day] || 0) + v;
        r.total += v;
        (items[`${code}|${day}`] ??= []).push({
          id: e.id,
          date: day,
          amount: v,
          description: e.description,
          wallet: walletName[e.wallet_id] ?? null,
        });
      });

      return {
        rows: Object.values(byCode).sort((a, b) => a.label.localeCompare(b.label)),
        items,
        days,
      };
    },
  });
};
