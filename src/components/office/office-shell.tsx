/**
 * Unified shell for the Office / Budget sections.
 *
 * Renders ONE sticky toolbar: tabs on the left, month status + month dropdown
 * + the single Open/Close Month control on the right (Stage 2A, 2026-09-01).
 * Tab-specific action buttons portal into a second row below the strip.
 *
 * The shared header is the ONLY owner of month management: Open Month and
 * Close Month live here and nowhere else. It reuses the existing
 * OpenMonthWizard / CloseMonthWizard flows unchanged (same RPCs, same audit).
 */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PeriodPicker,
  type OfficePeriod,
  accountingMonthPeriod,
  MONTH_NAMES,
} from "./PeriodPicker";
import { useSessionState } from "@/hooks/use-session-state";
import { useMonthClosures } from "@/hooks/use-fin-month-closures";
import { useMonthOpenings, monthStatusOf } from "@/hooks/use-fin-month-opening";
import { OpenMonthWizard } from "@/pages/office/OpenMonthWizard";
import { CloseMonthWizard } from "@/pages/office/CloseMonthWizard";
import { useFinBalanceSnapshot } from "@/hooks/use-fin-balance";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { CalendarPlus, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** Roles allowed to run the Open Month ritual (mirrors fin_open_month). */
const OPEN_MONTH_ROLES = ["super_admin", "manager", "general_manager", "finance_manager"];
/** Roles allowed to run Close Month (same list Wallets used before Stage 2A). */
const CLOSE_MONTH_ROLES = ["super_admin", "admin", "manager", "general_manager", "finance_manager"];

type Ctx = {
  period: OfficePeriod;
  setPeriod: (p: OfficePeriod) => void;
  actionsEl: HTMLDivElement | null;
  headerActionsEl: HTMLDivElement | null;
};

const OfficeShellCtx = createContext<Ctx | null>(null);

/**
 * Period of the current Office/Budget section. Falls back to the accounting
 * month (the month of the business day being closed), not the calendar month.
 */
export function useOfficePeriod() {
  const ctx = useContext(OfficeShellCtx);
  const [local, setLocal] = useState<OfficePeriod>(() => accountingMonthPeriod());
  if (ctx) return { period: ctx.period, setPeriod: ctx.setPeriod };
  return { period: local, setPeriod: setLocal };
}


/** Portals tab-specific action buttons into the shared toolbar's actions row. */
export function OfficeActions({ children }: { children: ReactNode }) {
  const ctx = useContext(OfficeShellCtx);
  const [, force] = useState(0);
  useEffect(() => {
    // Toolbar mounts before children, but re-render once to be safe.
    force((n) => n + 1);
  }, []);
  if (!ctx?.actionsEl) return null;
  return createPortal(<div className="flex items-center gap-2 flex-wrap justify-end">{children}</div>, ctx.actionsEl);
}

/**
 * Portals the active tab's action buttons INTO the header row, left of the
 * month status badge (Stage 2B, 2026-09-01). Use for the primary tab actions;
 * OfficeActions (second row) stays for overflow/secondary controls.
 */
export function OfficeHeaderActions({ children }: { children: ReactNode }) {
  const ctx = useContext(OfficeShellCtx);
  const [, force] = useState(0);
  useEffect(() => {
    force((n) => n + 1);
  }, []);
  if (!ctx?.headerActionsEl) return null;
  return createPortal(<div className="flex items-center gap-2 flex-wrap">{children}</div>, ctx.headerActionsEl);
}

export type ShellTab = { value: string; label: string };

/**
 * Hosts the existing CloseMonthWizard from the shared header. Mounted only
 * while the dialog is open, so the balance snapshot is fetched on demand —
 * exactly the data the Wallets page passed to the wizard before Stage 2A.
 */
function CloseMonthHost({
  open,
  onOpenChange,
  year,
  month,
  status,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  year: number;
  month: number;
  status: "open" | "closed";
}) {
  const { activeCasinoId } = useCasino();
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(year, month, 0).getDate();
  const from = `${year}-${pad(month)}-01`;
  const to = `${year}-${pad(month)}-${pad(last)}`;
  const { data: snap } = useFinBalanceSnapshot(from, to);
  const usdRate = snap?.rates?.usd_tzs || 2600;
  return (
    <CloseMonthWizard
      open={open}
      onOpenChange={onOpenChange}
      wallets={(snap?.wallets || []) as any}
      usdTzs={usdRate}
      casinoId={activeCasinoId}
      year={year}
      month={month}
      status={status}
    />
  );
}

export function OfficeShell({
  storageKey,
  tabs,
  tab,
  onTabChange,
  showPeriod = true,
  hideToolbar = false,
  monthControl = false,
  banner,
  children,
}: {
  storageKey: string;
  tabs: readonly ShellTab[];
  tab: string;
  onTabChange: (v: string) => void;
  showPeriod?: boolean;
  /**
   * Skip the sticky tab-strip toolbar entirely. Used by Office pages that
   * moved to the left sidebar (Import Statement / Rates / Inter-Casino):
   * they keep the shared period context but render their own PageHeader.
   */
  hideToolbar?: boolean;
  /**
   * Show the Open/Close Month controls in the header. Only the Report tab
   * owns month management (Stage 2B, 2026-09-01) — other tabs never render it.
   */
  monthControl?: boolean;
  banner?: ReactNode;
  children: ReactNode;
}) {
  /**
   * The header month is a fixed working window: it changes ONLY via the
   * picker, never automatically. First entry defaults to the accounting
   * month (the month of the business day being closed).
   */
  const [period, setPeriod] = useSessionState<OfficePeriod>(storageKey, accountingMonthPeriod());
  const { data: closures = [] } = useMonthClosures();
  const { data: openings = [] } = useMonthOpenings();
  const { roles } = useAuth();
  const canOpenMonth = roles.some((r) => OPEN_MONTH_ROLES.includes(r));
  const canCloseMonth = roles.some((r) => CLOSE_MONTH_ROLES.includes(r));
  const [openWizard, setOpenWizard] = useState(false);
  const [closeWizard, setCloseWizard] = useState(false);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [actionsEl, setActionsEl] = useState<HTMLDivElement | null>(null);
  const headerActionsRef = useRef<HTMLDivElement | null>(null);
  const [headerActionsEl, setHeaderActionsEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setActionsEl(actionsRef.current);
    setHeaderActionsEl(headerActionsRef.current);
  }, []);

  const monthStatus =
    period.mode === "month" ? monthStatusOf(openings, closures, period.year, period.month) : null;

  const changePeriod = (p: OfficePeriod) => {
    setPeriod(p);
  };

  const value = useMemo<Ctx>(
    () => ({ period, setPeriod: changePeriod, actionsEl, headerActionsEl }),
    [period, actionsEl, headerActionsEl],
  );


  return (
    <OfficeShellCtx.Provider value={value}>
      <div className="space-y-4">
        {banner}
        {!hideToolbar && (
        <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b border-border">
          {/* Single row: tabs left · [tab actions] [Close Month — Report only] [status] [month dropdown] right. */}
          <div className="flex items-center gap-3 flex-nowrap">
            <Tabs value={tab} onValueChange={onTabChange} className="min-w-0 overflow-x-auto">
              <TabsList className="h-9 flex-nowrap">
                {tabs.map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="text-xs whitespace-nowrap data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-md"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex-1" />
            {/* Tab actions portal — renders left of the month controls. */}
            <div ref={headerActionsRef} className="empty:hidden" />
            {/* Month control lives ONLY on the Report tab. */}
            {showPeriod && monthControl && monthStatus === "not_opened" && canOpenMonth && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 whitespace-nowrap border-amber-500/50 text-amber-700 dark:text-amber-400"
                onClick={() => setOpenWizard(true)}
              >
                <CalendarPlus className="w-4 h-4" />
                Open Month
              </Button>
            )}
            {showPeriod && monthControl && (monthStatus === "open" || monthStatus === "closed") && canCloseMonth && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 whitespace-nowrap"
                onClick={() => setCloseWizard(true)}
              >
                <CalendarCheck className="w-4 h-4" />
                Close Month
              </Button>
            )}
            {/* Month status badge — same height/rhythm as the month dropdown. */}
            {showPeriod && monthStatus && (
              <span
                className={cn(
                  "shrink-0 inline-flex items-center h-8 px-3 text-xs font-semibold uppercase tracking-wider rounded-md border whitespace-nowrap",
                  monthStatus === "open" &&
                    "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                  monthStatus === "closed" &&
                    "border-border bg-muted text-muted-foreground",
                  monthStatus === "not_opened" &&
                    "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                )}
              >
                {monthStatus === "not_opened" ? "NOT OPENED" : monthStatus === "open" ? "OPEN" : "CLOSED"}
              </span>
            )}
            {/* Month dropdown is ALWAYS the rightmost element. */}
            {showPeriod && <PeriodPicker value={period} onChange={changePeriod} />}
          </div>
          {/* Tab-specific actions row — hidden when the active tab portals nothing. */}
          <div ref={actionsRef} className="mt-2 empty:hidden" />
        </div>
        )}
        {/* Single generic month-state message — no action button (the header owns it). */}
        {showPeriod && monthStatus === "not_opened" && (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            {MONTH_NAMES[period.month - 1]} {period.year} is not opened yet — finance postings
            are disabled until the month is opened.
          </div>
        )}
        {children}
        {period.mode === "month" && (
          <OpenMonthWizard
            open={openWizard}
            onOpenChange={setOpenWizard}
            year={period.year}
            month={period.month}
          />
        )}
        {period.mode === "month" && closeWizard && (
          <CloseMonthHost
            open={closeWizard}
            onOpenChange={setCloseWizard}
            year={period.year}
            month={period.month}
            status={monthStatus === "closed" ? "closed" : "open"}
          />
        )}
      </div>
    </OfficeShellCtx.Provider>
  );
}
