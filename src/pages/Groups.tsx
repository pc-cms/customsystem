import { useState, useMemo } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { usePlayerGroups, useCreateGroup, useAddGroupMember, useRemoveGroupMember, usePlayers, useTransactions, useExpenses } from "@/hooks/use-casino-data";
import { formatCurrency } from "@/lib/currency";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Users, X, UsersRound, Check } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { fmtDate } from "@/lib/format-date";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DateRangePresets, type DatePreset, presetRange } from "@/components/ui/date-range-presets";
import { getBusinessDate } from "@/lib/business-day";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";

/**
 * GROUPS (STRICT):
 * - Analytical only — does NOT affect transactions
 * - Time-based membership (join/leave)
 * - Group result = sum of per-member period results
 */
const monthToDateRange = (today: string): { from: string; to: string } => {
  return { from: `${today.slice(0, 7)}-01`, to: today };
};

const Groups = () => {
  const { isManager } = useAuth();
  const { data: groups = [] } = usePlayerGroups();
  const { data: players = [] } = usePlayers();
  const { data: allTransactions = [] } = useTransactions();
  const { data: allExpenses = [] } = useExpenses();
  const createGroup = useCreateGroup();
  const addMember = useAddGroupMember();
  const removeMember = useRemoveGroupMember();
  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const today = serverBusinessDate || getBusinessDate();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);

  const [preset, setPreset] = useSessionState<DatePreset>("preset", "month");
  const initial = monthToDateRange(today);
  const [dateRange, setDateRange] = useSessionState<{ from: string; to: string }>("dateRange", initial);

  // Per-member period stats — accounts for membership window AND date filter
  const computeMemberStats = (m: any) => {
    const joinedAt = m.joined_at;
    const leftAt = m.left_at;
    const fromIso = `${dateRange.from}T00:00:00`;
    const toIso = `${dateRange.to}T23:59:59`;

    let drop = 0, cashout = 0, expenses = 0;

    for (const tx of allTransactions) {
      if (tx.player_id !== m.player_id) continue;
      if (tx.created_at < joinedAt) continue;
      if (leftAt && tx.created_at > leftAt) continue;
      if (tx.created_at < fromIso || tx.created_at > toIso) continue;
      const amt = Number(tx.amount) || 0;
      if (tx.type === "buy" || tx.type === "in") drop += amt;
      else if (tx.type === "cashout" || tx.type === "out") cashout += amt;
    }
    for (const exp of allExpenses) {
      if (exp.player_id !== m.player_id) continue;
      if (!exp.approved) continue;
      if (exp.created_at < joinedAt) continue;
      if (leftAt && exp.created_at > leftAt) continue;
      if (exp.created_at < fromIso || exp.created_at > toIso) continue;
      expenses += Number(exp.amount) || 0;
    }
    const result = cashout - drop;
    const realResult = result - expenses;
    return { drop, cashout, expenses, result, realResult };
  };

  // Searchable + alphabetical players for picker
  const sortedActivePlayers = useMemo(
    () => [...players]
      .filter((p: any) => p.status === "active")
      .sort((a: any, b: any) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
      ),
    [players]
  );

  return (
    <PageShell>
      <PageHeader
        icon={UsersRound}
        title="Player Groups"
        subtitle="Analytical only · Does not affect transactions"
        date
      >
        <DateRangePresets
          preset={preset}
          from={dateRange.from}
          to={dateRange.to}
          onChange={(v) => { setPreset(v.preset); setDateRange({ from: v.from, to: v.to }); }}
        />
        {isManager && (
          <Button onClick={() => setShowCreate(true)} size="sm"><Plus className="w-4 h-4 mr-1" /> New Group</Button>
        )}
      </PageHeader>

      <div className="space-y-4">
        {groups.map(group => {
          const allMembers = (group as any).group_members || [];
          const activeMembers = allMembers.filter((m: any) => !m.left_at);
          const memberRows = activeMembers.map((m: any) => ({ m, stats: computeMemberStats(m) }));
          const totals = memberRows.reduce(
            (acc, r) => {
              acc.drop += r.stats.drop; acc.cashout += r.stats.cashout;
              acc.expenses += r.stats.expenses; acc.result += r.stats.result; acc.realResult += r.stats.realResult;
              return acc;
            },
            { drop: 0, cashout: 0, expenses: 0, result: 0, realResult: 0 }
          );
          // Sort members A→Z
          memberRows.sort((a, b) =>
            `${a.m.players?.first_name} ${a.m.players?.last_name}`
              .localeCompare(`${b.m.players?.first_name} ${b.m.players?.last_name}`)
          );

          return (
            <div key={group.id} className="cms-panel">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-card-foreground">{group.name}</h3>
                  <span className="text-xs text-muted-foreground">({activeMembers.length} members)</span>
                </div>
                {isManager && (
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setAddingToGroup(group.id)}>
                    <Plus className="w-3 h-3 mr-1" /> Add Member
                  </Button>
                )}
              </div>

              {/* Group totals */}
              <div className="px-4 py-3 grid grid-cols-5 gap-3 border-b border-border bg-muted/30">
                <div><p className="text-[10px] uppercase text-muted-foreground">Drop</p><p className="font-mono text-sm font-bold text-card-foreground">{formatCurrency(totals.drop)}</p></div>
                <div><p className="text-[10px] uppercase text-muted-foreground">Cashout</p><p className="font-mono text-sm font-bold text-card-foreground">{formatCurrency(totals.cashout)}</p></div>
                <div><p className="text-[10px] uppercase text-muted-foreground">Result</p>
                  <p className={`font-mono text-sm font-bold ${totals.result >= 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>{formatCurrency(totals.result)}</p>
                </div>
                <div><p className="text-[10px] uppercase text-muted-foreground">Comps</p><p className="font-mono text-sm font-bold text-card-foreground">{formatCurrency(totals.expenses)}</p></div>
                <div><p className="text-[10px] uppercase text-muted-foreground">Real Result</p>
                  <p className={`font-mono text-sm font-bold ${totals.realResult >= 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>{formatCurrency(totals.realResult)}</p>
                </div>
              </div>

              {/* Per-member breakdown */}
              {memberRows.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 px-4">No members</p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="grid items-center px-4 py-2 border-b border-border bg-muted/10 gap-2"
                    style={{ gridTemplateColumns: "minmax(180px,1.4fr) 100px 110px 110px 110px 90px 110px 32px" }}>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Player</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Joined</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Drop</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Cashout</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Result</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Comps</span>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Real</span>
                    <span />
                  </div>
                  {memberRows.map(({ m, stats }) => (
                    <div key={m.id} className="grid items-center px-4 py-1.5 border-b border-border last:border-0 gap-2 hover:bg-muted/30"
                      style={{ gridTemplateColumns: "minmax(180px,1.4fr) 100px 110px 110px 110px 90px 110px 32px" }}>
                      <span className="text-xs text-card-foreground truncate">
                        {m.players?.first_name} {m.players?.last_name}
                        {m.players?.nickname && <span className="text-muted-foreground ml-1.5">({m.players.nickname})</span>}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">{fmtDate(m.joined_at)}</span>
                      <span className="text-xs font-mono text-card-foreground">{stats.drop ? formatCurrency(stats.drop) : <span className="text-muted-foreground">·</span>}</span>
                      <span className="text-xs font-mono text-card-foreground">{stats.cashout ? formatCurrency(stats.cashout) : <span className="text-muted-foreground">·</span>}</span>
                      <span className={`text-xs font-mono ${stats.result === 0 ? "text-muted-foreground" : stats.result > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                        {stats.result ? formatCurrency(stats.result) : "·"}
                      </span>
                      <span className="text-xs font-mono text-card-foreground">{stats.expenses ? formatCurrency(stats.expenses) : <span className="text-muted-foreground">·</span>}</span>
                      <span className={`text-xs font-mono ${stats.realResult === 0 ? "text-muted-foreground" : stats.realResult > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                        {stats.realResult ? formatCurrency(stats.realResult) : "·"}
                      </span>
                      {isManager ? (
                        <button onClick={() => removeMember.mutate(m.id)} className="text-muted-foreground hover:text-destructive justify-self-end">
                          <X className="w-3 h-3" />
                        </button>
                      ) : <span />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {groups.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">No groups created</p>}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Group</DialogTitle></DialogHeader>
          <Input placeholder="Group name" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => { createGroup.mutate(newName); setNewName(""); setShowCreate(false); }} disabled={!newName}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!addingToGroup} onOpenChange={() => setAddingToGroup(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
          <Command className="rounded-md border border-border">
            <CommandInput placeholder="Type a name or nickname…" autoFocus />
            <CommandList className="max-h-72">
              <CommandEmpty>No players found</CommandEmpty>
              <CommandGroup>
                {sortedActivePlayers.map((p: any) => {
                  const label = `${p.first_name} ${p.last_name}${p.nickname ? ` (${p.nickname})` : ""}`;
                  return (
                    <CommandItem
                      key={p.id}
                      value={label}
                      onSelect={() => {
                        if (addingToGroup) {
                          addMember.mutate({ groupId: addingToGroup, playerId: p.id });
                          setAddingToGroup(null);
                        }
                      }}
                    >
                      <Check className="w-3 h-3 mr-2 opacity-0" />
                      {label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddingToGroup(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
};

export default Groups;
