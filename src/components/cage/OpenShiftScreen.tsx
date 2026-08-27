import { useState, useMemo, useCallback, useEffect } from "react";
import { useOpenShift, useLastClosedShift } from "@/hooks/use-shift";
import { useFinDailyRatesForDate } from "@/hooks/use-fin-daily-rates";
import { Link } from "react-router-dom";

import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Play, Settings2, ChevronRight, ChevronLeft, Landmark, Pencil, ShieldAlert } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { CloseBusinessDayButton } from "@/components/pit/CloseBusinessDayButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import ManagerOverrideDialog from "@/components/ManagerOverrideDialog";
import OpeningDeltaConfirmDialog from "@/components/cage/OpeningDeltaConfirmDialog";
import { logAction } from "@/lib/logging";
import {
  CHIP_DENOMS, formatCurrency, formatNumberSpaces, CURRENCIES, FOREIGN_CURRENCIES,
  DEFAULT_EXCHANGE_RATES, CASH_DENOMS,
} from "@/lib/currency";
import ChipDenomInput from "@/components/ChipDenomInput";
import CashDenomInput, { cashSum } from "@/components/cage/CashDenomInput";
import LockableSection from "@/components/cage/LockableSection";
import {
  MOBILE_PROVIDERS, emptyMobile, emptyBanks, mobileTotal, bankTotalTzs,
  chipSum, emptyCash, calcCashTotalTzs,
  type MobileProviders, type Banks,
} from "@/components/cage/CageHelpers";
import type { Tables } from "@/integrations/supabase/types";

const OpenShiftScreen = ({ tables }: { tables: Tables<"gaming_tables">[] }) => {
  const openShift = useOpenShift();
  const { managerOverride, activateManagerOverride, displayName, casinoId } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const { data: lastShift } = useLastClosedShift();
  const [rates, setRates] = useState<Record<string, number>>({ ...DEFAULT_EXCHANGE_RATES });
  const [ratesPrefilled, setRatesPrefilled] = useState(false);
  const { data: officeRates } = useFinDailyRatesForDate();
  const officeRatesLocked = !!officeRates && Object.keys(officeRates).length > 0;

  // Prefer Office-set rates (per business date) over the last closed shift.
  useEffect(() => {
    if (officeRates && Object.keys(officeRates).length > 0) {
      setRates(r => ({ ...r, ...officeRates }));
      setRatesPrefilled(true);
      return;
    }
    if (ratesPrefilled) return;
    const prev = (lastShift?.exchange_rates || {}) as Record<string, number>;
    if (prev && Object.keys(prev).length > 0) {
      setRates(r => ({ ...r, ...prev }));
      setRatesPrefilled(true);
    }
  }, [lastShift, ratesPrefilled, officeRates]);


  // Carry over closing chips from the last closed shift so the cashier sees
  // the chips actually counted at close instead of zeros.
  const [closingPrefilled, setClosingPrefilled] = useState(false);
  const [closingChips, setClosingChips] = useState<Record<number, number>>({});
  const [openingChips, setOpeningChips] = useState<Record<number, number>>({});

  useEffect(() => {
    if (closingPrefilled) return;
    const prevClosing = (lastShift as any)?.closing_count?.chips as Record<string, number> | undefined;
    if (prevClosing && Object.keys(prevClosing).length > 0) {
      const normalized: Record<number, number> = {};
      Object.entries(prevClosing).forEach(([k, v]) => { normalized[Number(k)] = Number(v) || 0; });
      setClosingChips(normalized);
      // Opening chips stay empty: cashier must physically recount and enter
      // every denom. The previous closing values are shown as grey placeholder
      // hints inside the Opening Chips inputs.
      setClosingPrefilled(true);
    }
  }, [lastShift, closingPrefilled]);
  const [openingCash, setOpeningCash] = useState<Record<string, Record<number, number>>>(emptyCash);
  const [bankBalance, setBankBalance] = useState<Banks>(emptyBanks);
  const [mobileBalance, setMobileBalance] = useState<MobileProviders>(emptyMobile);
  const [showRates, setShowRates] = useState(false);
  const [showManagerAccess, setShowManagerAccess] = useState(false);

  const [locks, setLocks] = useState({
    closingChips: false, openingChips: false, tzsCash: false, mobile: false,
    eurCash: false, gbpCash: false, usdCash: false, kesCash: false, bankTzs: false, bankUsd: false,
  });

  const toggleLock = useCallback((key: keyof typeof locks) => {
    setLocks(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const closingChipTotal = useMemo(() => chipSum(closingChips), [closingChips]);
  const openingChipTotal = useMemo(() => chipSum(openingChips), [openingChips]);
  const cashTotalTzs = useMemo(() => calcCashTotalTzs(openingCash, rates), [openingCash, rates]);
  const mobTotal = useMemo(() => mobileTotal(mobileBalance), [mobileBalance]);
  const bankTotal = useMemo(() => bankTotalTzs(bankBalance, rates), [bankBalance, rates]);
  const openingTotal = openingChipTotal + cashTotalTzs + mobTotal + bankTotal;

  // Per-denom diff between opening (entered) and closing (expected baseline).
  // Only meaningful once we've prefilled from the previous closed shift —
  // a fresh casino with no prior shift has no baseline to compare against.
  const chipDiff = useMemo(() => {
    if (!closingPrefilled) return [] as { denom: number; expected: number; entered: number; delta: number }[];
    const out: { denom: number; expected: number; entered: number; delta: number }[] = [];
    CHIP_DENOMS.forEach(d => {
      const expected = Number(closingChips[d] || 0);
      const entered = Number(openingChips[d] || 0);
      if (expected !== entered) out.push({ denom: d, expected, entered, delta: entered - expected });
    });
    return out;
  }, [closingChips, openingChips, closingPrefilled]);
  const hasChipDelta = chipDiff.length > 0;
  const chipDeltaTzs = openingChipTotal - closingChipTotal;

  const [showDeltaConfirm, setShowDeltaConfirm] = useState(false);

  const submitOpen = (override?: { managerId: string; reason: string }) => {
    openShift.mutate({
      exchange_rates: rates,
      opening_float: {
        closing_chips: closingChips,
        chips: openingChips,
        cash: openingCash,
        bank: bankBalance,
        mobile: mobileBalance,
        ...(override
          ? {
              chip_delta_override: {
                manager_id: override.managerId,
                reason: override.reason,
                expected_chips: closingChips,
                entered_chips: openingChips,
                diff: chipDiff,
                expected_tzs: closingChipTotal,
                entered_tzs: openingChipTotal,
                delta_tzs: chipDeltaTzs,
                approved_at: new Date().toISOString(),
              },
            }
          : {}),
        totals: {
          closing_chips_tzs: closingChipTotal,
          chips_tzs: openingChipTotal,
          ...Object.fromEntries(CURRENCIES.map(c => [c, cashSum(openingCash[c] || {})])),
          bank: bankBalance,
          mobile: mobileBalance,
          total_tzs: openingTotal,
        },
      },
    }, {
      onSuccess: async (shift: any) => {
        if (override && casinoId) {
          await logAction(casinoId, "edit", "OPEN_SHIFT_CHIP_DELTA_OVERRIDE", {
            shift_id: shift?.id,
            manager_id: override.managerId,
            reason: override.reason,
            expected_chips: closingChips,
            entered_chips: openingChips,
            diff: chipDiff,
            delta_tzs: chipDeltaTzs,
          });
        }
      },
    });
  };

  const handleOpen = () => {
    if (hasChipDelta) {
      setShowDeltaConfirm(true);
      return;
    }
    submitOpen();
  };

  return (
    <PageShell>
      <PageHeader
        icon={Landmark}
        title="Cage"
        subtitle={`Open shift · Step ${step} of 2`}
        centerSlot={
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/40 border border-border/50 whitespace-nowrap overflow-x-auto max-w-full">
            {FOREIGN_CURRENCIES.map((c, i) => (
              <span key={c} className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-foreground">
                {i > 0 && <span className="text-muted-foreground/60 mx-0.5">·</span>}
                <span className="text-muted-foreground text-[9px] font-semibold uppercase tracking-wider">{c}</span>
                <span className="font-semibold">{formatNumberSpaces(rates[c] || 0)}</span>
              </span>
            ))}
          </div>
        }
      >
        <Button variant="outline" size="sm" onClick={() => setShowRates(true)} className="gap-1.5">
          <Settings2 className="w-3.5 h-3.5" /> Rates
        </Button>
        <CloseBusinessDayButton />
      </PageHeader>

      <div className="flex items-center gap-1.5 mb-3">
        <button type="button" onClick={() => setStep(1)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-colors ${step === 1 ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
          <span className="w-4 h-4 rounded-full bg-background/20 flex items-center justify-center text-[9px] font-bold">1</span>
          Chips · TZS · Mobile
        </button>
        <ChevronRight className="w-3 h-3 text-muted-foreground" />
        <button type="button" onClick={() => setStep(2)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-colors ${step === 2 ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
          <span className="w-4 h-4 rounded-full bg-background/20 flex items-center justify-center text-[9px] font-bold">2</span>
          Foreign · Banks
        </button>
      </div>

      {step === 1 && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <LockableSection
              title="Chips from Closing"
              locked={locks.closingChips}
              onToggleLock={() => toggleLock("closingChips")}
              headerActions={
                !managerOverride.active ? (
                  <button
                    type="button"
                    onClick={() => setShowManagerAccess(true)}
                    className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Pencil className="w-2.5 h-2.5" /> Edit
                  </button>
                ) : null
              }
            >
              <div className={!managerOverride.active ? "opacity-50 pointer-events-none" : ""}>
                <ChipDenomInput values={closingChips} onChange={setClosingChips} showValue={false} />
              </div>
              {!managerOverride.active && (
                <p className="text-[9px] text-destructive font-medium">Manager access required</p>
              )}
            </LockableSection>
            <LockableSection title="Opening Chips" locked={locks.openingChips} onToggleLock={() => toggleLock("openingChips")}>
              <ChipDenomInput values={openingChips} onChange={setOpeningChips} showValue={false} placeholder={closingChips} />
            </LockableSection>
          </div>

          {hasChipDelta && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-destructive uppercase tracking-wider">
                  Opening chips do not match the previous closing
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Δ <span className={`font-mono font-bold ${chipDeltaTzs > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                    {chipDeltaTzs > 0 ? "+" : ""}{formatNumberSpaces(chipDeltaTzs)}
                  </span> TZS · {chipDiff.length} denomination{chipDiff.length === 1 ? "" : "s"} differ.
                  Manager override and reason will be required to open the shift.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <LockableSection title="TZS Cash" locked={locks.tzsCash} onToggleLock={() => toggleLock("tzsCash")}>
              <CashDenomInput values={openingCash["TZS"] || {}} onChange={v => setOpeningCash(c => ({ ...c, TZS: v }))} denoms={CASH_DENOMS["TZS"] || []} currency="TZS" />
            </LockableSection>
            <LockableSection title="Mobile Money" locked={locks.mobile} onToggleLock={() => toggleLock("mobile")}>
              <div className="grid grid-cols-2 gap-2">
                {MOBILE_PROVIDERS.map(provider => (
                  <div key={provider} className="space-y-0.5">
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">{provider}</p>
                    <NumberInput
                      value={mobileBalance[provider] || ""}
                      onChange={v => setMobileBalance(m => ({ ...m, [provider]: Number(v) || 0 }))}
                      className="no-spin h-7 w-full min-w-0 font-mono text-xs text-right"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border">
                <span className="text-[10px] font-medium text-muted-foreground">Mobile Total</span>
                <span className="font-mono text-xs font-bold text-card-foreground">TZS {formatNumberSpaces(mobTotal)}</span>
              </div>
            </LockableSection>
          </div>

          <div className="cms-panel px-3 py-2 flex items-center justify-between">
            <div>
              <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Step 1 Subtotal (TZS)</p>
              <p className="text-lg font-mono font-bold text-card-foreground">
                {formatCurrency(openingChipTotal + cashSum(openingCash["TZS"] || {}) + mobTotal)}
              </p>
            </div>
            <Button onClick={() => setStep(2)} size="sm" className="gap-1 h-8 px-4">
              Next <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <LockableSection title="EUR Cash" locked={locks.eurCash} onToggleLock={() => toggleLock("eurCash")}>
              <CashDenomInput values={openingCash["EUR"] || {}} onChange={v => setOpeningCash(c => ({ ...c, EUR: v }))} denoms={CASH_DENOMS["EUR"] || []} currency="EUR" />
            </LockableSection>
            <LockableSection title="USD Cash" locked={locks.usdCash} onToggleLock={() => toggleLock("usdCash")}>
              <CashDenomInput values={openingCash["USD"] || {}} onChange={v => setOpeningCash(c => ({ ...c, USD: v }))} denoms={CASH_DENOMS["USD"] || []} currency="USD" />
            </LockableSection>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <LockableSection title="GBP Cash" locked={locks.gbpCash} onToggleLock={() => toggleLock("gbpCash")}>
              <CashDenomInput values={openingCash["GBP"] || {}} onChange={v => setOpeningCash(c => ({ ...c, GBP: v }))} denoms={CASH_DENOMS["GBP"] || []} currency="GBP" />
            </LockableSection>
            <LockableSection title="KES Cash" locked={locks.kesCash} onToggleLock={() => toggleLock("kesCash")}>
              <CashDenomInput values={openingCash["KES"] || {}} onChange={v => setOpeningCash(c => ({ ...c, KES: v }))} denoms={CASH_DENOMS["KES"] || []} currency="KES" />
            </LockableSection>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {BANK_CHANNELS.map(ch => {
              const e = bankBalance.channels?.[ch.key] || { in: 0, out: 0, final: 0 };
              return (
                <LockableSection
                  key={ch.key}
                  title={`${ch.bank} ${ch.currency}`}
                  locked={ch.currency === "USD" ? locks.bankUsd : locks.bankTzs}
                  onToggleLock={() => toggleLock(ch.currency === "USD" ? "bankUsd" : "bankTzs")}
                >
                  <NumberInput
                    value={e.final || ""}
                    onChange={v => setBankBalance(b => withDerivedBankTotals({
                      ...b,
                      channels: { ...emptyBankChannels(), ...(b.channels || {}), [ch.key]: { ...e, final: Number(v) || 0 } },
                    }))}
                    className="no-spin h-7 w-full text-right text-xs"
                    placeholder="0"
                  />
                </LockableSection>
              );
            })}
          </div>
          {bankBalance.usd > 0 && rates?.["USD"] ? (
            <p className="text-[9px] font-mono text-muted-foreground text-right">
              USD balance = TZS {formatNumberSpaces(bankBalance.usd * (rates["USD"] || 0))}
            </p>
          ) : null}


          <div className="cms-panel px-3 py-2 space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Total Opening Chips</p>
                <p className="text-base font-mono font-bold text-card-foreground">TZS {formatNumberSpaces(openingChipTotal)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Total Cash (all → TZS)</p>
                <p className="text-base font-mono font-bold text-card-foreground">TZS {formatNumberSpaces(cashTotalTzs + mobTotal + bankTotal)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep(1)} className="gap-1 h-8">
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </Button>
                <div>
                  <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Grand Total (TZS)</p>
                  <p className="text-xl font-mono font-bold text-card-foreground">{formatCurrency(openingTotal)}</p>
                </div>
              </div>
              <Button onClick={handleOpen} disabled={openShift.isPending} className="gap-1 h-9 px-6" size="sm">
                <Play className="w-3.5 h-3.5" /> {openShift.isPending ? "Opening…" : "Open Shift"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={showRates} onOpenChange={setShowRates}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Exchange Rates</DialogTitle></DialogHeader>
          {officeRatesLocked ? (
            <p className="text-xs text-muted-foreground mb-3">
              Set in <Link to="/office?tab=rates" className="text-primary underline">Office → Rates</Link> for today's business date. Read-only here.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mb-3">
              No Office rates for today. Enter fallback values (per 1 unit of foreign currency).{" "}
              <Link to="/office?tab=rates" className="text-primary underline">Open Rates</Link>
            </p>
          )}
          <div className="space-y-3">
            {FOREIGN_CURRENCIES.map(c => (
              <div key={c} className="flex items-center gap-3">
                <span className="text-sm font-mono font-bold text-card-foreground w-10">{c}</span>
                <NumberInput
                  value={rates[c] || ""}
                  onChange={v => setRates(r => ({ ...r, [c]: Number(v) || 0 }))}
                  placeholder="0"
                  className="flex-1"
                  disabled={officeRatesLocked}
                />
                <span className="text-xs text-muted-foreground font-mono">TZS</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowRates(false)} className="w-full">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <ManagerOverrideDialog
        open={showManagerAccess}
        onClose={() => setShowManagerAccess(false)}
        onConfirm={(managerId) => {
          activateManagerOverride(managerId, "Manager");
          setShowManagerAccess(false);
        }}
        title="Edit Opening Chips"
        description="Manager access required to edit chips from closing during shift opening. Only chips are unlocked."
        actionType="OPEN_SHIFT_CHIPS_EDIT_UNLOCKED"
        actionDetails={{ activated_by: displayName }}
      />
      <OpeningDeltaConfirmDialog
        open={showDeltaConfirm}
        onClose={() => setShowDeltaConfirm(false)}
        diff={chipDiff}
        expectedTotal={closingChipTotal}
        enteredTotal={openingChipTotal}
        onConfirm={(override) => {
          setShowDeltaConfirm(false);
          submitOpen(override);
        }}
      />
    </PageShell>
  );
};

export default OpenShiftScreen;
