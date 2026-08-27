/**
 * Wallet Movement — Add money / Take money / Transfer.
 *
 * Add money / Take money are ACTUAL-only corrections: they behave exactly like
 * a physical recount (Actual 100 000 + 10 → Actual 100 010). They are NOT an
 * income, NOT an expense and they never move Expected. A `kind = 'adjustment'`
 * row is written purely for audit (excluded from the Expected ledger sum).
 *
 * Transfer really moves money between wallets, so it stays a ledger movement:
 *   transfer_in   → +amount (stored positive)
 *   transfer_out  → −amount (stored NEGATIVE)
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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  wallets: any[];
  defaultWalletId?: string;
  defaultMode?: MovementMode;
  usdRate?: number;
  minDate?: string;
  maxDate?: string;
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

  const fxRate = currency === "USD" ? usdRate : currency === "TZS" ? 1 : 1;

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
      const common = {
        casino_id: activeCasinoId,
        currency,
        fx_rate: fxRate,
        business_date: date,
        created_by: user.id,
        denominations: denomJson,
        // Manual wallet movements post immediately (no Pending until day close)
        posted_at: new Date().toISOString(),
      };
      let rows: any[] = [];
      if (mode === "in") {
        rows = [
          {
            ...common,
            wallet_id: wallet.id,
            kind: "adjustment_in",
            amount,
            amount_tzs: amount * fxRate,
            note: baseNote || `Money in · ${wallet.name}`,
          },
        ];
      } else if (mode === "out") {
        rows = [
          {
            ...common,
            wallet_id: wallet.id,
            kind: "adjustment_out",
            amount,
            amount_tzs: amount * fxRate,
            note: baseNote || `Money out · ${wallet.name}`,
          },
        ];
      } else {
        const label = `Transfer ${wallet.name} → ${toWallet!.name}`;
        rows = [
          {
            ...common,
            wallet_id: wallet.id,
            kind: "transfer_out",
            amount: -amount,
            amount_tzs: -amount * fxRate,
            note: [label, baseNote].filter(Boolean).join(" · "),
          },
          {
            ...common,
            wallet_id: toWallet!.id,
            kind: "transfer_in",
            amount,
            amount_tzs: amount * fxRate,
            note: [label, baseNote].filter(Boolean).join(" · "),
          },
        ];
      }
      const { error } = await supabase.from("fin_wallet_tx").insert(rows as any);
      if (error) throw error;
      toast.success(
        mode === "transfer"
          ? `Transferred ${formatNumberSpaces(amount)} ${currency}`
          : `${mode === "in" ? "Received" : "Paid out"} ${formatNumberSpaces(amount)} ${currency}`,
      );
      invalidateFinance(qc);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Wallet Movement"
      description="Balance adjustment in / out or a transfer — not counted as income or expense"
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
              <Input type="date" value={date} onChange={(e) => setDate(clamp(e.target.value))} />
            </div>
          )}
        </div>

        {mode === "transfer" && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Date</div>
            <Input type="date" value={date} onChange={(e) => setDate(clamp(e.target.value))} />
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

        <div className="rounded-md border border-border bg-card p-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {mode === "in" ? "Wallet increases by" : mode === "out" ? "Wallet decreases by" : "Moves"}
          </span>
          <span
            className={cn(
              "font-mono tabular-nums text-lg font-semibold",
              mode === "in" ? "cms-amount-positive" : mode === "out" ? "cms-amount-negative" : "",
            )}
          >
            {mode === "out" ? "−" : mode === "in" ? "+" : ""}
            {formatNumberSpaces(amount)} {currency}
          </span>
        </div>

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
