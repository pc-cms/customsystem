import { Plus, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDuplicateGroups } from "@/hooks/use-duplicate-groups";
import { useMergeBasket } from "@/hooks/use-merge-basket";
import { fmtDate } from "@/lib/format-date";

export const DuplicateSuggestions = () => {
  const { data: groups = [], isLoading, refetch, isFetching } = useDuplicateGroups();
  const { addMany, has } = useMergeBasket();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Looking for duplicates...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {groups.length} group{groups.length !== 1 ? "s" : ""} of possible duplicates
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground border rounded-lg">
          No obvious duplicates detected. Use Manual search to build a group.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.group_key} className="rounded-lg border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{g.match_reason}</Badge>
                  <span className="text-xs text-muted-foreground">{g.players.length} players</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addMany(g.players.map(p => p.id))}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add all
                </Button>
              </div>
              <ul className="divide-y">
                {g.players.map(p => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    {p.photo_url ? (
                      <img src={p.photo_url} className="h-8 w-8 rounded-full object-cover" alt="" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs">
                        {(p.first_name?.[0] ?? "") + (p.last_name?.[0] ?? "")}
                      </div>
                    )}
                    <div className="flex-1 min-w-0 grid grid-cols-4 gap-2">
                      <div className="truncate font-medium">{p.first_name} {p.last_name}</div>
                      <div className="truncate text-muted-foreground text-xs">#{p.id_number || "—"}</div>
                      <div className="truncate text-muted-foreground text-xs">{p.phone || "—"}</div>
                      <div className="truncate text-muted-foreground text-xs">
                        {p.birth_date ? fmtDate(p.birth_date) : "—"}
                        {p.status === "blacklist" && <Badge variant="destructive" className="ml-2">BL</Badge>}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={has(p.id) ? "secondary" : "ghost"}
                      onClick={() => {
                        if (!has(p.id)) addMany([p.id]);
                      }}
                      disabled={has(p.id)}
                    >
                      {has(p.id) ? "✓ In basket" : <><Plus className="h-3.5 w-3.5" /></>}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
