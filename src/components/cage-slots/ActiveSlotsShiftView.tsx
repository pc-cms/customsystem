import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Coins, Send, RotateCcw, Printer, FileText, CreditCard, Save, ArrowLeftRight, History, Pencil, Gift } from "lucide-react";
import PrintSlotsShiftDialog from "./PrintSlotsShiftDialog";
import EditOpeningCardsDialog from "./EditOpeningCardsDialog";
// SlotsTransfersForm moved to /transfers page (sidebar)
import { useSlotsTransfers } from "@/hooks/use-cage-slots-transfers";
import { useSlotsExpenses } from "@/hooks/use-expenses";
import { useSlotsTipsCd } from "@/hooks/use-slots-tips-cd";
import { useSlotsTipsCdPayouts } from "@/hooks/use-slots-tips-cd-payouts";
import { tipsBucketOf } from "@/lib/slots-tips-bucket";


import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import CashDenomInput, { cashSum } from "@/components/cage/CashDenomInput";
import CashCountGrid from "@/components/cage/CashCountGrid";
import {
  emptyBanks, emptyMobile, mobileTotal, bankTotalTzs,
  MOBILE_PROVIDERS,
  type Banks, type MobileProviders,
} from "@/components/cage/CageHelpers";
import {
  CURRENCIES, FOREIGN_CURRENCIES, CASH_DENOMS,
  formatNumberSpaces, formatCurrency,
} from "@/lib/currency";
import { fmtDateTime } from "@/lib/format-date";
import {
  useSlotsRates, useSlotsInventory, useSlotsCards, useSlotsCashCounts,
  useSlotsCashless, useSlotsComments,
  useUpdateSlotsSystemResult, useUpsertSlotsInventory, useUpdateSlotsCards,
  useCreateSlotsCashCount, useSubmitSlotsForReview, useApproveSlotsShift,
  useCreateSlotsCashless, useReopenSlotsShift,
} from "@/hooks/use-cage-slots";
import { useCashlessSuggestions } from "@/hooks/use-cashless";
import { useAuth } from "@/lib/auth-context";
import ManagerOverrideDialog from "@/components/ManagerOverrideDialog";
import type { Tables } from "@/integrations/supabase/types";
import CashCheckViewerDialog from "@/components/cage/CashCheckViewerDialog";
import { computeSlotsShiftBalance } from "@/lib/cage-balance";
import { supabase } from "@/integrations/supabase/client";

type Shift = Tables<"cage_slots_shifts">;

const ActiveSlotsShiftView = ({ shift }: { shift: Shift }) => {
  const navigate = useNavigate();
  const { roles, managerOverride } = useAuth();
  const canManage =
    roles.includes("manager") || roles.includes("super_admin") || managerOverride.active;

  const { data: rates = [] } = useSlotsRates(shift.id);
  const { data: inventory = [] } = useSlotsInventory(shift.id);
  const { data: cards } = useSlotsCards(shift.id);
  const { data: checks = [] } = useSlotsCashCounts(shift.id);
  const { data: cashless = [] } = useSlotsCashless(shift.id);
  const { data: comments = [] } = useSlotsComments(shift.id);
  const { data: slotsExpenses = [] } = useSlotsExpenses(shift.business_date);
  const { data: cashlessSug } = useCashlessSuggestions(shift.business_date, "slots");
  const { data: tipsCdRows = [] } = useSlotsTipsCd(shift.id);
  const { data: tipsCdPayouts = [] } = useSlotsTipsCdPayouts(shift.id);
  
  const { data: transfers = [] } = useSlotsTransfers(shift.id);





  const setSystem = useUpdateSlotsSystemResult();
  const upsertInv = useUpsertSlotsInventory();
  const updateCards = useUpdateSlotsCards();
  const saveCheck = useCreateSlotsCashCount();
  const submit = useSubmitSlotsForReview();
  const approve = useApproveSlotsShift();
  const reopen = useReopenSlotsShift();
  const createCashless = useCreateSlotsCashless();

  const rateMap = useMemo(() => {
    const m: Record<string, number> = { TZS: 1 };
    rates.forEach(r => { m[r.currency_code] = Number(r.rate_to_tzs); });
    return m;
  }, [rates]);

  // Opening totals
  const opening = useMemo(() => {
    const byCur: Record<string, Record<number, number>> = Object.fromEntries(CURRENCIES.map(c => [c, {}]));
    inventory.filter(r => r.inventory_type === "opening").forEach(r => {
      byCur[r.currency_code] = byCur[r.currency_code] || {};
      byCur[r.currency_code][r.denomination] = r.quantity;
    });
    return byCur;
  }, [inventory]);

  const openingTotalTzs = useMemo(() =>
    inventory.filter(r => r.inventory_type === "opening")
      .reduce((s, r) => s + Number(r.total_tzs || 0), 0),
    [inventory],
  );

  // Closing entry state (controlled locally, persisted on save)
  // activeSection is now driven by route (see top); no local state.
  const [closingCash, setClosingCash] = useState<Record<string, Record<number, number>>>(
    Object.fromEntries(CURRENCIES.map(c => [c, {}]))
  );
  const [closingBanks, setClosingBanks] = useState<Banks>(emptyBanks());
  const [closingMobile, setClosingMobile] = useState<MobileProviders>(emptyMobile());
  const [closingCards, setClosingCards] = useState<number>(cards?.closing_card_count ?? 0);
  const [systemResultInput, setSystemResultInput] = useState<string>(
    shift.system_shift_result?.toString() ?? "",
  );
  const [aceFillsInput, setAceFillsInput] = useState<string>(
    (shift as any).ace_fills?.toString() ?? "",
  );
  const [cashlessFinalInput, setCashlessFinalInput] = useState<string>(
    (shift as any).cashless_final?.toString() ?? "",
  );
  // Cashless manual entry blocks (IN / OUT / FINAL) — providers, persisted on the shift row.
  const [cashlessInProviders, setCashlessInProviders] = useState<MobileProviders>(
    { ...emptyMobile(), ...((shift as any).cashless_in_providers || {}) },
  );
  const [cashlessOutProviders, setCashlessOutProviders] = useState<MobileProviders>(
    { ...emptyMobile(), ...((shift as any).cashless_out_providers || {}) },
  );
  const [cashlessFinalProviders, setCashlessFinalProviders] = useState<MobileProviders>(
    { ...emptyMobile(), ...((shift as any).cashless_final_providers || {}) },
  );
  const [cashierNote, setCashierNote] = useState<string>(shift.cashier_note || "");

  // Persist cashless provider blocks (onBlur from the inputs).
  const saveCashlessProviders = async (
    field: "cashless_in_providers" | "cashless_out_providers" | "cashless_final_providers",
    value: MobileProviders,
  ) => {
    await supabase
      .from("cage_slots_shifts")
      .update({ [field]: value } as any)
      .eq("id", shift.id);
  };

  // Hydrate closing from persisted closing inventory + cards
  useEffect(() => {
    const byCur: Record<string, Record<number, number>> = Object.fromEntries(CURRENCIES.map(c => [c, {}]));
    inventory.filter(r => r.inventory_type === "closing").forEach(r => {
      byCur[r.currency_code] = byCur[r.currency_code] || {};
      byCur[r.currency_code][r.denomination] = r.quantity;
    });
    setClosingCash(byCur);
  }, [inventory]);
  useEffect(() => {
    if (cards?.closing_card_count != null) setClosingCards(cards.closing_card_count);
  }, [cards?.closing_card_count]);

  // Hydrate banks + mobile from the latest cash check (denominations JSONB).
  useEffect(() => {
    const last = checks[0];
    const d = (last?.denominations || {}) as Record<string, unknown>;
    if (d.bank) setClosingBanks(d.bank as Banks);
    if (d.mobile) setClosingMobile(d.mobile as MobileProviders);
  }, [checks]);


  const closingTzsTotal = useMemo(() => cashSum(closingCash["TZS"] || {}), [closingCash]);
  const closingFxTzs = useMemo(() => FOREIGN_CURRENCIES.reduce(
    (s, c) => s + cashSum(closingCash[c] || {}) * (rateMap[c] || 0), 0,
  ), [closingCash, rateMap]);
  const cardDepositTzs = Number(cards?.card_deposit_value_tzs || 5000);

  // Cashless IN/OUT (current shift)
  const cashlessIn = useMemo(() =>
    cashless.filter((t: any) => t.direction === "IN").reduce((s, t: any) => s + Number(t.amount), 0),
    [cashless],
  );
  const cashlessOut = useMemo(() =>
    cashless.filter((t: any) => t.direction === "OUT").reduce((s, t: any) => s + Number(t.amount), 0),
    [cashless],
  );

  // Transfers grouped by type
  const transfersAgg = useMemo(() => {
    const agg = { fill: 0, collection: 0, lg_in: 0, lg_out: 0 };
    transfers.forEach((t: any) => {
      const k = t.transfer_type as keyof typeof agg;
      if (k in agg) agg[k] += Number(t.amount || 0);
    });
    return agg;
  }, [transfers]);

  // Approved expenses for this slots shift
  const expensesApproved = useMemo(() =>
    slotsExpenses.filter((e: any) => e.approved).reduce((s: number, e: any) => s + Number(e.amount || 0), 0),
    [slotsExpenses],
  );

  // Tips CD collected during this shift — reporting log only (not in balance).
  const tipsCdTotal = useMemo(() =>
    (tipsCdRows as any[]).reduce((s, t) => s + Number(t.amount || 0), 0),
    [tipsCdRows],
  );
  // Per-bucket collected (derived from created_at via tipsBucketOf).
  const collectedByBucket = useMemo(() => {
    const out = { day: 0, evening: 0 };
    (tipsCdRows as any[]).forEach((t) => {
      const b = tipsBucketOf(t.created_at);
      out[b] += Number(t.amount || 0);
    });
    return out;
  }, [tipsCdRows]);
  // Payout state per bucket.
  const payoutByBucket = useMemo(() => {
    const out: { day: any; evening: any } = { day: null, evening: null };
    (tipsCdPayouts as any[]).forEach((p) => { out[p.bucket as "day" | "evening"] = p; });
    return out;
  }, [tipsCdPayouts]);
  const tipsCdPayoutTotal = useMemo(() =>
    (tipsCdPayouts as any[]).reduce((s, p) => s + Number(p.amount || 0), 0),
    [tipsCdPayouts],
  );

  // Slots balance is shown as explicit manual formula parts in the UI.
  const openingCashTzs = openingTotalTzs;
  // Mobile Money is derived from manual Cashless blocks:
  //   Mobile Money = Cashless IN − Cashless OUT
  //   Closing Cash = TZS + FX + Banks + Mobile Money
  const cashlessInManualTzs = useMemo(() => mobileTotal(cashlessInProviders), [cashlessInProviders]);
  const cashlessOutManualTzs = useMemo(() => mobileTotal(cashlessOutProviders), [cashlessOutProviders]);
  const mobileMoneyTzs = cashlessInManualTzs - cashlessOutManualTzs;
  const closingCashTzs = closingTzsTotal + closingFxTzs
    + bankTotalTzs(closingBanks, rateMap) + mobileMoneyTzs;

  const openingCardsCount = Number(cards?.opening_card_count || 0);
  const systemResult = Number(systemResultInput) || Number(shift.system_shift_result || 0);
  const aceFills = Number(aceFillsInput) || Number((shift as any).ace_fills || 0);
  // Informative metric: real slots P&L = System − manual ACE Fills.
  // NOT used in CDR or Shift Balance; mirrored in DB column slots_result by trigger.
  const slotsResultDerived = systemResult - aceFills;

  const cashlessFinal = Number(cashlessFinalInput) || 0;

  const balance = useMemo(() => computeSlotsShiftBalance({
    openingCash: openingCashTzs,
    closingCash: closingCashTzs,
    expenses: expensesApproved,
    collection: transfersAgg.collection,
    addFloat: transfersAgg.fill,
    lgIn: transfersAgg.lg_in,
    lgOut: transfersAgg.lg_out,
    cashlessIn: cashlessInManualTzs,
    cashlessOut: cashlessOutManualTzs,
    cashlessFinal,
    openingCards: openingCardsCount,
    closingCards,
    cardValue: cardDepositTzs,
    systemResult,
    tipsCdIn: tipsCdTotal,
    tipsCdPayout: tipsCdPayoutTotal,
  }), [openingCashTzs, closingCashTzs, expensesApproved, transfersAgg, cashlessInManualTzs, cashlessOutManualTzs, cashlessFinal, openingCardsCount, closingCards, cardDepositTzs, systemResult, tipsCdTotal, tipsCdPayoutTotal]);

  const { deltaCash, cashDeskResult, cardsMiss, slotsResult, cashlessBalance, shiftBalance } = balance;




  const persistClosingCash = async (currency: string, denom: number, qty: number) => {
    await upsertInv.mutateAsync({
      shift_id: shift.id,
      inventory_type: "closing",
      currency, denomination: denom, quantity: qty,
      rate_to_tzs: rateMap[currency] || (currency === "TZS" ? 1 : 0),
    });
  };

  // Pull fresh transfer aggregates straight from the DB so the snapshot is
  // never stale relative to React Query cache (e.g. a transfer added seconds
  // before pressing "Check" might not be in the local list yet).
  const fetchFreshTransfersAgg = async () => {
    const agg = { fill: 0, collection: 0, lg_in: 0, lg_out: 0 };
    const { data } = await supabase
      .from("cage_slots_transfers")
      .select("transfer_type, amount")
      .eq("cage_slots_shift_id", shift.id);
    (data || []).forEach((t: any) => {
      const k = t.transfer_type as keyof typeof agg;
      if (k in agg) agg[k] += Number(t.amount || 0);
    });
    return agg;
  };

  // Mid-shift cash check — snapshot of canonical balance fields.
  // Empty till is a valid state (negative balance reflects the shortage).
  // Mobile block is derived from the CURRENT cashless providers (IN − OUT) so
  // the saved check matches what's actually visible on screen — never stale.
  const recordMidCheck = async () => {
    const freshAgg = await fetchFreshTransfersAgg();
    const bankTzs = bankTotalTzs(closingBanks, rateMap);
    const mobileBlock: MobileProviders = { ...emptyMobile() };
    MOBILE_PROVIDERS.forEach(p => {
      mobileBlock[p] = Number(cashlessInProviders[p] || 0) - Number(cashlessOutProviders[p] || 0);
    });
    const mobileTzs = mobileTotal(mobileBlock);
    saveCheck.mutate({
      shift_id: shift.id,
      count_type: "check",
      denominations: {
        cash: closingCash,
        bank: closingBanks,
        mobile: mobileBlock,
        cashless_in_providers: cashlessInProviders,
        cashless_out_providers: cashlessOutProviders,
        cards: { count: closingCards, value_tzs: cardDepositTzs },
        rateMap,
        totals: {
          total_tzs: closingCashTzs,
          bank_tzs: bankTzs,
          mobile_tzs: mobileTzs,
          delta_cash: deltaCash,
          cash_desk_result: cashDeskResult,
          cards_miss: cardsMiss,
          system_result: systemResult,
          slots_result: slotsResult,
          slots_result_derived: slotsResult,
          expenses: expensesApproved,
          transfer_in: freshAgg.lg_in,
          transfer_out: freshAgg.lg_out,
          collection: freshAgg.collection,
          add_float: freshAgg.fill,
          cashless_in: cashlessInManualTzs,
          cashless_out: cashlessOutManualTzs,
          cashless_balance: cashlessBalance,
          shift_balance: shiftBalance,
          balance: shiftBalance,
        },
      },
      total_tzs: closingCashTzs,
      note: "Mid-shift check",
    });
  };




  // Closing preview dialog (Live Game-style: review before submit-for-review).
  const [showClosingPreview, setShowClosingPreview] = useState(false);
  const [showEditOpeningCards, setShowEditOpeningCards] = useState(false);
  

  const openClosingPreview = () => {
    if (!systemResultInput.trim()) {
      alert("Enter the System Result before previewing the closing.");
      return;
    }
    setShowClosingPreview(true);
  };

  const confirmSubmitForReview = async () => {
    const freshAgg = await fetchFreshTransfersAgg();
    await supabase
      .from("cage_slots_shifts")
      .update({ cashless_final: cashlessFinal } as any)
      .eq("id", shift.id);
    setSystem.mutate({ shift_id: shift.id, system_shift_result: Number(systemResultInput) || 0 });
    updateCards.mutate({ shift_id: shift.id, closing_card_count: closingCards });
    // End-of-day mobile money balances = MANUAL snapshot from the cashier
    // (closingMobile state, edited in the closing form). Never auto-derive
    // from IN−OUT — the printed report row must reflect what the cashier
    // physically saw on each provider account at close.
    submit.mutate({
      shift_id: shift.id,
      closing_total_tzs: closingCashTzs,
      closing_denominations: {
        cash: closingCash,
        bank: closingBanks,
        mobile: closingMobile,
        cashless_in_providers: cashlessInProviders,
        cashless_out_providers: cashlessOutProviders,

        cards: { count: closingCards, value_tzs: cardDepositTzs },
        rateMap,
        totals: {
          total_tzs: closingCashTzs,
          delta_cash: deltaCash,
          cash_desk_result: cashDeskResult,
          cards_miss: cardsMiss,
          system_result: systemResult,
          slots_result: slotsResult,
          slots_result_derived: slotsResult,
          expenses: expensesApproved,
          transfer_in: freshAgg.lg_in,
          transfer_out: freshAgg.lg_out,
          collection: freshAgg.collection,
          add_float: freshAgg.fill,
          cashless_in: cashlessInManualTzs,
          cashless_out: cashlessOutManualTzs,
          cashless_balance: cashlessBalance,
          cashless_final: cashlessFinal,
          shift_balance: shiftBalance,
          balance: shiftBalance,
        },
      },
      cashier_note: cashierNote,
    }, { onSuccess: () => setShowClosingPreview(false) });
  };


  // Manager approve
  const [showApprove, setShowApprove] = useState(false);
  const [managerComment, setManagerComment] = useState("");
  const [viewerCheck, setViewerCheck] = useState<Tables<"cash_counts"> | null>(null);
  const [showPrintPrompt, setShowPrintPrompt] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const needsComment = Math.abs(shiftBalance) > 0;

  const doApprove = (managerId: string) => {
    approve.mutate(
      {
        shift_id: shift.id,
        manager_id: managerId,
        manager_comment: managerComment || (needsComment ? "" : "Approved with zero balance"),
      },
      {
        onSuccess: () => {
          setShowApprove(false);
          setManagerComment("");
          // Shift becomes "closed" → this view unmounts immediately. Navigate
          // to the report page with ?print=1 so the print dialog opens there
          // (the previous inline print prompt was being unmounted before it
          // could appear, which is why "Print" never fired on close).
          navigate(`/cage-slots/report/${shift.id}?print=1`);
        },
      },
    );
  };

  // Cashless transactions UI moved to /cashless sidebar page — keep per-provider totals
  // for hints/snapshot only.
  const cashlessByProvider = useMemo(() => {
    const m: Record<string, number> = {};
    cashless.forEach((t: any) => {
      const sign = t.direction === "IN" ? 1 : -1;
      m[t.provider] = (m[t.provider] || 0) + sign * Number(t.amount || 0);
    });
    return m;
  }, [cashless]);




  const isReadyForReview = shift.status === "ready_for_review";

  // ============ Manager Review Screen ============
  // When cashier has submitted, show ONLY a clean review panel — no tabs, no editing.
  if (isReadyForReview) {
    return (
      <PageShell>
        <PageHeader
          icon={Coins}
          title="Cage Slots · Manager Review"
          subtitle={`Submitted ${shift.submitted_at ? fmtDateTime(shift.submitted_at) : "—"}`}
          date
          context={<Badge className="uppercase text-[10px]">Awaiting Manager</Badge>}
        />

        <div className="max-w-2xl mx-auto w-full space-y-3">
          {/* Cash on Hand — 5 clean columns, no opening/delta duplication */}
          <PageSection title="Cash on Hand (Closing)">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <BigTile label="TZS Cash" value={closingTzsTotal} />
              <BigTile label="Foreign Cash" value={closingFxTzs} />
              <BigTile label="Banks" value={bankTotalTzs(closingBanks, rateMap)} />
              <BigTile label="Mobile Money" value={mobileMoneyTzs} signed />
              <BigTile label="Total Closing Cash" value={closingCashTzs} emphasize />
            </div>
          </PageSection>

          {/* Shift Result — single row, no duplicates, no formulas in headings */}
          <PageSection title="Shift Result">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <BigTile label="Opening Cash" value={openingCashTzs} />
              <BigTile label="Closing Cash" value={closingCashTzs} />
              <BigTile label="System Result" value={systemResult} signed />
              <BigTile label="Cash Desk Result" value={cashDeskResult} signed />
              <BigTile label="Cards Miss" value={cardsMiss} signed />
            </div>

            {(tipsCdTotal > 0 || tipsCdPayoutTotal > 0) && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Tips CD this shift: IN <span className="font-mono cms-amount-positive">+{formatNumberSpaces(tipsCdTotal)}</span> · OUT <span className="font-mono cms-amount-negative">−{formatNumberSpaces(tipsCdPayoutTotal)}</span> — neutralized in Cash Desk Result (unpaid tips stay as a debt to staff, not a cage surplus).
              </p>
            )}

            {/* Shift Balance — big number, no formula text */}
            <div className="mt-4 rounded-lg border-2 border-primary/50 bg-primary/5 p-5 flex items-center justify-between">
              <span className="text-sm uppercase text-foreground tracking-[0.18em] font-bold">Shift Balance</span>
              <span className={`font-mono font-extrabold text-5xl tabular-nums ${shiftBalance < 0 ? "cms-amount-negative" : shiftBalance > 0 ? "cms-amount-positive" : "text-emerald-500"}`}>
                {shiftBalance === 0 ? "0" : `${shiftBalance > 0 ? "+" : ""}${formatNumberSpaces(shiftBalance)}`}
              </span>
            </div>

            {cashierNote && (
              <div className="mt-3">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Cashier note</p>
                <p className="text-xs whitespace-pre-wrap border border-border rounded p-2 bg-muted/30">{cashierNote}</p>
              </div>
            )}
            {Math.abs(shiftBalance) > 0 && (
              <div className="mt-3">
                <p className="text-xs text-destructive font-semibold mb-1">Non-zero balance — manager comment required.</p>
                <Textarea value={managerComment} onChange={e => setManagerComment(e.target.value)} rows={2} placeholder="Reason / explanation…" />
              </div>
            )}
          </PageSection>

          {/* Action buttons */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setShowPrintDialog(true)}
              className="gap-1.5"
            >
              <Printer className="w-4 h-4" /> Print Report
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => reopen.mutate({ shift_id: shift.id })}
              disabled={reopen.isPending}
            >
              Cancel
            </Button>
            <ConfirmApproveButton
              needsComment={needsComment}
              hasComment={!!managerComment.trim()}
              onConfirm={(managerId) => doApprove(managerId)}
            />
          </div>
        </div>

        {showPrintDialog && (
          <PrintSlotsShiftDialog
            open={showPrintDialog}
            shiftId={shift.id}
            onClose={() => setShowPrintDialog(false)}
          />
        )}
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        icon={Coins}
        title="Cage Slots"
        subtitle={`Opened ${fmtDateTime(shift.opened_at)}`}
        date
        context={
          <Badge variant={isReadyForReview ? "default" : "outline"} className="uppercase text-[10px]">
            {shift.status.replace("_", " ")}
          </Badge>
        }
      >
        {shift.status === "open" && (
          <>
            <Button
              onClick={recordMidCheck}
              size="sm"
              variant="outline"
              className="gap-1.5 h-8 border-amber-500/60 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
              disabled={saveCheck.isPending}
            >
              <FileText className="w-3.5 h-3.5" /> Check
            </Button>
            <Button
              onClick={() => navigate("/cage-slots/tips")}
              size="sm"
              variant="outline"
              className="gap-1.5 h-8 border-pink-500/60 text-pink-600 hover:bg-pink-500/10 dark:text-pink-400"
            >
              <Gift className="w-3.5 h-3.5" /> Tips CD
            </Button>
            <Button
              onClick={openClosingPreview}
              size="sm"
              className="gap-1.5 h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={submit.isPending}
            >
              <Send className="w-3.5 h-3.5" /> Closing
            </Button>
          </>
        )}
        {isReadyForReview && (
          <Button onClick={() => setShowApprove(true)} size="sm" className="gap-1.5 h-8" disabled={approve.isPending}>
            <Save className="w-3.5 h-3.5" /> Close Shift
          </Button>
        )}
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => navigate("/cage-slots?view=history")} className="gap-1.5 h-8">
            <History className="w-3.5 h-3.5" /> History
          </Button>
        )}
      </PageHeader>

      {/* ===== Unified Shift Dashboard — two rows, read-only metrics ===== */}
      <div className="cms-panel p-2 mb-2">
        {/* Row 1 — Cash flow */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-x-3 gap-y-1">
          <div>
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">Opening Cash</p>
            <p className="font-mono text-base font-bold text-card-foreground tabular-nums">{formatCurrency(openingCashTzs)}</p>
          </div>
          <div>
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">+ Add Float</p>
            <p className="font-mono text-base font-bold text-success tabular-nums">+{formatCurrency(transfersAgg.fill)}</p>
          </div>
          <div>
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">− Collection</p>
            <p className="font-mono text-base font-bold text-destructive tabular-nums">−{formatCurrency(transfersAgg.collection)}</p>
          </div>
          <div>
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">− Expenses</p>
            <p className="font-mono text-base font-bold text-warning tabular-nums">−{formatCurrency(expensesApproved)}</p>
          </div>
          <div>
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">Δ Cash</p>
            <p className={`font-mono text-base font-bold tabular-nums ${deltaCash >= 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>{deltaCash >= 0 ? "+" : ""}{formatCurrency(deltaCash)}</p>
          </div>
          <div>
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">Closing Cash</p>
            <p className="font-mono text-base font-bold text-card-foreground tabular-nums">{formatCurrency(closingCashTzs)}</p>
          </div>
        </div>

        <div className="my-2 border-t border-border/60" />

        {/* Row 2 — Slots P&L */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-x-3 gap-y-1">
          <div>
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">System Result</p>
            <p className={`font-mono text-base font-bold tabular-nums ${systemResult < 0 ? "cms-amount-negative" : systemResult > 0 ? "cms-amount-positive" : ""}`}>
              {systemResult > 0 ? "+" : ""}{formatNumberSpaces(systemResult)}
            </p>
          </div>
          <div>
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">− ACE Fills</p>
            <p className="font-mono text-base font-bold text-warning tabular-nums">−{formatNumberSpaces(aceFills)}</p>
          </div>
          <div>
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">Slots Result</p>
            <p className={`font-mono text-base font-bold tabular-nums ${slotsResultDerived < 0 ? "cms-amount-negative" : slotsResultDerived > 0 ? "cms-amount-positive" : ""}`}>
              {slotsResultDerived > 0 ? "+" : ""}{formatNumberSpaces(slotsResultDerived)}
            </p>
          </div>
          <div>
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">Cards Miss</p>
            <p className={`font-mono text-base font-bold tabular-nums ${cardsMiss < 0 ? "cms-amount-negative" : cardsMiss > 0 ? "cms-amount-positive" : ""}`}>
              {cardsMiss > 0 ? "+" : ""}{formatNumberSpaces(cardsMiss)}
            </p>
          </div>
          <div>
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">Cash Desk Result</p>
            <p className={`font-mono text-base font-bold tabular-nums ${cashDeskResult < 0 ? "cms-amount-negative" : cashDeskResult > 0 ? "cms-amount-positive" : ""}`}>
              {cashDeskResult > 0 ? "+" : ""}{formatNumberSpaces(cashDeskResult)}
            </p>
          </div>
          <div>
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">Shift Balance</p>
            <p className={`font-mono text-base font-bold tabular-nums ${shiftBalance === 0 ? "text-success" : "text-destructive"}`}>
              {shiftBalance >= 0 ? "+" : ""}{formatCurrency(shiftBalance)}
            </p>
          </div>
        </div>
      </div>

      {/* ===== Manual Inputs — separate panel below the dashboard ===== */}
      <div className="cms-panel p-2 mb-4 border-dashed">
        <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium mb-2">Manual Entry</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-2">
          <div>
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">System Result (TZS)</p>
            <NumberInput
              value={systemResultInput}
              onChange={v => setSystemResultInput(String(v))}
              onBlur={() => setSystem.mutate({ shift_id: shift.id, system_shift_result: Number(systemResultInput) || 0 })}
              className={`no-spin h-8 w-full font-mono text-base font-bold tabular-nums ${systemResult < 0 ? "cms-amount-negative" : systemResult > 0 ? "cms-amount-positive" : ""}`}
              placeholder="0"
              disabled={shift.status !== "open"}
            />
          </div>
          <div>
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">ACE Fills (TZS) <span className="text-muted-foreground/70 normal-case tracking-normal">· manual</span></p>
            <NumberInput
              value={aceFillsInput}
              onChange={v => setAceFillsInput(String(v))}
              onBlur={async () => {
                await supabase
                  .from("cage_slots_shifts")
                  .update({ ace_fills: Number(aceFillsInput) || 0 } as any)
                  .eq("id", shift.id);
              }}
              className="no-spin h-8 w-full font-mono text-base font-bold tabular-nums"
              placeholder="0"
              disabled={shift.status !== "open"}
            />
          </div>
          <div className="relative">
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">
              Cards Opening <span className="text-muted-foreground/70 normal-case tracking-normal">· × {formatNumberSpaces(cardDepositTzs)}</span>
            </p>
            <div className="h-8 flex items-center font-mono text-base font-bold tabular-nums">
              {cards?.opening_card_count ?? 0}
            </div>
            {canManage && shift.status === "open" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowEditOpeningCards(true)}
                className="absolute top-0 right-0 h-5 w-5 text-muted-foreground hover:text-primary"
                title="Edit opening cards (manager)"
              >
                <Pencil className="w-3 h-3" />
              </Button>
            )}
          </div>
          <div>
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">
              Cards Closing <span className="text-muted-foreground/70 normal-case tracking-normal">· miss {cards?.miss_card_count ?? (closingCards - (cards?.opening_card_count ?? 0))}</span>
            </p>
            <NumberInput
              value={closingCards || ""}
              onChange={v => setClosingCards(Number(v) || 0)}
              onBlur={() => updateCards.mutate({ shift_id: shift.id, closing_card_count: closingCards })}
              className="no-spin h-8 w-full font-mono text-base font-bold tabular-nums"
              disabled={shift.status !== "open"}
            />
          </div>
        </div>
      </div>




      <div>
        <div className="flex-1 min-w-0 space-y-2">

          {true && (
            <>
              {/* Same grid as Live Game cage, scaled down ~30% for compactness. */}
              <div className="cms-panel p-3">
                <div style={{ zoom: 0.7 }}>
                  <CashCountGrid
                    chips={{}}
                    onChipsChange={() => { /* slots cage has no chips */ }}
                    cash={closingCash}
                    onCashChange={(cur, next) => {
                      const prev = closingCash[cur] || {};
                      setClosingCash(c => ({ ...c, [cur]: next }));
                      const denoms = CASH_DENOMS[cur] || [];
                      for (const d of denoms) {
                        if ((next[d] || 0) !== (prev[d] || 0)) {
                          persistClosingCash(cur, d, next[d] || 0);
                        }
                      }
                    }}
                    banks={closingBanks}
                    onBanksChange={setClosingBanks}
                    mobile={closingMobile}
                    onMobileChange={setClosingMobile}
                    rates={rateMap}
                    hideChips
                    hideMobile
                  />
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Bank balances are saved into the next Check (use the Check button at the top). Mobile Money is derived from Cashless IN − OUT below.
                </p>
              </div>

              {/* Cashless manual entry — three provider blocks (IN / OUT / FINAL). */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <CashlessProvidersBlock
                  title="Cashless IN"
                  tone="in"
                  values={cashlessInProviders}
                  onChange={setCashlessInProviders}
                  onBlur={() => saveCashlessProviders("cashless_in_providers", cashlessInProviders)}
                  disabled={shift.status !== "open"}
                  suggestions={cashlessSug?.in}
                />
                <CashlessProvidersBlock
                  title="Cashless OUT"
                  tone="out"
                  values={cashlessOutProviders}
                  onChange={setCashlessOutProviders}
                  onBlur={() => saveCashlessProviders("cashless_out_providers", cashlessOutProviders)}
                  disabled={shift.status !== "open"}
                  suggestions={cashlessSug?.out}
                />
                <CashlessProvidersBlock
                  title="Cashless FINAL · print only"
                  tone="final"
                  values={cashlessFinalProviders}
                  onChange={(v) => {
                    setCashlessFinalProviders(v);
                    const total = mobileTotal(v);
                    setCashlessFinalInput(String(total));
                  }}
                  onBlur={async () => {
                    await saveCashlessProviders("cashless_final_providers", cashlessFinalProviders);
                    await supabase
                      .from("cage_slots_shifts")
                      .update({ cashless_final: Number(cashlessFinalInput) || 0 } as any)
                      .eq("id", shift.id);
                  }}
                  disabled={shift.status !== "open"}
                />
              </div>

              {/* Checks history (was a separate tab) */}
              <PageSection title={`Checks (${checks.length})`}>
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground border-b border-border">
                    <tr><th className="text-left py-1.5">When</th><th className="text-left">Kind</th><th className="text-right">Balance (TZS)</th><th className="text-left">Note</th></tr>
                  </thead>
                  <tbody>
                    {checks.length === 0 && <tr><td colSpan={4} className="text-center text-muted-foreground py-3">·</td></tr>}
                    {checks.map(c => {
                      const d: any = c.denominations || {};
                      const t: any = d.totals || {};
                      const isOpening = !!(d.is_opening || t.is_opening);
                      const isClosing = !!(d.is_closing || t.is_closing);
                      const isReview = !!(d.is_review || t.is_review);
                      const kind = isOpening ? "Opening" : isClosing ? "Closing" : isReview ? "Review" : "Check";
                      const cls =
                        kind === "Opening" ? "bg-primary/15 text-primary" :
                        kind === "Closing" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                        kind === "Review"  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                                             "bg-muted text-muted-foreground";
                      const balanceRaw = t.balance ?? t.shift_balance;
                      const hasBalance = balanceRaw !== undefined && balanceRaw !== null && !isOpening;
                      const balanceNum = Number(balanceRaw || 0);
                      const balanceCls = !hasBalance
                        ? "text-muted-foreground"
                        : balanceNum > 0
                          ? "cms-amount-positive"
                          : balanceNum < 0
                            ? "cms-amount-negative"
                            : "";
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setViewerCheck({ ...(c as any), total: (c as any).total_tzs } as Tables<"cash_counts">)}
                          className="border-b border-border/50 cursor-pointer hover:bg-accent/30 transition-colors"
                        >
                          <td className="py-1.5 font-mono text-[10px] text-muted-foreground">{fmtDateTime(c.created_at)}</td>
                          <td><span className={`cms-chip text-[9px] h-4 px-1.5 uppercase ${cls}`}>{kind}</span></td>
                          <td className={`text-right font-mono ${balanceCls}`}>{hasBalance ? formatNumberSpaces(balanceNum) : "·"}</td>
                          <td className="text-muted-foreground">{c.note || "·"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </PageSection>
              <CashCheckViewerDialog
                open={!!viewerCheck}
                onOpenChange={(o) => { if (!o) setViewerCheck(null); }}
                check={viewerCheck}
                balanceMode="slots"
              />
            </>
          )}

          {/* Cashless transactions moved to dedicated /cashless page in the sidebar */}

          {/* Transfers form moved to dedicated /transfers page in the sidebar */}
        </div>
      </div>


      {comments.length > 0 && (
        <PageSection title="Comments & Reversals">
          <ul className="space-y-2">
            {comments.map(c => (
              <li key={c.id} className="text-xs border-l-2 border-primary/50 pl-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Badge variant="outline" className="text-[10px] uppercase">{c.comment_type.replace("_", " ")}</Badge>
                  <span>{fmtDateTime(c.created_at)}</span>
                </div>
                <p className="text-foreground mt-0.5">{c.comment_text}</p>
              </li>
            ))}
          </ul>
        </PageSection>
      )}

      {/* Closing preview modal — Live Game-style review before submit-for-review */}
      {showClosingPreview && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowClosingPreview(false)}>
          <div className="bg-card border border-border rounded-md shadow-lg p-5 max-w-3xl w-full space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Closing Preview</h3>
              <Badge variant="outline" className="text-[10px]">REVIEW BEFORE SUBMIT</Badge>
            </div>

            {/* Cash on Hand — single grouped panel, one row per metric (no wrap) */}
            <GroupedPanel
              title="Cash on Hand (Closing)"
              rows={[
                { label: "TZS Cash",      value: closingTzsTotal },
                { label: "Foreign Cash",  value: closingFxTzs },
                { label: "Banks",         value: bankTotalTzs(closingBanks, rateMap) },
                { label: "Mobile Money",  value: mobileMoneyTzs, signed: true },
              ]}
              total={{ label: "Total Closing Cash", value: closingCashTzs }}
            />

            {/* Shift Result — single grouped panel */}
            <GroupedPanel
              title="Shift Result"
              rows={[
                { label: "Opening Cash",     value: openingCashTzs },
                { label: "Closing Cash",     value: closingCashTzs },
                { label: "System Result",    value: systemResult,   signed: true },
                { label: "Cash Desk Result", value: cashDeskResult, signed: true },
                { label: "Cards Miss",       value: cardsMiss,      signed: true },
              ]}
            />
            {(tipsCdTotal > 0 || tipsCdPayoutTotal > 0) && (
              <p className="text-[11px] text-muted-foreground -mt-2">
                Tips CD this shift: IN <span className="font-mono cms-amount-positive">+{formatNumberSpaces(tipsCdTotal)}</span> · OUT <span className="font-mono cms-amount-negative">−{formatNumberSpaces(tipsCdPayoutTotal)}</span> — neutralized in Cash Desk Result.
              </p>
            )}

            {/* Shift Balance — big number, no formula */}
            <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-5 flex items-center justify-between">
              <span className="text-sm uppercase text-foreground tracking-[0.18em] font-bold">Shift Balance</span>
              <span className={`font-mono font-extrabold text-5xl tabular-nums whitespace-nowrap ${shiftBalance < 0 ? "cms-amount-negative" : shiftBalance > 0 ? "cms-amount-positive" : "text-emerald-500"}`}>
                {shiftBalance === 0 ? "0" : `${shiftBalance > 0 ? "+" : ""}${formatNumberSpaces(shiftBalance)}`}
              </span>
            </div>
            {Math.abs(shiftBalance) > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 -mt-2">
                Non-zero balance — manager will need to approve with a comment.
              </p>
            )}

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md border border-border p-2">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Cashless IN / OUT</p>
                <p className="font-mono whitespace-nowrap">{formatNumberSpaces(cashlessInManualTzs)} / {formatNumberSpaces(cashlessOutManualTzs)}</p>
              </div>
              <div className="rounded-md border border-border p-2">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Cashless Final (print only)</p>
                <p className="font-mono whitespace-nowrap">{formatNumberSpaces(cashlessFinal)}</p>
              </div>
              <div className="rounded-md border border-border p-2">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Cards Open · Close</p>
                <p className="font-mono whitespace-nowrap">{cards?.opening_card_count ?? 0} · {closingCards}</p>
              </div>
            </div>

            {cashierNote && (
              <div>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Cashier note</p>
                <p className="text-xs whitespace-pre-wrap border border-border rounded p-2 bg-muted/30">{cashierNote}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setShowClosingPreview(false)}>
                <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" /> Back to Edit
              </Button>
              <Button
                size="sm"
                onClick={confirmSubmitForReview}
                disabled={submit.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" /> Submit for Review
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Approve modal */}
      {showApprove && (
        <>
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowApprove(false)}>
            <div className="bg-card border border-border rounded-md shadow-lg p-4 max-w-md w-full space-y-3" onClick={e => e.stopPropagation()}>
              <h3 className="font-semibold">Approve & Close Slots Shift</h3>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Stat label="Count Cash" value={closingCashTzs} />
                <Stat label="Slots Result" value={slotsResult} signed />
                <Stat label="Balance" value={shiftBalance} signed emphasize />
              </div>
              {needsComment && (
                <div>
                  <p className="text-xs text-destructive font-semibold mb-1">Balance is non-zero — manager comment is required.</p>
                  <Textarea value={managerComment} onChange={e => setManagerComment(e.target.value)} rows={3} placeholder="Reason / explanation…" />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowApprove(false)}>Cancel</Button>
                <ConfirmApproveButton needsComment={needsComment} hasComment={!!managerComment.trim()} onConfirm={doApprove} />
              </div>
            </div>
          </div>
        </>
      )}

      {showEditOpeningCards && (
        <EditOpeningCardsDialog
          shift={shift}
          currentValue={Number(cards?.opening_card_count ?? 0)}
          cardDepositValue={Number(cards?.card_deposit_value_tzs ?? 5000)}
          open={showEditOpeningCards}
          onClose={() => setShowEditOpeningCards(false)}
        />
      )}

      {/* Print Reports prompt — shown after manager approves & closes the shift */}
      {showPrintPrompt && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowPrintPrompt(false)}>
          <div className="bg-card border border-border rounded-md shadow-lg p-5 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="font-semibold text-base">Print Reports?</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Shift closed successfully. Do you want to print the shift report now?
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowPrintPrompt(false)}>No</Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setShowPrintPrompt(false);
                  setShowPrintDialog(true);
                }}
              >
                <Printer className="w-3.5 h-3.5" /> Yes, Print
              </Button>
            </div>
          </div>
        </div>
      )}

      {showPrintDialog && (
        <PrintSlotsShiftDialog
          open
          shiftId={shift.id}
          onClose={() => setShowPrintDialog(false)}
        />
      )}
    </PageShell>
  );
};

const ConfirmApproveButton = ({ needsComment, hasComment, onConfirm }: {
  needsComment: boolean; hasComment: boolean; onConfirm: (managerId: string) => void;
}) => {
  const [show, setShow] = useState(false);
  const disabled = needsComment && !hasComment;
  return (
    <>
      <Button size="sm" disabled={disabled} onClick={() => setShow(true)}>Authorize & Close</Button>
      <ManagerOverrideDialog
        open={show}
        onClose={() => setShow(false)}
        onConfirm={(managerId) => { setShow(false); onConfirm(managerId); }}
        title="Approve Slots Shift"
        description="Manager authentication is required to close this shift."
        actionType="CAGE_SLOTS_CLOSE"
      />
    </>
  );
};

const ClosingCashEditor = ({ currency, values, opening, onChange, onPersist }: {
  currency: string;
  values: Record<number, number>;
  opening: Record<number, number>;
  onChange: (v: Record<number, number>) => void;
  onPersist: (currency: string, denom: number, qty: number) => void;
}) => {
  const denoms = CASH_DENOMS[currency] || [];
  return (
    <div className="space-y-2">
      <CashDenomInput
        values={values}
        onChange={(next) => {
          onChange(next);
          // persist only changed denom
          for (const d of denoms) {
            if ((next[d] || 0) !== (values[d] || 0)) {
              onPersist(currency, d, next[d] || 0);
            }
          }
        }}
        denoms={denoms}
        currency={currency}
      />
      <div className="text-[10px] text-muted-foreground flex items-center justify-between border-t border-border pt-1">
        <span>Opening:</span>
        <span className="font-mono">
          {currency} {formatNumberSpaces(denoms.reduce((s, d) => s + d * (opening[d] || 0), 0))}
        </span>
      </div>
    </div>
  );
};

const TileCard = ({ label, sub, emphasize, valueClass, children }: {
  label: string; sub?: string; emphasize?: boolean; valueClass?: string; children: React.ReactNode;
}) => (
  <div className={`rounded-md border ${emphasize ? "border-primary/50 bg-primary/5" : "border-border bg-card"} px-3 py-2 h-[88px] flex flex-col justify-between`}>
    <p className="text-xs uppercase font-bold tracking-wider text-muted-foreground text-center">{label}</p>
    <div className={`flex-1 flex items-center justify-center ${valueClass || ""}`}>{children}</div>
    {sub ? <p className="text-[10px] text-muted-foreground text-center">{sub}</p> : <span className="h-[14px]" />}
  </div>
);

const SummaryCard = ({ label, value, signed, emphasize }: {
  label: string; value: number; signed?: boolean; emphasize?: boolean;
}) => {
  const isNeg = value < 0;
  const colorCls = !signed ? "" : (isNeg ? "cms-amount-negative" : value > 0 ? "cms-amount-positive" : "");
  return (
    <div className={`rounded-md border ${emphasize ? "border-primary/50 bg-primary/5" : "border-border bg-card"} px-3 py-2`}>
      <p className="text-[9px] uppercase text-muted-foreground tracking-wider">{label}</p>
      <p className={`text-base font-mono font-bold ${colorCls}`}>
        {signed && value > 0 ? "+" : ""}{formatNumberSpaces(value)}
      </p>
    </div>
  );
};

const Stat = ({ label, value, signed, emphasize }: { label: string; value: number; signed?: boolean; emphasize?: boolean }) => (
  <div>
    <p className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</p>
    <p className={`font-mono font-bold ${emphasize ? "text-base" : "text-sm"} ${signed && value < 0 ? "cms-amount-negative" : signed && value > 0 ? "cms-amount-positive" : ""}`}>
      {signed && value > 0 ? "+" : ""}{formatNumberSpaces(value)}
    </p>
  </div>
);

const BigTile = ({ label, value, signed, emphasize }: { label: string; value: number; signed?: boolean; emphasize?: boolean }) => {
  const colorCls = signed
    ? value < 0 ? "cms-amount-negative" : value > 0 ? "cms-amount-positive" : ""
    : "";
  return (
    <div className={`rounded-md border px-2 py-3 flex flex-col items-center justify-center min-h-[88px] ${emphasize ? "border-primary/60 bg-primary/10" : "border-border bg-card"}`}>
      <p className="text-[10px] uppercase text-muted-foreground tracking-[0.14em] font-semibold text-center mb-1">{label}</p>
      <p className={`font-mono font-bold tabular-nums text-center whitespace-nowrap ${emphasize ? "text-2xl" : "text-xl"} ${colorCls}`}>
        {signed && value > 0 ? "+" : ""}{formatNumberSpaces(value)}
      </p>
    </div>
  );
};

/**
 * Grouped metrics panel — one bordered card with stacked rows.
 * Replaces the multi-tile "5 tiny boxes per row" pattern so long numbers
 * (e.g. 1 160 000) stay on a single line.
 */
const GroupedPanel = ({
  title,
  rows,
  total,
}: {
  title: string;
  rows: Array<{ label: string; value: number; signed?: boolean }>;
  total?: { label: string; value: number; signed?: boolean };
}) => (
  <section className="rounded-md border border-border bg-card">
    <header className="px-4 pt-3 pb-2 border-b border-border/60">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-bold">{title}</p>
    </header>
    <div className="divide-y divide-border/40">
      {rows.map(r => {
        const colorCls = r.signed
          ? r.value < 0 ? "cms-amount-negative" : r.value > 0 ? "cms-amount-positive" : ""
          : "";
        return (
          <div key={r.label} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{r.label}</span>
            <span className={`font-mono font-bold tabular-nums whitespace-nowrap text-xl ${colorCls}`}>
              {r.signed && r.value > 0 ? "+" : ""}{formatNumberSpaces(r.value)}
            </span>
          </div>
        );
      })}
      {total && (() => {
        const colorCls = total.signed
          ? total.value < 0 ? "cms-amount-negative" : total.value > 0 ? "cms-amount-positive" : ""
          : "";
        return (
          <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-t-2 border-primary/40">
            <span className="text-sm uppercase tracking-[0.14em] text-foreground font-bold">{total.label}</span>
            <span className={`font-mono font-extrabold tabular-nums whitespace-nowrap text-2xl ${colorCls || "text-foreground"}`}>
              {total.signed && total.value > 0 ? "+" : ""}{formatNumberSpaces(total.value)}
            </span>
          </div>
        );
      })()}
    </div>
  </section>
);

const CashlessProvidersBlock = ({
  title, values, onChange, disabled, onBlur, tone = "default", suggestions,
}: {
  title: string;
  values: MobileProviders;
  onChange: (v: MobileProviders) => void;
  disabled?: boolean;
  onBlur?: () => void;
  tone?: "default" | "in" | "out" | "final";
  /** Gray placeholder per provider (e.g. /cashless sum for this business day). */
  suggestions?: Partial<Record<string, number>>;
}) => {
  const total = mobileTotal(values);
  const toneCls =
    tone === "in"    ? "border-emerald-500/40" :
    tone === "out"   ? "border-rose-500/40"    :
    tone === "final" ? "border-primary/50 bg-primary/5" :
                       "border-border";
  const row = "flex items-center gap-2";
  const chip = "cms-chip text-[10px] bg-muted text-foreground h-7 w-16 shrink-0 justify-center";
  const input = "no-spin font-mono text-sm h-8 w-24 flex-1 min-w-0 rounded border border-border bg-background px-2 text-right text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

  const hintTotal = suggestions
    ? Object.values(suggestions).reduce((s, v) => s + (Number(v) || 0), 0)
    : 0;
  const hasHints = !!suggestions && hintTotal !== 0;

  const applyHints = () => {
    if (!suggestions) return;
    const next: MobileProviders = { ...values };
    MOBILE_PROVIDERS.forEach(p => {
      if (!values[p]) {
        const s = Number(suggestions[p]) || 0;
        if (s) next[p] = s;
      }
    });
    onChange(next);
    onBlur?.();
  };

  return (
    <section className={`rounded-xl border ${toneCls} bg-background/40 p-3 flex flex-col`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-foreground uppercase tracking-[0.22em]">{title}</p>
        {hasHints && !disabled && (
          <button
            type="button"
            onClick={applyHints}
            className="text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            title="Fill empty rows from /cashless transactions"
          >
            Apply hint
          </button>
        )}
      </div>
      <div className="space-y-1">
        {MOBILE_PROVIDERS.map(provider => {
          const hint = Number(suggestions?.[provider]) || 0;
          const placeholder = hint ? formatNumberSpaces(hint) : "0";
          return (
            <div key={provider} className={row}>
              <span className={chip}>{provider}</span>
              <NumberInput
                value={values[provider] || ""}
                onChange={v => onChange({ ...values, [provider]: Number(v) || 0 })}
                onBlur={onBlur}
                className={input}
                placeholder={placeholder}
                disabled={disabled}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-border">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total</span>
        <span className="font-mono text-sm font-bold text-card-foreground whitespace-nowrap">TZS {formatNumberSpaces(total)}</span>
      </div>
      {hasHints && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Hint · Cashless</span>
          <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">TZS {formatNumberSpaces(hintTotal)}</span>
        </div>
      )}
    </section>
  );
};

export default ActiveSlotsShiftView;
