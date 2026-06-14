import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCasino } from "@/lib/casino-context";
import { useDealers, useBreaklistData, useSetBreaklistCell, useLockBreaklistCell, useGamingTables, usePitRotaRange, useSetDealerAttendance, useDealerAttendance } from "@/hooks/use-casino-data";
import { useCasinoInfo } from "@/hooks/use-table-lifecycle";
import { useAuth } from "@/lib/auth-context";
import { Lock, Unlock, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { ALL_ROLES, ROLE_COLORS, TABLE_ROLES } from "@/lib/currency";
import { getTableCellClasses } from "@/lib/table-colors";
import { isAfterBreaklistLock, nowEAT } from "@/lib/business-day";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useUpsertWarningCommentByKey } from "@/hooks/use-staff-warnings";

const CATEGORY_LABELS: Record<string, string> = {
  trainee: "T",
  dealer: "D",
  inspector: "I",
  expert: "E",
  pit_boss: "P",
};

const CATEGORY_COLORS: Record<string, string> = {
  trainee: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  dealer: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  inspector: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  expert: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  pit_boss: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
};

interface BreaklistGridProps {
  date: string;
  zoom?: number;
}

// 18:00 → 05:00, 20-minute intervals
const generateTimeSlots = () => {
  const slots: string[] = [];
  for (let h = 18; h <= 28; h++) { // 28 = 04:xx next day
    for (let m = 0; m < 60; m += 20) {
      if (h === 29) break; // stop before 05:00
      const hour = h % 24;
      slots.push(`${String(hour).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

// Get current active slot
const getCurrentSlot = () => {
  const now = nowEAT();
  const h = now.getHours();
  const m = Math.floor(now.getMinutes() / 20) * 20;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

// Check if a slot is within working hours (18-07, matches business-day rollover)
const isInWorkingHours = (slot: string) => {
  const h = parseInt(slot.split(":")[0]);
  return h >= 18 || h < 7;
};

// Map a stored role to the per-table exclusivity slot.
// Three independent slots per table: Dealer (D), Inspector (I, ends with 'i'), Chipper (C, ends with 'c').
const roleSlot = (r: string): "D" | "I" | "C" | null => {
  if (!r || r === "BR" || r === "TR" || r === "S" || r === "LT" || r === "SRT" || r === "CLS") return null;
  if (/c$/i.test(r)) return "C";
  if (/i$/.test(r)) return "I";
  return "D";
};

const BreaklistGrid = ({ date, zoom = 100 }: BreaklistGridProps) => {
  const { data: dealers = [] } = useDealers();
  const { data: breaklist = [] } = useBreaklistData(date);
  const { data: tables = [] } = useGamingTables();
  const { data: rota = [] } = usePitRotaRange(date, date);
  const { data: attendance = [] } = useDealerAttendance(date);
  const { data: casino } = useCasinoInfo();
  const isMwanza = (casino?.name ?? "").toLowerCase().includes("mwanza");
  const fmtTableName = (name: string | null | undefined) => {
    if (!name) return name;
    if (isMwanza && name.toLowerCase() === "baccarat") return "BCR";
    return name;
  };
  const setCell = useSetBreaklistCell();
  const setAttendance = useSetDealerAttendance();
  const lockCell = useLockBreaklistCell();
  const { isManager, roles } = useAuth();
  const isPit = roles.includes("pit");

  const activeDealers = dealers.filter(d => d.is_active);
  const openTables = tables.filter(t => t.status === "open");
  // For displaying existing breaklist assignments — include closed tables too,
  // so per-table assignments (P1, R1, etc.) remain visible after a table is closed mid-day.
  const assignableTables = tables;

  // Stable color index per table — based on alphabetical order of all tables (open + closed).
  const tableColorIndex = useMemo(() => {
    const sorted = [...assignableTables].sort((a, b) => a.name.localeCompare(b.name));
    const map = new Map<string, number>();
    sorted.forEach((t, i) => map.set(t.id, i));
    return map;
  }, [assignableTables]);

  // Dealers scheduled in rota for this date (M or N only)
  const rotaDealers = useMemo(() => {
    return rota
      .filter((r: any) => r.shift === "M" || r.shift === "N" || r.shift === "E")
      .map((r: any) => ({ dealerId: r.dealer_id, shift: r.shift as string }));
  }, [rota]);

  // Absent / Sick / Suspend dealer set — attendance value "A", "S" or "SP"
  // hides them from the grid entirely.
  // ("{n}S" — worked n hours then went sick mid-shift — does NOT hide; they were physically present.)
  const absentDealerIds = useMemo(() => {
    const s = new Set<string>();
    (attendance as any[]).forEach((a: any) => {
      const v = (a.value ?? "").toString().trim().toUpperCase();
      if (v === "A" || v === "S" || v === "SP") s.add(a.dealer_id);
    });
    return s;
  }, [attendance]);

  // Sort options: # (insertion order) is meaningless without a base sort,
  // so sort cycles between Shift / Category / Name. Numbering is then derived from current sort.
  const [sortBy, setSortBy] = useState<"name" | "shift" | "category">("shift");

  const breaklistDealers = useMemo(() => {
    const rotaDealerIds = new Set(rotaDealers.map(r => r.dealerId));
    // STRICT: only dealers scheduled in the rota (M/N/E) for this date.
    // Pit Bosses never appear; absent (A) dealers are hidden.
    // No fallback to "all active dealers" — empty rota = empty grid (forces Pit to fill rota first).
    const filtered = activeDealers.filter(
      d => rotaDealerIds.has(d.id) && !(d as any).is_pit_boss && !absentDealerIds.has(d.id),
    );
    const rows = filtered;

    const shiftOrder: Record<string, number> = { M: 0, N: 1, E: 2 };
    const categoryOrder: Record<string, number> = { trainee: 0, dealer: 1, inspector: 2, expert: 3, pit_boss: 4 };
    if (sortBy === "name") {
      return [...rows].sort((a, b) => a.name.localeCompare(b.name));
    }
    if (sortBy === "category") {
      return [...rows].sort((a, b) => {
        const ca = categoryOrder[a.category] ?? 99;
        const cb = categoryOrder[b.category] ?? 99;
        return ca !== cb ? ca - cb : a.name.localeCompare(b.name);
      });
    }
    // shift
    return [...rows].sort((a, b) => {
      const sa = rotaDealers.find(r => r.dealerId === a.id)?.shift || "Z";
      const sb = rotaDealers.find(r => r.dealerId === b.id)?.shift || "Z";
      const diff = (shiftOrder[sa] ?? 9) - (shiftOrder[sb] ?? 9);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });
  }, [activeDealers, rotaDealers, sortBy, absentDealerIds]);

  const getDealerShift = (dealerId: string) => {
    return rotaDealers.find(r => r.dealerId === dealerId)?.shift || null;
  };

  const currentSlot = useMemo(() => getCurrentSlot(), []);
  const shiftEndHour = casino?.shift_end ? parseInt(casino.shift_end.split(":")[0]) : 5;
  const { data: effectiveBusinessDate } = useEffectiveBusinessDate();
  const isToday = !!effectiveBusinessDate && date === effectiveBusinessDate;
  const pastLock = isToday && isAfterBreaklistLock(casino?.breaklist_lock || "05:30");
  // Editable if it's today AND not past lock time (or if manager / pit operator).
  // Pit role is the on-duty operator and must be able to prepare the breaklist
  // ahead of the 18:00 shift start, so they bypass the morning-lock window.
  const isEditable = isToday && (!pastLock || isManager || isPit);

  // Inline role picker state
  const [activeCell, setActiveCell] = useState<{ dealerId: string; timeSlot: string; dropUp: boolean } | null>(null);
  // HR comment dialog state (opens after A/S/SP/LT to capture a short note)
  const [commentFor, setCommentFor] = useState<{ dealerId: string; dealerName: string; kind: "Absent" | "Sick" | "Suspend" | "Late"; label: string } | null>(null);
  const [commentText, setCommentText] = useState("");
  // For Suspend: number of consecutive days (incl. today) to apply SP forward.
  const [suspendDays, setSuspendDays] = useState<number>(1);
  const upsertWarningComment = useUpsertWarningCommentByKey();
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();


  const getCellData = (dealerId: string, timeSlot: string) =>
    breaklist.find(b => b.dealer_id === dealerId && b.time_slot === timeSlot);

  const handleCellClick = (dealerId: string, timeSlot: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditable) return;
    const cell = getCellData(dealerId, timeSlot);
    if (cell?.is_locked && !isManager) {
      toast.error("Locked — manager access required");
      return;
    }
    // Open dropdown upward when there is not enough space below
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropUp = spaceBelow < 240;
    setActiveCell({ dealerId, timeSlot, dropUp });
    // Force-refresh breaklist for this casino so the popup's "available tables"
    // list reflects rows added by other operators since the page last refetched.
    // Without this, off-screen assignments (e.g. Wilfred on AR1 at 20:00) may not
    // be in cache, the popup would falsely offer AR1, and the DB trigger would
    // then reject the click with a "slot already taken" error.
    if (activeCasinoId) {
      qc.invalidateQueries({ queryKey: ["breaklist", activeCasinoId] });
    }
  };

  const openCommentDialog = (dealerId: string, kind: "Absent" | "Sick" | "Suspend" | "Late", label: string) => {
    const dealerName = activeDealers.find(d => d.id === dealerId)?.name || "Dealer";
    setCommentText("");
    setSuspendDays(1);
    setCommentFor({ dealerId, dealerName, kind, label });
  };

  // Add N days to an ISO yyyy-mm-dd, returning the same shape.
  const addDays = (iso: string, n: number) => {
    const d = new Date(iso + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  // Save HR comment for the current dialog and, when Suspend with N>1 days,
  // propagate SP attendance forward to the next (N-1) days.
  const handleCommentSave = () => {
    if (!commentFor) return;
    if (commentFor.kind === "Suspend" && suspendDays > 1) {
      for (let i = 1; i < suspendDays; i++) {
        const d = addDays(date, i);
        setAttendance.mutate({ dealer_id: commentFor.dealerId, date: d, value: "SP" });
        // Also persist the same HR note on each forward day so warnings stay aligned.
        if (commentText.trim()) {
          upsertWarningComment.mutate({ employee_id: commentFor.dealerId, business_date: d, comment: commentText });
        }
      }
      if (suspendDays > 1) {
        toast.success(`Suspend applied for ${suspendDays} days`);
      }
    }
    upsertWarningComment.mutate(
      { employee_id: commentFor.dealerId, business_date: date, comment: commentText },
      { onSuccess: () => setCommentFor(null) },
    );
  };

  const handleRoleSelect = (role: string, tableId?: string) => {
    if (!activeCell) return;

    // SP = Suspend: no breaklist cell, just sets attendance to "SP".
    // The dealer is then hidden from the grid (see absentDealerIds memo).
    // Triggers HR comment dialog so the operator can leave a short note.
    if (role === "SP") {
      const dealerId = activeCell.dealerId;
      setAttendance.mutate({ dealer_id: dealerId, date, value: "SP" });
      toast.success("Marked Suspend — dealer hidden from grid");
      setActiveCell(null);
      openCommentDialog(dealerId, "Suspend", "SP");
      return;
    }

    // LT = Late: marks a single slot as Late and recomputes attendance.
    // Each LT slot = 20 min late. Worked hours = max(0, 9 - ceil(LTcount * 20 / 60)).
    if (role === "LT") {
      const dealerId = activeCell.dealerId;
      setCell.mutate({
        date,
        dealer_id: dealerId,
        time_slot: activeCell.timeSlot,
        role: "LT",
        table_id: null,
      });
      // Recompute LT count INCLUDING this new cell (in case it didn't exist before)
      const existingLT = breaklist.filter(
        (b: any) => b.dealer_id === dealerId && b.role === "LT"
      );
      const alreadyHadThisSlot = existingLT.some((b: any) => b.time_slot === activeCell.timeSlot);
      const ltCount = existingLT.length + (alreadyHadThisSlot ? 0 : 1);
      const lateMinutes = ltCount * 20;
      const lateHours = Math.ceil(lateMinutes / 60);
      const workedH = Math.max(0, 9 - lateHours);
      const attValue = workedH > 0 ? `${workedH}L` : "L";
      setAttendance.mutate({ dealer_id: dealerId, date, value: attValue });
      toast.success(`Late: ${ltCount} slot${ltCount === 1 ? "" : "s"} (~${lateHours}h), shift = ${workedH}h`);
      setActiveCell(null);
      // Open comment dialog only on the FIRST LT mark of the day (no prior LT cells).
      if (existingLT.length === 0) openCommentDialog(dealerId, "Late", "LT");
      return;
    }


    // S = Sick: fill all slots from current one until end of shift with S.
    // No table assignment, no per-table conflict checks (S overrides everything for this dealer).
    if (role === "S") {
      const startIdx = TIME_SLOTS.indexOf(activeCell.timeSlot);
      if (startIdx === -1) {
        setActiveCell(null);
        return;
      }
      // Only fill EMPTY slots from current onwards; existing assignments are preserved.
      const occupied = new Set(
        breaklist
          .filter((b: any) => b.dealer_id === activeCell.dealerId)
          .map((b: any) => b.time_slot as string)
      );
      const slotsToFill = TIME_SLOTS.slice(startIdx).filter(s => !occupied.has(s));
      if (slotsToFill.length === 0) {
        toast.info("No empty slots ahead to mark Sick");
        setActiveCell(null);
        return;
      }
      slotsToFill.forEach(slot => {
        setCell.mutate({
          date,
          dealer_id: activeCell.dealerId,
          time_slot: slot,
          role: "S",
          table_id: null,
        });
      });
      // Hours worked BEFORE this Sick click = from the START OF SHIFT to the
      // click slot, rounded UP to whole hours. Each slot = 20 minutes.
      //   M (Morning/Mid) — shift starts at 18:00 (first slot, index 0).
      //   N (Night)        — shift starts at 21:00.
      //   E (Extra)        — falls back to the dealer's first occupied slot.
      const dealerShift = rotaDealers.find(rd => rd.dealerId === activeCell.dealerId)?.shift;
      let shiftStartIdx = 0; // default = 18:00 (first slot)
      if (dealerShift === "N") {
        const nIdx = TIME_SLOTS.indexOf("21:00");
        shiftStartIdx = nIdx >= 0 ? nIdx : 0;
      } else if (dealerShift === "E") {
        const occupiedIdx = breaklist
          .filter((b: any) => b.dealer_id === activeCell.dealerId && b.role !== "S")
          .map((b: any) => TIME_SLOTS.indexOf(b.time_slot as string))
          .filter((i: number) => i >= 0);
        shiftStartIdx = occupiedIdx.length > 0 ? Math.min(...occupiedIdx) : 0;
      }
      let hoursWorked = 0;
      const slotsWorked = startIdx - shiftStartIdx;
      if (slotsWorked > 0) hoursWorked = Math.ceil((slotsWorked * 20) / 60);
      // Store as "{H}S" to encode "worked H hours, then went sick".
      // If 0 hours, store plain "S".
      const attValue = hoursWorked > 0 ? `${hoursWorked}S` : "S";
      setAttendance.mutate({ dealer_id: activeCell.dealerId, date, value: attValue });
      toast.success(`Marked Sick: ${hoursWorked}h worked (shift ${dealerShift || "?"}), ${slotsToFill.length} slots ahead`);

      const sickDealerId = activeCell.dealerId;
      setActiveCell(null);
      openCommentDialog(sickDealerId, "Sick", "S");
      return;
    }


    // Per-table role exclusivity:
    //   - Dealer slot   (P / BJ / AR)
    //   - Inspector slot (Pi / BJi / ARi)
    //   - Croupier slot  (ARc, roulette only)
    // BR is manual — never auto-filled. Block conflicts with an error.
    const slot = roleSlot(role);
    if (tableId && slot) {
      const conflict = breaklist.find((b: any) => {
        if (b.time_slot !== activeCell.timeSlot) return false;
        if (b.table_id !== tableId) return false;
        if (b.dealer_id === activeCell.dealerId) return false;
        return roleSlot(b.role) === slot;
      });
      if (conflict) {
        const occupant = activeDealers.find(d => d.id === conflict.dealer_id)?.name || "another dealer";
        const table = openTables.find(t => t.id === tableId);
        const tableName = fmtTableName(table?.name) || "this table";
        toast.error(`${tableName} ${slot} already taken by ${occupant} at ${activeCell.timeSlot}`);
        return;
      }
    }

    setCell.mutate({
      date,
      dealer_id: activeCell.dealerId,
      time_slot: activeCell.timeSlot,
      role,
      table_id: tableId || null,
    });
    setActiveCell(null);
  };

  const handleToggleCellLock = (dealerId: string, timeSlot: string) => {
    const cell = getCellData(dealerId, timeSlot);
    if (!cell) return;
    lockCell.mutate({ id: cell.id, lock: !cell.is_locked });
  };

  const getLockedCount = (dealerId: string) =>
    breaklist.filter(b => b.dealer_id === dealerId && b.is_locked).length;

  const roleSuffix: Record<string, string> = {
    ARi: "i", ARc: "c", AR1i: "i", AR1c: "c",
    Pi: "i", BJi: "i",
  };

  // Manual entry only — no bulk auto-fill. BR/SRT/CLS/TR are entered per cell via the role picker.

  return (
    <>
      <div className="cms-panel overflow-auto" style={{ zoom: `${zoom}%` }}>
        <div className="min-w-[1400px]">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-center text-[9px] font-medium text-muted-foreground uppercase px-1 py-2 min-w-[26px] sticky left-0 bg-card z-10">
                  #
                </th>
                <th
                  onClick={() => setSortBy("category")}
                  className={`text-center text-[9px] font-medium uppercase px-1 py-2 min-w-[34px] whitespace-nowrap sticky left-[26px] bg-card z-10 cursor-pointer hover:text-foreground select-none ${sortBy === "category" ? "text-foreground" : "text-muted-foreground"}`}
                  title="Sort by Category"
                >
                  <span className="inline-flex items-center justify-center gap-0.5">C{sortBy === "category" && <span className="text-[8px]">↓</span>}</span>
                </th>
                <th
                  onClick={() => setSortBy("name")}
                  className={`text-left text-xs font-medium uppercase px-3 py-2 sticky left-[60px] bg-card z-10 min-w-[120px] whitespace-nowrap cursor-pointer hover:text-foreground select-none ${sortBy === "name" ? "text-foreground" : "text-muted-foreground"}`}
                  title="Sort by Name"
                >
                  Name {sortBy === "name" && <span className="text-[10px]">↓</span>}
                </th>
                <th
                  onClick={() => setSortBy("shift")}
                  className={`text-center text-[9px] font-medium uppercase px-1 py-2 min-w-[34px] whitespace-nowrap cursor-pointer hover:text-foreground select-none ${sortBy === "shift" ? "text-foreground" : "text-muted-foreground"}`}
                  title="Sort by Shift"
                >
                  <span className="inline-flex items-center justify-center gap-0.5">S{sortBy === "shift" && <span className="text-[8px]">↓</span>}</span>
                </th>
                {TIME_SLOTS.map(slot => {
                  const isActive = isToday && slot === currentSlot;
                  const isHourStart = slot.endsWith(":00");
                  return (
                    <th
                      key={slot}
                      className={`text-center text-[9px] font-mono px-0.5 py-2 min-w-[52px] ${
                        isActive ? "bg-primary text-primary-foreground font-bold border-x-2 border-primary" : "text-muted-foreground"
                      } ${isHourStart && !isActive ? "border-l-2 border-foreground/25" : ""}`}
                    >
                      {slot}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {breaklistDealers.map((dealer, idx) => {
                const lockedCount = getLockedCount(dealer.id);
                const shift = getDealerShift(dealer.id);
                return (
                  <tr key={dealer.id} className={`border-b border-border last:border-0 ${idx % 2 === 1 ? "bg-muted/10" : ""}`}>
                    <td className={`text-center py-1 sticky left-0 z-10 text-[10px] font-mono font-bold text-muted-foreground ${idx % 2 === 1 ? "bg-card/95" : "bg-card"}`}>
                      {idx + 1}
                    </td>
                    <td className={`text-center py-1 sticky left-[26px] z-10 ${idx % 2 === 1 ? "bg-card/95" : "bg-card"}`}>
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-mono font-bold ${CATEGORY_COLORS[dealer.category] || "text-muted-foreground"}`}>
                        {CATEGORY_LABELS[dealer.category] || "?"}
                      </span>
                    </td>
                    <td className={`px-3 py-1 text-xs font-medium text-card-foreground sticky left-[60px] z-10 ${idx % 2 === 1 ? "bg-card/95" : "bg-card"}`}>
                      <div className="flex items-center justify-between">
                        <span>{dealer.name}</span>
                        {lockedCount > 0 && (
                          <span className="text-[9px] text-yellow-600 dark:text-yellow-400 flex items-center gap-0.5">
                            <LockKeyhole className="w-2.5 h-2.5" />{lockedCount}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`text-center py-1 ${idx % 2 === 1 ? "bg-card/95" : "bg-card"}`}>
                      {shift && (
                         <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                          shift === "M" ? "bg-teal-100 text-teal-800 dark:bg-teal-500/25 dark:text-teal-300" : shift === "N" ? "bg-sky-100 text-sky-700 dark:bg-sky-500/25 dark:text-sky-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-300"
                        }`}>{shift}</span>
                      )}
                    </td>
                    {TIME_SLOTS.map(slot => {
                      const cell = getCellData(dealer.id, slot);
                      const table = cell?.table_id ? assignableTables.find(t => t.id === cell.table_id) : null;
                      const tableName = fmtTableName(table?.name) ?? null;
                      const displayLabel = cell
                        ? tableName
                          ? `${tableName}${roleSuffix[cell.role] || ""}`
                          : cell.role
                        : "·";
                      const isActiveCell = activeCell?.dealerId === dealer.id && activeCell?.timeSlot === slot;
                      const isCurrentCol = isToday && slot === currentSlot;
                      const isHourStart = slot.endsWith(":00");
                      return (
                        <td key={slot} className={`px-0.5 py-0.5 text-center relative group ${isCurrentCol ? "bg-primary/15 border-x-2 border-primary" : isHourStart ? "border-l-2 border-foreground/25" : ""}`}>
                          <div
                            onClick={(e) => isEditable && handleCellClick(dealer.id, slot, e)}
                            className={`w-full h-7 rounded text-[13px] font-mono font-extrabold relative transition-colors cursor-pointer flex items-center justify-center ${
                              cell
                                ? cell.table_id && tableColorIndex.has(cell.table_id)
                                  ? getTableCellClasses(cell.table_id, tableColorIndex.get(cell.table_id)!, cell.role)
                                  : ROLE_COLORS[cell.role] || "bg-muted text-muted-foreground"
                                : isEditable ? "bg-transparent hover:bg-muted/50 text-transparent hover:text-muted-foreground" : "bg-transparent text-transparent"
                            } ${cell?.is_locked ? "ring-1 ring-yellow-500/40" : ""} ${isActiveCell ? "ring-2 ring-primary" : ""} ${!isEditable ? "cursor-default" : ""}`}
                            title={tableName ? `${cell?.role} @ ${tableName}` : cell?.role}
                          >
                            {displayLabel}
                            {cell?.is_locked && <Lock className="w-2 h-2 absolute top-0.5 right-0.5 text-yellow-600 dark:text-yellow-400" />}
                          </div>
                          {/* Per-cell lock toggle for managers */}
                          {isEditable && isManager && cell && !isActiveCell && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToggleCellLock(dealer.id, slot); }}
                              className="absolute bottom-0.5 right-0.5 p-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-yellow-600 dark:hover:text-yellow-400 transition-opacity z-10"
                              title={cell.is_locked ? "Unlock cell" : "Lock cell"}
                            >
                              {cell.is_locked ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                            </button>
                          )}
                          {/* Inline role picker dropdown */}
                          {isActiveCell && (
                            <div className={`absolute z-50 ${activeCell?.dropUp ? "bottom-8" : "top-8"} left-0 bg-popover border border-border rounded-md shadow-lg p-1 min-w-[100px]`}
                              onMouseLeave={() => setActiveCell(null)}>
                              <div className="flex flex-wrap gap-0.5 mb-1">
                                <button onClick={() => handleRoleSelect("BR")}
                                  title="Break"
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-colors ${ROLE_COLORS["BR"] || "bg-muted text-muted-foreground"} hover:opacity-80`}>
                                  BR
                                </button>
                                <button onClick={() => handleRoleSelect("TR")}
                                  title="Training"
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-colors ${ROLE_COLORS["TR"] || "bg-muted text-muted-foreground"} hover:opacity-80`}>
                                  TR
                                </button>
                                <button onClick={() => handleRoleSelect("SRT")}
                                  title="Sorting"
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-colors ${ROLE_COLORS["SRT"] || "bg-muted text-muted-foreground"} hover:opacity-80`}>
                                  SRT
                                </button>
                                <button onClick={() => handleRoleSelect("CLS")}
                                  title="Closing"
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-colors ${ROLE_COLORS["CLS"] || "bg-muted text-muted-foreground"} hover:opacity-80`}>
                                  CLS
                                </button>
                                <button onClick={() => handleRoleSelect("S")}
                                  title="Sick — fills all remaining slots until shift end"
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-colors ${ROLE_COLORS["S"] || "bg-muted text-muted-foreground"} hover:opacity-80`}>
                                  S
                                </button>
                                <button onClick={() => handleRoleSelect("SP")}
                                  title="Suspend — hides dealer from grid for the day"
                                  className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-colors bg-red-500/20 text-red-600 dark:text-red-300 ring-1 ring-red-500/40 hover:opacity-80">
                                  SP
                                </button>
                                <button onClick={() => handleRoleSelect("LT")}
                                  title="Late — each slot deducts 20 min from shift"
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-colors ${ROLE_COLORS["LT"] || "bg-muted text-muted-foreground"} hover:opacity-80`}>
                                  LT
                                </button>

                              </div>
                              {openTables.length > 0 && (
                                <div className="border-t border-border pt-1 space-y-0.5">
                                  <p className="text-[8px] text-muted-foreground uppercase px-1">Assign to table</p>
                                  {openTables.map(t => {
                                    const roles = TABLE_ROLES[t.game] || [];
                                    const rSuffix: Record<string, string> = {
                                      ARi: "i", ARc: "c", AR1i: "i", AR1c: "c",
                                      Pi: "i", BJi: "i",
                                    };
                                    // Slots already taken on this table for this time slot (by other dealers)
                                    const takenSlots = new Set(
                                      breaklist
                                        .filter((b: any) =>
                                          b.table_id === t.id &&
                                          b.time_slot === activeCell!.timeSlot &&
                                          b.dealer_id !== activeCell!.dealerId,
                                        )
                                        .map((b: any) => roleSlot(b.role))
                                        .filter(Boolean),
                                    );
                                    const availableRoles = roles.filter(r => {
                                      const s = roleSlot(r);
                                      return !s || !takenSlots.has(s);
                                    });
                                    if (availableRoles.length === 0) return null;
                                    return (
                                      <div key={t.id} className="flex items-center gap-0.5 px-1">
                                        <span className="text-[9px] font-mono text-card-foreground min-w-[28px]">{t.name}</span>
                                        {availableRoles.map(r => (
                                          <button key={r} onClick={() => handleRoleSelect(r, t.id)}
                                            className={`px-1 py-0.5 rounded text-[8px] font-mono font-bold ${getTableCellClasses(t.id, tableColorIndex.get(t.id) ?? 0, r)} hover:opacity-80`}>
                                            {t.name}{rSuffix[r] || ""}
                                          </button>
                                        ))}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* HR comment dialog — opens after marking A / S / SP / LT so the
          operator can attach a short note that lands in staff_warnings. */}
      <Dialog open={!!commentFor} onOpenChange={(o) => { if (!o) setCommentFor(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1 rounded text-[10px] font-mono font-bold bg-muted">{commentFor?.label}</span>
              <span>{commentFor?.dealerName}</span>
              <span className="text-muted-foreground text-sm font-normal">· {commentFor?.kind}</span>
            </DialogTitle>
          </DialogHeader>
          {commentFor?.kind === "Suspend" && (
            <div className="flex items-center gap-2 px-1">
              <label className="text-xs text-muted-foreground">Apply Suspend for</label>
              <input
                type="number"
                min={1}
                max={60}
                value={suspendDays}
                onChange={(e) => setSuspendDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                className="w-16 h-7 px-2 text-sm font-mono rounded border border-border bg-background"
              />
              <span className="text-xs text-muted-foreground">consecutive day(s), starting today</span>
            </div>
          )}
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Short note for HR (optional)…"
            rows={4}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (!commentFor) return;
                handleCommentSave();
              }
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCommentFor(null)}>Skip</Button>
            <Button
              disabled={upsertWarningComment.isPending}
              onClick={handleCommentSave}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>

  );
};

export default BreaklistGrid;
