/**
 * Management Rota / Attendance — one network-wide page for all casinos.
 * Blocks: each casino, OFFICE, CCTV. Slot-based, so managers can be moved
 * between cities without touching the roster.
 */
import { useMemo, useState } from "react";
import { useCasino } from "@/lib/casino-context";
import VacationPlanner from "@/components/management/VacationPlanner";
import ShiftCodesDialog from "@/components/shifts/ShiftCodesDialog";
import type { MgmtBlock } from "@/hooks/use-management-rota";
import { ChevronLeft, ChevronRight, Printer, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import ManagementGrid from "@/components/management/ManagementGrid";
import { useAuth } from "@/lib/auth-context";
import { useSessionState } from "@/hooks/use-session-state";
import { getBusinessDate } from "@/lib/business-day";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { MGMT_SHIFT_LABELS } from "@/hooks/use-management-rota";
import { UNIFIED_ATT_COLORS, UNIFIED_SHIFT_COLORS } from "@/lib/shift-colors";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const NETWORK_ROLES = ["super_admin", "boss", "general_manager", "finance_manager", "hr"];
const CASINO_ROLES = ["manager", "shift_manager"];
const EDIT_ROLES = [...NETWORK_ROLES, ...CASINO_ROLES];

export default function ManagementSchedulePage({ mode }: { mode: "rota" | "attendance" }) {
  const { roles } = useAuth();
  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const businessToday = serverBusinessDate || getBusinessDate();
  const currentMonth = useMemo(() => businessToday.slice(0, 7), [businessToday]);
  const [month, setMonth] = useSessionState<string>("mgmt-month", currentMonth);

  const isCctvUser = roles.includes("surveillance");
  const canEdit = roles.some((r) => EDIT_ROLES.includes(r)) || isCctvUser;
  const cctvOnly = isCctvUser && !roles.some((r) => EDIT_ROLES.includes(r));
  const { activeCasinoId } = useCasino();
  const isNetwork = roles.some((r) => NETWORK_ROLES.includes(r));
  const isCasinoMgr = roles.some((r) => CASINO_ROLES.includes(r));
  const canEditBlock = (block: MgmtBlock, casinoId: string | null) => {
    if (isNetwork) return true;
    if (block === "cctv") return isCctvUser;
    if (block === "casino") return isCasinoMgr && !!activeCasinoId && casinoId === activeCasinoId;
    return false;
  };
  const [view, setView] = useState<"schedule" | "vacations">("schedule");

  const navigateMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
  }, [month]);

  const printGrid = () => {
    const html = document.documentElement;
    const wasDark = html.classList.contains("dark");
    if (wasDark) html.classList.remove("dark");
    window.print();
    if (wasDark) html.classList.add("dark");
  };

  return (
    <div>
      <PageHeader
        icon={UserCheck}
        title={mode === "rota" ? "Management Rota" : "Management Attendance"}
        subtitle="All casinos · Managers & CCTV"
        centerSlot={
          <div className="flex items-center gap-3 flex-wrap justify-center no-print">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateMonth(-1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-semibold text-card-foreground min-w-[140px] text-center">{monthLabel}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateMonth(1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-1.5 flex-nowrap whitespace-nowrap overflow-x-auto py-0.5">
              {(["D", "M", "N"] as const).map((s) => (
                <span key={s} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono ${UNIFIED_SHIFT_COLORS[s]}`}>
                  <span className="font-bold">{s}</span>
                  <span className="opacity-80">{MGMT_SHIFT_LABELS[s]}</span>
                </span>
              ))}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-blue-700 text-white">
                <span className="font-bold">ARU</span>
                <span className="opacity-80">CCTV 18:00–06:00</span>
              </span>
              {mode === "attendance" && (
                <>
                  <span className="mx-1 h-4 w-px bg-border" />
                  {(["A", "L", "S"] as const).map((v) => (
                    <span key={v} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono ${UNIFIED_ATT_COLORS[v]}`}>
                      <span className="font-bold">{v}</span>
                      <span className="opacity-80">{v === "A" ? "Absent" : v === "L" ? "Leave" : "Sick"}</span>
                    </span>
                  ))}
                </>
              )}
              <span className="mx-1 h-4 w-px bg-border" />
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                Type {mode === "attendance" ? "A / L / S" : "D M N L · CCTV: city letter"} · Space = next · Backspace = clear
              </span>
            </div>
          </div>
        }
      >
        <div className="inline-flex rounded-md border border-border p-0.5">
          {(["schedule", "vacations"] as const).map((v) => (
            <Button key={v} size="sm" variant={view === v ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setView(v)}>
              {v === "schedule" ? "Schedule" : "Vacations"}
            </Button>
          ))}
        </div>
        <ShiftCodesDialog defaultDept="management" />
        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={printGrid}>
          <Printer className="w-3.5 h-3.5" /> Print
        </Button>
      </PageHeader>

      {view === "schedule" ? (
        <ManagementGrid month={month} mode={mode} canEdit={canEdit} cctvOnly={cctvOnly} canEditBlock={canEditBlock} />
      ) : (
        <VacationPlanner year={Number(month.slice(0, 4))} />
      )}
    </div>
  );
}
