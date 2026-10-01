import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";

/** True when [from, to] is exactly one calendar month. */
export const isWholeMonth = (from: string, to: string) => {
  if (!from?.endsWith("-01") || from.slice(0, 7) !== to?.slice(0, 7)) return false;
  const [y, m] = from.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return Number(to.slice(8, 10)) === last;
};

/** Opening balance (START) of a ledger source = net of everything before the month. */
export const useFinCarry = (source: "tips" | "jp", from: string, to: string) => {
  const { activeCasinoId: casinoId } = useCasino();
  const whole = isWholeMonth(from, to);
  const q = useQuery({
    queryKey: ["other-incomes", "carry", source, casinoId, from],
    enabled: !!casinoId && whole,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fin_carry", {
        p_casino_id: casinoId,
        p_month_start: from,
        p_source: source,
      });
      if (error) throw error;
      return Number(data || 0);
    },
  });
  return { whole, start: q.data ?? 0 };
};
