import { useState, useEffect } from "react";
import { Search, Plus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useMergeBasket } from "@/hooks/use-merge-basket";
import { fmtDate } from "@/lib/format-date";

export const ManualSearch = () => {
  const [raw, setRaw] = useState("");
  const [q, setQ] = useState("");
  const { addMany, has } = useMergeBasket();

  useEffect(() => {
    const t = setTimeout(() => setQ(raw.trim()), 250);
    return () => clearTimeout(t);
  }, [raw]);

  const { data = [], isLoading } = useQuery({
    queryKey: ["merge-manual-search", q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const like = `%${q}%`;
      const { data, error } = await supabase
        .from("players")
        .select("id, first_name, last_name, nickname, phone, id_number, photo_url, birth_date, status, casino_id, created_at")
        .neq("status", "merged")
        .or(`first_name.ilike.${like},last_name.ilike.${like},nickname.ilike.${like},phone.ilike.${like},id_number.ilike.${like}`)
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, id number, phone..."
          className="pl-9"
          value={raw}
          onChange={e => setRaw(e.target.value)}
          autoFocus
        />
      </div>

      {q.length < 2 ? (
        <div className="py-12 text-center text-sm text-muted-foreground border rounded-lg">
          Type at least 2 characters to search.
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Searching...
        </div>
      ) : data.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground border rounded-lg">
          No players match "{q}".
        </div>
      ) : (
        <ul className="divide-y border rounded-lg overflow-hidden">
          {data.map((p: any) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30">
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
                variant={has(p.id) ? "secondary" : "outline"}
                onClick={() => { if (!has(p.id)) addMany([p.id]); }}
                disabled={has(p.id)}
              >
                {has(p.id) ? "✓" : <Plus className="h-3.5 w-3.5" />}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
