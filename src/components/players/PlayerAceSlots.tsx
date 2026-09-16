/**
 * Player profile → Slots (ACE) section.
 *
 * Conservative, additive extension of /players/:id. It NEVER touches the
 * existing table statistics: slot numbers come only from the ACE tables.
 *
 * Canon of this block:
 *   Slot Drop   = IN
 *   Slot Handle = ACE turnover only; N/A when ACE sends nothing
 *   Slot Result = IN - OUT (casino perspective)
 *
 * TODO (deliberately NOT done yet): a combined "Total Result" KPI. The existing
 * CMS table Result uses its current sign convention while ACE Slot Result is
 * specified as IN - OUT, so mixing them silently would produce a wrong number.
 * Decide the shared convention first, then add the combined KPI.
 */
import { useMemo, useState } from "react";
import { PageSection } from "@/components/layout/PageShell";
import { SmartTable } from "@/components/ui/smart-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Unlink } from "lucide-react";
import { formatMoneyFull } from "@/lib/format-money";
import { fmtDateOnly, fmtDateTime } from "@/lib/format-date";
import {
  useAceCasinos,
  useAcePlayerIdentities,
  useAcePlayerEgmDaily,
  useAcePlayerJackpots,
  useAttachAceIdentity,
  useUnlinkAceIdentity,
} from "@/hooks/use-ace-players";

const NA = <span className="text-muted-foreground">N/A</span>;
const sum = (rows: any[], key: string): number | null => {
  const vals = rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
  return vals.length ? vals.reduce((a, b) => a + Number(b), 0) : null;
};

interface Props {
  playerId: string;
  from: string;
  to: string;
  isSuperAdmin: boolean;
}

export default function PlayerAceSlots({ playerId, from, to, isSuperAdmin }: Props) {
  const { data: casinos = [] } = useAceCasinos();
  const casinoName = useMemo(() => new Map(casinos.map((c) => [c.id, c.name])), [casinos]);
  const identities = useAcePlayerIdentities(playerId);
  const egmDaily = useAcePlayerEgmDaily(playerId, from, to);
  const jackpots = useAcePlayerJackpots(playerId);

  const [aceInput, setAceInput] = useState("");
  const [branch, setBranch] = useState<string>("");
  const [conflict, setConflict] = useState<{ ace: string; casino: string } | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<any | null>(null);

  const attach = useAttachAceIdentity();
  const unlink = useUnlinkAceIdentity();

  const rows = egmDaily.data ?? [];
  const slotIn = sum(rows, "in_amount");
  const slotOut = sum(rows, "out_amount");
  const slotDrop = sum(rows, "drop_amount");
  const slotHandle = sum(rows, "handle_amount");
  const slotResult = slotIn === null && slotOut === null ? null : (slotIn ?? 0) - (slotOut ?? 0);

  /** Link exactly one ACE ID to this player, in one branch. */
  const submitAceId = async (force = false) => {
    const ace = aceInput.trim();
    if (!branch || !ace) return;
    const res = await attach.mutateAsync({
      player_id: playerId,
      casino_id: branch,
      ace_player_id: ace,
      force,
    });
    if (res?.status === "conflict") {
      setConflict({ ace, casino: branch });
      return;
    }
    setAceInput("");
  };

  const kpi = (label: string, value: React.ReactNode) => (
    <div className="rounded-md border border-border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageSection card title="Slots statistics (ACE)">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {kpi("Slot Drop", slotDrop === null ? NA : formatMoneyFull(slotDrop))}
          {kpi("Slot Handle", slotHandle === null ? NA : formatMoneyFull(slotHandle))}
          {kpi("IN", slotIn === null ? NA : formatMoneyFull(slotIn))}
          {kpi("OUT", slotOut === null ? NA : formatMoneyFull(slotOut))}
          {kpi(
            "Slot Result",
            slotResult === null ? (
              NA
            ) : (
              <span className={slotResult >= 0 ? "cms-amount-positive" : "cms-amount-negative"}>
                {formatMoneyFull(slotResult)}
              </span>
            ),
          )}
        </div>
        <div className="mt-4">
          <SmartTable
            data={rows}
            rowKey={(r: any) => r.id}
            loading={egmDaily.isLoading}
            empty={
              <div className="py-8 text-center text-sm text-muted-foreground">
                No ACE slot activity in this period.
              </div>
            }
            columns={[
              { key: "day", header: "Business day", accessor: (r: any) => fmtDateOnly(r.business_date) },
              { key: "egm", header: "EGM", accessor: (r: any) => r.egm_code },
              { key: "ace", header: "ACE ID", accessor: (r: any) => r.ace_player_id ?? "—" },
              { key: "in", header: "IN", type: "money", accessor: (r: any) => (r.in_amount === null ? NA : formatMoneyFull(r.in_amount)) },
              { key: "out", header: "OUT", type: "money", accessor: (r: any) => (r.out_amount === null ? NA : formatMoneyFull(r.out_amount)) },
              { key: "drop", header: "Drop", type: "money", accessor: (r: any) => (r.drop_amount === null ? NA : formatMoneyFull(r.drop_amount)) },
              { key: "handle", header: "Handle", type: "money", accessor: (r: any) => (r.handle_amount === null ? NA : formatMoneyFull(r.handle_amount)) },
              { key: "games", header: "Games", type: "int", accessor: (r: any) => r.games ?? NA },
              { key: "last", header: "Last play", accessor: (r: any) => (r.last_play_at ? fmtDateTime(r.last_play_at) : "—") },
            ]}
          />
        </div>
      </PageSection>

      <PageSection card title="Linked ACE identities">
        {isSuperAdmin && (
          <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <Label className="text-xs">ACE ID (one at a time)</Label>
              <Input value={aceInput} onChange={(e) => setAceInput(e.target.value)} placeholder="10231" />
            </div>
            <div>
              <Label className="text-xs">Branch (ACE IDs are unique per branch)</Label>
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {casinos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => submitAceId(false)} disabled={!aceInput.trim() || !branch || attach.isPending}>
              <Plus className="w-4 h-4 mr-1" /> Link ACE ID
            </Button>
          </div>
        )}

        {(identities.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">No ACE identities linked to this player.</div>
        ) : (
          <div className="space-y-3">
            {(identities.data ?? []).map((i: any) => (
              <div key={i.id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <span className="font-semibold">{casinoName.get(i.casino_id) ?? "—"}</span>
                    {" · ACE "}
                    <span className="font-mono">{i.ace_player_id}</span>
                    {i.ace_name ? ` · ${i.ace_name}` : ""}
                    {!i.is_active && <Badge variant="outline" className="ml-2">inactive</Badge>}
                    {i.is_auto_created && <Badge variant="outline" className="ml-2">auto</Badge>}
                  </div>
                  {isSuperAdmin && i.is_active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setUnlinkTarget(i)}
                    >
                      <Unlink className="w-4 h-4 mr-1" /> Unlink
                    </Button>
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Cards:{" "}
                  {(i.player_ace_cards ?? []).length
                    ? (i.player_ace_cards ?? [])
                        .map((c: any) => `${c.card_number}${c.is_active ? "" : " (old)"}`)
                        .join(", ")
                    : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageSection>

      <PageSection card title="Jackpots">
        <SmartTable
          data={jackpots.data ?? []}
          rowKey={(r: any) => r.id}
          loading={jackpots.isLoading}
          empty={<div className="py-8 text-center text-sm text-muted-foreground">No jackpot wins recorded.</div>}
          columns={[
            { key: "time", header: "Time", accessor: (r: any) => (r.occurred_at ? fmtDateTime(r.occurred_at) : fmtDateOnly(r.business_date)) },
            { key: "name", header: "Jackpot", accessor: (r: any) => r.jackpot_name ?? "—" },
            { key: "amount", header: "Amount", type: "money", accessor: (r: any) => (r.amount === null ? NA : formatMoneyFull(r.amount)) },
            { key: "egm", header: "EGM", accessor: (r: any) => r.egm_code ?? "—" },
            { key: "branch", header: "Branch", accessor: (r: any) => casinoName.get(r.casino_id) ?? "—" },
            { key: "ace", header: "ACE ID", accessor: (r: any) => r.ace_player_id ?? "—" },
          ]}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Jackpot payouts are already included in OUT, so they are never added to Slot Result again.
        </p>
      </PageSection>

      <AlertDialog open={!!conflict} onOpenChange={(o) => !o && setConflict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ACE ID belongs to another player</AlertDialogTitle>
            <AlertDialogDescription>
              ACE ID {conflict?.ace} is already linked to a different CMS player in this branch.
              Move it to this player? The change is recorded in the ACE identity audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const c = conflict;
                setConflict(null);
                if (!c) return;
                await attach.mutateAsync({
                  player_id: playerId,
                  casino_id: c.casino,
                  ace_player_id: c.ace,
                  force: true,
                });
                setAceInput("");
              }}
            >
              Move it here
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
