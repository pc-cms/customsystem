/**
 * Unified shell for the Office / Budget sections.
 *
 * Renders ONE sticky toolbar: tabs + period picker + a slot where the active
 * tab can portal its own action buttons. Tabs no longer draw their own header,
 * casino switcher or period controls.
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
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { CalendarPlus } from "lucide-react";

/** Roles allowed to run the Open Month ritual (mirrors fin_open_month). */
const OPEN_MONTH_ROLES = ["super_admin", "manager", "general_manager", "finance_manager"];

type Ctx = {
  period: OfficePeriod;
  setPeriod: (p: OfficePeriod) => void;
  actionsEl: HTMLDivElement | null;
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


/** Portals tab-specific action buttons into the shared toolbar. */
export function OfficeActions({ children }: { children: ReactNode }) {
  const ctx = useContext(OfficeShellCtx);
  const [, force] = useState(0);
  useEffect(() => {
    // Toolbar mounts before children, but re-render once to be safe.
    force((n) => n + 1);
  }, []);
  if (!ctx?.actionsEl) return null;
  return createPortal(<div className="flex items-center gap-2">{children}</div>, ctx.actionsEl);
}

export type ShellTab = { value: string; label: string };

export function OfficeShell({
  storageKey,
  tabs,
  tab,
  onTabChange,
  showPeriod = true,
  banner,
  children,
}: {
  storageKey: string;
  tabs: readonly ShellTab[];
  tab: string;
  onTabChange: (v: string) => void;
  showPeriod?: boolean;
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
  const [openWizard, setOpenWizard] = useState(false);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [actionsEl, setActionsEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setActionsEl(actionsRef.current);
  }, []);

  const monthStatus =
    period.mode === "month" ? monthStatusOf(openings, closures, period.year, period.month) : null;

  const changePeriod = (p: OfficePeriod) => {
    setPeriod(p);
  };

  const value = useMemo<Ctx>(
    () => ({ period, setPeriod: changePeriod, actionsEl }),
    [period, actionsEl],
  );


  return (
    <OfficeShellCtx.Provider value={value}>
      <div className="space-y-4">
        {banner}
        <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b border-border">
          <div className="flex items-center gap-3 flex-wrap">
            <Tabs value={tab} onValueChange={onTabChange} className="min-w-0">
              <TabsList className="h-9 flex-wrap">
                {tabs.map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-md"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex-1" />
          {showPeriod && <PeriodPicker value={period} onChange={changePeriod} />}
          {showPeriod && monthStatus && (
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border",
                monthStatus === "open" &&
                  "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                monthStatus === "closed" &&
                  "border-border bg-muted text-muted-foreground",
                monthStatus === "not_opened" &&
                  "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
              )}
            >
              {monthStatus === "not_opened" ? "Not opened" : monthStatus}
            </span>
          )}
          {showPeriod && monthStatus === "not_opened" && canOpenMonth && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-amber-500/50 text-amber-700 dark:text-amber-400"
              onClick={() => setOpenWizard(true)}
            >
              <CalendarPlus className="w-4 h-4" />
              Open Month · {MONTH_NAMES[period.month - 1]} {period.year}
            </Button>
          )}
            <div ref={actionsRef} className="flex items-center gap-2" />
          </div>
        </div>
        {children}
      </div>
    </OfficeShellCtx.Provider>
  );
}
