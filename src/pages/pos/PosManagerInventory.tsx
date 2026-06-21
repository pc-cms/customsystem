/**
 * POS Manager → Inventory.
 * - Lists tracked items (stock_qty IS NOT NULL).
 * - Filters: All / Low / Out.
 * - Per-row "Move" opens stock-in/out dialog.
 * - Side panel: recent movements (audit log, append-only).
 */
import { useMemo, useState } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { useCasino } from "@/lib/casino-context";
import { usePosMenuItems, usePosMenuCategories, type PosMenuItem } from "@/hooks/use-pos-menu";
import { usePosInventoryRecent, stockStatus, type StockStatus } from "@/hooks/use-pos-inventory";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateTime } from "@/lib/format-date";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import StockMovementDialog from "@/components/pos/StockMovementDialog";

type Filter = "all" | "low" | "out";

const STATUS_VARIANT: Record<StockStatus, "secondary" | "destructive" | "outline"> = {
  ok: "outline",
  low: "secondary",
  out: "destructive",
  untracked: "outline",
};

const STATUS_LABEL: Record<StockStatus, string> = {
  ok: "OK",
  low: "Low",
  out: "Out",
  untracked: "—",
};

export default function PosManagerInventory() {
  const { activeCasinoId } = useCasino();
  const { data: items = [], isLoading } = usePosMenuItems(activeCasinoId);
  const { data: categories = [] } = usePosMenuCategories(activeCasinoId);
  const { data: recent = [] } = usePosInventoryRecent(activeCasinoId, 30);

  const [filter, setFilter] = useSessionState<Filter>("filter", "all");
  const [search, setSearch] = useSessionState("search", "");
  const [moveItem, setMoveItem] = useState<PosMenuItem | null>(null);

  const catName = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items
      .filter((i) => i.is_active && i.stock_qty != null)
      .filter((i) => !s || i.name.toLowerCase().includes(s))
      .map((i) => ({ ...i, status: stockStatus(i.stock_qty, i.low_threshold) }))
      .filter((i) => filter === "all" || i.status === filter)
      .sort((a, b) => {
        const order: Record<StockStatus, number> = { out: 0, low: 1, ok: 2, untracked: 3 };
        return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
      });
  }, [items, search, filter]);

  const counts = useMemo(() => {
    const c = { all: 0, low: 0, out: 0 };
    for (const i of items) {
      if (!i.is_active || i.stock_qty == null) continue;
      c.all++;
      const st = stockStatus(i.stock_qty, i.low_threshold);
      if (st === "low") c.low++;
      if (st === "out") c.out++;
    }
    return c;
  }, [items]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Inventory</h1>
          <p className="text-xs text-muted-foreground">
            Track stock levels for items with inventory enabled. Movements are append-only.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList>
                <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
                <TabsTrigger value="low">
                  Low ({counts.low})
                </TabsTrigger>
                <TabsTrigger value="out">
                  Out ({counts.out})
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search item…"
                className="pl-8"
              />
            </div>
          </div>

          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Low at</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Loading…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No tracked items.</TableCell></TableRow>
                ) : rows.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.name}</TableCell>
                    <TableCell className="text-muted-foreground">{catName.get(it.category_id) ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatNumberSpaces(it.stock_qty ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                      {it.low_threshold != null ? formatNumberSpaces(it.low_threshold) : "·"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[it.status]}>{STATUS_LABEL[it.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setMoveItem(it)}>
                        Move
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Recent movements</h2>
          <div className="border rounded-md divide-y max-h-[600px] overflow-y-auto">
            {recent.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-6">No movements yet.</div>
            ) : recent.map((m) => (
              <div key={m.id} className="p-2 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{m.item_name}</span>
                  <span
                    className={`font-mono tabular-nums flex items-center gap-1 ${
                      m.delta > 0 ? "text-cms-amount-positive" : "text-cms-amount-negative"
                    }`}
                  >
                    {m.delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {m.delta > 0 ? "+" : ""}{m.delta}
                  </span>
                </div>
                <div className="text-muted-foreground truncate">{m.reason}</div>
                <div className="text-[10px] text-muted-foreground">{fmtDateTime(m.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <StockMovementDialog
        open={!!moveItem}
        onOpenChange={(o) => !o && setMoveItem(null)}
        item={moveItem}
      />
    </div>
  );
}
