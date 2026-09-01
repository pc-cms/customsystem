/**
 * OpenMonthWizard — explicit start of an accounting month (3 steps).
 * Step 1: Starting Float per wallet (prefilled from the wallet's current float)
 * Step 2: Opening wallet balances (prefilled from the last physical count)
 * Step 3: Confirm
 *
 * Nothing rolls over automatically: until this is confirmed the month rejects
 * wallet counts, wallet movements and office expenses.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { formatNumberSpaces } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useFinWallets } from "@/hooks/use-fin";
import { useOpenMonth } from "@/hooks/use-fin-month-opening";
import { MONTH_NAMES } from "@/components/office/PeriodPicker";
import { cn } from "@/lib/utils";

type Row = { wallet_id: string; name: string; currency: string; amount: number };

export function OpenMonthWizard({
  open,
  onOpenChange,
  year,
  month,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  year: number;
  month: number;
}) {
  const { activeCasinoId } = useCasino();
  const { data: allWallets = [] } = useFinWallets();
  const wallets = useMemo(
    () =>
      (allWallets as any[]).filter(
        (w) => w.is_active !== false && (!activeCasinoId || w.casino_id === activeCasinoId),
      ),
    [allWallets, activeCasinoId],
  );

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [note, setNote] = useState("");
  const dirtyRef = useRef(false);

  /* Last physical count per wallet — prefill for opening balances. */
  const { data: lastCounts } = useQuery({
    queryKey: ["open-month-last-counts", activeCasinoId],
    enabled: !!activeCasinoId && open,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_count_snapshots")
        .select("wallet_id, physical_total, created_at")
        .eq("casino_id", activeCasinoId!)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const m = new Map<string, number>();
      (data || []).forEach((r: any) => {
        if (!m.has(r.wallet_id)) m.set(r.wallet_id, Number(r.physical_total ?? 0));
      });
      return m;
    },
  });

  const buildFloat = (): Row[] =>
    wallets.map((w) => ({
      wallet_id: w.id,
      name: w.name,
      currency: w.currency || "TZS",
      amount: Number(w.starting_float_amount ?? 0),
    }));
  const buildBalances = (): Row[] =>
    wallets.map((w) => ({
      wallet_id: w.id,
      name: w.name,
      currency: w.currency || "TZS",
      amount: Number(lastCounts?.get(w.id) ?? 0),
    }));

  const [floatRows, setFloatRows] = useState<Row[]>([]);
  const [balanceRows, setBalanceRows] = useState<Row[]>([]);

  // Prefill once wallets/counts are loaded, unless the user already edited.
  useEffect(() => {
    if (dirtyRef.current) return;
    setFloatRows(buildFloat());
    setBalanceRows(buildBalances());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets, lastCounts]);

  const resetAll = () => {
    setStep(1);
    setNote("");
    dirtyRef.current = false;
    setFloatRows(buildFloat());
    setBalanceRows(buildBalances());
  };

  const run = useOpenMonth();

  const totalFloat = floatRows.reduce((s, r) => s + r.amount, 0);
  const totalBalances = balanceRows.reduce((s, r) => s + r.amount, 0);

  const submit = async () => {
    await run.mutateAsync({
      year,
      month,
      float_details: floatRows.map((r) => ({ wallet_id: r.wallet_id, amount: r.amount })),
      wallet_balances: balanceRows.map((r) => ({ wallet_id: r.wallet_id, amount: r.amount })),
      note,
    });
    onOpenChange(false);
    resetAll();
  };

  const label = `${MONTH_NAMES[month - 1]} ${year}`;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(b) => {
        if (!b) resetAll();
        onOpenChange(b);
      }}
      title={`Open Month · ${label}`}
    >
      <div className="flex items-center gap-2 mb-4">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={cn("flex-1 h-1.5 rounded", step >= s ? "bg-primary" : "bg-muted")}
          />
        ))}
      </div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
        Step {step} of 3 —{" "}
        {step === 1 ? "Starting Float" : step === 2 ? "Opening Wallet Balances" : "Confirm"}
      </div>

      {step === 1 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Starting Float the month begins with. Prefilled from the current wallet float — adjust
            if it changes.
          </p>
          <WalletAmountList
            rows={floatRows}
            onChange={(next) => {
              dirtyRef.current = true;
              setFloatRows(next);
            }}
          />
          <TotalRow label="Total Float" value={totalFloat} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Opening balance of each wallet on the 1st of {label}. Prefilled from the last physical
            count — enter the actual amounts.
          </p>
          <WalletAmountList
            rows={balanceRows}
            onChange={(next) => {
              dirtyRef.current = true;
              setBalanceRows(next);
            }}
          />
          <TotalRow label="Total Opening Balance" value={totalBalances} />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="rounded-md border border-border p-3 bg-muted/20 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground uppercase tracking-wider">Period</span>
              <span className="font-mono">
                {year}-{String(month).padStart(2, "0")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground uppercase tracking-wider">Float Total</span>
              <span className="font-mono tabular-nums">{formatNumberSpaces(totalFloat)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground uppercase tracking-wider">
                Opening Balance Total
              </span>
              <span className="font-mono tabular-nums">{formatNumberSpaces(totalBalances)}</span>
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Note (optional)
            </label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-400">
            After confirming, {label} accepts wallet counts, movements and office expenses. Closing
            the previous month is not required.
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-between gap-2">
        <Button
          variant="outline"
          onClick={() => (step > 1 ? setStep((step - 1) as 1 | 2) : onOpenChange(false))}
        >
          {step > 1 ? "Back" : "Cancel"}
        </Button>
        {step < 3 ? (
          <Button onClick={() => setStep((step + 1) as 2 | 3)}>Next</Button>
        ) : (
          <Button onClick={submit} disabled={run.isPending}>
            {run.isPending ? "Opening…" : "Confirm & Open"}
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
    <div className="rounded-md border border-border overflow-hidden max-h-72 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground sticky top-0">
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
