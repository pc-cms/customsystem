/**
 * COGS report — manager-only. Groups consumption movements by sellable item,
 * ingredient, location or day. Uses cost snapshots (immutable per movement).
 */
import { useMemo, useState } from "react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, BarChart3 } from "lucide-react";
import { useCasino } from "@/lib/casino-context";
import { usePosLocations } from "@/hooks/use-pos-locations";
import { usePosCogsReport, type CogsGroupBy } from "@/hooks/use-pos-cogs";
import { formatNumberSpaces } from "@/lib/currency";

const GROUP_LABEL: Record<CogsGroupBy, string> = {
  sellable_item: "Sellable item",
  ingredient: "Ingredient",
  location: "Location",
  day: "Day",
};

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function PosManagerCogs() {
  const { activeCasinoId } = useCasino();
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(today());
  const [groupBy, setGroupBy] = useState<CogsGroupBy>("sellable_item");
  const [locationId, setLocationId] = useState<string>("__all__");

  const { data: locations = [] } = usePosLocations(activeCasinoId, true);
  const { data: rows = [], isLoading } = usePosCogsReport({
    casinoId: activeCasinoId,
    from, to,
    locationId: locationId === "__all__" ? null : locationId,
    groupBy,
  });

  const totals = useMemo(() => {
    const sales = rows.reduce((s, r) => s + r.gross_sales_tzs, 0);
    const cogs = rows.reduce((s, r) => s + r.cogs_tzs, 0);
    const uncosted = rows.reduce((s, r) => s + r.uncosted_movement_count, 0);
    const margin = sales - cogs;
    const pct = sales > 0 ? (margin / sales) * 100 : null;
    return { sales, cogs, margin, pct, uncosted };
  }, [rows]);

  return (
    <PageShell>
      <PageHeader
        icon={BarChart3}
        title="COGS report"
        description="Cost of goods sold from immutable inventory cost snapshots. Sales come from order items."
      />

      <PageSection>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Group by</Label>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as CogsGroupBy)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(GROUP_LABEL) as CogsGroupBy[]).map((k) => (
                  <SelectItem key={k} value={k}>{GROUP_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All locations</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PageSection>

      <PageSection>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryCard label="Gross sales" value={`${formatNumberSpaces(totals.sales)} TZS`} />
          <SummaryCard label="COGS" value={`${formatNumberSpaces(totals.cogs)} TZS`} />
          <SummaryCard
            label="Gross margin"
            value={`${formatNumberSpaces(totals.margin)} TZS`}
            tone={totals.margin >= 0 ? "pos" : "neg"}
          />
          <SummaryCard
            label="Margin %"
            value={totals.pct == null ? "—" : `${totals.pct.toFixed(2)}%`}
          />
          <SummaryCard
            label="Uncosted movements"
            value={String(totals.uncosted)}
            tone={totals.uncosted > 0 ? "warn" : undefined}
          />
        </div>
        {totals.uncosted > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
            <div>
              Some movements have no cost snapshot (zero or missing
              <code className="mx-1">avg_cost_tzs</code>, or pre-Phase-3C-3 history).
              They are treated as 0 TZS in COGS.
            </div>
          </div>
        )}
      </PageSection>

      <PageSection>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{GROUP_LABEL[groupBy]}</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead className="text-right">COGS (TZS)</TableHead>
              <TableHead className="text-right">Gross sales (TZS)</TableHead>
              <TableHead className="text-right">Margin (TZS)</TableHead>
              <TableHead className="text-right">Margin %</TableHead>
              <TableHead className="text-right">Movements</TableHead>
              <TableHead className="text-right">Uncosted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No data in range.</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={`${r.group_type}:${r.group_key}`}>
                <TableCell className="font-medium">{r.group_label}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumberSpaces(r.units_consumed)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumberSpaces(r.cogs_tzs)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumberSpaces(r.gross_sales_tzs)}</TableCell>
                <TableCell className={`text-right tabular-nums ${r.gross_margin_tzs >= 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                  {formatNumberSpaces(r.gross_margin_tzs)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.gross_margin_pct == null ? "—" : `${r.gross_margin_pct.toFixed(2)}%`}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.movement_count}</TableCell>
                <TableCell className="text-right tabular-nums">{r.uncosted_movement_count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PageSection>
    </PageShell>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" | "warn" }) {
  const toneCls =
    tone === "pos" ? "cms-amount-positive" :
    tone === "neg" ? "cms-amount-negative" :
    tone === "warn" ? "text-amber-600" : "";
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  );
}
