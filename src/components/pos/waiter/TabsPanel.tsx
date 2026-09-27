import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateTime } from "@/lib/format-date";
import type { PosTab } from "@/hooks/use-pos-tabs";

interface Props {
  tabs: PosTab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  loading?: boolean;
}

export const TabsPanel = ({ tabs, activeTabId, onSelect, onNew, loading }: Props) => {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Open tabs</h2>
        <Button size="sm" onClick={onNew}>
          <Plus className="h-4 w-4 mr-1" /> New
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
        ) : tabs.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No open tabs. Tap “New” to start one.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {tabs.map((t) => {
              const label = t.player_id
                ? t.player_name || "Player"
                : `Walk-in · ${t.walkin_label}`;
              const active = t.id === activeTabId;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(t.id)}
                    className={`w-full text-left px-3 py-3 transition-colors ${
                      active ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-accent/40 border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium truncate">{label}</span>
                      <span className="font-mono tabular-nums text-sm shrink-0">
                        {formatNumberSpaces(t.total_tzs)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {fmtDateTime(t.opened_at)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default TabsPanel;
