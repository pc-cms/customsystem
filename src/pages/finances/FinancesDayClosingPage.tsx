import { useEffect, useState, useMemo } from "react";
import { ClipboardPen, Lock, Plus, Trash2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useFinDayClosing, useDayClosingList, useUpsertDayClosing, useLockDayClosing,
  useShiftsTablesResultForDate, useFinWallets, useBusinessDayClosureSnapshot,
} from "@/hooks/use-fin";
import { formatNumberSpaces, CASH_DENOMS } from "@/lib/currency";
import { fmtDate } from "@/lib/format-date";
import CashDenomInput, { cashSum } from "@/components/cage/CashDenomInput";
import { cn } from "@/lib/utils";

const today = () => new Date().toISOString().slice(0, 10);
const parseAmountInput = (value: string): number => Number(value.replace(/\s+/g, "").replace(",", ".")) || 0;
const formatAmountInput = (value: string): string => {
  const trimmed = value.trimStart();
  const sign = trimmed.startsWith("-") ? "-" : "";
  const cleaned = trimmed.replace(/[^\d.,]/g, "").replace(",", ".");
  const [integer = "", decimal] = cleaned.split(".");
  const digits = integer.replace(/\D/g, "");
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${decimal !== undefined ? `.${decimal.replace(/\D/g, "")}` : ""}`;
};
const amountToneClass = (value: number) => value > 0 ? "cms-amount-positive" : value < 0 ? "cms-amount-negative" : "text-muted-foreground";

export default function FinancesDayClosingPage() {
  const [bd, setBd] = useState(today());
  const { data: existing } = useFinDayClosing(bd);
  const { data: list = [] } = useDayClosingList();
  const { data: tablesAuto = 0 } = useShiftsTablesResultForDate(bd);
  const { data: wallets = [] } = useFinWallets();
  const { data: snap } = useBusinessDayClosureSnapshot(bd);
  const upsert = useUpsertDayClosing();
  const lock = useLockDayClosing();

  const [slots, setSlots] = useState("");
  const [tables, setTables] = useState("");
  const [notes, setNotes] = useState("");
  const [varianceNote, setVarianceNote] = useState("");
  const [lines, setLines] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (existing) {
      setTables(formatNumberSpaces(Number(existing.tables_result || 0)));
      setSlots(formatNumberSpaces(Number(existing.slots_result || 0)));
      setNotes(existing.notes || "");
      setVarianceNote((existing as any).variance_note || "");
      setLines(Array.isArray(existing.income_lines) ? (existing.income_lines as any[]) : []);
    } else {
      setTables(formatNumberSpaces(tablesAuto || 0)); setSlots(""); setNotes(""); setVarianceNote(""); setLines([]);
    }
  }, [existing?.id, tablesAuto]);

  const locked = !!existing?.locked_at;
  const incomeTotal = useMemo(
    () => lines.reduce((s, l) => s + Number(l.amount || 0) * Number(l.fx_rate || 1), 0),
    [lines]
  );

  const tablesValue = parseAmountInput(tables);
  const slotsValue = parseAmountInput(slots);
  const diffTables = tablesValue - (snap?.tables ?? 0);
  const diffSlots = slotsValue - (snap?.slots ?? 0);
  const needsVariance = !!snap && (Math.abs(diffTables) > 1 || Math.abs(diffSlots) > 1);
  const noteValid = varianceNote.trim().length >= 3;

  const addLine = () => {
    setExpanded(lines.length);
    setLines((l) => [...l, { wallet_id: "", currency: "TZS", amount: 0, fx_rate: 1, denominations: {} }]);
  };
  const updateLine = (i: number, patch: any) => setLines((l) => l.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const updateDenoms = (i: number, denoms: Record<number, number>) => {
    const amt = cashSum(denoms);
    updateLine(i, { denominations: denoms, amount: amt });
  };

  const save = async () => {
    await upsert.mutateAsync({
      id: existing?.id,
      business_date: bd,
      tables_result: tablesValue,
      slots_result: slotsValue,
      income_lines: lines,
      notes,
    });
  };

  const lockNow = async () => {
    await save();
    if (!existing) return;
    await lock.mutateAsync({
      id: existing.id,
      varianceNote: needsVariance ? varianceNote.trim() : null,
    });
  };

  const lockDisabled = !existing || (needsVariance && !noteValid);

  return (
    <PageShell>
      <PageHeader icon={ClipboardPen} title="Day Closing" subtitle="Manual entry · reconciled against the Cage closure">
        <FinanceCasinoSwitcher allowNetwork={false} />
        <Input type="date" value={bd} onChange={(e) => setBd(e.target.value)} className="w-40 font-mono text-xs" />
      </PageHeader>

      {/* Reconciliation panel */}
      <PageSection
        title="Reconciliation vs Cage closure"
        titleRight={
          snap ? (
            <span className="text-xs flex items-center gap-1 text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
              Cage closed {fmtDate(snap.closedAt)} · {snap.closedMethod}
            </span>
          ) : (
            <span className="text-xs flex items-center gap-1 text-amber-600">
              <AlertTriangle className="w-3.5 h-3.5" />
              Cage closure not found — lock disabled
            </span>
          )
        }
      >
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="font-medium text-muted-foreground uppercase tracking-wider"></div>
          <div className="text-right font-medium text-muted-foreground uppercase tracking-wider">Entered</div>
          <div className="text-right font-medium text-muted-foreground uppercase tracking-wider">Cage actual / Δ</div>

          <div>Tables</div>
          <div className={cn("text-right font-mono", amountToneClass(tablesValue))}>{formatNumberSpaces(tablesValue)}</div>
          <div className="text-right font-mono">
            {snap ? formatNumberSpaces(snap.tables) : "—"}
            {snap && (
              <span className={`ml-2 ${Math.abs(diffTables) > 1 ? "cms-amount-negative font-semibold" : "text-muted-foreground"}`}>
                ({diffTables > 0 ? "+" : ""}{formatNumberSpaces(diffTables)})
              </span>
            )}
          </div>

          <div>Slots</div>
          <div className={cn("text-right font-mono", amountToneClass(slotsValue))}>{formatNumberSpaces(slotsValue)}</div>
          <div className="text-right font-mono">
            {snap ? formatNumberSpaces(snap.slots) : "—"}
            {snap && (
              <span className={`ml-2 ${Math.abs(diffSlots) > 1 ? "cms-amount-negative font-semibold" : "text-muted-foreground"}`}>
                ({diffSlots > 0 ? "+" : ""}{formatNumberSpaces(diffSlots)})
              </span>
            )}
          </div>
        </div>

        {needsVariance && (
          <div className="mt-3 p-3 rounded-md border border-destructive/40 bg-destructive/5">
            <div className="flex items-center gap-2 text-xs text-destructive font-medium mb-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              Variance vs Cage — reconciliation comment required (min 3 chars)
            </div>
            <Textarea
              value={varianceNote}
              disabled={locked}
              onChange={(e) => setVarianceNote(e.target.value)}
              placeholder="Explain the discrepancy (e.g. late-night cash adjustment, miscount on slots…)"
              rows={2}
            />
          </div>
        )}
        {!needsVariance && snap && (
          <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Matches Cage closure
          </div>
        )}
      </PageSection>

      <div className="grid sm:grid-cols-3 gap-3">
        <PageSection title="Tables">
          <Input type="text" inputMode="decimal" disabled={locked} value={tables} onChange={(e) => setTables(formatAmountInput(e.target.value))} className={cn("text-lg font-mono", amountToneClass(tablesValue))} />
          <div className={cn("text-xs mt-1", amountToneClass(tablesAuto))}>From shifts: {formatNumberSpaces(tablesAuto)}</div>
        </PageSection>
        <PageSection title="Slots">
          <Input type="text" inputMode="decimal" disabled={locked} value={slots} onChange={(e) => setSlots(formatAmountInput(e.target.value))} className={cn("text-lg font-mono", slots === "" ? "text-muted-foreground" : amountToneClass(slotsValue))} />
        </PageSection>
        <PageSection title="Total Income (lines)">
          <div className={cn("text-2xl font-mono", amountToneClass(incomeTotal))}>{formatNumberSpaces(incomeTotal)}</div>
        </PageSection>
      </div>

      <PageSection title="Income Lines" titleRight={!locked && <Button size="sm" variant="outline" onClick={addLine}><Plus className="w-3.5 h-3.5" /> Line</Button>}>
        {!lines.length && <div className="text-sm text-muted-foreground text-center py-4">No income lines</div>}
        {lines.map((l, i) => {
          const denoms = CASH_DENOMS[l.currency] || CASH_DENOMS.TZS;
          const isOpen = expanded === i;
          return (
            <div key={i} className="rounded-md border border-border mb-2">
              <div className="grid grid-cols-12 gap-2 p-2 items-end">
                <div className="col-span-1 flex items-end pb-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setExpanded(isOpen ? null : i)} className="h-7 w-7 p-0">
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </Button>
                </div>
                <div className="col-span-3">
                  <label className="text-xs text-muted-foreground">Wallet</label>
                  <Select value={l.wallet_id} onValueChange={(v) => {
                    const w = wallets.find((x: any) => x.id === v);
                    updateLine(i, { wallet_id: v, currency: w?.currency || l.currency });
                  }} disabled={locked}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{wallets.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.currency})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-3"><label className="text-xs text-muted-foreground">Amount</label>
                  <Input type="number" step="0.01" disabled={locked} value={l.amount || ""} onChange={(e) => updateLine(i, { amount: Number(e.target.value), denominations: {} })} /></div>
                <div className="col-span-2"><label className="text-xs text-muted-foreground">Currency</label>
                  <Input value={l.currency} disabled className="font-mono" /></div>
                <div className="col-span-2"><label className="text-xs text-muted-foreground">FX → TZS</label>
                  <Input type="number" step="0.000001" disabled={locked} value={l.fx_rate || 1} onChange={(e) => updateLine(i, { fx_rate: Number(e.target.value) })} /></div>
                <div className="col-span-1 text-right">
                  {!locked && <Button variant="ghost" size="sm" onClick={() => removeLine(i)}><Trash2 className="w-3.5 h-3.5" /></Button>}
                </div>
              </div>
              {isOpen && (
                <div className="border-t border-border p-3 bg-muted/30">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                    Denominations · {l.currency} {locked && "(locked)"}
                  </div>
                  <div className="max-w-md">
                    <CashDenomInput
                      values={l.denominations || {}}
                      onChange={locked ? () => {} : (v) => updateDenoms(i, v)}
                      denoms={denoms}
                      currency={l.currency}
                      size="sm"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </PageSection>

      <PageSection title="Notes">
        <Input value={notes} disabled={locked} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
      </PageSection>

      <div className="flex justify-end gap-2">
        {!locked && <Button variant="outline" onClick={save}>Save Draft</Button>}
        {existing && !locked && (
          <Button
            onClick={lockNow}
            disabled={lockDisabled}
            title={!snap ? "Cage closure required first" : needsVariance && !noteValid ? "Variance comment required" : ""}
          >
            <Lock className="w-4 h-4" /> Lock & Post Income
          </Button>
        )}
        {locked && (
          <span className="text-xs text-muted-foreground self-center">
            Locked {fmtDate(existing!.locked_at)}
            {(existing as any).variance_note && <> · note: "{(existing as any).variance_note}"</>}
          </span>
        )}
      </div>

      <PageSection title="Recent closings">
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs uppercase">
              <tr><th className="px-3 py-2 text-left">Date</th><th className="text-right">Tables</th><th className="text-right">Slots</th><th className="text-right">Income lines</th><th>Status</th></tr>
            </thead>
            <tbody>
              {list.map((r: any) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/40 cursor-pointer" onClick={() => setBd(r.business_date)}>
                  <td className="px-3 py-1.5 font-mono text-xs">{fmtDate(r.business_date)}</td>
                  <td className={cn("text-right font-mono", amountToneClass(Number(r.tables_result || 0)))}>{formatNumberSpaces(Number(r.tables_result))}</td>
                  <td className={cn("text-right font-mono", amountToneClass(Number(r.slots_result || 0)))}>{formatNumberSpaces(Number(r.slots_result))}</td>
                  <td className="text-right">{Array.isArray(r.income_lines) ? r.income_lines.length : 0}</td>
                  <td className="text-xs">
                    {r.locked_at ? <span className="text-green-600">Locked</span> : <span className="text-muted-foreground">Draft</span>}
                    {r.variance_note && <span className="ml-1 cms-amount-negative" title={r.variance_note}>· Δ</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageSection>
    </PageShell>
  );
}
