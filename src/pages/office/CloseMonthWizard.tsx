/**
 * CloseMonthWizard — monthly reset (super_admin only).
 * Step: Collection per wallet (how much cash is withdrawn from the safe)
 * Step: New Starting Float per wallet (SKIPPED when the next month is already
 *       opened/closed — its starting float is then owned by Open Month)
 * Step: Confirm & Lock
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { formatNumberSpaces } from "@/lib/currency";
import { useRunCloseMonth, useMonthClosures } from "@/hooks/use-fin-month-closures";
import { useMonthOpenings, monthStatusOf } from "@/hooks/use-fin-month-opening";
import { useCloseMonthReport } from "@/hooks/use-fin-month-finance";
import type { WalletBalanceRow } from "@/hooks/use-fin-balance";
import { cn } from "@/lib/utils";


type Row = { wallet_id: string; name: string; currency: string; amount: number };

export function CloseMonthWizard({
  open,
  onOpenChange,
  wallets,
  usdTzs,
  casinoId,
  year: yearProp,
  month: monthProp,
  status,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  wallets: WalletBalanceRow[];
  usdTzs: number;
  /** Canonical report close (`fin_close_month_report`) runs for this casino/month. */
  casinoId?: string | null;
  year?: number;
  month?: number;
  status?: "open" | "closed";
}) {
  const now = new Date();
  const year = yearProp ?? now.getFullYear();
  const month = monthProp ?? now.getMonth() + 1;

  // Next month owns its own starting float once it was opened (Open Month).
  // In that case the float step is skipped entirely so we never overwrite it.
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const { data: openings = [] } = useMonthOpenings();
  const { data: closures = [] } = useMonthClosures();
  const nextStatus = monthStatusOf(openings, closures, nextYear, nextMonth);
  const skipFloat = nextStatus !== "not_opened";
  const steps = useMemo(
    () => (skipFloat ? (["collection", "confirm"] as const) : (["collection", "float", "confirm"] as const)),
    [skipFloat],
  );

  const [stepIdx, setStepIdx] = useState(0);
  const current = steps[Math.min(stepIdx, steps.length - 1)];
  const [note, setNote] = useState("");


  const initialCollection: Row[] = useMemo(
    () =>
      wallets.map((w) => ({
        wallet_id: w.wallet_id,
        name: w.name,
        currency: w.currency,
        amount: Number(w.physical ?? w.ledger ?? 0),
      })),
    [wallets],
  );
  const [collection, setCollection] = useState<Row[]>(initialCollection);
  const [newFloat, setNewFloat] = useState<Row[]>(
    wallets.map((w) => ({
      wallet_id: w.wallet_id,
      name: w.name,
      currency: w.currency,
      amount: 0,
    })),
  );

  // Отслеживаем, редактировал ли пользователь вручную — чтобы не затирать
  // введённые значения при подгрузке wallets.
  const dirtyRef = useRef(false);

  // Пересинхронизация при подгрузке/изменении wallets: если пользователь ещё
  // ничего не редактировал (первое открытие с пустым snap), заполняем строки.
  useEffect(() => {
    if (dirtyRef.current) return;
    setCollection(
      wallets.map((w) => ({
        wallet_id: w.wallet_id,
        name: w.name,
        currency: w.currency,
        amount: Number(w.physical ?? w.ledger ?? 0),
      })),
    );
    setNewFloat(
      wallets.map((w) => ({
        wallet_id: w.wallet_id,
        name: w.name,
        currency: w.currency,
        amount: 0,
      })),
    );
  }, [wallets]);

  const markDirty = () => {
    dirtyRef.current = true;
  };

  // sync when wallets change / dialog opens fresh
  const resetAll = () => {
    setStepIdx(0);
    setNote("");
    dirtyRef.current = false;
    setCollection(
      wallets.map((w) => ({
        wallet_id: w.wallet_id,
        name: w.name,
        currency: w.currency,
        amount: Number(w.physical ?? w.ledger ?? 0),
      })),
    );
    setNewFloat(
      wallets.map((w) => ({
        wallet_id: w.wallet_id,
        name: w.name,
        currency: w.currency,
        amount: 0,
      })),
    );
  };


  const run = useRunCloseMonth();
  const closeReport = useCloseMonthReport();

  const totalCollectionTzs = collection.reduce(
    (s, r) => s + (r.currency === "USD" ? r.amount * usdTzs : r.amount),
    0,
  );
  const totalFloatTzs = newFloat.reduce(
    (s, r) => s + (r.currency === "USD" ? r.amount * usdTzs : r.amount),
    0,
  );

  const submit = async () => {
    await run.mutateAsync({
      year,
      month,
      collection_details: collection.map((r) => ({
        wallet_id: r.wallet_id,
        currency: r.currency,
        amount: r.amount,
      })),
      // Skipped when the next month already has its own opening float.
      new_float_details: skipFloat
        ? []
        : newFloat.map((r) => ({
            wallet_id: r.wallet_id,
            currency: r.currency,
            amount: r.amount,
          })),

      note,
    });
    // Canonical report snapshot — freezes Final Profit / Manager Bonus.
    if (casinoId) await closeReport.mutateAsync({ casino_id: casinoId, year, month, note });
    onOpenChange(false);
    resetAll();
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(b) => {
        if (!b) resetAll();
        onOpenChange(b);
      }}
      title={`Close Month · ${year}-${String(month).padStart(2, "0")} · ${status === "closed" ? "Closed" : "Open"}`}
    >
      {/* Steps header */}
      <div className="flex items-center gap-2 mb-4">
        {steps.map((s, i) => (
          <div
            key={s}
            className={cn(
              "flex-1 h-1.5 rounded",
              i <= stepIdx ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
        Step {stepIdx + 1} of {steps.length} —{" "}
        {current === "collection"
          ? "Collection"
          : current === "float"
            ? "New Starting Float"
            : "Confirm & Lock"}
      </div>
      {skipFloat && (
        <div className="mb-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Next month is already {nextStatus === "closed" ? "closed" : "opened"} — starting float
          kept as entered in Open Month.
        </div>
      )}


      {current === "collection" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Confirm how much cash is withdrawn from each wallet (collection).
          </p>
          <WalletAmountList rows={collection} onChange={(next) => { markDirty(); setCollection(next); }} />
          <TotalRow label="Total Collection (TZS)" value={totalCollectionTzs} />
        </div>
      )}

      {current === "float" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Enter new Starting Float for each wallet (usually 0). You can skip this and enter it
            later with Open Month.
          </p>
          <WalletAmountList rows={newFloat} onChange={(next) => { markDirty(); setNewFloat(next); }} />
          <TotalRow label="Total New Float (TZS)" value={totalFloatTzs} />
        </div>
      )}

      {current === "confirm" && (
        <div className="space-y-3">
          <div className="rounded-md border border-border p-3 bg-muted/20 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground uppercase tracking-wider">
                Period
              </span>
              <span className="font-mono">
                {year}-{String(month).padStart(2, "0")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground uppercase tracking-wider">
                Collection Total
              </span>
              <span className="font-mono tabular-nums">
                {formatNumberSpaces(totalCollectionTzs)} TZS
              </span>
            </div>
            {!skipFloat && (
              <div className="flex justify-between">
                <span className="text-muted-foreground uppercase tracking-wider">
                  New Float Total
                </span>
                <span className="font-mono tabular-nums">
                  {formatNumberSpaces(totalFloatTzs)} TZS
                </span>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Note (optional)
            </label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
            {skipFloat
              ? "After confirming, the month is locked. Next month's starting float is left untouched."
              : "After confirming, the month is locked and Starting Float updates apply to next month."}
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-between gap-2">
        <Button
          variant="outline"
          onClick={() => (stepIdx > 0 ? setStepIdx(stepIdx - 1) : onOpenChange(false))}
        >
          {stepIdx > 0 ? "Back" : "Cancel"}
        </Button>
        <div className="flex gap-2">
          {current === "float" && (
            <Button
              variant="ghost"
              onClick={() => {
                markDirty();
                setNewFloat((rows) => rows.map((r) => ({ ...r, amount: 0 })));
                setStepIdx(stepIdx + 1);
              }}
            >
              Skip
            </Button>
          )}
          {current !== "confirm" ? (
            <Button onClick={() => setStepIdx(stepIdx + 1)}>Next</Button>
          ) : (
            <Button onClick={submit} disabled={run.isPending}>
              {run.isPending ? "Closing…" : "Confirm & Lock"}
            </Button>
          )}
        </div>
      </div>

    </ResponsiveDialog>
  );
}

function WalletAmountList({
  rows,
  onChange,
}: {
  rows: Row[];
  onChange: (next: Row[]) => void;
}) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
          <tr>
            <th className="text-left px-2 py-1.5">Wallet</th>
            <th className="text-left px-2 py-1.5 w-16">Curr</th>
            <th className="text-right px-2 py-1.5 w-40">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.wallet_id} className="border-t border-border">
              <td className="px-2 py-1">{r.name}</td>
              <td className="px-2 py-1 font-mono">{r.currency}</td>
              <td className="px-2 py-1 text-right">
                <NumberInput
                  decimals={2}
                  className="h-7 text-right font-mono"
                  value={r.amount}
                  onValueChange={(v) => {
                    const next = [...rows];
                    next[i] = { ...r, amount: v ?? 0 };
                    onChange(next);
                  }}
                />
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={3} className="text-center text-muted-foreground py-4">
                No wallets
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-muted/30 text-xs">
      <span className="uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums font-semibold">{formatNumberSpaces(value)}</span>
    </div>
  );
}
