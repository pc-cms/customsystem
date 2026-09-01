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
  nextMonthPeriod,
} from "./PeriodPicker";
import { useSessionState } from "@/hooks/use-session-state";
import { useMonthClosures } from "@/hooks/use-fin-month-closures";

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
  const [period, setPeriod] = useSessionState<OfficePeriod>(storageKey, accountingMonthPeriod());
  /** True once the user picked a period by hand — auto-defaulting stops then. */
  const [touched, setTouched] = useSessionState<boolean>(`${storageKey}:touched`, false);
  const { data: closures = [] } = useMonthClosures();
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [actionsEl, setActionsEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setActionsEl(actionsRef.current);
  }, []);

  /**
   * The working month only rolls forward once the previous one is closed via
   * Close Month. Until then Office stays on the accounting month, so wallets,
   * variance and expenses keep landing in the month they belong to.
   */
  useEffect(() => {
    if (touched) return;
    const base = accountingMonthPeriod();
    const isClosed = (y: number, m: number) =>
      closures.some((c) => c.year === y && c.month === m);
    const want = isClosed(base.year, base.month)
      ? nextMonthPeriod(base.year, base.month)
      : base;
    if (period.mode !== "month" || period.year !== want.year || period.month !== want.month) {
      setPeriod(want);
    }
  }, [closures, touched, period, setPeriod]);

  const changePeriod = (p: OfficePeriod) => {
    setTouched(true);
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
            {showPeriod && <PeriodPicker value={period} onChange={setPeriod} />}
            <div ref={actionsRef} className="flex items-center gap-2" />
          </div>
        </div>
        {children}
      </div>
    </OfficeShellCtx.Provider>
  );
}
