import { X, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMergeBasket } from "@/hooks/use-merge-basket";
import { useBasketPlayers } from "@/hooks/use-merge-players";

interface Props {
  onMerge: () => void;
}

export const MergeBasket = ({ onMerge }: Props) => {
  const { ids, remove, clear, max, count } = useMergeBasket();
  const { data: players = [] } = useBasketPlayers(ids);

  const canMerge = count >= 2 && count <= max;
  const ordered = ids.map(id => players.find(p => p.id === id)).filter(Boolean) as any[];

  return (
    <div className="sticky top-4 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <h3 className="font-semibold text-sm">Merge basket</h3>
        </div>
        <Badge variant={canMerge ? "default" : "secondary"}>{count} / {max}</Badge>
      </div>

      {count === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">
          Add 2–{max} players from the list on the left to compare and merge them.
        </p>
      ) : (
        <ul className="space-y-1.5 mb-3 max-h-[50vh] overflow-y-auto">
          {ordered.map(p => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {p.photo_url ? (
                  <img src={p.photo_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">
                    {(p.first_name?.[0] ?? "") + (p.last_name?.[0] ?? "")}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.first_name} {p.last_name}</div>
                  <div className="truncate text-muted-foreground">#{p.id_number || "—"} · {p.phone || "—"}</div>
                </div>
              </div>
              <button
                onClick={() => remove(p.id)}
                className="text-muted-foreground hover:text-destructive shrink-0"
                aria-label="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={clear} disabled={count === 0} className="flex-1">
          Clear
        </Button>
        <Button size="sm" onClick={onMerge} disabled={!canMerge} className="flex-1">
          Merge {count > 0 ? count : ""}
        </Button>
      </div>
      {count === 1 && (
        <p className="text-[11px] text-muted-foreground mt-2">Add at least one more player.</p>
      )}
      {count > max && (
        <p className="text-[11px] text-destructive mt-2">Too many — remove some.</p>
      )}
    </div>
  );
};
