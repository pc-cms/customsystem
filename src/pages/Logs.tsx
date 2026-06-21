import { useState, useMemo } from "react";
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


      <div className="cms-panel overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                {["Time", "Category", "Action", "Details", "Operator"].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-muted-foreground uppercase px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="text-center text-muted-foreground text-sm py-8">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted-foreground text-sm py-8">No logs found</td></tr>
              ) : filtered.map(log => (
                <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase ${CATEGORY_STYLES[log.category] || ""}`}>{log.category}</span>
                  </td>
                  <td className="px-3 py-1.5 text-xs font-medium text-card-foreground">{log._label}</td>
                  <td className="px-3 py-1.5 text-[11px] text-foreground/80 max-w-md truncate" title={log._pretty}>
                    {log._pretty || <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-1.5 text-[10px] text-muted-foreground" title={log.operator_id}>{log._operator}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Logs;
