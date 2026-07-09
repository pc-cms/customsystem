import { useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSessionState } from "@/hooks/use-session-state";
import { useActivityLogs } from "@/hooks/use-casino-data";
import { useLogLookups } from "@/hooks/use-log-lookups";
import { actionLabel, formatLogDetails } from "@/lib/format-log";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar } from "@/components/layout/FilterBar";

const CATEGORY_STYLES: Record<string, string> = {
  transaction: "bg-primary/10 text-primary", edit: "bg-accent/10 text-accent",
  lock: "bg-destructive/10 text-destructive", expense: "bg-info/10 text-info",
  player: "bg-success/10 text-success", system: "bg-muted text-muted-foreground",
  breaklist: "bg-warning/10 text-warning", pit: "bg-primary/10 text-primary",
};

const Logs = () => {
  const { data: logs = [], isLoading } = useActivityLogs(500);
  const { data: lookups = {} } = useLogLookups();
  const [search, setSearch] = useSessionState<string>("search", "");
  const [catFilter, setCatFilter] = useSessionState<string>("catFilter", "all");

  const enriched = useMemo(() => logs.map(l => ({
    ...l,
    _label: actionLabel(l.action),
    _pretty: formatLogDetails(l.action, l.details, lookups),
    _operator: lookups.users?.[l.operator_id] || `${l.operator_id.slice(0, 8)}…`,
  })), [logs, lookups]);

  const filtered = useMemo(() => {
    let result = enriched;
    if (catFilter !== "all") result = result.filter(l => l.category === catFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l._label.toLowerCase().includes(q) ||
        l._pretty.toLowerCase().includes(q) ||
        l._operator.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q)
      );
    }
    return result;
  }, [enriched, search, catFilter]);

  const categories = useMemo(() => {
    const cats = new Set(logs.map(l => l.category));
    return Array.from(cats).sort();
  }, [logs]);

  return (
    <div>
      <PageHeader
        icon={ClipboardList}
        title="Audit Log"
        subtitle={`Immutable trail · searchable · ${filtered.length} entries`}
        date
      />

      <FilterBar
        search={
          <div className="relative w-[320px] max-w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search action, details, operator…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 font-mono text-xs h-9"
            />
          </div>
        }
        filters={
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c} className="capitalize text-xs">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />


      <VirtualLogTable
        rows={filtered}
        loading={isLoading}
      />
    </div>
  );
};

interface LogRow {
  id: string;
  created_at: string;
  category: string;
  action: string;
  operator_id: string;
  _label: string;
  _pretty: string;
  _operator: string;
}

/**
 * Virtualized log table — renders only ~30 visible rows regardless of how
 * many entries are in the result set. Replaces a full-list render that
 * previously janked badly past ~500 logs.
 */
const COLS = "160px 110px 200px 1fr 160px";

const VirtualLogTable = ({ rows, loading }: { rows: LogRow[]; loading: boolean }) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div className="cms-panel overflow-hidden">
      <div
        className="grid text-[10px] font-medium text-muted-foreground uppercase border-b border-border bg-card px-3 py-2"
        style={{ gridTemplateColumns: COLS, gap: "12px" }}
      >
        <div>Time</div><div>Category</div><div>Action</div><div>Details</div><div>Operator</div>
      </div>
      <div ref={parentRef} className="max-h-[600px] overflow-y-auto">
        {loading ? (
          <div className="text-center text-muted-foreground text-sm py-8">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">No logs found</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {items.map((vi) => {
              const log = rows[vi.index];
              return (
                <div
                  key={log.id}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className="grid items-center border-b border-border hover:bg-muted/30 px-3 py-2"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                    gridTemplateColumns: COLS,
                    gap: "12px",
                  }}
                >
                  <div className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </div>
                  <div>
                    <span className={`inline-block text-[9px] font-mono px-1.5 py-0.5 rounded uppercase whitespace-nowrap ${CATEGORY_STYLES[log.category] || ""}`}>{log.category}</span>
                  </div>
                  <div className="text-xs font-medium text-card-foreground truncate" title={log._label}>{log._label}</div>
                  <div className="text-[11px] text-foreground/80 truncate" title={log._pretty}>
                    {log._pretty || <span className="text-muted-foreground">—</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate" title={log.operator_id}>{log._operator}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Logs;
