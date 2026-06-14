import { useState, useMemo, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useTransactions, useExpenses, useCreateTransaction } from "@/hooks/use-casino-data";
import { useCashlessSuggestions } from "@/hooks/use-cashless";
import { useCreateCashCount, useCashCounts } from "@/hooks/use-shift";
import { useChipBaseline, useCloseAllTables, baselineToMap } from "@/hooks/use-table-lifecycle";
import { getBusinessDate } from "@/lib/business-day";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { Button } from "@/components/ui/button";
import { DateNavigator } from "@/components/ui/date-navigator";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowDownToLine, ArrowUpFromLine, Calculator, Square, CheckCircle2, Package, ArrowLeftRight, Landmark, Ban, Gift, Coins, UserCheck, Sparkles, Ticket } from "lucide-react";
import TipsDialog, { type TipsKind } from "@/components/cage/TipsDialog";
import CancelTransactionDialog from "@/components/cage/CancelTransactionDialog";
import PromoInDialog from "@/components/cage/PromoInDialog";
import IssueTicketDialog from "@/components/cage/IssueTicketDialog";
import { useNavigate } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { CloseBusinessDayButton } from "@/components/pit/CloseBusinessDayButton";
import TransfersForm from "@/components/cage/TransfersForm";
import CanceledTxPanel from "@/components/cage/CanceledTxPanel";
import { useCageTransfers } from "@/hooks/use-cage-transfers";
import {
  CURRENCIES, FOREIGN_CURRENCIES, formatCurrency, formatNumberSpaces, CASH_DENOMS,
} from "@/lib/currency";
import { greedyChipBreakdown, sumChips } from "@/hooks/use-chip-colors";
import PlayerSearch from "@/components/cage/PlayerSearch";
import PlayerInfoCard from "@/components/cage/PlayerInfoCard";
import ActivePlayersList from "@/components/cage/ActivePlayersList";
import { useVisitsToday } from "@/hooks/use-casino-data";
import ChipDenomInput from "@/components/ChipDenomInput";
import CashDenomInput, { cashSum } from "@/components/cage/CashDenomInput";
import CashCountGrid from "@/components/cage/CashCountGrid";
import CashCheckViewerDialog from "@/components/cage/CashCheckViewerDialog";
import { useCashChecksByBusinessDate } from "@/hooks/use-cash-checks-by-date";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";

import {
  MOBILE_PROVIDERS, emptyMobile, emptyBanks, mobileTotal, bankTotalTzs,
  chipSum, emptyCash, calcCashTotalTzs,
  type MobileProviders, type Banks,
} from "@/components/cage/CageHelpers";
import type { Tables } from "@/integrations/supabase/types";

const TransactionsTable = ({ transactions, tableMap, isInTx, canCancel, onCancel }: {
  transactions: Tables<"transactions">[];
  tableMap: Map<string, Tables<"gaming_tables">>;
  isInTx: (t: string) => boolean;
  canCancel: boolean;
  onCancel: (tx: Tables<"transactions">) => void;
}) => (
  <div className="cms-panel">
    <div className="cms-header">Transactions ({transactions.length})</div>
    <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
      <table className="w-full">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border">
            {["Type", "Player", "Table", "Amount", "Time", ""].map((h, i) => (
              <th key={i} className={`text-xs font-medium text-muted-foreground uppercase px-3 py-1.5 ${h === "Amount" || h === "Time" ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {transactions.length === 0 ? (
            <tr><td colSpan={6} className="text-center text-muted-foreground text-sm py-6">No transactions yet</td></tr>
          ) : transactions.map(tx => {
            const txWithPlayer = tx as typeof tx & { players?: { first_name: string; last_name: string }, cancelled_at?: string | null, cancel_reason?: string | null };
            const isIn = isInTx(tx.type);
            const cancelled = !!txWithPlayer.cancelled_at;
            return (
              <tr
                key={tx.id}
                className={`border-b border-border last:border-0 ${cancelled ? "line-through opacity-50" : ""}`}
                title={cancelled ? `CANCELLED — ${txWithPlayer.cancel_reason || ""}` : undefined}
              >
                <td className="px-3 py-1.5">
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isIn ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"}`}>
                    {isIn ? "IN" : "OUT"}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-xs text-card-foreground">{txWithPlayer.players?.first_name} {txWithPlayer.players?.last_name}</td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono">
                  {tx.table_id ? tableMap.get(tx.table_id)?.name || "—" : "—"}
                </td>
                <td className={`px-3 py-1.5 text-right font-mono text-xs font-medium ${isIn ? "cms-amount-positive" : "cms-amount-negative"}`}>
                  {isIn ? "+" : "−"}{formatCurrency(Number(tx.amount))}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[10px] text-muted-foreground">
                  {new Date(tx.created_at).toLocaleTimeString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-2 py-1 text-right no-underline">
                  {canCancel && !cancelled && !String(tx.id).startsWith("optimistic-") && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10 no-underline"
                      onClick={(e) => { e.stopPropagation(); onCancel(tx); }}
                      title="Cancel transaction"
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

const ActiveShiftView = ({ shift, players, tables }: {
  shift: Tables<"shifts">;
  players: Tables<"players">[];
  tables: Tables<"gaming_tables">[];
}) => {
  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const businessDate = serverBusinessDate || getBusinessDate();
  const { data: transactions = [] } = useTransactions(businessDate);
  const { data: expenses = [] } = useExpenses(businessDate);
  const { data: cashChecks = [] } = useCashCounts(shift.id);
  const { data: cageTransfers = [] } = useCageTransfers(shift.id);
  const createTx = useCreateTransaction();
  const navigate = useNavigate();
  const [showCloseTables, setShowCloseTables] = useState(false);
  const [tipsKind, setTipsKind] = useState<TipsKind | null>(null);
  const [showPromoIn, setShowPromoIn] = useState(false);
  const [showIssueTicket, setShowIssueTicket] = useState(false);
  
  

  // Cashier may only transact with players currently checked in (open visit today).
  // Players not checked in via Reception are invisible in cage search.
  const { data: todayVisits = [] } = useVisitsToday("player_id, checked_out_at") as { data: { player_id: string; checked_out_at: string | null }[] };
  const checkedInIds = useMemo(
    () => new Set(todayVisits.filter(v => !v.checked_out_at).map(v => v.player_id)),
    [todayVisits]
  );
  const activePlayers = useMemo(
    () => players.filter(p => p.status === "active" && checkedInIds.has(p.id)),
    [players, checkedInIds]
  );
  const openTables = useMemo(() => tables.filter(t => t.status === "open"), [tables]);
  const exchangeRates = (shift.exchange_rates || {}) as Record<string, number>;

  const shiftTransactions = useMemo(() => transactions.filter(t => t.shift_id === shift.id), [transactions, shift.id]);
  const shiftExpenses = useMemo(() => expenses.filter(e => e.shift_id === shift.id), [expenses, shift.id]);

  // Treat both "buy" (legacy) and "in" (new) the same
  const isInTx = (t: string) => t === "buy" || t === "in";
  const isOutTx = (t: string) => t === "cashout" || t === "out";

  // Cancelled transactions are visible but excluded from all totals
  const activeShiftTransactions = useMemo(() => shiftTransactions.filter(t => !(t as any).cancelled_at), [shiftTransactions]);

  const totalIns = useMemo(() => activeShiftTransactions.filter(t => isInTx(t.type)).reduce((s, t) => s + Number(t.amount), 0), [activeShiftTransactions]);
  const totalOuts = useMemo(() => activeShiftTransactions.filter(t => isOutTx(t.type)).reduce((s, t) => s + Number(t.amount), 0), [activeShiftTransactions]);
  const totalExpenses = useMemo(() => shiftExpenses.reduce((s, e) => s + Number(e.amount), 0), [shiftExpenses]);

  // Cage transfer totals
  const totalAddFloat = useMemo(() => cageTransfers.filter(t => t.transfer_type === "add_float").reduce((s, t) => s + Number(t.amount), 0), [cageTransfers]);
  const totalCollection = useMemo(() => cageTransfers.filter(t => t.transfer_type === "collection").reduce((s, t) => s + Number(t.amount), 0), [cageTransfers]);
  const totalSlotsOut = useMemo(() => cageTransfers.filter(t => t.transfer_type === "slots_out").reduce((s, t) => s + Number(t.amount), 0), [cageTransfers]);
  const totalSlotsIn = useMemo(() => cageTransfers.filter(t => t.transfer_type === "slots_in").reduce((s, t) => s + Number(t.amount), 0), [cageTransfers]);
  // Chip-only transfers to/from tables — affect total cage VALUE (chips leave/enter cage)
  // but NOT cash. Used by Check (chips + cash) so physical count matches.
  // Fill: chips OUT of cage → expected total decreases.
  // Credit: chips INTO cage → expected total increases.
  const totalFill = useMemo(() => cageTransfers.filter(t => t.transfer_type === "fill").reduce((s, t) => s + Number(t.amount), 0), [cageTransfers]);
  const totalCredit = useMemo(() => cageTransfers.filter(t => t.transfer_type === "credit").reduce((s, t) => s + Number(t.amount), 0), [cageTransfers]);
  // When cashier closes a table, only the table's raw chip delta is physically
  // settled back into Cage. Fill/Credit are already tracked as separate cage moves.
  const totalClosedTableDelta = useMemo(
    () => tables
      .filter(t => t.status === "closed" && !t.is_archived && t.closing_result !== null)
      .reduce((s, t) => s + Number(t.closing_result || 0), 0),
    [tables],
  );

  // Cancel dialog state
  const [cancelTarget, setCancelTarget] = useState<Tables<"transactions"> | null>(null);
  const { roles, managerOverride, user } = useAuth();
  // Cancel TX is restricted to Cashier, Manager and Surveillance (CCTV).
  // Super Admin and Manager Override also retain access.
  const canCancelTx =
    roles.includes("cashier") ||
    roles.includes("manager") ||
    roles.includes("surveillance") ||
    roles.includes("super_admin") ||
    managerOverride.active;

  const openingFloat = useMemo(() => {
    const of = shift.opening_float as Record<string, unknown> | null;
    const totals = of?.totals as Record<string, number> | undefined;
    return totals?.total_tzs || 0;
  }, [shift]);

  // Cage running cash position (cash-only, used for Cash Result/Close Shift):
  // IN adds cash to cage, OUT removes cash. Add-Float adds, Collection/Expenses/Slots-Out remove.
  const expectedCash = openingFloat + totalIns + totalAddFloat + totalSlotsIn - totalOuts - totalCollection - totalSlotsOut - totalExpenses;
  const cashResult = totalIns - totalOuts;
  // Total cage VALUE (chips + cash). IN/OUT are pure swaps (cash↔chips) — they
  // do NOT change the total. Only money entering/leaving the cage matters.
  // This is what the physical Check (chips + cash + bank + mobile) must equal.
  const expectedTotal = openingFloat + totalAddFloat + totalSlotsIn + totalCredit + totalClosedTableDelta - totalCollection - totalSlotsOut - totalExpenses - totalFill;

  const shiftDuration = useMemo(() => {
    const start = new Date(shift.opened_at);
    const diff = Math.floor((Date.now() - start.getTime()) / 60000);
    return `${Math.floor(diff / 60)}h ${diff % 60}m`;
  }, [shift.opened_at]);

  const tableMap = useMemo(() => new Map(tables.map(t => [t.id, t])), [tables]);

  return (
    <PageShell>
      <PageHeader
        icon={Landmark}
        title="Cage"
        context={
          <span className="flex items-center gap-1.5 text-base font-semibold">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="font-mono tabular-nums text-foreground">{shiftDuration}</span>
          </span>
        }
        belowHeader={
          <div className="flex items-center gap-4 flex-wrap">
            {FOREIGN_CURRENCIES.map(c => (
              <span key={c} className="text-sm font-semibold font-mono tabular-nums text-foreground whitespace-nowrap">
                <span className="text-muted-foreground text-xs font-medium uppercase mr-1">{c}</span>
                {formatNumberSpaces(exchangeRates[c] || 0).replace(/ /g, "\u00a0")}
              </span>
            ))}
          </div>
        }
        date
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTipsKind("tips_live")}
          className="gap-1.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25"
        >
          <Gift className="w-3.5 h-3.5" /> Tips Live
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTipsKind("tips_poker")}
          className="gap-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 hover:bg-amber-500/25"
        >
          <Coins className="w-3.5 h-3.5" /> Tips Poker
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTipsKind("tips_floor")}
          className="gap-1.5 bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40 hover:bg-sky-500/25"
        >
          <UserCheck className="w-3.5 h-3.5" /> Tips Floor
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowPromoIn(true)} className="gap-1.5 bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/40 hover:bg-violet-500/25">
          <Sparkles className="w-3.5 h-3.5" /> Promo IN
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowIssueTicket(true)} className="gap-1.5 bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/40 hover:bg-pink-500/25">
          <Ticket className="w-3.5 h-3.5" /> Issue Ticket
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowCloseTables(true)} className="gap-1.5">
          <Package className="w-3.5 h-3.5" /> Close Tables
        </Button>
        <CloseBusinessDayButton />
        <Button variant="destructive" size="sm" onClick={() => navigate("/cage/close-shift")} className="gap-1.5">
          <Square className="w-3.5 h-3.5" /> Close Shift
        </Button>
      </PageHeader>

      <div className="cms-panel p-2 mb-4">
        <div className="grid grid-cols-3 md:grid-cols-8 gap-2">
          <div>
            <p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">Opening</p>
            <p className="font-mono text-base font-bold text-card-foreground tabular-nums">{formatCurrency(openingFloat)}</p>
          </div>
          <div><p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">+ IN</p><p className="font-mono text-base font-bold text-success tabular-nums">+{formatCurrency(totalIns)}</p></div>
          <div><p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">− OUT</p><p className="font-mono text-base font-bold text-destructive tabular-nums">−{formatCurrency(totalOuts)}</p></div>
          <div><p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">+ Add Float</p><p className="font-mono text-base font-bold text-success tabular-nums">+{formatCurrency(totalAddFloat)}</p></div>
          <div><p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">− Collection</p><p className="font-mono text-base font-bold text-destructive tabular-nums">−{formatCurrency(totalCollection)}</p></div>
          <div><p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">− Expenses</p><p className="font-mono text-base font-bold text-warning tabular-nums">−{formatCurrency(totalExpenses)}</p></div>
          <div><p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">= Expected</p><p className="font-mono text-base font-bold text-card-foreground tabular-nums">{formatCurrency(expectedCash)}</p></div>
          <div><p className="uppercase text-muted-foreground tracking-wider text-[10px] font-medium">Cash Result</p><p className={`font-mono text-base font-bold tabular-nums ${cashResult >= 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>{cashResult >= 0 ? "+" : ""}{formatCurrency(cashResult)}</p></div>
        </div>
      </div>

      <Tabs defaultValue="in" className="space-y-3">
        <TabsList className="w-full grid grid-cols-5 h-11">
          <TabsTrigger
            value="in"
            className="gap-1.5 text-sm font-semibold data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-400 data-[state=active]:border data-[state=active]:border-emerald-500/40"
          >
            <ArrowDownToLine className="w-4 h-4" /> IN
          </TabsTrigger>
          <TabsTrigger
            value="out"
            className="gap-1.5 text-sm font-semibold data-[state=active]:bg-red-500/15 data-[state=active]:text-red-400 data-[state=active]:border data-[state=active]:border-red-500/40"
          >
            <ArrowUpFromLine className="w-4 h-4" /> OUT
          </TabsTrigger>
          <TabsTrigger
            value="check"
            className="gap-1.5 text-sm font-semibold data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-400 data-[state=active]:border data-[state=active]:border-amber-500/40"
          >
            <Calculator className="w-4 h-4" /> Check
          </TabsTrigger>
          <TabsTrigger
            value="transfers"
            className="gap-1.5 text-sm font-semibold data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:border data-[state=active]:border-primary/40"
          >
            <ArrowLeftRight className="w-4 h-4" /> Transfers
          </TabsTrigger>
          <TabsTrigger
            value="canceled"
            className="gap-1.5 text-sm font-semibold data-[state=active]:bg-destructive/15 data-[state=active]:text-destructive data-[state=active]:border data-[state=active]:border-destructive/40"
          >
            <Ban className="w-4 h-4" /> Canceled TX
          </TabsTrigger>
        </TabsList>

        <TabsContent value="in" className="space-y-3">
          <InForm players={activePlayers} tables={openTables} exchangeRates={exchangeRates} shiftId={shift.id} onSubmit={createTx.mutate} loading={createTx.isPending} shiftTransactions={shiftTransactions} />
          <TransactionsTable
            transactions={shiftTransactions.filter(t => isInTx(t.type))}
            tableMap={tableMap}
            isInTx={isInTx}
            canCancel={canCancelTx}
            onCancel={setCancelTarget}
          />
        </TabsContent>
        <TabsContent value="out" className="space-y-3">
          <OutForm players={activePlayers} tables={openTables} shiftId={shift.id} onSubmit={createTx.mutate} loading={createTx.isPending} shiftTransactions={shiftTransactions} />
          <TransactionsTable
            transactions={shiftTransactions.filter(t => isOutTx(t.type))}
            tableMap={tableMap}
            isInTx={isInTx}
            canCancel={canCancelTx}
            onCancel={setCancelTarget}
          />
        </TabsContent>
        <TabsContent value="check" className="space-y-3">
          <CashCheckForm expectedBalance={expectedTotal} shiftId={shift.id} exchangeRates={exchangeRates} cashChecks={cashChecks} businessDate={businessDate} />
          <TransactionsTable
            transactions={shiftTransactions}
            tableMap={tableMap}
            isInTx={isInTx}
            canCancel={canCancelTx}
            onCancel={setCancelTarget}
          />
        </TabsContent>
        <TabsContent value="transfers" className="space-y-3">
          <TransfersForm shiftId={shift.id} tables={openTables} />
        </TabsContent>
        <TabsContent value="canceled" className="space-y-3">
          <CanceledTxPanel shiftId={shift.id} />
        </TabsContent>
      </Tabs>

      <Dialog open={showCloseTables} onOpenChange={setShowCloseTables}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Close Tables</DialogTitle>
          </DialogHeader>
          <CloseTablesForm tables={tables} />
        </DialogContent>
      </Dialog>

      <CancelTransactionDialog
        tx={cancelTarget}
        open={!!cancelTarget}
        onOpenChange={(v) => { if (!v) setCancelTarget(null); }}
      />

      {tipsKind && (
        <TipsDialog
          kind={tipsKind}
          open={!!tipsKind}
          onClose={() => setTipsKind(null)}
          shiftId={shift.id}
          tables={tables}
        />
      )}

      <PromoInDialog
        open={showPromoIn}
        onOpenChange={setShowPromoIn}
        players={players}
        tables={tables}
        shiftId={shift.id}
        casinoId={shift.casino_id}
        cashierId={user?.id ?? ""}
      />

      <IssueTicketDialog
        open={showIssueTicket}
        onOpenChange={setShowIssueTicket}
        players={players}
        tables={tables}
        casinoId={shift.casino_id}
      />


    </PageShell>
  );
};

// =================== SHARED LAYOUT WRAPPER ===================
const TwoColumnLayout = ({
  form,
  rightPanel,
}: {
  form: React.ReactNode;
  rightPanel: React.ReactNode;
}) => (
  <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-3 items-stretch">
    <div className="cms-panel p-4">{form}</div>
    {/* Right column must not push the row taller than the form. On lg+ we
        zero out the column's intrinsic height and let an absolutely-positioned
        child fill the stretched row — list scrolls internally instead. */}
    <div className="min-h-[400px] lg:min-h-0 lg:relative">
      <div className="lg:absolute lg:inset-0">{rightPanel}</div>
    </div>
  </div>
);

// =================== IN FORM (was Buy-In) ===================
const InForm = ({ players, tables, exchangeRates, shiftId, onSubmit, loading, shiftTransactions = [] }: {
  players: Tables<"players">[];
  tables: Tables<"gaming_tables">[];
  exchangeRates: Record<string, number>;
  shiftId: string;
  onSubmit: (data: Record<string, unknown>, opts?: Record<string, unknown>) => void;
  loading: boolean;
  shiftTransactions?: Tables<"transactions">[];
}) => {
  const [playerId, setPlayerId] = useState("");
  const [tableId, setTableId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("TZS");
  const [chips, setChips] = useState<Record<number, number>>({});
  const amountRef = useRef<HTMLInputElement>(null);

  // Track edit source to avoid feedback loop between amount<->chips
  const lastEditSource = useRef<"amount" | "chips" | null>(null);

  const tzsAmount = useMemo(() => {
    const raw = Number(amount) || 0;
    if (currency === "TZS") return raw;
    return raw * (exchangeRates[currency] || 0);
  }, [amount, currency, exchangeRates]);

  // When amount/currency changes → regenerate chip breakdown from TZS-equivalent.
  // For foreign currencies chips are derived from tzsAmount; manual edits stay user-controlled.
  useEffect(() => {
    if (lastEditSource.current === "chips") {
      lastEditSource.current = null;
      return;
    }
    setChips(tzsAmount > 0 ? greedyChipBreakdown(tzsAmount) : {});
  }, [tzsAmount]);

  const handleChipsChange = (v: Record<number, number>) => {
    lastEditSource.current = "chips";
    setChips(v);
    // Only sync amount back from chips when entering in TZS — otherwise the
    // foreign amount must remain what the player actually paid.
    if (currency === "TZS") {
      const total = sumChips(v);
      lastEditSource.current = "chips";
      setAmount(total > 0 ? String(total) : "");
    }
  };

  const selectedPlayer = useMemo(() => players.find(p => p.id === playerId) || null, [players, playerId]);

  const handleSubmit = () => {
    if (!playerId || !tableId || tzsAmount <= 0) return;
    if (Number(amount) <= 0) { toast.error("Amount must be greater than zero"); return; }
    if (selectedPlayer?.status === "blacklist") { toast.error("BLOCKED — Player is blacklisted"); return; }
    const chipsPayload: Record<string, unknown> = { ...chips };
    if (currency !== "TZS") {
      chipsPayload._meta = {
        original_currency: currency,
        original_amount: Number(amount),
        rate: exchangeRates[currency],
      };
    }
    onSubmit({
      player_id: playerId, table_id: tableId, type: "in" as const, amount: tzsAmount, shift_id: shiftId,
      chips: Object.keys(chips).length > 0 ? chipsPayload : undefined,
    }, { onSuccess: () => { setAmount(""); setChips({}); amountRef.current?.focus(); } });
  };

  const form = (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">1. Player</label>
        <PlayerSearch players={players} value={playerId} onChange={setPlayerId} autoFocus />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">2. Table</label>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {tables.map(t => (
            <button key={t.id} onClick={() => setTableId(t.id)}
              className={`px-2.5 py-1 rounded text-xs font-mono shrink-0 transition-colors ${tableId === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-primary/20"}`}>
              {t.name}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">3. Amount</label>
          <NumberInput
            ref={amountRef as any}
            value={amount}
            onChange={(v) => { lastEditSource.current = "amount"; setAmount(v); }}
            className="text-lg h-11" placeholder="0"
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
          />
        </div>
        <div className="w-20">
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="font-mono h-11"><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {currency !== "TZS" && tzsAmount > 0 && (
        <p className="text-xs font-mono text-muted-foreground text-right">= {formatCurrency(tzsAmount)} (1 {currency} = {formatNumberSpaces(exchangeRates[currency] || 0)} TZS)</p>
      )}

      {/* Chip breakdown — shown for all currencies; for foreign, derived from TZS-equivalent */}
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
          4. Chips to Hand Out
        </label>
        <ChipDenomInput
          values={chips}
          onChange={handleChipsChange}
          columns={2}
          size="lg"
          onSubmit={handleSubmit}
        />
      </div>

      <Button onClick={handleSubmit} disabled={!playerId || !tableId || tzsAmount <= 0 || loading} className="w-full mt-2 gap-1.5 h-11">
        <ArrowDownToLine className="w-4 h-4" /> {loading ? "Recording…" : "IN"} {tzsAmount > 0 && `· ${formatCurrency(tzsAmount)}`}
      </Button>
    </div>
  );

  return (
    <TwoColumnLayout
      form={form}
      rightPanel={
        selectedPlayer
          ? <PlayerInfoCard player={selectedPlayer} tables={tables} shiftTransactions={shiftTransactions} />
          : <ActivePlayersList players={players} tables={tables} onSelect={(pid, tid) => { setPlayerId(pid); if (tid) setTableId(tid); }} />
      }
    />
  );
};

// =================== OUT FORM (was Cashout) ===================
const OutForm = ({ players, tables, shiftId, onSubmit, loading, shiftTransactions = [] }: {
  players: Tables<"players">[];
  tables: Tables<"gaming_tables">[];
  shiftId: string;
  onSubmit: (data: Record<string, unknown>, opts?: Record<string, unknown>) => void;
  loading: boolean;
  shiftTransactions?: Tables<"transactions">[];
}) => {
  const [playerId, setPlayerId] = useState("");
  const [chips, setChips] = useState<Record<number, number>>({});
  const total = useMemo(() => sumChips(chips), [chips]);
  const selectedPlayer = useMemo(() => players.find(p => p.id === playerId) || null, [players, playerId]);

  const handleSubmit = () => {
    if (!playerId || total <= 0) return;
    if (selectedPlayer?.status === "blacklist") { toast.error("BLOCKED — Player is blacklisted"); return; }
    onSubmit({ player_id: playerId, table_id: null, type: "out" as const, amount: total, chips, shift_id: shiftId },
      { onSuccess: () => setChips({}) });
  };

  const form = (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">1. Player</label>
        <PlayerSearch players={players} value={playerId} onChange={setPlayerId} autoFocus />
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">2. Chips to Receive</label>
        <ChipDenomInput
          values={chips}
          onChange={setChips}
          columns={2}
          size="lg"
          onSubmit={handleSubmit}
        />
      </div>
      <Button onClick={handleSubmit} disabled={!playerId || total <= 0 || loading} className="w-full mt-2 gap-1.5 h-11">
        <ArrowUpFromLine className="w-4 h-4" /> {loading ? "Recording…" : "OUT"} {total > 0 && `· ${formatCurrency(total)}`}
      </Button>
    </div>
  );

  return (
    <TwoColumnLayout
      form={form}
      rightPanel={
        selectedPlayer
          ? <PlayerInfoCard player={selectedPlayer} tables={tables} shiftTransactions={shiftTransactions} />
          : <ActivePlayersList players={players} tables={tables} onSelect={setPlayerId} />
      }
    />
  );
};

// =================== CASH CHECK ===================
const CashCheckForm = ({ expectedBalance, shiftId, exchangeRates, cashChecks, businessDate }: {
  expectedBalance: number;
  shiftId: string;
  exchangeRates: Record<string, number>;
  cashChecks: Tables<"cash_counts">[];
  businessDate: string;
}) => {
  const { hasRole } = useAuth();
  const { data: cashlessSug } = useCashlessSuggestions(businessDate, "live_game");
  const canBrowseHistory = hasRole("manager") || hasRole("pit") || hasRole("surveillance") || hasRole("finance_manager") || hasRole("super_admin");

  const createCount = useCreateCashCount();
  const lastCheck = cashChecks[0];
  const lastDenoms = (lastCheck?.denominations || {}) as Record<string, unknown>;
  const [chipCounts, setChipCounts] = useState<Record<number, number>>(() => (lastDenoms.chips as Record<number, number>) || {});
  const [cash, setCash] = useState<Record<string, Record<number, number>>>(() => (lastDenoms.cash as Record<string, Record<number, number>>) || emptyCash());
  const [bankBal, setBankBal] = useState<Banks>(() => (lastDenoms.bank as Banks) || emptyBanks());
  // Mobile Balance is MANUAL-ONLY — never carry forward from previous shift/day.
  const [mobileBal, setMobileBal] = useState<MobileProviders>(() => emptyMobile());

  const [cashlessIn, setCashlessIn] = useState<MobileProviders>(() => ({ ...emptyMobile(), ...((lastDenoms.cashless_in_providers as MobileProviders) || {}) }));
  const [cashlessOut, setCashlessOut] = useState<MobileProviders>(() => ({ ...emptyMobile(), ...((lastDenoms.cashless_out_providers as MobileProviders) || {}) }));
  const seededId = useRef<string | null>(lastCheck?.id || null);
  useEffect(() => {
    if (lastCheck && lastCheck.id !== seededId.current) {
      seededId.current = lastCheck.id;
    }
  }, [lastCheck]);

  // Pre-fill Cashless IN/OUT/Balance from /cashless transactions when cashier
  // hasn't entered anything yet. They can still override any provider value.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current || !cashlessSug) return;
    const merge = (cur: MobileProviders, sug?: Partial<Record<string, number>>): MobileProviders => {
      if (!sug) return cur;
      const next = { ...cur };
      let touched = false;
      for (const p of Object.keys(sug)) {
        const s = Number(sug[p]) || 0;
        if (s && !Number(cur[p as keyof MobileProviders])) { (next as any)[p] = s; touched = true; }
      }
      return touched ? next : cur;
    };
    setCashlessIn(prev => merge(prev, cashlessSug.in));
    setCashlessOut(prev => merge(prev, cashlessSug.out));
    // Mobile Balance is MANUAL-ONLY — never auto-fill from NET (IN-OUT).
    prefilledRef.current = true;
  }, [cashlessSug]);

  const cashlessInTzs = useMemo(() => mobileTotal(cashlessIn), [cashlessIn]);
  const cashlessOutTzs = useMemo(() => mobileTotal(cashlessOut), [cashlessOut]);
  const totalTzs = useMemo(
    () => chipSum(chipCounts) + calcCashTotalTzs(cash, exchangeRates) + bankTotalTzs(bankBal, exchangeRates) + cashlessInTzs - cashlessOutTzs,
    [chipCounts, cash, bankBal, exchangeRates, cashlessInTzs, cashlessOutTzs],
  );
  const difference = totalTzs - expectedBalance;
  const [showDiff, setShowDiff] = useState(false);
  useEffect(() => { setShowDiff(false); }, [chipCounts, cash, bankBal, mobileBal, cashlessIn, cashlessOut]);

  // History viewer
  const [viewerCheck, setViewerCheck] = useState<Tables<"cash_counts"> | null>(null);
  const [historyDate, setHistoryDate] = useState<string>(businessDate);
  const browsingPast = canBrowseHistory && historyDate !== businessDate;
  const { data: historicalChecks = [] } = useCashChecksByBusinessDate(
    historyDate,
    canBrowseHistory && browsingPast,
  );
  const displayedChecks = browsingPast ? historicalChecks : cashChecks;

  const handleRecord = () => {
    createCount.mutate({
      shift_id: shiftId, count_type: "check", currency: "ALL",
      denominations: {
        chips: chipCounts, cash,
        bank: bankBal, mobile: mobileBal,
        cashless_in_providers: cashlessIn,
        cashless_out_providers: cashlessOut,
        totals: {
          chips_tzs: chipSum(chipCounts),
          ...Object.fromEntries(CURRENCIES.map(c => [c, cashSum(cash[c] || {})])),
          bank: bankBal, mobile: mobileBal,
          cashless_in: cashlessInTzs,
          cashless_out: cashlessOutTzs,
          expected: expectedBalance,
          counted: totalTzs,
          difference,
          balanced: difference === 0,
        },
      },
      total: totalTzs,
    }, { onSuccess: () => setShowDiff(true) });
  };

  return (
    <div className="space-y-3">
      <div className="cms-panel p-4">
        <CashCountGrid chips={chipCounts} onChipsChange={setChipCounts} cash={cash}
          onCashChange={(cur, v) => setCash(c => ({ ...c, [cur]: v }))} banks={bankBal} onBanksChange={setBankBal}
          mobile={mobileBal} onMobileChange={setMobileBal} rates={exchangeRates}
          mobileSuggestion={cashlessSug?.net}
          cashlessIn={cashlessIn} onCashlessInChange={setCashlessIn} cashlessInSuggestion={cashlessSug?.in}
          cashlessOut={cashlessOut} onCashlessOutChange={setCashlessOut} cashlessOutSuggestion={cashlessSug?.out} />

        <div className="grid grid-cols-3 gap-2 pt-3 mt-3 border-t border-border">
          <div className="text-center"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Expected</p><p className="font-mono text-xl font-bold text-card-foreground">{formatCurrency(expectedBalance)}</p></div>
          <div className="text-center"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Counted</p><p className="font-mono text-xl font-bold text-card-foreground">{formatCurrency(totalTzs)}</p></div>
          <div className="text-center"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Diff</p><p className={`font-mono text-xl font-bold ${!showDiff ? "text-muted-foreground" : difference === 0 ? "text-success" : "text-destructive"}`}>{showDiff ? `${difference >= 0 ? "+" : ""}${formatCurrency(difference)}` : "·"}</p></div>
        </div>

        <Button variant="outline" onClick={handleRecord} disabled={createCount.isPending} className="w-full mt-3">
          <Calculator className="w-4 h-4 mr-1.5" /> Record Check
        </Button>
      </div>

      <div className="cms-panel">
        <div className="cms-header text-xs flex items-center justify-between gap-2">
          <span>Previous ({displayedChecks.length}){browsingPast ? " · history" : ""}</span>
          {canBrowseHistory && (
            <div className="flex items-center gap-1.5">
              <DateNavigator
                value={historyDate}
                onChange={(iso) => setHistoryDate(iso || businessDate)}
                maxDate={new Date(businessDate + "T00:00:00")}
                size="sm"
              />
              {browsingPast && (
                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setHistoryDate(businessDate)}>
                  Today
                </Button>
              )}
            </div>
          )}
        </div>
        {displayedChecks.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">No checks for this day</div>
        ) : (
          <div className="divide-y divide-border max-h-[320px] overflow-y-auto">
            {displayedChecks.slice(0, browsingPast ? 50 : 50).map(cc => {
              const t = ((cc.denominations || {}) as Record<string, any>).totals || {};
              const diff = Number(t.difference ?? 0);
              const balanced = !!t.balanced || diff === 0;
              return (
                <button
                  type="button"
                  key={cc.id}
                  onClick={() => setViewerCheck(cc)}
                  className="w-full px-3 py-1.5 flex items-center justify-between gap-3 hover:bg-accent/30 transition-colors text-left"
                >
                  <span className="text-[10px] text-muted-foreground font-mono">{new Date(cc.created_at).toLocaleTimeString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="font-mono text-xs font-medium text-card-foreground flex-1 text-right">{formatCurrency(Number(cc.total))}</span>
                  <span className={`font-mono text-[10px] font-bold w-24 text-right ${balanced ? "text-success" : "text-destructive"}`}>
                    {balanced ? "Balanced" : `${diff >= 0 ? "+" : ""}${formatCurrency(diff)}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <CashCheckViewerDialog
        open={!!viewerCheck}
        onOpenChange={(o) => { if (!o) setViewerCheck(null); }}
        check={viewerCheck}
      />
    </div>
  );
};

// =================== CLOSE TABLES FORM ===================
const CloseTablesForm = ({ tables }: { tables: Tables<"gaming_tables">[] }) => {
  const { data: baseline = [] } = useChipBaseline();
  const closeAllTables = useCloseAllTables();
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const baselineMap = useMemo(() => baselineToMap(baseline), [baseline]);
  const tablesWithResults = useMemo(() => tables.filter(t => t.closing_result !== null && t.status === "open"), [tables]);
  const confirmedIds = useMemo(() => tablesWithResults.filter(t => confirmed[t.id]).map(t => t.id), [tablesWithResults, confirmed]);
  const anyConfirmed = confirmedIds.length > 0;
  const allConfirmed = tablesWithResults.length > 0 && tablesWithResults.every(t => confirmed[t.id]);

  const handleClose = () => {
    if (confirmedIds.length === 0) return;
    closeAllTables.mutate(confirmedIds, { onSuccess: () => setConfirmed({}) });
  };

  if (tablesWithResults.length === 0) {
    return (
      <div className="cms-panel p-6 text-center">
        <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium text-card-foreground">No tables ready to close</p>
        <p className="text-xs text-muted-foreground mt-1">Pit Boss must record Result before tables can be closed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Tick the tables you've physically paid out, then close them. Untouched tables stay open until later.</p>
      {tablesWithResults.map(table => {
        const closingChips = (table.closing_chips || {}) as Record<string, number>;
        const tableBaseline = baselineMap[table.id] || {};
        const result = Number(table.closing_result) || 0;
        const distribution = (table.denominations || []).map((d: number) => {
          const actual = Number(closingChips[String(d)]) || 0;
          const expected = tableBaseline[d] || 0;
          return { denom: d, diff: actual - expected };
        }).filter(r => r.diff !== 0).sort((a, b) => b.denom - a.denom);

        return (
          <div key={table.id} className="cms-panel p-3">
            <div className="flex items-center gap-3 mb-2">
              <Checkbox checked={!!confirmed[table.id]} onCheckedChange={c => setConfirmed(r => ({ ...r, [table.id]: !!c }))} id={`close-${table.id}`} />
              <label htmlFor={`close-${table.id}`} className="flex-1 cursor-pointer">
                <span className="text-sm font-semibold text-card-foreground">{table.name}</span>
                <span className="text-xs text-muted-foreground ml-2">({table.game})</span>
              </label>
              <span className={`font-mono text-lg font-bold ${result >= 0 ? "text-success" : "text-destructive"}`}>
                {result >= 0 ? "+" : ""}{formatCurrency(result)}
              </span>
            </div>
            {distribution.length > 0 && (
              <div className="flex flex-wrap gap-1.5 ml-8">
                {distribution.map(({ denom, diff }) => (
                  <span key={denom} className={`text-xs font-mono px-2 py-1 rounded-md ${diff > 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                    {formatNumberSpaces(denom)}: {diff > 0 ? `+${formatNumberSpaces(diff)}` : formatNumberSpaces(diff)}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <Button onClick={handleClose} disabled={!anyConfirmed || closeAllTables.isPending} className="w-full gap-1.5">
        <CheckCircle2 className="w-4 h-4" />
        {closeAllTables.isPending
          ? "Closing…"
          : allConfirmed
            ? `Close All Tables (${confirmedIds.length})`
            : `Close Selected Tables (${confirmedIds.length})`}
      </Button>
    </div>
  );
};

export default ActiveShiftView;
