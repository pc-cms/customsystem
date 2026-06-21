/**
 * G4 · Player CRM page — operational list for hosts/managers.
 * Not financial analytics: contacts + behavior + tags + host assignment.
 */
import { useMemo, useState } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { useNavigate } from "react-router-dom";
import { Users, RefreshCw, Phone, MessageCircle, Cake, Lock, Search } from "lucide-react";
import { useCasino } from "@/lib/casino-context";
import {
  useCrmPlayers,
  useUpsertCrm,
  useRecalcSegments,
  useCasinoHosts,
  type CrmPlayerRow,
  type CrmSegment,
} from "@/hooks/use-crm-players";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { fmtDateOnly } from "@/lib/format-date";

const SEGMENT_LABEL: Record<CrmSegment, string> = {
  vip: "VIP",
  regular: "Regular",
  new: "New",
  dormant: "Dormant",
  custom: "Custom",
};

const SEGMENT_STYLE: Record<CrmSegment, string> = {
  vip: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  regular: "bg-muted text-muted-foreground border-border",
  new: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  dormant: "bg-destructive/15 text-destructive border-destructive/30",
  custom: "bg-purple-500/15 text-purple-600 border-purple-500/30",
};

type BirthdayFilter = "all" | "today" | "week" | "month";

const isBirthday = (bd: string | null, mode: BirthdayFilter): boolean => {
  if (mode === "all") return true;
  if (!bd) return false;
  const d = new Date(bd + "T00:00:00");
  const today = new Date();
  const thisYearBd = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (mode === "today") {
    return thisYearBd.toDateString() === today.toDateString();
  }
  const diff = (thisYearBd.getTime() - today.setHours(0, 0, 0, 0)) / 86400000;
  if (mode === "week") return diff >= 0 && diff <= 7;
  if (mode === "month") return thisYearBd.getMonth() === new Date().getMonth();
  return true;
};

const daysAgo = (ymd: string | null): number | null => {
  if (!ymd) return null;
  const d = new Date(ymd + "T00:00:00");
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};

export default function CrmPlayers() {
  const { activeCasinoId } = useCasino();
  const nav = useNavigate();
  const { data = [], isLoading } = useCrmPlayers(activeCasinoId);
  const recalc = useRecalcSegments();
  const [search, setSearch] = useSessionState<string>("search", "");
  const [segFilter, setSegFilter] = useSessionState<"all" | CrmSegment>("segFilter", "all");
  const [bdFilter, setBdFilter] = useSessionState<BirthdayFilter>("bdFilter", "all");
  const [hostFilter, setHostFilter] = useSessionState<"all" | "assigned" | "unassigned">("hostFilter", "all");
  const [editing, setEditing] = useState<CrmPlayerRow | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((r) => {
      if (segFilter !== "all" && r.segment !== segFilter) return false;
      if (!isBirthday(r.birth_date, bdFilter)) return false;
      if (hostFilter === "assigned" && !r.host_user_id) return false;
      if (hostFilter === "unassigned" && r.host_user_id) return false;
      if (q) {
        const hay = [r.first_name, r.last_name, r.nickname, r.phone, r.card_number ?? ""]
          .join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, search, segFilter, bdFilter, hostFilter]);

  const stats = useMemo(() => {
    const out = { vip: 0, regular: 0, new: 0, dormant: 0, custom: 0, total: data.length, bdayWeek: 0, dormant60: 0, unassigned: 0 };
    for (const r of data) {
      out[r.segment]++;
      if (isBirthday(r.birth_date, "week")) out.bdayWeek++;
      if (r.segment === "dormant") out.dormant60++;
      if (!r.host_user_id) out.unassigned++;
    }
    return out;
  }, [data]);

  return (
    <PageShell>
      <PageHeader
        icon={Users}
        title="Player CRM"
        subtitle="Contacts · segments · hosts · birthdays"
      >
        <Button
          variant="outline"
          onClick={() => activeCasinoId && recalc.mutate(activeCasinoId)}
          disabled={recalc.isPending || !activeCasinoId}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${recalc.isPending ? "animate-spin" : ""}`} />
          Recalc segments
        </Button>
      </PageHeader>

      <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KpiCard label="Total" value={stats.total} />
          <KpiCard label="VIP" value={stats.vip} tone="vip" />
          <KpiCard label="New (30d)" value={stats.new} tone="new" />
          <KpiCard label="Dormant 60+" value={stats.dormant60} tone="dormant" />
          <KpiCard label="Birthdays · week" value={stats.bdayWeek} icon={Cake} />
          <KpiCard label="Unassigned host" value={stats.unassigned} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Search</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name / phone / card"
                className="pl-8"
              />
            </div>
          </div>
          <Filter label="Segment" value={segFilter} onChange={(v) => setSegFilter(v as any)} opts={[
            ["all", "All"], ["vip", "VIP"], ["regular", "Regular"],
            ["new", "New"], ["dormant", "Dormant"], ["custom", "Custom"],
          ]} />
          <Filter label="Birthday" value={bdFilter} onChange={(v) => setBdFilter(v as any)} opts={[
            ["all", "All"], ["today", "Today"], ["week", "This week"], ["month", "This month"],
          ]} />
          <Filter label="Host" value={hostFilter} onChange={(v) => setHostFilter(v as any)} opts={[
            ["all", "All"], ["assigned", "Assigned"], ["unassigned", "Unassigned"],
          ]} />
          <div className="text-xs text-muted-foreground">{rows.length} / {data.length}</div>
        </div>
      </div>

      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead>Card</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Segment</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Birthday</TableHead>
              <TableHead className="text-right">Last visit</TableHead>
              <TableHead className="text-right">Visits 90d</TableHead>
              <TableHead className="text-right">Last contact</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">No players match filters.</TableCell></TableRow>
            )}
            {rows.map((r) => {
              const ago = daysAgo(r.last_visit);
              const lastContact = r.last_contact_at ? new Date(r.last_contact_at) : null;
              const bdayIsToday = isBirthday(r.birth_date, "today");
              const bdayIsWeek = !bdayIsToday && isBirthday(r.birth_date, "week");
              return (
                <TableRow key={r.player_id} className="hover:bg-accent/40">
                  <TableCell>
                    <button
                      type="button"
                      className="font-medium hover:underline text-left"
                      onClick={() => nav(`/players/${r.player_id}`)}
                    >
                      {r.last_name} {r.first_name}
                      {r.nickname && <span className="text-muted-foreground text-xs ml-1">"{r.nickname}"</span>}
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.card_number ?? "·"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.phone ? (
                      <a href={`tel:${r.phone}`} className="hover:underline inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {r.phone}
                      </a>
                    ) : "·"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] uppercase ${SEGMENT_STYLE[r.segment]}`}>
                      {r.segment_locked && <Lock className="h-2.5 w-2.5 mr-1 inline" />}
                      {SEGMENT_LABEL[r.segment]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.host_name ?? <span className="italic">unassigned</span>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.birth_date ? (
                      <span className={bdayIsToday ? "text-amber-600 font-semibold" : bdayIsWeek ? "text-sky-600" : "text-muted-foreground"}>
                        {fmtDateOnly(r.birth_date).slice(0, 5)}
                      </span>
                    ) : "·"}
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono">
                    {r.last_visit ? (
                      <span className={ago !== null && ago > 60 ? "text-destructive" : ""}>
                        {fmtDateOnly(r.last_visit)} <span className="text-muted-foreground">({ago}d)</span>
                      </span>
                    ) : "·"}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{r.visits_90d}</TableCell>
                  <TableCell className="text-right text-xs font-mono">
                    {lastContact ? (
                      <span title={r.last_contact_note}>
                        {fmtDateOnly(lastContact.toISOString().slice(0, 10))}
                      </span>
                    ) : <span className="text-muted-foreground">·</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      {r.phone && (
                        <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="WhatsApp">
                          <a
                            href={`https://wa.me/${r.phone.replace(/[^\d]/g, "")}`}
                            target="_blank" rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => setEditing(r)}>Edit</Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <EditCrmDialog
          row={editing}
          casinoId={activeCasinoId!}
          open={!!editing}
          onClose={() => setEditing(null)}
        />
      )}
    </PageShell>
  );
}

function KpiCard({ label, value, tone, icon: Icon }: { label: string; value: number; tone?: CrmSegment; icon?: typeof Cake }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        {Icon && <Icon className="h-3 w-3" />}
      </div>
      <div className={`text-xl font-semibold tabular-nums ${tone ? SEGMENT_STYLE[tone].split(" ")[1] : ""}`}>{value}</div>
    </div>
  );
}

function Filter({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: [string, string][] }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          {opts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function EditCrmDialog({
  row, casinoId, open, onClose,
}: { row: CrmPlayerRow; casinoId: string; open: boolean; onClose: () => void }) {
  const upsert = useUpsertCrm();
  const { data: hosts = [] } = useCasinoHosts(casinoId);
  const [host, setHost] = useState(row.host_user_id ?? "__none__");
  const [segment, setSegment] = useState<CrmSegment>(row.segment);
  const [segmentLocked, setSegmentLocked] = useState(row.segment_locked);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState(row.custom_tags.join(", "));

  const save = async () => {
    const tagArr = tags.split(",").map((t) => t.trim()).filter(Boolean);
    await upsert.mutateAsync({
      player_id: row.player_id,
      casino_id: casinoId,
      host_user_id: host === "__none__" ? null : host,
      segment,
      segment_locked: segmentLocked,
      custom_tags: tagArr,
      ...(note.trim() ? {
        last_contact_note: note.trim(),
        last_contact_at: new Date().toISOString(),
      } : {}),
    });
    onClose();
  };

  const markBirthdaySent = async () => {
    await upsert.mutateAsync({
      player_id: row.player_id,
      casino_id: casinoId,
      birthday_card_sent_year: new Date().getFullYear(),
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row.last_name} {row.first_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Host</Label>
              <Select value={host} onValueChange={setHost}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Unassigned —</SelectItem>
                  {hosts.map((h) => (
                    <SelectItem key={h.user_id} value={h.user_id}>{h.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Segment</Label>
              <Select value={segment} onValueChange={(v) => setSegment(v as CrmSegment)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vip">VIP</SelectItem>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="dormant">Dormant</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Switch checked={segmentLocked} onCheckedChange={setSegmentLocked} id="lock" />
            <Label htmlFor="lock" className="cursor-pointer">
              Lock segment (skip auto-recalc)
            </Label>
          </div>

          <div className="space-y-1">
            <Label>Custom tags (comma-separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vip-friend, high-roller" />
          </div>

          <div className="space-y-1">
            <Label>Add contact note (optional)</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Called to confirm visit Friday"
            />
            {row.last_contact_at && (
              <div className="text-[11px] text-muted-foreground">
                Last: {fmtDateOnly(row.last_contact_at.slice(0, 10))} · {row.last_contact_note || "—"}
              </div>
            )}
          </div>

          {row.birth_date && (
            <div className="rounded-md border border-border p-2 flex items-center justify-between text-xs">
              <span>
                <Cake className="inline h-3 w-3 mr-1" />
                Birthday card {new Date().getFullYear()}: {row.birthday_card_sent_year === new Date().getFullYear() ? "✓ sent" : "not sent"}
              </span>
              {row.birthday_card_sent_year !== new Date().getFullYear() && (
                <Button size="sm" variant="outline" onClick={markBirthdaySent} disabled={upsert.isPending}>
                  Mark sent
                </Button>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
