/**
 * Wallet Movement — Add money / Take money / Transfer.
 *
 * Add money / Take money are ACTUAL-only corrections: they behave exactly like
 * a physical recount (Actual 100 000 + 10 → Actual 100 010). They are NOT an
 * income, NOT an expense and they never move Expected. A `kind = 'adjustment'`
 * row is written purely for audit (excluded from the Expected ledger sum).
 *
 * Transfer (inside the casino) works the same way: two Actual recounts
 * (source −amount, destination +amount). Expected is never touched.
 */


import { invalidateFinance } from "@/lib/fin-invalidate";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CashDenomInput, { cashSum } from "@/components/cage/CashDenomInput";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { formatNumberSpaces, CASH_DENOMS } from "@/lib/currency";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CASH_LIKE_KINDS = new Set(["cash", "safe", "cage"]);

export type MovementMode = "in" | "out" | "transfer";

const MODES: { id: MovementMode; label: string; icon: any; tone: string }[] = [
  { id: "in", label: "Add money", icon: ArrowDownLeft, tone: "cms-amount-positive" },
  { id: "out", label: "Take money", icon: ArrowUpRight, tone: "cms-amount-negative" },
  { id: "transfer", label: "Transfer", icon: ArrowLeftRight, tone: "text-foreground" },
];

function denomNote(vals: Record<number, number>, cents: number) {
  const parts = Object.entries(vals)
    .filter(([, q]) => Number(q) > 0)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([d, q]) => `${formatNumberSpaces(Number(d))}×${q}`);
  if (cents > 0) parts.push(`coins ${cents}`);
  return parts.join(" · ");
}

export default function WalletMovementDialog({
  open,
  onOpenChange,
  wallets,
  defaultWalletId,
  defaultMode = "in",
  usdRate = 2600,
  minDate,
  maxDate,
  windowFrom,
  windowTo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  wallets: any[];
  defaultWalletId?: string;
  defaultMode?: MovementMode;
  usdRate?: number;
  minDate?: string;
  maxDate?: string;
  /** Selected Office month window — used only for a soft warning. */
  windowFrom?: string;
  windowTo?: string;
}) {
  const { user } = useAuth();
  const { activeCasinoId } = useCasino();
  const qc = useQueryClient();

  const todayEat = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const clamp = (d: string) => (minDate && d < minDate ? minDate : maxDate && d > maxDate ? maxDate : d);

  const [mode, setMode] = useState<MovementMode>(defaultMode);
  const [walletId, setWalletId] = useState<string>(defaultWalletId || "");
  const [toWalletId, setToWalletId] = useState<string>("");
  const [date, setDate] = useState<string>(clamp(todayEat));
  /** Backdating outside the selected month window is allowed but flagged. */
  const outsideWindow =
    !!date && !!((windowFrom && date < windowFrom) || (windowTo && date > windowTo));
  const [denoms, setDenoms] = useState<Record<number, number>>({});
  const [cents, setCents] = useState(0);
  const [amountInput, setAmountInput] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(defaultMode);
    setWalletId(defaultWalletId || "");
    setToWalletId("");
    setDate(clamp(todayEat));
    setDenoms({});
    setCents(0);
    setAmountInput("");
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultWalletId, defaultMode]);

  const wallet = useMemo(() => wallets.find((w) => w.id === walletId), [wallets, walletId]);
  const toWallet = useMemo(() => wallets.find((w) => w.id === toWalletId), [wallets, toWalletId]);
  const useDenoms = !!wallet && CASH_LIKE_KINDS.has(wallet.kind);
  const currency = wallet?.currency || "TZS";
  const denomList = CASH_DENOMS[currency] || CASH_DENOMS.TZS;
  const centsVal = currency === "TZS" && useDenoms ? cents : 0;
  const amount = useDenoms ? cashSum(denoms) + centsVal / 100 : Number(amountInput || 0);

  const transferTargets = useMemo(
    () => wallets.filter((w) => w.id !== walletId && w.currency === currency),
    [wallets, walletId, currency],
  );

  const fxRate = currency === "USD" ? usdRate : 1;

  /**
   * Current Actual of the selected wallet — the same figure `fin_save_wallet_count`
   * uses as the previous count (last snapshot, else the wallet starting float).
   */
  const [actualNow, setActualNow] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    setActualNow(null);
    if (!open || !wallet) return;
    (async () => {
      const { data } = await supabase
        .from("cash_count_snapshots")
        .select("physical_total")
        .eq("wallet_id", wallet.id)
        .lte("business_date", date)
        .order("business_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setActualNow(
        data?.physical_total != null
          ? Number(data.physical_total)
          : Number(wallet.starting_float_amount || 0),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, wallet?.id, date]);

  const resultingActual =
    actualNow == null ? null : mode === "out" ? actualNow - amount : actualNow + amount;

  /**
   * Last physical Actual of a wallet as of the selected business date
   * (snapshot, else starting float). Later-dated counts must never be used as
   * the base of a backdated Add/Take money.
   */
  const fetchActual = async (w: { id: string; starting_float_amount?: number | null }) => {
    const { data } = await supabase
      .from("cash_count_snapshots")
      .select("physical_total")
      .eq("wallet_id", w.id)
      .lte("business_date", date)
      .order("business_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.physical_total != null
      ? Number(data.physical_total)
      : Number(w.starting_float_amount || 0);
  };


  const save = async () => {
    if (!user || !activeCasinoId) return toast.error("Not authorised");
    if (!wallet) return toast.error("Select a wallet");
    if (mode === "transfer" && !toWallet) return toast.error("Select destination wallet");
    if (!(amount > 0)) return toast.error("Enter amount");

    const breakdown = useDenoms ? denomNote(denoms, centsVal) : "";
    // Structured per-note breakdown so the next physical count can show
    // expected notes per denomination (all currencies, not just TZS).
    const denomJson = useDenoms
      ? { ...Object.fromEntries(Object.entries(denoms).filter(([, v]) => Number(v) > 0)), ...(centsVal ? { cents: centsVal } : {}) }
      : null;
    const baseNote = [note.trim(), breakdown].filter(Boolean).join(" · ");
    setSaving(true);
    try {
      let rate = fxRate;
      if (currency !== "TZS" && currency !== "USD") {
        const { data: rateRow } = await supabase
          .from("fin_daily_rates")
          .select("rate_to_tzs")
          .eq("casino_id", activeCasinoId)
          .eq("currency", currency)
          .lte("business_date", date)
          .order("business_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        rate = Number(rateRow?.rate_to_tzs || 1);
      }

      const common = {
        casino_id: activeCasinoId,
        currency,
        fx_rate: rate,
        business_date: date,
        created_by: user.id,
        denominations: denomJson,
        // Manual wallet movements post immediately (no Pending until day close)
        posted_at: new Date().toISOString(),
      };

      /** Actual-only recount + audit row (never touches Expected). */
      const applyActual = async (
        w: { id: string; name: string; starting_float_amount?: number | null },
        delta: number,
        label: string,
      ) => {
        const current = await fetchActual(w);
        const next = current + delta;
        if (next < 0) throw new Error(`Resulting balance of ${w.name} cannot be negative`);
        const fullNote = [label, baseNote].filter(Boolean).join(" · ");
        const { error: rpcError } = await (supabase as any).rpc("fin_save_wallet_count", {
          p_wallet_id: w.id,
          p_counted: next,
          p_denominations: {},
          p_note: fullNote,
          p_business_date: date,
          p_fx_rate: rate,
        });
        if (rpcError) throw rpcError;
        const { error: auditError } = await supabase.from("fin_wallet_tx").insert([
          {
            ...common,
            wallet_id: w.id,
            kind: "adjustment",
            amount: delta,
            amount_tzs: delta * rate,
            note: fullNote,
          },
        ] as any);
        if (auditError) throw auditError;
        return next;
      };

      if (mode !== "transfer") {
        // Actual-only correction: exactly like a physical recount.
        if (actualNow == null) return toast.error("Loading wallet balance, try again");
        const label = `${mode === "in" ? "Add money" : "Take money"} · ${formatNumberSpaces(amount)} ${currency}`;
        const next = await applyActual(wallet, mode === "out" ? -amount : amount, label);
        toast.success(`Actual · ${wallet.name} → ${formatNumberSpaces(next)} ${currency}`);
        invalidateFinance(qc);
        onOpenChange(false);
        return;
      }

      // Transfer inside the casino = two Actual recounts, no ledger movement,
      // so Expected stays untouched on both sides.
      const label = `Transfer ${wallet.name} → ${toWallet!.name}`;
      await applyActual(wallet, -amount, label);
      await applyActual(toWallet!, amount, label);
      toast.success(`Transferred ${formatNumberSpaces(amount)} ${currency} (Actual only)`);
      invalidateFinance(qc);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || e?.details || "Could not save movement");
    } finally {
      setSaving(false);
    }
  };



  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Wallet Movement"
      description="Add / Take money corrects the Actual balance only (like a recount). Transfer moves money between wallets."
      size="table"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                "rounded-md border px-2 py-2 text-xs flex flex-col items-center gap-1 transition-colors",
                mode === m.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/50",
              )}
            >
              <m.icon className={cn("w-4 h-4", mode === m.id && m.tone)} />
              {m.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {mode === "transfer" ? "From wallet" : "Wallet"}
            </div>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger>
                <SelectValue placeholder="Select wallet" />
              </SelectTrigger>
              <SelectContent>
                {wallets.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} · {w.currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {mode === "transfer" ? (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                To wallet ({currency})
              </div>
              <Select value={toWalletId} onValueChange={setToWalletId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select destination" />
                </SelectTrigger>
                <SelectContent>
                  {transferTargets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} · {w.currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Date</div>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(clamp(e.target.value))}
                className={cn(outsideWindow && "border-amber-500 text-amber-600 dark:text-amber-400")}
                title={outsideWindow ? "Date is outside the selected month window" : "Posting date"}
              />
            </div>
          )}
        </div>

        {mode === "transfer" && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Date</div>
            <Input
                type="date"
                value={date}
                onChange={(e) => setDate(clamp(e.target.value))}
                className={cn(outsideWindow && "border-amber-500 text-amber-600 dark:text-amber-400")}
                title={outsideWindow ? "Date is outside the selected month window" : "Posting date"}
              />
          </div>
        )}

        {wallet && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              {useDenoms ? `Denominations · ${currency}` : `Amount · ${currency}`}
            </div>
            {useDenoms ? (
              <CashDenomInput
                values={denoms}
                onChange={setDenoms}
                denoms={denomList}
                currency={currency}
                size="sm"
                {...(currency === "TZS"
                  ? { cents, onCentsChange: (c: number) => setCents(c) }
                  : {})}
              />
            ) : (
              <NumberInput
                decimals={2}
                placeholder={`Amount (${currency})`}
                value={amountInput}
                onValueChange={(v) => setAmountInput(v == null ? "" : String(v))}
                className="font-mono"
              />
            )}
          </div>
        )}

        <Textarea
          placeholder="Reason / reference (e.g. cash from Cage, office purchase)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />

        {mode === "transfer" ? (
          <div className="rounded-md border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Moves</span>
              <span className="font-mono tabular-nums text-lg font-semibold">
                {formatNumberSpaces(amount)} {currency}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Actual only — source −{formatNumberSpaces(amount)}, destination +{formatNumberSpaces(amount)}.
              Same as two physical recounts. Expected stays unchanged on both wallets.
            </div>
          </div>
        ) : (

          <div className="rounded-md border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Actual now</span>
              <span className="font-mono tabular-nums text-sm">
                {actualNow == null ? "—" : `${formatNumberSpaces(actualNow)} ${currency}`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Actual becomes ({mode === "in" ? "+" : "−"}
                {formatNumberSpaces(amount)})
              </span>
              <span
                className={cn(
                  "font-mono tabular-nums text-lg font-semibold",
                  mode === "in" ? "cms-amount-positive" : "cms-amount-negative",
                )}
              >
                {resultingActual == null ? "—" : `${formatNumberSpaces(resultingActual)} ${currency}`}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Affects Actual only — same as a physical recount. Not income, not expense, Expected stays unchanged.
            </div>
          </div>
        )}


        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !(amount > 0)}>
            {saving ? "Saving…" : "Save Movement"}
          </Button>
        </ResponsiveDialogFooter>
      </div>
    </ResponsiveDialog>
  );
}
