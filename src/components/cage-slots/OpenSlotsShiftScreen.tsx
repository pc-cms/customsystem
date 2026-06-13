import { useState, useMemo, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useFinDailyRatesForDate } from "@/hooks/use-fin-daily-rates";

import { Coins, Play, ChevronRight, ChevronLeft, CreditCard, Settings2, History } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSection } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import CashDenomInput, { cashSum } from "@/components/cage/CashDenomInput";
import {
  CURRENCIES, FOREIGN_CURRENCIES, CASH_DENOMS,
  DEFAULT_EXCHANGE_RATES, formatNumberSpaces, formatCurrency,
} from "@/lib/currency";
import { useOpenSlotsShift, useCageSlotsSettings, useLastClosedSlotsCards, type SlotsShiftType } from "@/hooks/use-cage-slots";
import { useLastClosedShift } from "@/hooks/use-shift";
import { useAuth } from "@/lib/auth-context";

const OpenSlotsShiftScreen = () => {
  const navigate = useNavigate();
  const { roles, managerOverride } = useAuth();
  const canManage =
    roles.includes("manager") || roles.includes("super_admin") ||
    roles.includes("finance_manager") || roles.includes("shift_manager") ||
    roles.includes("pit") || roles.includes("surveillance") || managerOverride.active;
  const open = useOpenSlotsShift();
  const { data: settings } = useCageSlotsSettings();
  const { data: lastShift } = useLastClosedShift();
  const { data: lastCards } = useLastClosedSlotsCards();
  const cardDepositTzs = Number(settings?.card_deposit_value_tzs || 5000);

  const [step, setStep] = useState<1 | 2>(1);
  const [shiftType, setShiftType] = useState<SlotsShiftType>("day");
  const [rates, setRates] = useState<Record<string, number>>({ ...DEFAULT_EXCHANGE_RATES });
  const [ratesPrefilled, setRatesPrefilled] = useState(false);
  const [showRates, setShowRates] = useState(false);

  const { data: officeRates } = useFinDailyRatesForDate();
  const officeRatesLocked = !!officeRates && Object.keys(officeRates).length > 0;

  // Prefer Office-set rates per business date over the last Live Game shift.
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


  const [openingCash, setOpeningCash] = useState<Record<string, Record<number, number>>>(
    Object.fromEntries(CURRENCIES.map(c => [c, {}]))
  );
  const [openingCards, setOpeningCards] = useState<number>(0);
  const [cardsPrefilled, setCardsPrefilled] = useState(false);

  // Carry over closing card count from the previous slots shift, analog of
  // chip carry-over in Live Game cage.
  useEffect(() => {
    if (cardsPrefilled) return;
    if (lastCards && lastCards.closing_card_count != null && openingCards === 0) {
      setOpeningCards(Number(lastCards.closing_card_count) || 0);
      setCardsPrefilled(true);
    }
  }, [lastCards, cardsPrefilled, openingCards]);

  const tzsTotal = useMemo(() => cashSum(openingCash["TZS"] || {}), [openingCash]);
  const fxTotalTzs = useMemo(() => FOREIGN_CURRENCIES.reduce(
    (s, c) => s + cashSum(openingCash[c] || {}) * (rates[c] || 0),
    0,
  ), [openingCash, rates]);
  const grandTotal = tzsTotal + fxTotalTzs;

  const submit = () => {
    if (FOREIGN_CURRENCIES.some(c => !(rates[c] > 0))) {
      return;
    }
    const flatCash: { currency: string; denomination: number; quantity: number }[] = [];
    for (const c of CURRENCIES) {
      const denoms = CASH_DENOMS[c] || [];
      for (const d of denoms) {
        const q = Number((openingCash[c] || {})[d] || 0);
        if (q > 0) flatCash.push({ currency: c, denomination: d, quantity: q });
      }
    }
    open.mutate({
      shift_type: shiftType,
      exchange_rates: rates,
      opening_cash: flatCash,
      opening_card_count: openingCards,
      card_deposit_value_tzs: cardDepositTzs,
    });
  };

  return (
    <PageShell>
      <PageHeader
        icon={Coins}
        title="Cage Slots"
        subtitle={`Open shift · Step ${step} of 2`}
        date
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
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => navigate("/cage-slots?view=history")} className="gap-1.5">
            <History className="w-3.5 h-3.5" /> History
          </Button>
        )}
      </PageHeader>

      {/* shift_type is fixed to 'day' going forward — single shift per business day.
          Historical day/night rows remain unchanged. */}

      {step === 1 && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <PageSection title="TZS Cash">
              <CashDenomInput
                values={openingCash["TZS"] || {}}
                onChange={v => setOpeningCash(c => ({ ...c, TZS: v }))}
                denoms={CASH_DENOMS["TZS"] || []}
                currency="TZS"
              />
            </PageSection>
            <PageSection title="Plastic Cards (Opening)">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                  <NumberInput
                    value={openingCards || ""}
                    onChange={v => setOpeningCards(Number(v) || 0)}
                    className="no-spin h-9 w-32 text-right font-mono"
                    placeholder="0"
                  />
                  <span className="text-xs text-muted-foreground">cards</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Counter only — not money. Card price TZS {formatNumberSpaces(cardDepositTzs)} is used at close to compute Cards Miss.
                </p>
                {cardsPrefilled && lastCards?.closing_card_count != null && (
                  <p className="text-[10px] text-primary/80 font-medium leading-snug">
                    Carried from previous shift closing: {lastCards.closing_card_count}
                  </p>
                )}
              </div>
            </PageSection>
          </div>

          <div className="cms-panel px-3 py-2 flex items-center justify-between">
            <div>
              <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Step 1 Subtotal (TZS)</p>
              <p className="text-lg font-mono font-bold">{formatCurrency(tzsTotal)}</p>
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
            {(["EUR", "USD"] as const).map(cur => (
              <PageSection key={cur} title={`${cur} Cash`}>
                <CashDenomInput
                  values={openingCash[cur] || {}}
                  onChange={v => setOpeningCash(c => ({ ...c, [cur]: v }))}
                  denoms={CASH_DENOMS[cur] || []}
                  currency={cur}
                />
              </PageSection>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {(["GBP", "KES"] as const).map(cur => (
              <PageSection key={cur} title={`${cur} Cash`}>
                <CashDenomInput
                  values={openingCash[cur] || {}}
                  onChange={v => setOpeningCash(c => ({ ...c, [cur]: v }))}
                  denoms={CASH_DENOMS[cur] || []}
                  currency={cur}
                />
              </PageSection>
            ))}
          </div>

          <div className="cms-panel px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setStep(1)} className="gap-1 h-8">
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </Button>
              <div>
                <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Grand Total (TZS)</p>
                <p className="text-xl font-mono font-bold">{formatCurrency(grandTotal)}</p>
              </div>
            </div>
            <Button onClick={submit} disabled={open.isPending} className="gap-1 h-9 px-6" size="sm">
              <Play className="w-3.5 h-3.5" /> {open.isPending ? "Opening…" : "Open Slots Shift"}
            </Button>
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
              No Office rates for today. Fallback values (per 1 unit of foreign currency).{" "}
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

    </PageShell>
  );
};

export default OpenSlotsShiftScreen;
