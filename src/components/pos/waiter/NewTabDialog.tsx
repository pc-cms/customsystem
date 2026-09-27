import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { toast } from "@/hooks/use-toast";
import { useOpenPosTab } from "@/hooks/use-pos-tabs";
import { usePosPlayerSearch, type PosPlayerSearchRow } from "@/hooks/use-pos-player-search";
import PlayerPosStatusBadge from "@/components/pos/PlayerPosStatusBadge";
import { Search } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  casinoId: string;
  shiftId: string;
  userId: string;
  onCreated: (tabId: string) => void;
}

export const NewTabDialog = ({ open, onOpenChange, casinoId, shiftId, userId, onCreated }: Props) => {
  const openTab = useOpenPosTab();
  const [search, setSearch] = useState("");
  const { data: results = [], isFetching } = usePosPlayerSearch(casinoId, search);
  const [guestNote, setGuestNote] = useState("");

  const createGuest = async () => {
    try {
      const r = await openTab.mutateAsync({ casino_id: casinoId, shift_id: shiftId, guest_note: guestNote.trim() || null });
      toast({ title: "Guest tab opened" });
      onCreated(r.id);
      onOpenChange(false);
      setGuestNote("");
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  const createForPlayer = async (player: PosPlayerSearchRow) => {
    try {
      const result = await openTab.mutateAsync({ casino_id: casinoId, shift_id: shiftId, player_id: player.id });
      toast({ title: result.existing ? "Existing tab opened" : "Tab opened" });
      onCreated(result.id);
      onOpenChange(false);
      setSearch("");
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("PLAYER_NOT_ACTIVE")) {
        toast({ title: "Player not checked in", description: "Only players currently in the casino can be served.", variant: "destructive" });
      } else {
        toast({ title: "Failed", description: msg, variant: "destructive" });
      }
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="New tab" size="lg">
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input value={guestNote} onChange={(e) => setGuestNote(e.target.value)} placeholder="Guest note (optional)" className="flex-1" />
          <Button className="h-10 px-6" onClick={createGuest} disabled={openTab.isPending}>+ Guest</Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, nickname, phone, ID, card number or RFID/QR…"
            autoFocus
            className="pl-9"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Only players currently checked in to this casino are listed. If the player already has an open tab, it will be opened.
        </p>
        <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border divide-y divide-border">
          {search.trim().length < 2 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Type at least 2 characters to search.
            </div>
          ) : isFetching ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No active players match.
            </div>
          ) : (
            results.map((p) => {
              const full = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
              const nick = p.nickname ? ` "${p.nickname}"` : "";
              const isCross = p.home_casino_id && p.home_casino_id !== casinoId;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => createForPlayer(p)}
                  className="w-full text-left px-3 py-3 hover:bg-accent/40 transition-colors"
                  disabled={openTab.isPending}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{full || p.nickname || "—"}{nick && full ? nick : ""}</span>
                    <PlayerPosStatusBadge playerId={p.id} casinoId={casinoId} />
                    {p.matched_card && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                        Card match
                      </span>
                    )}
                    {isCross && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
                        Network
                      </span>
                    )}
                  </div>
                  {p.phone_masked && (
                    <div className="text-xs text-muted-foreground">{p.phone_masked}</div>
                  )}
                </button>
              );
            })
          )}
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        </ResponsiveDialogFooter>
      </div>
    </ResponsiveDialog>
  );
};

export default NewTabDialog;
