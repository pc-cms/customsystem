/**
 * Handover POS shift: outgoing bartender closes, incoming opens with same cash.
 *
 * Flow:
 *  1. Z-report preview of outgoing shift (read-only)
 *  2. Enter closing cash (= incoming opening cash)
 *  3. Pick incoming waiter from the list of pos_waiter users for this casino
 *  4. Pick new shift segment (auto-suggested from EAT clock)
 *  5. Confirm → calls pos_handover_shift RPC (server-side atomic)
 *
 * Server enforces: no open tabs, outgoing waiter owns the shift or pos_manager
 * is acting, and opens the new shift with opening_cash = closing_cash.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { FormField, FormGrid } from "@/components/ui/form-grid";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { formatNumberSpaces } from "@/lib/currency";
import {
  useHandoverShift,
  usePosZReportPreview,
  suggestShiftType,
  type PosShift,
  type PosShiftType,
} from "@/hooks/use-pos-shift";
import { useSavePosStockCount } from "@/hooks/use-pos-stock-counts";
import ZReportView from "./ZReportView";
import StockCountPanel from "./StockCountPanel";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  shift: PosShift | null;
  openTabsCount: number;
  casinoId: string;
}

const SEGMENTS: { value: PosShiftType; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "night", label: "Night" },
];

/** Fetch pos_waiter candidates for this casino, excluding the outgoing user. */
function useWaiterCandidates(casinoId: string | null, excludeUserId: string | null) {
  return useQuery({
    queryKey: ["pos-waiter-candidates", casinoId, excludeUserId],
    enabled: !!casinoId,
    queryFn: async () => {
      // user_roles → user_casino_access → profiles
      const { data: roleRows, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "pos_waiter");
      if (rolesErr) throw rolesErr;
      const waiterIds = Array.from(new Set((roleRows ?? []).map((r: any) => r.user_id)));
      if (waiterIds.length === 0) return [];

      const { data: accessRows, error: accessErr } = await supabase
        .from("user_casino_access")
        .select("user_id")
        .eq("casino_id", casinoId!)
        .in("user_id", waiterIds);
      if (accessErr) throw accessErr;
      const allowedIds = Array.from(new Set((accessRows ?? []).map((r: any) => r.user_id)))
        .filter((id) => id !== excludeUserId);
      if (allowedIds.length === 0) return [];

      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", allowedIds);
      if (pErr) throw pErr;
      return (profs ?? [])
        .map((p: any) => ({ id: p.user_id as string, name: (p.full_name as string) || "—" }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

export const HandoverShiftDialog = ({
  open,
  onOpenChange,
  shift,
  openTabsCount,
  casinoId,
}: Props) => {
  const handoverMut = useHandoverShift();
  const saveCountMut = useSavePosStockCount();
  const { data: preview, isLoading } = usePosZReportPreview(shift?.id ?? null, open);
  const { data: candidates = [], isLoading: candLoading } = useWaiterCandidates(
    casinoId,
    shift?.waiter_user_id ?? null,
  );

  const [closingCash, setClosingCash] = useState("0");
  const [newWaiterId, setNewWaiterId] = useState<string>("");
  const [newShiftType, setNewShiftType] = useState<PosShiftType>(suggestShiftType());
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open && preview) {
      setClosingCash(String(preview.expected_cash ?? 0));
    }
  }, [open, preview]);

  useEffect(() => {
    if (open) {
      setNewShiftType(suggestShiftType());
      setNewWaiterId("");
      setCounts({});
    }
  }, [open]);

  const previewWithCash = useMemo(
    () =>
      preview
        ? {
            ...preview,
            closing_cash: Math.round(Number(closingCash) || 0),
            cash_delta: Math.round(Number(closingCash) || 0) - preview.expected_cash,
          }
        : null,
    [preview, closingCash],
  );

  const countedItems = Object.keys(counts).length;
  const canSubmit =
    openTabsCount === 0 &&
    !!shift &&
    !!preview &&
    !!newWaiterId &&
    countedItems > 0 &&
    !handoverMut.isPending &&
    !saveCountMut.isPending;

  const handle = async () => {
    if (!shift) return;
    if (openTabsCount > 0) {
      toast({ title: "Close all open tabs first", variant: "destructive" });
      return;
    }
    if (!newWaiterId) {
      toast({ title: "Select the incoming bartender", variant: "destructive" });
      return;
    }
    if (countedItems === 0) {
      toast({ title: "Stock count required", description: "Enter at least one counted item.", variant: "destructive" });
      return;
    }
    try {
      // 1. Save stock count first — if it fails we never hand over.
      await saveCountMut.mutateAsync({
        shift_id: shift.id,
        count_type: "handover",
        items: Object.entries(counts).map(([item_id, counted_qty]) => ({ item_id, counted_qty })),
      });
      // 2. Hand over the shift.
      await handoverMut.mutateAsync({
        closing_shift_id: shift.id,
        new_waiter_user_id: newWaiterId,
        new_shift_type: newShiftType,
        closing_cash: Math.round(Number(closingCash) || 0),
      });
      toast({ title: "Shift handed over" });
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Handover failed",
        description: e?.message,
        variant: "destructive",
      });
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Handover shift"
      size="xl"
    >
      <div className="space-y-4">
        {openTabsCount > 0 && (
          <div className="rounded-md bg-cms-amount-negative/10 text-cms-amount-negative px-3 py-2 text-sm">
            {openTabsCount} open tab(s) must be closed first.
          </div>
        )}

        <FormGrid>
          <FormField span={4} label="Closing cash (= opening cash)">
            <NumberInput
              decimals={0}
              value={Number(closingCash) || 0}
              onValueChange={(v) => setClosingCash(String(v ?? 0))}
              className="text-lg"
            />
          </FormField>
          <FormField span={4} label="Expected">
            <div className="h-10 flex items-center font-mono tabular-nums">
              {preview ? formatNumberSpaces(preview.expected_cash) : "—"} TZS
            </div>
          </FormField>
          <FormField span={4} label="Incoming segment">
            <Tabs value={newShiftType} onValueChange={(v) => setNewShiftType(v as PosShiftType)}>
              <TabsList className="grid grid-cols-2 w-full">
                {SEGMENTS.map((s) => (
                  <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </FormField>

          <FormField span={12} label="Incoming bartender" required>
            <Select value={newWaiterId} onValueChange={setNewWaiterId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    candLoading
                      ? "Loading…"
                      : candidates.length === 0
                        ? "No other pos_waiter users found"
                        : "Select bartender"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              The new shift will open immediately with this cash as opening balance.
            </p>
          </FormField>
        </FormGrid>

        {isLoading && <div className="text-sm text-muted-foreground">Computing report…</div>}
        {previewWithCash && <ZReportView z={previewWithCash} />}

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-semibold">
              Stock count · handover
            </p>
            <span className="text-[10px] text-muted-foreground">
              Enter actual shelf qty per item. Expected qty is hidden — variance goes to manager report.
            </span>
          </div>
          <StockCountPanel value={counts} onChange={setCounts} />
        </div>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handle} disabled={!canSubmit}>
            {saveCountMut.isPending
              ? "Saving count…"
              : handoverMut.isPending
                ? "Handing over…"
                : "Confirm handover"}
          </Button>
        </ResponsiveDialogFooter>
      </div>
    </ResponsiveDialog>
  );
};

export default HandoverShiftDialog;
