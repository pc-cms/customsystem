import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useOpenPosTab } from "@/hooks/use-pos-tabs";
import { usePosPlayerSearch, type PosPlayerSearchRow } from "@/hooks/use-pos-player-search";
import { usePosLocations } from "@/hooks/use-pos-locations";
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
  const { data: locations = [] } = usePosLocations(casinoId, true);
  const [locationId, setLocationId] = useState<string>("");

  useEffect(() => {
    if (!locationId && locations.length > 0) {
      const mainBar = locations.find((l) => l.name === "Main Bar") ?? locations[0];
      setLocationId(mainBar.id);
    }
  }, [locations, locationId]);

  const createForPlayer = async (player: PosPlayerSearchRow) => {
    try {
      const name = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
      const result = await openTab.mutateAsync({
        casino_id: casinoId,
        shift_id: shiftId,
        opened_by_user_id: userId,
        player_id: player.id,
        player_name: name || (player.nickname ?? "Player"),
        pos_location_id: locationId || null,
      });
      toast({ title: "Tab opened" });
      onCreated(result.id);
      onOpenChange(false);
      setSearch("");
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("PLAYER_REQUIRED_FOR_NEW_TAB")) {
        toast({ title: "Player required", description: "Every POS tab must be linked to a registered player.", variant: "destructive" });
      } else {
        toast({ title: "Failed", description: msg, variant: "destructive" });
      }
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="New tab" size="lg">
      <div className="space-y-3">
        {locations.length > 0 && (
          <div>
            <label className="text-xs uppercase text-muted-foreground">Location</label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
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
          Every POS tab must be linked to a registered player. Walk-in tabs are no longer allowed —
          register the customer first at Reception, then open the tab.
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
              No matches. Ask Reception to register the player first.
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
