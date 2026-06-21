/**
 * P4 · Bar Shift Reconciliation report.
 * Per-shift summary: sales vs cash vs stock variance vs overrides.
 * Read-only RPC `pos_shift_reconciliation`. Filterable by month + status.
 */
import { useMemo, useState } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateOnly, fmtDateTime } from "@/lib/format-date";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Row = {
  shift_id: string;
  business_date: string;
  shift_type: string;
  waiter_user_id: string;
  waiter_name: string;
  opened_at: string;
  closed_at: string | null;
  gross_tzs: number;
  cash_tzs: number;
  card_tzs: number;
  comp_player_tzs: number;
  comp_house_tzs: number;
  opening_cash: number;
  closing_cash: number;
  expected_cash: number;
  cash_delta: number;
  stock_variance_tzs: number;
  outstanding_charges_tzs: number;
  overrides_count: number;
  status: "clean" | "minor" | "flagged" | "open";
};

const monthBounds = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
};

const currentYM = () => {
  const d = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Dar_es_Salaam",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  return d; // YYYY-MM
};

export default function PosShiftReconciliation() {
  const { activeCasinoId } = useCasino();
  const [ym, setYm] = useSessionState("ym", currentYM());
  const [status, setStatus] = useSessionState<"all" | Row["status"]>("status", "all");

  const { from, to } = useMemo(() => monthBounds(ym), [ym]);

  const { data, isLoading } = useQuery({
    queryKey: ["pos-shift-recon", activeCasinoId, from, to],
    enabled: !!activeCasinoId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("pos_shift_reconciliation", {
        _casino_id: activeCasinoId!,
        _from: from,
        _to: to,
      } as any);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = (data ?? []).filter((r) => status === "all" || r.status === status);

  const totals = rows.reduce(
    (a, r) => ({
      gross: a.gross + r.gross_tzs,
      cash: a.cash + r.cash_tzs,
      card: a.card + r.card_tzs,
      comp: a.comp + r.comp_player_tzs + r.comp_house_tzs,
      cashD: a.cashD + r.cash_delta,
      stockD: a.stockD + r.stock_variance_tzs,
      out: a.out + r.outstanding_charges_tzs,
      ov: a.ov + r.overrides_count,
    }),
    { gross: 0, cash: 0, card: 0, comp: 0, cashD: 0, stockD: 0, out: 0, ov: 0 },
  );

  const StatusBadge = ({ s }: { s: Row["status"] }) => {
    const variant: Record<Row["status"], string> = {
      clean: "bg-cms-amount-positive/15 text-cms-amount-positive border-cms-amount-positive/30",
      minor: "bg-amber-500/15 text-amber-600 border-amber-500/30",
      flagged: "bg-destructive/15 text-destructive border-destructive/30",
      open: "bg-muted text-muted-foreground border-border",
    };
    return (
      <Badge variant="outline" className={`text-[10px] uppercase ${variant[s]}`}>{s}</Badge>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Shift reconciliation</h1>
        <p className="text-sm text-muted-foreground">
          Per-shift audit: sales vs cash vs stock variance vs overrides.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="ym" className="text-[10px] uppercase tracking-wider text-muted-foreground">Month</Label>
          <Input id="ym" type="month" value={ym} onChange={(e) => setYm(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="clean">Clean</SelectItem>
              <SelectItem value="minor">Minor</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
              <SelectItem value="open">Open</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {rows.length} shifts
        </div>
      </div>

      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Waiter</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Cash</TableHead>
              <TableHead className="text-right">Card</TableHead>
              <TableHead className="text-right">Comp P/H</TableHead>
              <TableHead className="text-right">Cash Δ</TableHead>
              <TableHead className="text-right">Stock Δ</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead className="text-right">Overr.</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-6">No shifts in this period.</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.shift_id}>
                <TableCell className="font-mono text-xs">{fmtDateOnly(r.business_date)}</TableCell>
                <TableCell className="text-xs uppercase">{r.shift_type}</TableCell>
                <TableCell className="text-xs truncate max-w-[140px]" title={r.waiter_name}>
                  {r.waiter_name || "—"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatNumberSpaces(r.gross_tzs)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatNumberSpaces(r.cash_tzs)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatNumberSpaces(r.card_tzs)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-xs">
                  {formatNumberSpaces(r.comp_player_tzs)} / {formatNumberSpaces(r.comp_house_tzs)}
                </TableCell>
                <TableCell className={`text-right font-mono tabular-nums ${
                  r.cash_delta === 0 ? "" : r.cash_delta > 0 ? "cms-amount-positive" : "cms-amount-negative"
                }`}>
                  {r.cash_delta > 0 ? "+" : ""}{formatNumberSpaces(r.cash_delta)}
                </TableCell>
                <TableCell className={`text-right font-mono tabular-nums ${
                  r.stock_variance_tzs === 0 ? "" : r.stock_variance_tzs > 0 ? "cms-amount-positive" : "cms-amount-negative"
                }`}>
                  {r.stock_variance_tzs > 0 ? "+" : ""}{formatNumberSpaces(r.stock_variance_tzs)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatNumberSpaces(r.outstanding_charges_tzs)}</TableCell>
                <TableCell className="text-right font-mono">{r.overrides_count || "·"}</TableCell>
                <TableCell><StatusBadge s={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
          {rows.length > 0 && (
            <tfoot className="border-t bg-muted/40 font-medium">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-xs uppercase tracking-wider">Totals</td>
                <td className="px-4 py-2 text-right font-mono">{formatNumberSpaces(totals.gross)}</td>
                <td className="px-4 py-2 text-right font-mono">{formatNumberSpaces(totals.cash)}</td>
                <td className="px-4 py-2 text-right font-mono">{formatNumberSpaces(totals.card)}</td>
                <td className="px-4 py-2 text-right font-mono">{formatNumberSpaces(totals.comp)}</td>
                <td className={`px-4 py-2 text-right font-mono ${totals.cashD === 0 ? "" : totals.cashD > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                  {totals.cashD > 0 ? "+" : ""}{formatNumberSpaces(totals.cashD)}
                </td>
                <td className={`px-4 py-2 text-right font-mono ${totals.stockD === 0 ? "" : totals.stockD > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                  {totals.stockD > 0 ? "+" : ""}{formatNumberSpaces(totals.stockD)}
                </td>
                <td className="px-4 py-2 text-right font-mono">{formatNumberSpaces(totals.out)}</td>
                <td className="px-4 py-2 text-right font-mono">{totals.ov || "·"}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </Table>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Status: clean = no variance; minor = small Δ within tolerance; flagged = |cash Δ| &gt; 5 000, |stock Δ| &gt; 10 000 or any override. Last refresh: {fmtDateTime(new Date())}.
      </p>
    </div>
  );
}
