import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Receipt, CheckCircle, Plus, X, Trash2, Filter, GlassWater, ExternalLink, Printer } from "lucide-react";
import { CardSkeleton, TableSkeleton } from "@/components/LoadingSkeletons";
import { useExpenses, useCreateExpense, useApproveExpense, useDeleteExpense } from "@/hooks/use-casino-data";
import { useCreateSlotsExpense, useUpdateExpenseFinCategory } from "@/hooks/use-expenses";
import { useCreateOfficeExpense, useExpenseCategories } from "@/hooks/use-expense-categories";
import { useFinCategories } from "@/hooks/use-fin";
import { useActiveShift } from "@/hooks/use-shift";
import { useActiveCageSlotsShift } from "@/hooks/use-cage-slots";
import { useExpenseAnalytics, type ExpenseStatus, type ExpenseTarget, type ExpenseSourceFilter } from "@/hooks/use-expenses-analytics";
import { useAuth } from "@/lib/auth-context";
import { getBusinessDate } from "@/lib/business-day";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { fmtDateOnly } from "@/lib/format-date";
import PrintPortal from "@/components/cage/PrintPortal";
import ExpensesDayReport from "@/components/closings/ExpensesDayReport";
import { useCasino } from "@/lib/casino-context";

import { PlayerNameAutocomplete } from "@/components/PlayerNameAutocomplete";
import { formatCurrency } from "@/lib/currency";

type SourceVal = "live_game" | "slots" | "office";

// Legacy hard-coded categories — used as a fallback if no per-casino
// `expense_categories` rows exist for the chosen source scope.
const FALLBACK_CATS = [
  { code: "food", label: "Food" },
  { code: "alcohol", label: "Alcohol" },
  { code: "taxi", label: "Taxi" },
  { code: "hotel", label: "Hotel" },
  { code: "flight", label: "Flight" },
  { code: "other", label: "Other" },
];

const CAT_COLORS: Record<string, string> = {
  food: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  alcohol: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",
  taxi: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400",
  hotel: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  flight: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  other: "bg-muted text-muted-foreground",
  pos_comp: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  bar_charge: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
};

const SRC_COLORS: Record<SourceVal, string> = {
  live_game: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
  slots:     "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
  office:    "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
};

const SRC_LABEL: Record<SourceVal, string> = {
  live_game: "Live",
  slots: "Slots",
  office: "Office",
};

const resolveSource = (e: any): SourceVal => {
  const s = (e.source || "").toLowerCase();
  if (s === "office" || s === "slots" || s === "live_game") return s as SourceVal;
  if (e.cage_slots_shift_id || e.cage_type === "slots") return "slots";
  return "live_game";
};

interface DraftRow {
  uid: string;
  source: SourceVal;
  target: "casino" | "player" | "";
  player_name: string;
  category: string;
  fin_category_id: string;
  amount: string;
  description: string;
}

const newDraft = (defaultSource: SourceVal): DraftRow => ({
  uid: Math.random().toString(36).slice(2),
  source: defaultSource,
  target: "",
  player_name: "",
  category: "",
  fin_category_id: "",
  amount: "",
  description: "",
});

type SortKey = "date" | "source" | "category" | "target" | "amount" | "status";
type SortDir = "asc" | "desc";

interface ExpensesProps {
  /** When true, render without page header, without "New entries" form,
   *  and hide row Approve/Cancel actions (used inside Reports tab). */
  embedded?: boolean;
}

const Expenses = ({ embedded = false }: ExpensesProps = {}) => {
  const { isManager, roles } = useAuth();
  const { activeCasino } = useCasino();
  const isCashierLive = roles.includes("cashier") && !roles.includes("cashier_slots");
  const isCashierSlots = roles.includes("cashier_slots") && !roles.includes("cashier");
  // Managers (and super_admin) see and can create everything.
  const isManagerView = isManager;

  // Default source per role (governs both the filter and new-row defaults).
  const roleDefaultSource: SourceVal = isCashierSlots ? "slots" : "live_game";
  // Cashier roles cannot pick a different source.
  const sourceLocked = isCashierLive || isCashierSlots;

  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const businessDate = serverBusinessDate || getBusinessDate();

  // ── Filters ──────────────────────────────────────────────
  const [from, setFrom] = useState<string>(businessDate);
  const [to, setTo] = useState<string>(businessDate);
  const [category, setCategory] = useState<string>("all");
  const [target, setTarget] = useState<ExpenseTarget>("all");
  const [status, setStatus] = useState<ExpenseStatus>("all");
  const [source, setSource] = useState<ExpenseSourceFilter>(
    sourceLocked ? roleDefaultSource : "all",
  );
  const [search, setSearch] = useState<string>("");
  const [showBarDetails, setShowBarDetails] = useState<boolean>(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "date", dir: "desc" });
  const toggleSort = (k: SortKey) =>
    setSort(s => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "desc" }));
  const sortArrow = (k: SortKey) => sort.key === k ? (sort.dir === "asc" ? " ↑" : " ↓") : "";

  const isSingleDay = from === to;
  const { data: liveShift } = useActiveShift();
  const { data: slotsShift } = useActiveCageSlotsShift();

  // Query: when source filter is "all" → fetch all sources (managers).
  // When locked to live/slots/office → fetch only that source via DB filter.
  const querySource: "all" | SourceVal = source;
  const { data: expenses = [], isLoading: loadingExpenses } = useExpenses(
    isSingleDay ? from : undefined,
    "live_game", // ignored when options.source is set
    isSingleDay ? undefined : { from, to },
    { source: querySource },
  );

  const create = useCreateExpense();
  const createSlots = useCreateSlotsExpense();
  const createOffice = useCreateOfficeExpense();
  const approve = useApproveExpense();
  const del = useDeleteExpense();
  const updateFinCat = useUpdateExpenseFinCategory();
  const { data: allFinCats = [] } = useFinCategories();
  const finCatById = useMemo(() => {
    const m: Record<string, any> = {};
    (allFinCats || []).forEach((c: any) => { m[c.id] = c; });
    return m;
  }, [allFinCats]);
  const [editingFinCatId, setEditingFinCatId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([newDraft(roleDefaultSource)]);

  const isLoading = loadingExpenses;

  const filters = useMemo(
    () => ({
      categories: category === "all" ? undefined : [category],
      target,
      status,
      source,
      search,
    }),
    [category, target, status, source, search],
  );
  const analytics = useExpenseAnalytics(expenses as any, filters);

  const resetFilters = () => {
    setFrom(businessDate);
    setTo(businessDate);
    setCategory("all");
    setTarget("all");
    setStatus("all");
    setSource(sourceLocked ? roleDefaultSource : "all");
    setSearch("");
  };

  const updateDraft = (uid: string, patch: Partial<DraftRow>) =>
    setDrafts((d) => d.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  const removeDraft = (uid: string) =>
    setDrafts((d) => (d.length > 1 ? d.filter((r) => r.uid !== uid) : d));

  const submitDraft = async (uid: string) => {
    const row = drafts.find((r) => r.uid === uid);
    if (!row) return;
    if (row.source !== "office" && !row.target) return toast.error("Choose target");
    if (row.source !== "office" && row.target === "player" && !row.player_name.trim())
      return toast.error("Enter player name");
    if (!row.category) return toast.error("Choose category");
    const amt = Number(row.amount);
    if (!amt || amt <= 0) return toast.error("Amount must be > 0");

    try {
      const finOverride = row.fin_category_id || undefined;
      if (row.source === "office") {
        await createOffice.mutateAsync({
          category_code: row.category,
          amount: amt,
          description: row.description,
          fin_category_id: finOverride,
        });
      } else if (row.source === "slots") {
        if (!slotsShift?.id) return toast.error("No open Slots shift");
        await createSlots.mutateAsync({
          slots_shift_id: slotsShift.id,
          category: row.category,
          amount: amt,
          description: row.description,
          player_id: null,
          player_name: row.target === "player" ? row.player_name.trim() : "",
          fin_category_id: finOverride,
        });
      } else {
        if (!liveShift?.id) return toast.error("No open Live Game shift");
        await new Promise<void>((resolve, reject) => {
          create.mutate(
            {
              category: row.category,
              amount: amt,
              description: row.description,
              player_id: null,
              player_name: row.target === "player" ? row.player_name.trim() : "",
              shift_id: liveShift.id,
              fin_category_id: finOverride,
            },
            { onSuccess: () => resolve(), onError: (e: any) => reject(e) },
          );
        });
      }
      setDrafts((d) => [...d.filter((r) => r.uid !== uid), newDraft(row.source)]);
    } catch {
      /* toast handled */
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader icon={Receipt} title="Expenses" subtitle="Loading…" />
        <CardSkeleton count={3} />
        <TableSkeleton rows={5} cols={6} />
      </div>
    );
  }

  return (
    <div>
      {!embedded && (
        <PageHeader
          icon={Receipt}
          title="Expenses"
          subtitle={`Immutable · ${analytics.filtered.length} of ${expenses.length} records · ${analytics.pendingCount} pending`}
          date
        />
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <button
          type="button"
          onClick={() => {
            // Reset to All sources + all categories/targets/statuses (keep date range).
            setSource(sourceLocked ? roleDefaultSource : "all");
            setCategory("all");
            setTarget("all");
            setStatus("all");
          }}
          className="cms-panel p-3 text-left transition hover:bg-muted/40"
          title="Show all sources"
        >
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Total</p>
          <p className="font-mono text-lg font-bold text-card-foreground">{formatCurrency(analytics.totalAmount)}</p>
        </button>
        <div className="cms-panel p-3">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Approved</p>
          <p className="font-mono text-lg font-bold cms-amount-positive">{formatCurrency(analytics.approvedAmount)}</p>
        </div>
        <div className="cms-panel p-3">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Pending</p>
          <p className="font-mono text-lg font-bold text-accent">{analytics.pendingCount}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowBarDetails((v) => !v)}
          className="cms-panel p-3 text-left transition hover:bg-muted/40"
          title="Toggle bar charge details"
        >
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider flex items-center gap-1">
            <GlassWater className="w-3 h-3" /> Bar charges
          </p>
          <p className="font-mono text-lg font-bold text-card-foreground">
            {formatCurrency(analytics.barChargeTotal)}
            <span className="ml-2 text-xs text-muted-foreground font-normal">· {analytics.barChargeCount}</span>
          </p>
        </button>
      </div>

      {/* By-source mini summary (managers only) */}
      {!sourceLocked && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {(["live_game", "slots", "office"] as SourceVal[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource((cur) => (cur === s ? "all" : s))}
              className={`cms-panel p-3 text-left transition hover:bg-muted/40 ${source === s ? "ring-1 ring-primary" : ""}`}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{SRC_LABEL[s]}</p>
              <p className="font-mono text-base font-bold text-card-foreground">
                {formatCurrency(analytics.bySource?.[s]?.total ?? 0)}
                <span className="ml-2 text-xs text-muted-foreground font-normal">· {analytics.bySource?.[s]?.count ?? 0}</span>
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="cms-panel p-3 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Filters</h3>
          <div className="ml-auto flex items-center gap-1 flex-wrap">
            {isManagerView && (() => {
              const stepDay = (delta: number) => {
                const base = isSingleDay ? from : businessDate;
                const d = new Date(base + "T00:00:00Z");
                d.setUTCDate(d.getUTCDate() + delta);
                const iso = d.toISOString().slice(0, 10);
                setFrom(iso);
                setTo(iso);
              };
              const dayValue = isSingleDay ? from : businessDate;
              return (
                <div className="flex items-center gap-1 mr-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0 text-xs"
                    onClick={() => stepDay(-1)}
                    title="Previous business day"
                  >‹</Button>
                  <Input
                    type="date"
                    value={dayValue}
                    max={businessDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      setFrom(v);
                      setTo(v);
                    }}
                    className="h-7 w-[140px] text-xs px-2"
                    title="Pick a business day"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0 text-xs"
                    onClick={() => stepDay(1)}
                    disabled={isSingleDay && from >= businessDate}
                    title="Next business day"
                  >›</Button>
                </div>
              );
            })()}
            {(() => {
              const shift = (days: number) => {
                const d = new Date(businessDate + "T00:00:00Z");
                d.setUTCDate(d.getUTCDate() - days);
                return d.toISOString().slice(0, 10);
              };
              const presets: Array<{ label: string; from: string; to: string }> = [
                { label: "Today", from: businessDate, to: businessDate },
                { label: "7d",    from: shift(6),   to: businessDate },
                { label: "30d",   from: shift(29),  to: businessDate },
                { label: "All",   from: "2020-01-01", to: businessDate },
              ];
              return presets.map(p => {
                const active = from === p.from && to === p.to;
                return (
                  <Button
                    key={p.label}
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => { setFrom(p.from); setTo(p.to); }}
                  >{p.label}</Button>
                );
              });
            })()}
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </div>
        <div className={`grid grid-cols-2 ${sourceLocked ? "md:grid-cols-6" : "md:grid-cols-7"} gap-2`}>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">From</label>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">To</label>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs" />
          </div>
          {!sourceLocked && (
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Source</label>
              <Select value={source} onValueChange={(v) => setSource(v as ExpenseSourceFilter)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="live_game">Live Game</SelectItem>
                  <SelectItem value="slots">Slots</SelectItem>
                  <SelectItem value="office">Office</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {FALLBACK_CATS.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                ))}
                <SelectItem value="pos_comp">POS Comp</SelectItem>
                <SelectItem value="bar_charge">Bar charge</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Target</label>
            <Select value={target} onValueChange={(v) => setTarget(v as ExpenseTarget)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All targets</SelectItem>
                <SelectItem value="casino">Casino</SelectItem>
                <SelectItem value="player">Player</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v as ExpenseStatus)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Search</label>
            <Input
              placeholder="Player or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Bar charges details (toggle) */}
      {showBarDetails && (
        <div className="cms-panel overflow-hidden mb-4">
          <div className="px-4 py-2 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
              <GlassWater className="w-4 h-4 text-amber-500" /> Bar charges · by player
            </h3>
            <span className="text-[10px] text-muted-foreground">
              Auto-generated from POS · linked to player tab
            </span>
          </div>
          {analytics.barChargesByPlayer.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-6">No bar charges in this period</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-3 py-2">Player</th>
                  <th className="text-center px-3 py-2">Charges</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-left px-3 py-2">Last charge</th>
                  <th className="text-center px-3 py-2 w-[80px]"></th>
                </tr>
              </thead>
              <tbody>
                {analytics.barChargesByPlayer.map((p) => (
                  <tr key={`${p.player_id}-${p.name}`} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-sm">{p.name}</td>
                    <td className="px-3 py-2 text-center font-mono text-xs">{p.count}</td>
                    <td className="px-3 py-2 text-right font-mono text-sm cms-amount-negative">
                      {formatCurrency(p.total)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground font-mono">
                      {fmtDateOnly(p.last_at)}
                      {" · "}
                      {new Date(p.last_at).toLocaleTimeString("en-GB", {
                        timeZone: "Africa/Dar_es_Salaam",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {p.player_id && (
                        <Link
                          to={`/players/${p.player_id}`}
                          className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Open player profile"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Entry table — every OK adds a fresh row (hidden in embedded/read-only mode) */}
      {!embedded && (
        <div className="cms-panel overflow-visible mb-6">
          <div className="px-4 py-2 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-card-foreground">New entries</h3>
            <Button size="sm" variant="outline" onClick={() => setDrafts((d) => [...d, newDraft(roleDefaultSource)])} className="h-8 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Row
            </Button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                {isManagerView && <th className="text-left px-3 py-2 w-[110px]">Source</th>}
                <th className="text-left px-3 py-2">Target</th>
                <th className="text-left px-3 py-2">Player</th>
                <th className="text-left px-3 py-2">Category</th>
                {isManagerView && <th className="text-left px-3 py-2 w-[200px]">Finance Plan</th>}
                <th className="text-right px-3 py-2">Amount (TZS)</th>
                <th className="text-left px-3 py-2">Description</th>
                <th className="text-center px-3 py-2 w-[140px]">Action</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => (
                <DraftRowView
                  key={d.uid}
                  draft={d}
                  isManagerView={isManagerView}
                  liveShift={liveShift}
                  slotsShift={slotsShift}
                  onChange={(patch) => updateDraft(d.uid, patch)}
                  onRemove={() => removeDraft(d.uid)}
                  onSubmit={() => submitDraft(d.uid)}
                  canRemove={drafts.length > 1}
                  isPending={create.isPending || createSlots.isPending || createOffice.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* History — sortable */}
      {(() => {
        const sortedExpenses = [...analytics.filtered].sort((a: any, b: any) => {
          const dir = sort.dir === "asc" ? 1 : -1;
          const get = (e: any): string | number => {
            switch (sort.key) {
              case "date":     return e.created_at;
              case "source":   return resolveSource(e);
              case "category": return e.category || "";
              case "target":   return e.players ? `${e.players.first_name} ${e.players.last_name}` : (e.player_name || "Casino");
              case "amount":   return Number(e.amount || 0);
              case "status":   return e.approved ? "approved" : "pending";
            }
          };
          const va = get(a); const vb = get(b);
          if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
          return String(va).localeCompare(String(vb)) * dir;
        });
        return (
          <div className="cms-panel overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-3 py-2 cursor-pointer select-none" onClick={() => toggleSort("date")}>Date{sortArrow("date")}</th>
                  <th className="text-left px-3 py-2">Time</th>
                  <th className="text-left px-3 py-2 cursor-pointer select-none" onClick={() => toggleSort("source")}>Source{sortArrow("source")}</th>
                  <th className="text-left px-3 py-2 cursor-pointer select-none" onClick={() => toggleSort("category")}>Category{sortArrow("category")}</th>
                  <th className="text-left px-3 py-2 cursor-pointer select-none" onClick={() => toggleSort("target")}>Target / Player{sortArrow("target")}</th>
                  <th className="text-right px-3 py-2 cursor-pointer select-none" onClick={() => toggleSort("amount")}>Amount{sortArrow("amount")}</th>
                  <th className="text-left px-3 py-2">Description</th>
                  <th className="text-center px-3 py-2 cursor-pointer select-none" onClick={() => toggleSort("status")}>Status{sortArrow("status")}</th>
                  {!embedded && <th className="text-center px-3 py-2">Action</th>}
                </tr>
              </thead>
              <tbody>
                {sortedExpenses.length === 0 ? (
                  <tr><td colSpan={embedded ? 8 : 9} className="text-center text-muted-foreground text-sm py-8">No expenses match the filters</td></tr>
                ) : sortedExpenses.map((exp: any) => {
                  const playerName = exp.players
                    ? `${exp.players.first_name} ${exp.players.last_name}`
                    : exp.player_name || "Casino";
                  const src = resolveSource(exp);
                  const catLabel = exp.category_code || exp.category;
                  return (
                    <tr key={exp.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                        {fmtDateOnly(exp.created_at)}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                        {new Date(exp.created_at).toLocaleTimeString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${SRC_COLORS[src]}`}>
                          {SRC_LABEL[src]}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${CAT_COLORS[exp.category] || CAT_COLORS.other}`}>
                            {catLabel}
                          </span>
                          {isManagerView && editingFinCatId === exp.id ? (
                            <div className="min-w-[180px]">
                              <FinCategoryPicker
                                value={exp.fin_category_id || ""}
                                onChange={(v) => {
                                  updateFinCat.mutate(
                                    { id: exp.id, fin_category_id: v || null },
                                    { onSuccess: () => { setEditingFinCatId(null); toast.success("Category updated"); } },
                                  );
                                }}
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => isManagerView && setEditingFinCatId(exp.id)}
                              className={`text-[10px] truncate max-w-[160px] ${
                                exp.fin_category_id
                                  ? "text-muted-foreground"
                                  : "text-amber-600 dark:text-amber-400 italic"
                              } ${isManagerView ? "hover:underline cursor-pointer" : "cursor-default"}`}
                              title={isManagerView ? "Click to re-classify" : undefined}
                            >
                              → {exp.fin_category_id ? (finCatById[exp.fin_category_id]?.name || "—") : "Unassigned"}
                            </button>
                          )}
                          {isManagerView && editingFinCatId === exp.id && (
                            <button
                              type="button"
                              onClick={() => setEditingFinCatId(null)}
                              className="text-[10px] text-muted-foreground hover:text-foreground"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2 text-sm">
                        {exp.player_id ? (
                          <Link
                            to={`/players/${exp.player_id}`}
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            {playerName}
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{playerName}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm cms-amount-negative">
                        {formatCurrency(Number(exp.amount))}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{exp.description || "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {exp.approved ? (
                          <span className="cms-status-active text-xs"><CheckCircle className="w-3 h-3 inline mr-0.5" /> Approved</span>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Pending</Badge>
                        )}
                      </td>
                      {!embedded && (
                        <td className="px-3 py-2 text-center">
                          <div className="inline-flex gap-1">
                            {!exp.approved && isManager && (
                              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => approve.mutate(exp.id)} disabled={approve.isPending}>Approve</Button>
                            )}
                            {!exp.approved && exp.category !== "bar_charge" && src !== "office" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => del.mutate({ id: exp.id, amount: Number(exp.amount), category: exp.category })}
                                title="Cancel expense"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
};

export default Expenses;

// ──────────────────────────────────────────────────────────
// Draft row (per-source dynamic categories)
// ──────────────────────────────────────────────────────────
const DraftRowView = ({
  draft, isManagerView, liveShift, slotsShift, onChange, onRemove, onSubmit, canRemove, isPending,
}: {
  draft: DraftRow;
  isManagerView: boolean;
  liveShift: any;
  slotsShift: any;
  onChange: (patch: Partial<DraftRow>) => void;
  onRemove: () => void;
  onSubmit: () => void;
  canRemove: boolean;
  isPending: boolean;
}) => {
  const { data: dynamicCats = [] } = useExpenseCategories(draft.source);
  const cats = dynamicCats.filter(c => c.active).length > 0
    ? dynamicCats.filter(c => c.active).map(c => ({ code: c.code, label: c.label }))
    : FALLBACK_CATS;

  const isOffice = draft.source === "office";
  const shiftMissing =
    (draft.source === "live_game" && !liveShift?.id) ||
    (draft.source === "slots" && !slotsShift?.id);

  return (
    <tr className="border-b border-border last:border-0">
      {isManagerView && (
        <td className="px-2 py-1.5">
          <Select
            value={draft.source}
            onValueChange={(v) => onChange({ source: v as SourceVal, category: "", target: v === "office" ? "casino" : draft.target })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="live_game">Live Game{liveShift ? "" : " (no shift)"}</SelectItem>
              <SelectItem value="slots">Slots{slotsShift ? "" : " (no shift)"}</SelectItem>
              <SelectItem value="office">Office (MAIN_CASH)</SelectItem>
            </SelectContent>
          </Select>
        </td>
      )}
      <td className="px-2 py-1.5">
        {isOffice ? (
          <span className="text-[11px] text-muted-foreground italic px-2">Casino</span>
        ) : (
          <Select
            value={draft.target}
            onValueChange={(v) => onChange({ target: v as "casino" | "player", player_name: "" })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Target" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="casino">Casino</SelectItem>
              <SelectItem value="player">Player</SelectItem>
            </SelectContent>
          </Select>
        )}
      </td>
      <td className="px-2 py-1.5">
        <PlayerNameAutocomplete
          placeholder={!isOffice && draft.target === "player" ? "Player name" : "—"}
          value={draft.player_name}
          onChange={(v) => onChange({ player_name: v })}
          disabled={isOffice || draft.target !== "player"}
        />
      </td>
      <td className="px-2 py-1.5">
        <Select value={draft.category} onValueChange={(v) => onChange({ category: v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            {cats.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      {isManagerView && (
        <td className="px-2 py-1.5">
          <FinCategoryPicker value={draft.fin_category_id} onChange={(v) => onChange({ fin_category_id: v })} />
        </td>
      )}
      <td className="px-2 py-1.5">
        <NumberInput placeholder="0" value={draft.amount} onChange={(v) => onChange({ amount: v })} className="h-8 text-xs text-right" />
      </td>
      <td className="px-2 py-1.5">
        <Input placeholder="Description" value={draft.description} onChange={(e) => onChange({ description: e.target.value })} className="h-8 text-xs" />
      </td>
      <td className="px-2 py-1.5 text-center">
        <div className="inline-flex gap-1">
          <Button size="sm" className="h-8 px-3" onClick={onSubmit} disabled={isPending || shiftMissing} title={shiftMissing ? "No open shift" : undefined}>
            OK
          </Button>
          {canRemove && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onRemove}>
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
};

// ──────────────────────────────────────────────────────────
// Manager-only Finance Plan picker (override)
// ──────────────────────────────────────────────────────────
const FinCategoryPicker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const { data: finCats = [] } = useFinCategories();
  const grouped = (finCats || []).reduce((acc: Record<string, any[]>, c: any) => {
    if (!c.is_active) return acc;
    (acc[c.group_name] ||= []).push(c);
    return acc;
  }, {});
  return (
    <Select value={value || "__auto"} onValueChange={(v) => onChange(v === "__auto" ? "" : v)}>
      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Auto" /></SelectTrigger>
      <SelectContent className="max-h-[400px]">
        <SelectItem value="__auto">Auto (from category)</SelectItem>
        {Object.entries(grouped).map(([group, list]) => (
          <div key={group}>
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/50">{group}</div>
            {(list as any[]).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </div>
        ))}
      </SelectContent>
    </Select>
  );
};
