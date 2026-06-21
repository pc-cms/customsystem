import { useMemo, useState } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { ClipboardList, Search } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useFinAuditLog } from "@/hooks/use-fin";
import { fmtDateTime } from "@/lib/format-date";
import { DateRangePresets, type DatePreset, presetRange } from "@/components/ui/date-range-presets";

export default function FinancesAuditLogPage() {
  const { data: rows = [] } = useFinAuditLog();
  const [action, setAction] = useSessionState("action", "all");
  const [entity, setEntity] = useSessionState("entity", "all");
  const [actor, setActor] = useSessionState("actor", "all");
  const initial = presetRange("month");
  const [preset, setPreset] = useSessionState<DatePreset>("preset", "month");
  const [from, setFrom] = useSessionState<string>("from", initial.from);
  const [to, setTo] = useSessionState<string>("to", initial.to);
  const [search, setSearch] = useSessionState("search", "");

  const { actions, entities, actors } = useMemo(() => {
    const a = new Set<string>(), e = new Set<string>(), u = new Set<string>();
    rows.forEach((r: any) => {
      if (r.action) a.add(r.action);
      if (r.entity_table) e.add(r.entity_table);
      if (r.actor) u.add(r.actor);
    });
    return {
      actions: Array.from(a).sort(),
      entities: Array.from(e).sort(),
      actors: Array.from(u).sort(),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return rows.filter((r: any) => {
      if (action !== "all" && r.action !== action) return false;
      if (entity !== "all" && r.entity_table !== entity) return false;
      if (actor !== "all" && r.actor !== actor) return false;
      if (from && r.created_at < from) return false;
      if (to && r.created_at > `${to}T23:59:59`) return false;
      if (s) {
        const hay = `${r.action} ${r.entity_table} ${r.entity_id} ${JSON.stringify(r.meta || {})}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, action, entity, actor, from, to, search]);

  const reset = () => {
    setAction("all"); setEntity("all"); setActor("all");
    const r = presetRange("month");
    setPreset("month"); setFrom(r.from); setTo(r.to);
    setSearch("");
  };

  return (
    <PageShell>
      <PageHeader
        icon={ClipboardList}
        title="Audit Log"
        subtitle={`2-year retention · ${filtered.length} of ${rows.length} entries`}
      >
        <FinanceCasinoSwitcher />
        <DateRangePresets
          preset={preset}
          from={from}
          to={to}
          onChange={(n) => { setPreset(n.preset); setFrom(n.from); setTo(n.to); }}
        />
      </PageHeader>
      <PageSection card={false}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All actions</SelectItem>
              {actions.map(a => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Entity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All entities</SelectItem>
              {entities.map(e => <SelectItem key={e} value={e} className="text-xs">{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={actor} onValueChange={setActor}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Actor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All actors</SelectItem>
              {actors.map(u => <SelectItem key={u} value={u} className="text-xs font-mono">{u.slice(0, 8)}…</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-7 h-8 text-xs" />
          </div>
        </div>

        <div className="flex justify-end mb-2">
          <Button size="sm" variant="ghost" onClick={reset} className="h-7 text-xs">Reset</Button>
        </div>
        <div className="rounded-md border border-border overflow-auto max-h-[70vh]">
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="text-left">Action</th>
                <th className="text-left">Entity</th>
                <th className="text-left">Entity ID</th>
                <th className="text-left">Actor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-1.5 font-mono">{fmtDateTime(r.created_at)}</td>
                  <td>{r.action}</td>
                  <td>{r.entity_table}</td>
                  <td className="font-mono text-[10px] text-muted-foreground">{r.entity_id?.slice(0, 8)}</td>
                  <td className="font-mono text-[10px] text-muted-foreground">{r.actor?.slice(0, 8)}</td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={5} className="text-center text-muted-foreground py-6">No entries match filters</td></tr>}
            </tbody>
          </table>
        </div>
      </PageSection>
    </PageShell>
  );
}
