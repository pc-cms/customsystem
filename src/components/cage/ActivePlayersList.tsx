/**
 * GuestsList — all players currently checked-in (in the hall), for the cashier
 * to quickly pick. If a guest is seated at a table, that table is shown and
 * selecting them also propagates the table to the parent form.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Users, User } from "lucide-react";
import CategoryBadge, { type PlayerCategory } from "@/components/player/CategoryBadge";
import { LazyImage } from "@/components/LazyImage";
import type { Tables } from "@/integrations/supabase/types";
import { getBusinessDate, businessDayHourUTC } from "@/lib/business-day";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";

interface Props {
  players: Tables<"players">[];
  tables: Tables<"gaming_tables">[];
  onSelect: (playerId: string, tableId?: string | null) => void;
}

const GuestsList = ({ players, tables, onSelect }: Props) => {
  const { casinoId } = useAuth();

  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const today = serverBusinessDate || getBusinessDate();
  const windowStartUTC = businessDayHourUTC(today, 7);

  // Active table sessions — used to know which table each guest is seated at.
  const { data: sessions = [] } = useQuery({
    queryKey: ["active-sessions-cage", casinoId, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_sessions")
        .select("player_id, table_id, started_at")
        .eq("casino_id", casinoId!)
        .is("stopped_at", null)
        .gte("started_at", windowStartUTC)
        .order("started_at", { ascending: false });
      return data || [];
    },
    enabled: !!casinoId,
    // Realtime (client_sessions) — основной источник; интервал только как fallback.
    refetchInterval: 10000,
  });

  const tableMap = new Map(tables.map(t => [t.id, t]));
  const seatedTableByPlayer = new Map<string, string>();
  for (const s of sessions) {
    if (s.table_id && !seatedTableByPlayer.has(s.player_id)) {
      seatedTableByPlayer.set(s.player_id, s.table_id);
    }
  }

  // `players` is already pre-filtered to active + checked-in guests by the parent.
  const rows = [...players].sort((a, b) => {
    const ta = seatedTableByPlayer.get(a.id) ? 0 : 1;
    const tb = seatedTableByPlayer.get(b.id) ? 0 : 1;
    if (ta !== tb) return ta - tb;
    return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
  });

  return (
    <div className="cms-panel h-full flex flex-col">
      <div className="cms-header flex items-center gap-2">
        <Users className="w-3.5 h-3.5" />
        Guests ({rows.length})
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-border min-h-0">
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            No checked-in players. Reception must check the player in first.
          </div>
        ) : (
          rows.map(player => {
            const tableId = seatedTableByPlayer.get(player.id) || null;
            const table = tableId ? tableMap.get(tableId) : null;
            return (
              <button
                key={player.id}
                onClick={() => onSelect(player.id, tableId)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 ring-1 ring-border">
                  {player.photo_url ? (
                    <LazyImage src={player.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-card-foreground truncate">
                      {player.first_name} {player.last_name}
                    </span>
                    <CategoryBadge category={(player.category || "normal") as PlayerCategory} />
                  </div>
                  {player.nickname && (
                    <p className="text-[10px] text-muted-foreground truncate">"{player.nickname}"</p>
                  )}
                </div>
                {table && (
                  <span className="font-mono text-xs font-bold text-primary shrink-0">
                    {table.name}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default GuestsList;
