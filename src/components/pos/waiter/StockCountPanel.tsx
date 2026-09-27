/**
 * StockCountPanel — blind count. Expected qty is never shown at entry.
 * Every active tracked item (stock_qty != null) must be counted for open/close.
 * Liquids (stock_unit = 'ml') are entered as full bottles + open ml → total ml.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { useCasino } from "@/lib/casino-context";

interface TrackedItem {
  id: string;
  name: string;
  category_name: string | null;
  stock_unit: "pcs" | "ml";
  bottle_size_ml: number | null;
}

interface Props {
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  hideExpected?: boolean;
  onTotalChange?: (total: number) => void;
}

export function useTrackedStockItems(casinoId: string | null) {
  return useQuery({
    queryKey: ["pos-tracked-items", casinoId],
    enabled: !!casinoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_menu_items")
        .select("id, name, stock_unit, bottle_size_ml, pos_menu_categories(name)")
        .eq("casino_id", casinoId!)
        .eq("is_active", true)
        .not("stock_qty", "is", null)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        category_name: r.pos_menu_categories?.name ?? null,
        stock_unit: r.stock_unit === "ml" ? "ml" : "pcs",
        bottle_size_ml: r.bottle_size_ml ? Number(r.bottle_size_ml) : null,
      })) as TrackedItem[];
    },
  });
}

export const StockCountPanel = ({ value, onChange, onTotalChange }: Props) => {
  const { activeCasinoId } = useCasino();
  const [filter, setFilter] = useState("");
  const [liquid, setLiquid] = useState<Record<string, { b?: number; ml?: number }>>({});
  const { data: items = [], isLoading } = useTrackedStockItems(activeCasinoId);

  useEffect(() => { onTotalChange?.(items.length); }, [items.length, onTotalChange]);

  const grouped = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const filtered = f ? items.filter((i) => i.name.toLowerCase().includes(f)) : items;
    const map = new Map<string, TrackedItem[]>();
    for (const it of filtered) {
      const k = it.category_name || "Uncategorized";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items, filter]);

  const setVal = (id: string, n: number | null) => {
    if (n == null) {
      const { [id]: _, ...rest } = value;
      onChange(rest);
    } else onChange({ ...value, [id]: n });
  };

  const setLiquidPart = (it: TrackedItem, part: "b" | "ml", n: number | null) => {
    const cur = { ...(liquid[it.id] ?? {}), [part]: n ?? undefined };
    setLiquid({ ...liquid, [it.id]: cur });
    if (cur.b === undefined && cur.ml === undefined) return setVal(it.id, null);
    const size = it.bottle_size_ml ?? 0;
    setVal(it.id, (cur.b ?? 0) * size + (cur.ml ?? 0));
  };

  const filled = items.filter((i) => value[i.id] !== undefined).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Input placeholder="Filter items…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
        <span className={`text-xs tabular-nums ${filled === items.length ? "text-muted-foreground" : "cms-amount-negative"}`}>
          Counted {filled} / {items.length}
        </span>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading items…</p>}
      {!isLoading && items.length === 0 && <p className="text-sm text-muted-foreground italic">No tracked items in this casino.</p>}
      <div className="max-h-[40vh] overflow-y-auto rounded border border-border divide-y divide-border/40">
        {grouped.map(([cat, list]) => (
          <div key={cat}>
            <div className="px-3 py-1.5 bg-muted/40 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{cat}</div>
            {list.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="text-sm truncate flex-1">{it.name}</span>
                {it.stock_unit === "ml" && it.bottle_size_ml ? (
                  <div className="flex items-center gap-1">
                    <NumberInput decimals={0} min={0} placeholder="bottles" className="h-8 w-20 text-right font-mono no-spin"
                      value={liquid[it.id]?.b ?? ""} onValueChange={(n) => setLiquidPart(it, "b", n)} />
                    <span className="text-[10px] text-muted-foreground">× {it.bottle_size_ml} +</span>
                    <NumberInput decimals={0} min={0} placeholder="open ml" className="h-8 w-20 text-right font-mono no-spin"
                      value={liquid[it.id]?.ml ?? ""} onValueChange={(n) => setLiquidPart(it, "ml", n)} />
                  </div>
                ) : (
                  <NumberInput decimals={0} min={0} placeholder="·" className="h-8 w-24 text-right font-mono tabular-nums no-spin"
                    value={value[it.id] === undefined ? "" : value[it.id]}
                    onValueChange={(n) => { if (n == null || n >= 0) setVal(it.id, n); }} />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StockCountPanel;
