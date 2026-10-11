/**
 * MoveTableChips — move chips between two closed tables' float baseline.
 * Total casino float stays unchanged. Server RPC `move_table_chips` enforces
 * roles, same casino, both tables closed and no negative balances.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGamingTables } from "@/hooks/use-casino-data";
import { useChipBaseline } from "@/hooks/use-table-lifecycle";
import { useChipColors, resolveChipColor, useVisibleChipDenoms } from "@/hooks/use-chip-colors";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatChipLabel, formatCurrency } from "@/lib/currency";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const MoveTableChips = () => {
  const qc = useQueryClient();
  const { data: tables = [] } = useGamingTables();
  const { data: baseline = [] } = useChipBaseline();
  const { data: chipColorOverrides } = useChipColors();
  const visibleDenoms = useVisibleChipDenoms();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [qty, setQty] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);

  const active = useMemo(
    () => tables.filter((t: any) => !t.is_archived).sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.name.localeCompare(b.name)),
    [tables],
  );
  const qtyOf = (tableId: string, d: number) =>
    Number(baseline.find(b => b.location_type === "table" && b.location_id === tableId && Number(b.denomination) === d)?.expected_quantity ?? 0);

  const from = active.find((t: any) => t.id === fromId);
  const to = active.find((t: any) => t.id === toId);
  const anyOpen = from?.status === "open" || to?.status === "open";
  const denoms = [...visibleDenoms].sort((a, b) => b - a);
  const total = denoms.reduce((s, d) => s + (qty[d] || 0) * d, 0);
  const overdraw = !!fromId && denoms.some(d => (qty[d] || 0) > qtyOf(fromId, d));
  const canSave = !!from && !!to && fromId !== toId && total > 0 && !overdraw && !anyOpen && !saving;

  const save = async () => {
    setSaving(true);
    const chips: Record<string, number> = {};
    denoms.forEach(d => { if (qty[d]) chips[String(d)] = qty[d]; });
    const { error } = await (supabase as any).rpc("move_table_chips", { p_from: fromId, p_to: toId, p_chips: chips });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Moved ${formatCurrency(total)} from ${from?.name} to ${to?.name}`);
    setQty({});
    qc.invalidateQueries({ queryKey: ["chip-baseline"] });
  };

  const tableSelect = (value: string, onChange: (v: string) => void, exclude: string) => (
    <Select value={value} onValueChange={(v) => { onChange(v); setQty({}); }}>
      <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Select table" /></SelectTrigger>
      <SelectContent>
        {active.filter((t: any) => t.id !== exclude).map((t: any) => (
          <SelectItem key={t.id} value={t.id}>{t.name}{t.status === "open" ? " · open" : ""}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">Move Chips Between Tables</h2>
        <p className="text-xs text-muted-foreground">Total casino float does not change. Allowed only before tables are opened on Pit.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {tableSelect(fromId, setFromId, toId)}
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
        {tableSelect(toId, setToId, fromId)}
      </div>

      {anyOpen && (
        <div className="cms-panel p-3 flex items-center gap-2 text-xs text-warning">
          <AlertTriangle className="w-4 h-4" /> One of the tables is open. Chips can only be moved before tables are opened.
        </div>
      )}

      {from && to && (
        <div className="cms-panel overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium">Denom</th>
                <th className="text-right py-2 px-3 font-medium">{from.name} now</th>
                <th className="text-center py-2 px-3 font-medium">Move qty</th>
                <th className="text-right py-2 px-3 font-medium">{from.name} after</th>
                <th className="text-right py-2 px-3 font-medium">{to.name} now</th>
                <th className="text-right py-2 px-3 font-medium">{to.name} after</th>
              </tr>
            </thead>
            <tbody>
              {denoms.map(d => {
                const f = qtyOf(fromId, d), t = qtyOf(toId, d), m = qty[d] || 0;
                const c = resolveChipColor(d, chipColorOverrides);
                return (
                  <tr key={d} className="border-b border-border last:border-0">
                    <td className="py-1 px-3">
                      <span className="cms-chip-token" style={{ "--chip-bg": c.bg, "--chip-edge": c.edge, "--chip-text": c.text } as CSSProperties}>{formatChipLabel(d)}</span>
                    </td>
                    <td className="py-1 px-3 text-right font-mono">{f || "·"}</td>
                    <td className="py-1 px-3">
                      <NumberInput
                        min={0}
                        value={m || ""}
                        onValueChange={(v) => setQty(p => ({ ...p, [d]: v == null ? 0 : Math.max(0, Math.floor(Number(v))) }))}
                        disabled={anyOpen || f === 0}
                        className="w-16 h-7 rounded text-[11px] font-mono text-center border border-border bg-background mx-auto block disabled:opacity-50"
                        placeholder="0"
                      />
                    </td>
                    <td className={`py-1 px-3 text-right font-mono ${m > f ? "cms-amount-negative" : ""}`}>{m ? f - m : (f || "·")}</td>
                    <td className="py-1 px-3 text-right font-mono">{t || "·"}</td>
                    <td className="py-1 px-3 text-right font-mono">{m ? t + m : (t || "·")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="cms-panel p-3 inline-flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground uppercase">Moving</span>
          <span className="font-mono text-lg font-bold text-primary">{formatCurrency(total)}</span>
        </div>
        <Button size="sm" onClick={save} disabled={!canSave}>{saving ? "Moving…" : "Move Chips"}</Button>
      </div>
      {overdraw && <p className="text-xs cms-amount-negative">Not enough chips on {from?.name}.</p>}
    </div>
  );
};

export default MoveTableChips;
