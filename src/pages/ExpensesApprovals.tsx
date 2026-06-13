/**
 * Expenses approval queue (Manager / Shift Manager / Finance / Super Admin).
 *
 * Unified view of pending expenses from BOTH cages:
 *   • Live Game (cage_type='live_game')  — submitted by Cashier Live
 *   • Slots     (cage_type='slots')      — submitted by Cashier Slots
 *
 * Each row shows: From (submitter display name), Source badge (Live/Slots),
 * Category, Target, Amount, Description, and Approve/Cancel actions.
 */
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt, CheckCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useApproveExpense, useDeleteExpense } from "@/hooks/use-expenses";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/LoadingSkeletons";
import { formatCurrency } from "@/lib/currency";
import { fmtDateTime } from "@/lib/format-date";

const CAT_COLORS: Record<string, string> = {
  food: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  alcohol: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",
  taxi: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400",
  hotel: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  flight: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  other: "bg-muted text-muted-foreground",
};

type PendingRow = {
  id: string;
  cage_type: "live_game" | "slots" | null;
  category: string;
  amount: number;
  description: string | null;
  created_at: string;
  created_by: string | null;
  player_name: string | null;
  players: { first_name: string; last_name: string } | null;
  submitter_name: string;
};

const usePendingExpenses = () => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["expenses-approvals", casinoId],
    queryFn: async (): Promise<PendingRow[]> => {
      if (!casinoId) return [];
      const { data, error } = await supabase
        .from("expenses")
        .select("*, players(first_name, last_name)")
        .eq("casino_id", casinoId)
        .eq("approved", false)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = (data || []) as any[];

      const userIds = Array.from(new Set(rows.map(r => r.created_by).filter(Boolean)));
      let nameById = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        nameById = new Map((profs || []).map((p: any) => [p.user_id, p.display_name || "—"]));
      }

      return rows.map(r => ({
        ...r,
        submitter_name: r.created_by ? (nameById.get(r.created_by) || "—") : "—",
      })) as PendingRow[];
    },
    enabled: !!casinoId,
    staleTime: 1000 * 30,
  });
};

const ExpensesApprovals = () => {
  const { data: rows = [], isLoading } = usePendingExpenses();
  const approve = useApproveExpense();
  const del = useDeleteExpense();
  const qc = useQueryClient();

  const totals = useMemo(() => {
    const sum = (cage: "live_game" | "slots") =>
      rows.filter(r => r.cage_type === cage).reduce((a, r) => a + Number(r.amount || 0), 0);
    return {
      live: sum("live_game"),
      slots: sum("slots"),
      liveCount: rows.filter(r => r.cage_type === "live_game").length,
      slotsCount: rows.filter(r => r.cage_type === "slots").length,
    };
  }, [rows]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["expenses-approvals"] });
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["expenses-slots"] });
  };

  return (
    <div>
      <PageHeader
        icon={Receipt}
        title="Expenses Approvals"
        subtitle={`${rows.length} pending · Live ${totals.liveCount} · Slots ${totals.slotsCount}`}
      />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="cms-panel p-3">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Pending Total</p>
          <p className="font-mono text-lg font-bold text-accent">{formatCurrency(totals.live + totals.slots)}</p>
        </div>
        <div className="cms-panel p-3">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Live Game</p>
          <p className="font-mono text-lg font-bold text-card-foreground">{formatCurrency(totals.live)}</p>
        </div>
        <div className="cms-panel p-3">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Slots</p>
          <p className="font-mono text-lg font-bold text-card-foreground">{formatCurrency(totals.slots)}</p>
        </div>
      </div>

      <div className="cms-panel overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-3 py-2">Time</th>
              <th className="text-left px-3 py-2">From</th>
              <th className="text-left px-3 py-2">Source</th>
              <th className="text-left px-3 py-2">Category</th>
              <th className="text-left px-3 py-2">Target</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-left px-3 py-2">Description</th>
              <th className="text-center px-3 py-2 w-[160px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="p-2"><TableSkeleton rows={4} cols={8} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-muted-foreground text-sm py-10">
                <CheckCircle className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" />
                No pending expenses
              </td></tr>
            ) : rows.map(exp => (
              <tr key={exp.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">
                  {fmtDateTime(exp.created_at)}
                </td>
                <td className="px-3 py-2 text-sm text-card-foreground">{exp.submitter_name}</td>
                <td className="px-3 py-2">
                  {exp.cage_type === "slots" ? (
                    <Badge variant="outline" className="text-[10px] border-purple-500/40 text-purple-600 dark:text-purple-400">Slots</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-600 dark:text-blue-400">Live</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${CAT_COLORS[exp.category] || CAT_COLORS.other}`}>
                    {exp.category}
                  </span>
                </td>
                <td className="px-3 py-2 text-sm text-muted-foreground">
                  {exp.players ? `${exp.players.first_name} ${exp.players.last_name}` : (exp.player_name || "Casino")}
                </td>
                <td className="px-3 py-2 text-right font-mono text-sm cms-amount-negative">
                  {formatCurrency(Number(exp.amount))}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{exp.description || "—"}</td>
                <td className="px-3 py-2 text-center">
                  <div className="inline-flex gap-1">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        approve.mutate(exp.id, {
                          onSuccess: invalidate,
                          onError: (e: any) => toast.error(e?.message || "Failed"),
                        })
                      }
                      disabled={approve.isPending}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() =>
                        del.mutate(
                          { id: exp.id, amount: Number(exp.amount), category: exp.category },
                          { onSuccess: invalidate },
                        )
                      }
                      title="Cancel expense"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExpensesApprovals;
