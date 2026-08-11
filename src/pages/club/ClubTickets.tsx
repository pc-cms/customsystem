import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { clubApi, fetchLotteries, fetchMyTickets } from "@/lib/club-api";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDate, fmtDateTime } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";

const GOLD = "#E8C688";
const GOLD_DEEP = "#A68E61";

export default function ClubTickets() {
  const qc = useQueryClient();
  const { data: lotteries = [], isLoading } = useQuery({ queryKey: ["club-lotteries"], queryFn: fetchLotteries });
  const { data: wallet } = useQuery({ queryKey: ["club-wallet"], queryFn: () => clubApi.wallet() });
  const playerId = wallet?.player?.id as string | undefined;
  const { data: myTickets = [] } = useQuery({
    queryKey: ["club-my-tickets", playerId],
    queryFn: () => (playerId ? fetchMyTickets(playerId) : Promise.resolve([])),
    enabled: !!playerId,
  });

  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const isVerified = wallet?.player?.verification_status === "verified";

  const buy = async (lotteryId: string, casinoId: string, price: number) => {
    if (!isVerified) {
      toast.error("Complete verification to buy tickets");
      return;
    }
    const qty = qtyMap[lotteryId] || 1;
    const total = price * qty;
    if ((wallet?.balance ?? 0) < total) {
      toast.error("Insufficient balance");
      return;
    }
    setBusyId(lotteryId);
    try {
      const r = await clubApi.buyTicket(lotteryId, qty, casinoId);
      toast.success(`Issued ${r.tickets.length} ticket(s): #${r.tickets.join(", #")}`);
      qc.invalidateQueries({ queryKey: ["club-wallet"] });
      qc.invalidateQueries({ queryKey: ["club-my-tickets"] });
      qc.invalidateQueries({ queryKey: ["club-lotteries"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-5">
      {!isVerified && (
        <Link
          to="/club/profile"
          className="flex items-center gap-3 rounded-xl border px-4 py-3"
          style={{ borderColor: `${GOLD}66`, backgroundColor: "rgba(232,198,136,0.08)" }}
        >
          <ShieldAlert className="w-4 h-4 shrink-0" style={{ color: GOLD }} />
          <div className="flex-1 min-w-0">
            <p className="font-faberge text-[11px] tracking-[0.25em] uppercase" style={{ color: GOLD }}>
              Get verified to buy tickets
            </p>
            <p className="text-[10px] tracking-[0.2em] uppercase mt-0.5" style={{ color: GOLD_DEEP }}>
              Tap to complete verification
            </p>
          </div>
        </Link>
      )}

      <div className="text-sm text-muted-foreground">
        Balance:{" "}
        <span className="font-mono font-semibold text-foreground">
          {formatNumberSpaces(wallet?.balance ?? 0)}
        </span>{" "}
        credits
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Open lotteries</h2>
        {lotteries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open draws right now.</p>
        ) : (
          <ul className="space-y-2">
            {lotteries.map((l: any) => (
              <li key={l.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div>
                  <p className="font-semibold">{l.name}</p>
                  {l.description && <p className="text-xs text-muted-foreground mt-0.5">{l.description}</p>}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Draws {fmtDate(l.draw_business_date)}</span>
                  <span className="font-mono font-semibold">
                    {formatNumberSpaces(l.ticket_price_credits)} cr / ticket
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <NumberInput
                    min={1}
                    max={l.max_tickets_per_player ?? 99}
                    value={qtyMap[l.id] ?? 1}
                    onValueChange={(v) => setQtyMap((m) => ({ ...m, [l.id]: Math.max(1, v ?? 1) }))}
                    className="w-20"
                  />
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={busyId === l.id || !isVerified}
                    onClick={() => buy(l.id, l.casino_id, l.ticket_price_credits)}
                  >
                    {busyId === l.id ? "…" : `Buy · ${formatNumberSpaces(l.ticket_price_credits * (qtyMap[l.id] ?? 1))} cr`}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">My tickets</h2>
        {myTickets.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tickets yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {myTickets.map((t: any) => (
              <li key={t.id} className="rounded-md border border-border bg-card px-3 py-2 flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold">{t.lotteries?.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    Ticket <span className="font-mono">#{String(t.ticket_number).padStart(4, "0")}</span> · {fmtDateTime(t.purchased_at)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  Draw {t.lotteries?.draw_business_date ? fmtDate(t.lotteries.draw_business_date) : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Draws are held offline. Winners are contacted by the casino.
      </p>
    </div>
  );
}
