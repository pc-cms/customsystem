/**
 * CloseMonthWizard — 3-step monthly reset (super_admin only).
 * Step 1: Collection per wallet (how much cash is withdrawn from the safe)
 * Step 2: New Starting Float per wallet (usually 0)
 * Step 3: Confirm & Lock
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatNumberSpaces } from "@/lib/currency";
import { useRunCloseMonth } from "@/hooks/use-fin-month-closures";
import type { WalletBalanceRow } from "@/hooks/use-fin-balance";
import { cn } from "@/lib/utils";

type Row = { wallet_id: string; name: string; currency: string; amount: number };

export function CloseMonthWizard({
  open,
  onOpenChange,
  wallets,
  usdTzs,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  wallets: WalletBalanceRow[];
  usdTzs: number;
}) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // month being closed = current

  const [step, setStep] = useState<1 | 2 | 3>(1);
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
    setStep(1);
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
      new_float_details: newFloat.map((r) => ({
        wallet_id: r.wallet_id,
        currency: r.currency,
        amount: r.amount,
      })),
      note,
    });
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
      title={`Close Month · ${year}-${String(month).padStart(2, "0")}`}
    >
      {/* Steps header */}
      <div className="flex items-center gap-2 mb-4">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={cn(
              "flex-1 h-1.5 rounded",
              step >= s ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
        Step {step} of 3 —{" "}
        {step === 1 ? "Collection" : step === 2 ? "New Starting Float" : "Confirm & Lock"}
      </div>

      {step === 1 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Confirm how much cash is withdrawn from each wallet (collection).
          </p>
          <WalletAmountList rows={collection} onChange={(next) => { markDirty(); setCollection(next); }} />
          <TotalRow label="Total Collection (TZS)" value={totalCollectionTzs} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Enter new Starting Float for each wallet (usually 0).
          </p>
          <WalletAmountList rows={newFloat} onChange={(next) => { markDirty(); setNewFloat(next); }} />
          <TotalRow label="Total New Float (TZS)" value={totalFloatTzs} />
        </div>
      )}

      {step === 3 && (
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
            <div className="flex justify-between">
              <span className="text-muted-foreground uppercase tracking-wider">
                New Float Total
              </span>
              <span className="font-mono tabular-nums">
                {formatNumberSpaces(totalFloatTzs)} TZS
              </span>
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Note (optional)
            </label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
            After confirming, the month is locked and Starting Float updates apply to next month.
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-between gap-2">
        <Button
          variant="outline"
          onClick={() => (step > 1 ? setStep((step - 1) as any) : onOpenChange(false))}
        >
          {step > 1 ? "Back" : "Cancel"}
        </Button>
        {step < 3 ? (
          <Button onClick={() => setStep((step + 1) as any)}>Next</Button>
        ) : (
          <Button onClick={submit} disabled={run.isPending}>
            {run.isPending ? "Closing…" : "Confirm & Lock"}
          </Button>
        )}
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
                <Input
                  type="number"
                  step="0.01"
                  className="h-7 text-right font-mono"
                  value={r.amount}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...r, amount: Number(e.target.value) || 0 };
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
