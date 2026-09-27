/**
 * Shared Z-report renderer. Used both for preview (open shift) and snapshot (closed shift).
 */
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateTime } from "@/lib/format-date";
import type { PosZReport } from "@/hooks/use-pos-shift";
import { Badge } from "@/components/ui/badge";

const Money = ({ v }: { v: number }) => (
  <span className="font-mono tabular-nums">{formatNumberSpaces(v)}</span>
);

export const ZReportView = ({ z }: { z: PosZReport }) => {
  const t = z.totals ?? { gross_tzs: 0, cash: 0, card: 0, comp_player: 0, comp_house: 0 };
  const c = z.counts ?? { tabs_closed: 0, tabs_voided: 0, orders_total: 0, orders_void: 0 };
  const deltaCls =
    z.cash_delta === 0
      ? "text-muted-foreground"
      : z.cash_delta > 0
      ? "text-cms-amount-positive"
      : "text-cms-amount-negative";

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>Opened: <span className="text-foreground">{fmtDateTime(z.opened_at)}</span></div>
        <div>Closed: <span className="text-foreground">{z.closed_at ? fmtDateTime(z.closed_at) : "—"}</span></div>
      </div>

      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1">Payment totals</div>
        <div className="rounded-md border divide-y">
          {[
            ["Money", t.money ?? t.cash],
            ["Credits", t.credits ?? 0],
            ["Free (hospitality, not revenue)", t.free ?? 0],
            ...(t.card || t.comp_player || t.comp_house
              ? [["Card (legacy)", t.card], ["Comp · player (legacy)", t.comp_player], ["Comp · house (legacy)", t.comp_house]]
              : []),
            ...(z.cogs_tzs != null ? [["COGS", z.cogs_tzs]] : []),
          ].map(([label, val]) => (
            <div key={label as string} className="flex justify-between px-3 py-1.5">
              <span>{label}</span>
              <Money v={val as number} />
            </div>
          ))}
          <div className="flex justify-between px-3 py-2 font-semibold bg-muted/40">
            <span>Retail value</span>
            <Money v={t.gross_tzs} />
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1">Money drawer</div>
        <div className="rounded-md border divide-y">
          <div className="flex justify-between px-3 py-1.5"><span>Opening money</span><Money v={z.opening_cash} /></div>
          <div className="flex justify-between px-3 py-1.5"><span>+ Money sales</span><Money v={t.money ?? t.cash} /></div>
          <div className="flex justify-between px-3 py-1.5 bg-muted/30"><span>Expected money</span><Money v={z.expected_cash} /></div>
          <div className="flex justify-between px-3 py-1.5">
            <span>Actual closing</span>
            <Money v={z.closing_cash ?? 0} />
          </div>
          <div className={`flex justify-between px-3 py-2 font-semibold ${deltaCls}`}>
            <span>Δ</span>
            <span className="font-mono tabular-nums">
              {z.cash_delta > 0 ? "+" : ""}{formatNumberSpaces(z.cash_delta)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">Tabs closed: {c.tabs_closed}</Badge>
        {c.tabs_voided > 0 && <Badge variant="destructive">Tabs voided: {c.tabs_voided}</Badge>}
        <Badge variant="outline">Orders: {c.orders_total}</Badge>
        {c.orders_void > 0 && <Badge variant="outline">Voids: {c.orders_void}</Badge>}
      </div>

      {z.by_category?.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">By category</div>
          <div className="rounded-md border divide-y">
            {z.by_category.map((r) => (
              <div key={r.category_name} className="flex justify-between px-3 py-1.5">
                <span className="truncate">{r.category_name}</span>
                <span className="flex gap-4">
                  <span className="text-muted-foreground">×{r.qty}</span>
                  <Money v={r.total_tzs} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {z.by_item?.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">By item</div>
          <div className="rounded-md border divide-y max-h-64 overflow-y-auto">
            {z.by_item.map((r) => (
              <div key={r.item_id} className="flex justify-between px-3 py-1.5">
                <span className="truncate">{r.item_name}</span>
                <span className="flex gap-4">
                  <span className="text-muted-foreground">×{r.qty}</span>
                  <Money v={r.total_tzs} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ZReportView;
