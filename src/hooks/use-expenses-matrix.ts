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
  /** Budget group (fin_categories.group_code), e.g. fixed / variable / salary. */
  group?: string;
  /** Main category code (fin_main_categories.code) or "unallocated". */
  mainCode: string;
  /** day (YYYY-MM-DD) → amount TZS */
  byDay: Record<string, number>;
  total: number;
}

export interface ExpenseMainCategory {
  code: string;
  label: string;
  sortOrder: number;
}

export interface ExpensesMatrix {
  rows: ExpenseCategoryRow[];
  /** Fixed list of main categories (+ trailing Unallocated). */
  mains: ExpenseMainCategory[];
  /** `${code}|${day}` → the individual expenses behind a cell. */
  items: Record<string, ExpenseItem[]>;
  days: string[];
}

export const UNALLOCATED = "unallocated";


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

/** Expense scope: casino floor (live + slots) vs head office. */
export type ExpenseScope = "all" | "casino" | "office";

export const useExpensesMatrix = (
  month: string,
  scope: ExpenseScope = "all",
  enabled = true,
) => {
  const { activeCasinoId } = useCasino();
  const days = monthDays(month);
  const from = days[0];
  const to = days[days.length - 1];

  return useQuery({
    queryKey: ["expenses-matrix", activeCasinoId, month, scope],
    enabled: enabled && !!activeCasinoId && !!month,
    staleTime: 30_000,
    queryFn: async (): Promise<ExpensesMatrix> => {
      const sb = supabase as any;
      const casino = activeCasinoId!;

      const [finCats, cats, rows, wallets] = await Promise.all([
        fetchPaged<any>((a, b) =>
          sb.from("fin_categories")
            .select("id, name, group_code, group_name, sort_order, is_income, is_active")
            .range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("expense_categories").select("code, label, active")
            .eq("casino_id", casino).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("expenses")
            .select("id, business_date, amount, amount_tzs, category, category_code, fin_category_id, description, wallet_id, voided_at, source")
            .eq("casino_id", casino)
            .gte("business_date", from).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("fin_wallets").select("id, name").eq("casino_id", casino).range(a, b)),
      ]);

      const walletName: Record<string, string> = {};
      wallets.forEach((w: any) => { walletName[w.id] = w.name; });

      const label: Record<string, string> = {};
      cats.forEach((c: any) => { label[c.code] = c.label || titleCase(c.code); });

      /** Budget categories (fin_categories, expense side) drive the row list. */
      const budget: Record<string, any> = {};
      finCats.forEach((c: any) => { budget[c.id] = c; });

      const byCode: Record<string, ExpenseCategoryRow> = {};
      const items: Record<string, ExpenseItem[]> = {};
      const order: Record<string, number> = {};

      const ensure = (code: string, name?: string, group?: string, sort?: number) => {
        const r = (byCode[code] ??= { code, label: name || label[code] || titleCase(code), group, byDay: {}, total: 0 });
        if (name) r.label = name;
        if (group) r.group = group;
        if (sort != null) order[code] = sort;
        return r;
      };

      const GROUPS = ["salary", "fixed", "variable", "petrol", "tax", "additional", "collections"];
      // Every budget category is listed, even with no spend this month.
      finCats
        .filter((c: any) => c.is_income === false && c.is_active !== false)
        .forEach((c: any) => {
          const gi = GROUPS.indexOf(c.group_code);
          ensure(c.id, c.name, c.group_code, (gi < 0 ? GROUPS.length : gi) * 1000 + (c.sort_order ?? 0));
        });

      const inScope = (e: any) =>
        scope === "all" ? true
          : scope === "office" ? e.source === "office"
            : e.source !== "office";

      rows.filter((e: any) => !e.voided_at && inScope(e)).forEach((e: any) => {
        const fin = e.fin_category_id ? budget[e.fin_category_id] : null;
        const code = fin ? String(fin.id) : (e.category_code || e.category || "other");
        const day = String(e.business_date).slice(0, 10);
        const v = e.amount_tzs != null ? num(e.amount_tzs) : num(e.amount);
        const r = fin ? ensure(fin.id, fin.name, fin.group_code) : ensure(code);
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
        rows: Object.values(byCode).sort((a, b) => {
          const oa = order[a.code] ?? 999_999;
          const ob = order[b.code] ?? 999_999;
          return oa !== ob ? oa - ob : a.label.localeCompare(b.label);
        }),
        items,
        days,
      };
    },
  });
};
