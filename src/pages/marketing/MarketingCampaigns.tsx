/**
 * G3 · Marketing — Campaigns list page.
 * Manager / Finance / Super Admin can create campaigns.
 * Read access: same casino users.
 */
import { useMemo, useState } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { useNavigate } from "react-router-dom";
import { Megaphone, Plus } from "lucide-react";
import { useCasino } from "@/lib/casino-context";
import {
  usePromoCampaigns,
  useCreatePromoCampaign,
  type PromoCampaignType,
  type PromoCampaignStatus,
} from "@/hooks/use-promo-campaigns";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateOnly } from "@/lib/format-date";
import { toast } from "@/hooks/use-toast";

const TYPE_LABEL: Record<PromoCampaignType, string> = {
  event: "Event",
  bonus: "Bonus",
  advertising: "Advertising",
  sponsorship: "Sponsorship",
  other: "Other",
};

const STATUS_LABEL: Record<PromoCampaignStatus, string> = {
  planned: "Planned",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_STYLE: Record<PromoCampaignStatus, string> = {
  planned: "bg-muted text-muted-foreground border-border",
  active: "bg-cms-amount-positive/15 text-cms-amount-positive border-cms-amount-positive/30",
  completed: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

const today = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

export default function MarketingCampaigns() {
  const { activeCasinoId } = useCasino();
  const nav = useNavigate();
  const { data = [], isLoading } = usePromoCampaigns(activeCasinoId);
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useSessionState<"all" | PromoCampaignStatus>("statusFilter", "all");

  const rows = useMemo(
    () => data.filter((c) => statusFilter === "all" || c.status === statusFilter),
    [data, statusFilter],
  );

  return (
    <PageShell>
      <PageHeader
        icon={Megaphone}
        title="Marketing Campaigns"
        subtitle="Promotional budgets, expenses and ROI"
      >
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Campaign
        </Button>
      </PageHeader>


      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">{rows.length} campaigns</div>
      </div>

      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Budget (TZS)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No campaigns yet.</TableCell></TableRow>
            )}
            {rows.map((c) => (
              <TableRow
                key={c.id}
                className="cursor-pointer hover:bg-accent/40"
                onClick={() => nav(`/marketing/campaigns/${c.id}`)}
              >
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{TYPE_LABEL[c.campaign_type]}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] uppercase ${STATUS_STYLE[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs font-mono">
                  {fmtDateOnly(c.starts_on)} {c.ends_on ? `– ${fmtDateOnly(c.ends_on)}` : "– …"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatNumberSpaces(c.budget_tzs)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <NewCampaignDialog
        open={open}
        onOpenChange={setOpen}
        casinoId={activeCasinoId}
        onCreated={(id) => {
          setOpen(false);
          nav(`/marketing/campaigns/${id}`);
        }}
      />
    </PageShell>
  );
}

function NewCampaignDialog({
  open, onOpenChange, casinoId, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  casinoId: string | null;
  onCreated: (id: string) => void;
}) {
  const create = useCreatePromoCampaign();
  const [name, setName] = useState("");
  const [type, setType] = useState<PromoCampaignType>("event");
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState("");
  const [budget, setBudget] = useState("0");
  const [description, setDescription] = useState("");

  const submit = async () => {
    if (!casinoId || !name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    try {
      const id = await create.mutateAsync({
        casino_id: casinoId,
        name: name.trim(),
        campaign_type: type,
        status: "planned",
        starts_on: startsOn,
        ends_on: endsOn || null,
        budget_tzs: Number(budget.replace(/\s/g, "")) || 0,
        description: description.trim() || null,

      });
      toast({ title: "Campaign created" });
      onCreated(id);
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New campaign</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as PromoCampaignType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="bonus">Bonus</SelectItem>
                  <SelectItem value="advertising">Advertising</SelectItem>
                  <SelectItem value="sponsorship">Sponsorship</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Budget (TZS)</Label>
              <Input
                inputMode="numeric"
                value={budget}
                onChange={(e) => setBudget(e.target.value.replace(/[^\d\s]/g, ""))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Starts</Label>
              <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Ends (optional)</Label>
              <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
