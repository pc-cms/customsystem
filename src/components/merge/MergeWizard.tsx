import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { useBasketPlayers, useMergePlayers } from "@/hooks/use-merge-players";
import { useMergeBasket } from "@/hooks/use-merge-basket";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { fmtDate } from "@/lib/format-date";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: (mergeId: string, survivorId: string) => void;
}

const FIELDS: { key: string; label: string }[] = [
  { key: "photo_url", label: "Photo" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "nickname", label: "Nickname" },
  { key: "id_number", label: "ID number" },
  { key: "phone", label: "Phone" },
  { key: "birth_date", label: "Birth date" },
  { key: "category", label: "Category" },
  { key: "player_type", label: "Type" },
];

export const MergeWizard = ({ open, onOpenChange, onDone }: Props) => {
  const { ids, clear } = useMergeBasket();
  const { data: players = [] } = useBasketPlayers(ids);
  const merge = useMergePlayers();

  // Ordered by created_at
  const ordered = useMemo(() =>
    [...players].sort((a: any, b: any) => (a.created_at || "").localeCompare(b.created_at || "")),
    [players]
  );

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [survivorId, setSurvivorId] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  // reset when opened
  useMemo(() => {
    if (open) {
      const first = ordered[0]?.id ?? null;
      setSurvivorId(first);
      setStep(1);
      const initial: Record<string, string> = {};
      for (const f of FIELDS) {
        const src = ordered.find((p: any) => p[f.key]);
        if (src) initial[f.key] = src.id;
      }
      setChoices(initial);
      setReason("");
      setAck(false);
      setConfirmName("");
    }
  }, [open, ordered.length]);

  const survivor: any = ordered.find(p => p.id === survivorId);
  const losers = ordered.filter(p => p.id !== survivorId);
  const loserIds = losers.map(p => p.id);

  // affected counts preview
  const { data: counts } = useQuery({
    queryKey: ["merge-preview-counts", loserIds],
    enabled: open && step === 2 && loserIds.length > 0,
    queryFn: async () => {
      const tables = ["casino_visits", "transactions", "expenses", "player_cards", "player_notes", "player_tags"] as const;
      const out: Record<string, number> = {};
      for (const t of tables) {
        const { count } = await supabase.from(t as any).select("*", { count: "exact", head: true }).in("player_id", loserIds);
        out[t] = count ?? 0;
      }
      return out;
    },
  });

  const anyBlacklist = losers.some((p: any) => p.status === "blacklist");
  const canConfirm = reason.trim().length >= 10 && ack &&
    confirmName.trim().toLowerCase() === (survivor?.last_name ?? "").trim().toLowerCase();

  const submit = async () => {
    if (!survivor) return;
    try {
      const mergeId = await merge.mutateAsync({
        survivor_id: survivor.id,
        loser_ids: loserIds,
        field_choices: choices,
        reason: reason.trim(),
      });
      clear();
      onOpenChange(false);
      onDone(mergeId, survivor.id);
    } catch {}
  };

  if (!open || ordered.length < 2) return null;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Merge ${ordered.length} players — Step ${step} of 3`}
      className="max-w-5xl"
    >
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pick the surviving profile (green header) and choose which value wins for each field.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-2 sticky left-0 bg-background">Field</th>
                  {ordered.map((p: any) => (
                    <th key={p.id} className={`p-2 text-left border-l ${p.id === survivorId ? "bg-primary/10" : ""}`}>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="survivor"
                          checked={survivorId === p.id}
                          onChange={() => setSurvivorId(p.id)}
                        />
                        <span className="font-medium">
                          {p.first_name} {p.last_name}
                          {p.status === "blacklist" && <Badge variant="destructive" className="ml-1">BL</Badge>}
                        </span>
                      </label>
                      <div className="text-muted-foreground font-normal mt-0.5">
                        Registered {fmtDate(p.created_at)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FIELDS.map(f => (
                  <tr key={f.key} className="border-t">
                    <td className="p-2 font-medium sticky left-0 bg-background">{f.label}</td>
                    {ordered.map((p: any) => {
                      const val = p[f.key];
                      const disabled = val === null || val === undefined || val === "";
                      const isChosen = choices[f.key] === p.id;
                      return (
                        <td key={p.id} className={`p-2 border-l ${isChosen ? "bg-primary/5" : ""}`}>
                          <label className={`flex items-center gap-2 ${disabled ? "opacity-40" : "cursor-pointer"}`}>
                            <input
                              type="radio"
                              name={`f_${f.key}`}
                              checked={isChosen}
                              disabled={disabled}
                              onChange={() => setChoices({ ...choices, [f.key]: p.id })}
                            />
                            {f.key === "photo_url" ? (
                              val ? <img src={val} alt="" className="h-10 w-10 rounded object-cover" /> : <span>—</span>
                            ) : f.key === "birth_date" ? (
                              <span>{val ? fmtDate(val) : "—"}</span>
                            ) : (
                              <span className="truncate max-w-[160px]">{String(val ?? "—")}</span>
                            )}
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-lg border p-3 bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">Survivor</div>
            <div className="font-semibold">{survivor?.first_name} {survivor?.last_name} · #{survivor?.id_number || "—"}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground mb-2">These records will move to the survivor:</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {counts ? Object.entries(counts).map(([k, v]) => (
                <div key={k}>
                  <div className="text-2xl font-bold cms-mono">{v}</div>
                  <div className="text-xs text-muted-foreground">{k.replace(/_/g, " ")}</div>
                </div>
              )) : <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          </div>
          {anyBlacklist && survivor?.status !== "blacklist" && (
            <div className="rounded-lg border-2 border-destructive/50 bg-destructive/10 p-3 flex items-start gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                One of the merged profiles is <strong>Blacklisted</strong>.
                The survivor will inherit blacklist status.
              </div>
            </div>
          )}
          <div className="rounded-lg border p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">These profiles will become inactive (merged) and hidden from lists:</strong>
            <ul className="mt-2 space-y-1">
              {losers.map((p: any) => (
                <li key={p.id}>· {p.first_name} {p.last_name} · #{p.id_number || "—"}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div>
            <Label>Reason for merge (min. 10 characters)</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Same person registered 3 times on Nov 21 due to reception error"
              rows={3}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Retype survivor's last name to confirm: <strong>{survivor?.last_name}</strong></Label>
            <Input
              value={confirmName}
              onChange={e => setConfirmName(e.target.value)}
              placeholder={survivor?.last_name}
              className="mt-1"
            />
          </div>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox checked={ack} onCheckedChange={v => setAck(!!v)} className="mt-0.5" />
            <span>I understand this action moves all visits, transactions, cards and notes to the survivor. <strong>This action is permanent and cannot be undone.</strong></span>
          </label>
        </div>
      )}

      <ResponsiveDialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={merge.isPending}>
          Cancel
        </Button>
        {step > 1 && (
          <Button variant="outline" onClick={() => setStep((step - 1) as 1 | 2)} disabled={merge.isPending}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        )}
        {step < 3 && (
          <Button onClick={() => setStep((step + 1) as 2 | 3)} disabled={!survivorId}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
        {step === 3 && (
          <Button onClick={submit} disabled={!canConfirm || merge.isPending}>
            {merge.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Merge {ordered.length} players
          </Button>
        )}
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
};
