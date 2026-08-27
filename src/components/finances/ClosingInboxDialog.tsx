/**
 * Closing Wallet Inbox — review & post the monetary balances of a closed
 * business day into Office wallets.
 *
 * Rules (server-enforced, mirrored here for UX):
 *  - LIVE and SLOTS are reviewed in separate tabs but posted together.
 *  - Cash is shown by currency AND denomination; mobile/bank as single amounts.
 *  - Chips and player cards are never part of this inbox.
 *  - Corrections never touch the original closing: Original / Correction / Final.
 *  - ONE global "Post All" — atomic and idempotent on the server.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Check, Inbox, Pencil } from "lucide-react";

import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useFinWallets } from "@/hooks/use-fin";
import {
  useClosingInbox,
  usePostClosingInbox,
  useSetInboxCorrection,
  useSetInboxWallet,
  type ClosingInboxRow,
} from "@/hooks/use-closing-inbox";

const amt = (n: number) => formatNumberSpaces(Math.round(n));
const signed = (n: number) => (n > 0 ? `+${amt(n)}` : n < 0 ? `−${amt(Math.abs(n))}` : "·");

function CorrectionDialog({
  row,
  open,
  onOpenChange,
}: {
  row: ClosingInboxRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const setCorrection = useSetInboxCorrection();
  const [deltaCount, setDeltaCount] = useState<string>("");
  const [deltaAmount, setDeltaAmount] = useState<string>("");
  const [reason, setReason] = useState("");

  const isCash = row?.source_kind === "cash";
  const dc = Number(deltaCount) || 0;
  const da = isCash ? dc * Number(row?.denomination || 0) : Number(deltaAmount) || 0;
  const final = (row?.orig_amount || 0) + da;

  if (!row) return null;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setDeltaCount("");
          setDeltaAmount("");
          setReason("");
        }
        onOpenChange(v);
      }}
      title={`Correction · ${row.label}${row.denomination ? ` · ${amt(row.denomination)}` : ""}`}
      size="form"
    >
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-2 font-mono tabular-nums">
          <div>
            <div className="text-xs text-muted-foreground">Original</div>
            <div>{amt(row.orig_amount)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Correction</div>
            <div className={cn(da < 0 && "cms-amount-negative", da > 0 && "cms-amount-positive")}>
              {signed(da)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Final</div>
            <div>{amt(final)}</div>
          </div>
        </div>

        {isCash ? (
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              Note count delta (e.g. −1 means one note less)
            </div>
            <NumberInput
              decimals={0}
              allowNegative
              value={deltaCount === "" ? null : deltaCount}
              onValueChange={(v) => setDeltaCount(v == null ? "" : String(v))}
            />
          </div>
        ) : (
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              Net delta — applies to the amount posted (IN − OUT). The closing balance
              {row.final_balance != null ? ` (${amt(row.final_balance)})` : ""} stays unchanged as control figure.
            </div>
            <NumberInput
              decimals={2}
              allowNegative
              value={deltaAmount === "" ? null : deltaAmount}
              onValueChange={(v) => setDeltaAmount(v == null ? "" : String(v))}
            />
          </div>
        )}


        <div>
          <div className="text-xs text-muted-foreground mb-1">Reason (required)</div>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why does the physical recount differ from the closing?"
            rows={3}
          />
        </div>
      </div>

      <ResponsiveDialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          disabled={(da === 0 && !row.corr_delta_amount) || (da !== 0 && !reason.trim()) || setCorrection.isPending}
          onClick={() =>
            setCorrection.mutate(
              {
                rowId: row.id,
                deltaCount: isCash ? dc : 0,
                deltaAmount: isCash ? 0 : da,
                reason: reason.trim(),
              },
              { onSuccess: () => onOpenChange(false) },
            )
          }
        >
          Save correction
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
}

function SectionTable({
  rows,
  posted,
  onCorrect,
}: {
  rows: ClosingInboxRow[];
  posted: boolean;
  onCorrect: (r: ClosingInboxRow) => void;
}) {
  const { data: wallets = [] } = useFinWallets();
  const setWallet = useSetInboxWallet();

  const groups = useMemo(() => {
    const cash = new Map<string, ClosingInboxRow[]>();
    const others: ClosingInboxRow[] = [];
    rows.forEach((r) => {
      if (r.source_kind === "cash") {
        const arr = cash.get(r.currency) || [];
        arr.push(r);
        cash.set(r.currency, arr);
      } else others.push(r);
    });
    return { cash: Array.from(cash.entries()), others };
  }, [rows]);

  if (!rows.length) {
    return <div className="text-sm text-muted-foreground py-6 text-center">No money rows for this section.</div>;
  }

  const walletCell = (r: ClosingInboxRow) => {
    if (posted) return <span className="text-muted-foreground">{r.wallet_name || "—"}</span>;
    const opts = (wallets as any[]).filter(
      (w) => (w.currency || "TZS") === r.currency && w.is_active !== false,
    );
    return (
      <Select value={r.wallet_id || ""} onValueChange={(v) => setWallet.mutate({ rowId: r.id, walletId: v })}>
        <SelectTrigger className={cn("h-7 text-xs", !r.wallet_id && "border-destructive text-destructive")}>
          <SelectValue placeholder="Needs mapping" />
        </SelectTrigger>
        <SelectContent>
          {opts.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const line = (r: ClosingInboxRow, label: string) => (
    <tr key={r.id} className="border-b border-border/40">
      <td className="py-1 pr-2">{label}</td>
      <td className="py-1 pr-2 text-right font-mono tabular-nums">
        {r.orig_count != null ? r.orig_count : "·"}
      </td>
      <td className="py-1 pr-2 text-right font-mono tabular-nums">{amt(r.orig_amount)}</td>
      <td
        className={cn(
          "py-1 pr-2 text-right font-mono tabular-nums",
          r.corr_delta_amount < 0 && "cms-amount-negative",
          r.corr_delta_amount > 0 && "cms-amount-positive",
        )}
        title={r.correction_reason || undefined}
      >
        {signed(r.corr_delta_amount)}
      </td>
      <td className="py-1 pr-2 text-right font-mono tabular-nums font-medium">{amt(r.final_amount)}</td>
      <td className="py-1 pr-2 min-w-[150px]">{walletCell(r)}</td>
      <td className="py-1 text-right">
        {!posted && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onCorrect(r)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        )}
      </td>
    </tr>
  );

  const head = (
    <thead>
      <tr className="text-[11px] uppercase text-muted-foreground border-b">
        <th className="text-left font-medium py-1 pr-2">Source</th>
        <th className="text-right font-medium py-1 pr-2">Qty</th>
        <th className="text-right font-medium py-1 pr-2">Original</th>
        <th className="text-right font-medium py-1 pr-2">Correction</th>
        <th className="text-right font-medium py-1 pr-2">Final</th>
        <th className="text-left font-medium py-1 pr-2">Destination wallet</th>
        <th />
      </tr>
    </thead>
  );

  return (
    <div className="space-y-4">
      {groups.cash.map(([cur, list]) => {
        const total = list.reduce((a, r) => a + Number(r.final_amount || 0), 0);
        return (
          <div key={cur}>
            <div className="text-xs font-semibold mb-1">Cash · {cur}</div>
            <table className="w-full text-xs">
              {head}
              <tbody>
                {list
                  .slice()
                  .sort((a, b) => Number(b.denomination || 0) - Number(a.denomination || 0))
                  .map((r) => line(r, `${amt(Number(r.denomination || 0))} × note`))}
                <tr className="font-medium">
                  <td className="py-1 pr-2">Total {cur}</td>
                  <td />
                  <td className="py-1 pr-2 text-right font-mono tabular-nums">
                    {amt(list.reduce((a, r) => a + Number(r.orig_amount || 0), 0))}
                  </td>
                  <td className="py-1 pr-2 text-right font-mono tabular-nums">
                    {signed(list.reduce((a, r) => a + Number(r.corr_delta_amount || 0), 0))}
                  </td>
                  <td className="py-1 pr-2 text-right font-mono tabular-nums">{amt(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}

      {groups.others.length > 0 && (
        <div>
          <div className="text-xs font-semibold mb-1">Mobile money / Bank</div>
          <table className="w-full text-xs">
            {head}
            <tbody>{groups.others.map((r) => line(r, `${r.label} (${r.currency})`))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ClosingInboxDialog({
  open,
  onOpenChange,
  businessDate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  businessDate?: string | null;
}) {
  const { data, isLoading } = useClosingInbox(businessDate ?? null, open);
  const post = usePostClosingInbox();
  const [tab, setTab] = useState<"live" | "slots">("live");
  const [corrRow, setCorrRow] = useState<ClosingInboxRow | null>(null);

  const rows = data?.rows || [];
  const inbox = data?.inbox || null;
  const live = rows.filter((r) => r.section === "live");
  const slots = rows.filter((r) => r.section === "slots");
  const posted = inbox?.status === "posted";

  const unmapped = rows.filter((r) => Number(r.final_amount) !== 0 && !r.wallet_id).length;
  const missingReason = rows.filter(
    (r) => Number(r.corr_delta_amount) !== 0 && !r.correction_reason?.trim(),
  ).length;
  const corrTotal = rows.reduce((a, r) => a + Number(r.corr_delta_amount || 0), 0);
  const blocked = posted || unmapped > 0 || missingReason > 0 || !inbox;

  const sectionTotal = (list: ClosingInboxRow[]) =>
    list.reduce((a, r) => a + Number(r.final_amount || 0), 0);

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Closing Inbox"
        description={
          inbox
            ? `Business date ${fmtDate(inbox.business_date)} · ${posted ? "Posted" : "Pending review"}`
            : "No pending closing inbox"
        }
        size="4xl"
      >
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : !inbox ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            <Inbox className="w-5 h-5 mx-auto mb-2 opacity-60" />
            Nothing to review. An inbox is created automatically after a Day Closing.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={posted ? "secondary" : "default"}>
                {posted ? "POSTED" : blocked ? "PENDING REVIEW" : "READY TO POST"}
              </Badge>
              <span className="text-muted-foreground">
                Money only — chips and player cards are excluded.
              </span>
              {corrTotal !== 0 && (
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    corrTotal < 0 ? "cms-amount-negative" : "cms-amount-positive",
                  )}
                >
                  Total corrections {signed(corrTotal)}
                </span>
              )}
            </div>

            {(unmapped > 0 || missingReason > 0) && !posted && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="w-4 h-4" />
                {unmapped > 0 && <span>{unmapped} row(s) need a destination wallet.</span>}
                {missingReason > 0 && <span>{missingReason} correction(s) need a reason.</span>}
              </div>
            )}

            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList>
                <TabsTrigger value="live">
                  LIVE · {amt(sectionTotal(live))}
                </TabsTrigger>
                <TabsTrigger value="slots">
                  SLOTS · {amt(sectionTotal(slots))}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="live" className="mt-3">
                <SectionTable rows={live} posted={posted} onCorrect={setCorrRow} />
              </TabsContent>
              <TabsContent value="slots" className="mt-3">
                <SectionTable rows={slots} posted={posted} onCorrect={setCorrRow} />
              </TabsContent>
            </Tabs>
          </div>
        )}

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {inbox && !posted && (
            <Button disabled={blocked || post.isPending} onClick={() => post.mutate(inbox.id)}>
              <Check className="w-4 h-4" /> Post All
            </Button>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialog>

      <CorrectionDialog row={corrRow} open={!!corrRow} onOpenChange={(v) => !v && setCorrRow(null)} />
    </>
  );
}
