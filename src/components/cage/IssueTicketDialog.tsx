import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PlayerSearch from "@/components/cage/PlayerSearch";
import PlayerInfoCard from "@/components/cage/PlayerInfoCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDate } from "@/lib/format-date";
import type { Tables } from "@/integrations/supabase/types";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  players: Tables<"players">[];
  tables: Tables<"gaming_tables">[];
  casinoId: string;
};

export default function IssueTicketDialog({ open, onOpenChange, players, tables, casinoId }: Props) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [lotteryId, setLotteryId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);

  const { data: lotteries = [] } = useQuery({
    queryKey: ["cashier_open_lotteries", casinoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lotteries")
        .select("id, name, ticket_price_credits, draw_business_date, max_tickets_per_player")
        .eq("casino_id", casinoId)
        .eq("status", "open")
        .order("draw_business_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const player = players.find((p) => p.id === playerId);
  const lot = lotteries.find((l) => l.id === lotteryId);
  const total = lot ? lot.ticket_price_credits * qty : 0;

  const reset = () => { setPlayerId(null); setLotteryId(""); setQty(1); };

  const handleIssue = async () => {
    if (!playerId || !lotteryId || qty <= 0) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("cashier_issue_lottery_ticket", {
      p_player_id: playerId,
      p_lottery_id: lotteryId,
      p_qty: qty,
      p_casino_id: casinoId,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as any;
    toast.success(`Issued ${r.tickets.length} ticket(s): #${r.tickets.join(", #")} — collect ${formatNumberSpaces(r.total_cash)} cash`);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Issue lottery ticket · Cash sale</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Player</Label>
            <PlayerSearch players={players as any} value={playerId ?? ""} onChange={(id) => setPlayerId(id || null)} />
            {player && <div className="mt-2"><PlayerInfoCard player={player as any} tables={tables} /></div>}
          </div>
          <div>
            <Label>Lottery</Label>
            <Select value={lotteryId} onValueChange={setLotteryId}>
              <SelectTrigger><SelectValue placeholder="Select open lottery" /></SelectTrigger>
              <SelectContent>
                {lotteries.length === 0 && <div className="p-2 text-xs text-muted-foreground">No open lotteries</div>}
                {lotteries.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} · {formatNumberSpaces(l.ticket_price_credits)} · draw {fmtDate(l.draw_business_date)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tickets</Label>
            <NumberInput decimals={0} min={1} value={qty} onValueChange={(v) => setQty(Math.max(1, v || 1))} />
          </div>
          {lot && (
            <p className="text-sm">
              Collect cash: <span className="font-mono font-bold">{formatNumberSpaces(total)}</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Cashier collects cash from player before pressing Issue. Tickets recorded as cash sale (no promo wallet debit).
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleIssue} disabled={!playerId || !lotteryId || qty <= 0 || busy}>
            {busy ? "Issuing…" : "Issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
