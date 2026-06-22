/**
 * POS Cost Control — manager-only.
 *
 * Reframed (Phase 3C-3 revision): the casino bar/coffee POS is not a profit
 * center. We may sell at cost or via comps. The report focuses on:
 *   - How much was consumed
 * - What that consumption cost the casino
 *   - How that cost was covered (cash / card / comps / complimentary / player charge)
 *   - What was voided / reversed
 *
 * Gross-margin fields still exist in the RPC payload for backward compat but
 * are intentionally not shown as headline KPIs.
 */
import { useMemo, useState } from "react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ClipboardList } from "lucide-react";
import { useCasino } from "@/lib/casino-context";
import { usePosLocations } from "@/hooks/use-pos-locations";
import { usePosCogsReport, type CogsGroupBy } from "@/hooks/use-pos-cogs";
import { formatNumberSpaces } from "@/lib/currency";

const GROUP_LABEL: Record<CogsGroupBy, string> = {
  sellable_item: "Sellable item",
  ingredient: "Ingredient",
  location: "Location",
  day: "Day",
  shift: "Shift",
  payment_method: "Payment method",
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
  const { data: rows = [], isLoading, error } = usePosCogsReport({
    casinoId: activeCasinoId,
    from, to,
    locationId: locationId === "__all__" ? null : locationId,
    groupBy,
  });

  const totals = useMemo(() => {
    const posValue = rows.reduce((s, r) => s + r.gross_sales_tzs, 0);
    const cost = rows.reduce((s, r) => s + r.cogs_tzs, 0);
    const cash = rows.reduce((s, r) => s + r.cost_cash_tzs, 0);
    const card = rows.reduce((s, r) => s + r.cost_card_tzs, 0);
    const compPlayer = rows.reduce((s, r) => s + r.cost_comp_player_tzs, 0);
    const compHouse = rows.reduce((s, r) => s + r.cost_comp_house_tzs, 0);
    const pc = rows.reduce((s, r) => s + r.cost_player_charge_tzs, 0);
    const voided = rows.reduce((s, r) => s + r.cost_voided_tzs, 0);
    const uncosted = rows.reduce((s, r) => s + r.uncosted_movement_count, 0);
    return { posValue, cost, cash, card, compPlayer, compHouse, pc, voided, uncosted };
  }, [rows]);

  const isForbidden = (error as any)?.message?.toLowerCase?.().includes("forbidden");

  return (
    <PageShell>
      <PageHeader
        icon={ClipboardList}
        title="POS Cost Control"
        subtitle="Consumption cost from immutable inventory snapshots. Manager-tier only. POS value is shown for reference, not as a profit KPI."
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

      {isForbidden && (
        <PageSection>
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            You do not have permission to view cost-control data.
            Requires Bar Manager, Manager, Finance Manager or Super Admin.
          </div>
        </PageSection>
      )}

      <PageSection>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="POS value (reference)" value={`${formatNumberSpaces(totals.posValue)} TZS`} muted />
          <SummaryCard label="Cost consumed" value={`${formatNumberSpaces(totals.cost)} TZS`} strong />
          <SummaryCard label="Voids / reversals (cost)" value={`${formatNumberSpaces(totals.voided)} TZS`} tone={totals.voided > 0 ? "warn" : undefined} />
          <SummaryCard label="Uncosted movements" value={String(totals.uncosted)} tone={totals.uncosted > 0 ? "warn" : undefined} />
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryCard label="Cash-covered cost"        value={`${formatNumberSpaces(totals.cash)} TZS`} />
          <SummaryCard label="Card-covered cost"        value={`${formatNumberSpaces(totals.card)} TZS`} />
          <SummaryCard label="Comps cost (player wallet)" value={`${formatNumberSpaces(totals.compPlayer)} TZS`} />
          <SummaryCard label="Complimentary cost (house)" value={`${formatNumberSpaces(totals.compHouse)} TZS`} />
          <SummaryCard label="Player-charge cost"      value={`${formatNumberSpaces(totals.pc)} TZS`} />
        </div>

        {totals.uncosted > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
            <div>
              Some movements have no cost snapshot (zero/missing
              <code className="mx-1">avg_cost_tzs</code> or pre-Phase-3C-3 history).
              They are counted as 0 TZS in the cost columns.
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
              <TableHead className="text-right">Cost consumed (TZS)</TableHead>
              <TableHead className="text-right">POS value (TZS)</TableHead>
              <TableHead className="text-right">Cost share %</TableHead>
              <TableHead className="text-right">Cash</TableHead>
              <TableHead className="text-right">Card</TableHead>
              <TableHead className="text-right">Comps</TableHead>
              <TableHead className="text-right">Compl.</TableHead>
              <TableHead className="text-right">Player charge</TableHead>
              <TableHead className="text-right">Movements</TableHead>
              <TableHead className="text-right">Uncosted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground">No data in range.</TableCell></TableRow>
            )}
            {rows.map((r) => {
              const share = totals.cost > 0 ? (r.cogs_tzs / totals.cost) * 100 : null;
              return (
                <TableRow key={`${r.group_type}:${r.group_key}`}>
                  <TableCell className="font-medium">{r.group_label}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumberSpaces(r.units_consumed)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatNumberSpaces(r.cogs_tzs)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumberSpaces(r.gross_sales_tzs)}</TableCell>
                  <TableCell className="text-right tabular-nums">{share == null ? "—" : `${share.toFixed(1)}%`}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumberSpaces(r.cost_cash_tzs)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumberSpaces(r.cost_card_tzs)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumberSpaces(r.cost_comp_player_tzs)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumberSpaces(r.cost_comp_house_tzs)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumberSpaces(r.cost_player_charge_tzs)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.movement_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.uncosted_movement_count}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </PageSection>
    </PageShell>
  );
}

function SummaryCard({ label, value, tone, strong, muted }: { label: string; value: string; tone?: "warn"; strong?: boolean; muted?: boolean }) {
  const toneCls = tone === "warn" ? "text-amber-600" : muted ? "text-muted-foreground" : "";
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg tabular-nums ${strong ? "font-semibold" : ""} ${toneCls}`}>{value}</div>
    </div>
  );
}
