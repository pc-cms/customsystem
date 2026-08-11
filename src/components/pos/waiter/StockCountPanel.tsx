/**
 * StockCountPanel — embedded in HandoverShiftDialog (and reusable for open/close).
 * Bartender enters counted qty for every tracked item (stock_qty != null).
 * `expected_qty` is intentionally HIDDEN at entry time; only revealed in manager report.
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
  category_id: string | null;
  category_name: string | null;
  stock_qty: number | null;
}

interface Props {
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  hideExpected?: boolean; // always true for bartender entry
}

export const StockCountPanel = ({ value, onChange, hideExpected = true }: Props) => {
  const { activeCasinoId } = useCasino();
  const [filter, setFilter] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["pos-tracked-items", activeCasinoId],
    enabled: !!activeCasinoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_menu_items")
        .select("id, name, category_id, stock_qty, pos_categories(name)")
        .eq("casino_id", activeCasinoId!)
        .not("stock_qty", "is", null)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        category_id: r.category_id,
        category_name: r.pos_categories?.name ?? null,
        stock_qty: r.stock_qty,
      })) as TrackedItem[];
    },
  });

  // Group by category for easier counting on a long bar list.
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

  // Initialize all to blank so bartender must enter every value explicitly.
  useEffect(() => {
    if (Object.keys(value).length === 0 && items.length > 0) {
      const init: Record<string, number> = {};
      // Leave empty; not setting prevents misclick "0".
      onChange(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const filledCount = Object.keys(value).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Input
          placeholder="Filter items…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
        <span className="text-xs text-muted-foreground tabular-nums">
          {filledCount} / {items.length} counted
        </span>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading items…</p>}
      {!isLoading && items.length === 0 && (
        <p className="text-sm text-muted-foreground italic">No tracked items in this casino.</p>
      )}

      <div className="max-h-[40vh] overflow-y-auto rounded border border-border divide-y divide-border/40">
        {grouped.map(([cat, list]) => (
          <div key={cat}>
            <div className="px-3 py-1.5 bg-muted/40 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              {cat}
            </div>
            {list.map((it) => {
              const v = value[it.id];
              return (
                <div key={it.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span className="text-sm truncate flex-1">{it.name}</span>
                  {!hideExpected && (
                    <span className="font-mono text-xs text-muted-foreground tabular-nums w-12 text-right">
                      exp {it.stock_qty}
                    </span>
                  )}
                  <NumberInput
                    decimals={0}
                    min={0}
                    placeholder="·"
                    className="h-8 w-24 text-right font-mono tabular-nums no-spin"
                    value={v === undefined ? "" : v}
                    onValueChange={(n) => {
                      if (n == null) {
                        const { [it.id]: _, ...rest } = value;
                        onChange(rest);
                      } else if (n >= 0) {
                        onChange({ ...value, [it.id]: n });
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StockCountPanel;
