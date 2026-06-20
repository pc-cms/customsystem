import { useState, useMemo, useEffect, useRef } from "react";
import EmployeePhotoCell from "@/components/EmployeePhotoCell";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, ChevronLeft, ChevronRight, ArrowUpDown, Printer, Building2, Lock } from "lucide-react";
import { getBusinessDate } from "@/lib/business-day";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  useStaffMembers, useCreateStaffMember, useUpdateStaffMember, useDeleteStaffMember,
  useStaffRotaRange, useSetStaffRota,
  useDeleteStaffRota, useStaffAttendanceRange, useSetStaffAttendance,
  DEPARTMENT_LABELS, DEPARTMENT_ORDER, STAFF_SHIFT_LABELS, STAFF_SHIFT_COLORS,
  ROTA_GROUPS, type StaffDepartment, type RotaGroupKey,
} from "@/hooks/use-staff";
import { Trash2 } from "lucide-react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

import { UNIFIED_ATT_COLORS, UNIFIED_SHIFT_TINTS } from "@/lib/shift-colors";
import { useClosedBusinessDates, useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { CellPicker } from "@/components/grids/CellPicker";
import { useRotaLock, type RotaScope } from "@/hooks/use-rota-lock";
import RotaLockButton from "@/components/rota/RotaLockButton";
import RotaExcelButtons from "@/components/rota/RotaExcelButtons";
const ATT_COLORS = UNIFIED_ATT_COLORS;

const DEPT_BADGE_COLORS: Record<string, string> = {
  security: "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30",
  cashier: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30",
  bartender: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30",
  hostess: "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/20 dark:text-pink-400 dark:border-pink-500/30",
  waiter: "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/20 dark:text-cyan-400 dark:border-cyan-500/30",
  cleaner: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30",
  it: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/20 dark:text-violet-400 dark:border-violet-500/30",
  hr: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30",
  driver: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/20 dark:text-teal-400 dark:border-teal-500/30",
  reception: "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30",
};

const DEPT_BORDER_COLORS: Record<string, string> = {
  security: "border-red-500/50",
  cashier: "border-blue-500/50",
  bartender: "border-amber-500/50",
  hostess: "border-pink-500/50",
  waiter: "border-cyan-500/50",
  cleaner: "border-emerald-500/50",
  it: "border-violet-500/50",
  hr: "border-orange-500/50",
  driver: "border-teal-500/50",
  reception: "border-rose-500/50",
};

const DEPT_DOT_COLORS: Record<string, string> = {
  security: "bg-red-400",
  cashier: "bg-blue-400",
  bartender: "bg-amber-400",
  hostess: "bg-pink-400",
  waiter: "bg-cyan-400",
  cleaner: "bg-emerald-400",
  it: "bg-violet-400",
  hr: "bg-orange-400",
  driver: "bg-teal-400",
  reception: "bg-rose-400",
};

const DEPT_ROW_COLORS: Record<string, string> = {
  security: "bg-red-500/5",
  cashier: "bg-blue-500/5",
  bartender: "bg-amber-500/5",
  hostess: "bg-pink-500/5",
  waiter: "bg-cyan-500/5",
  cleaner: "bg-emerald-500/5",
  it: "bg-violet-500/5",
  hr: "bg-orange-500/5",
  driver: "bg-teal-500/5",
  reception: "bg-rose-500/5",
};

interface StaffProps {
  forcedTab?: "employee" | "attendance" | "rota_floor" | "rota_security" | "rota_office";
  forcedGroup?: "floor" | "security" | "office";
}

const Staff = ({ forcedTab, forcedGroup }: StaffProps = {}) => {
  const { isManager: isMgr, roles } = useAuth();
  // Only manager/HR (and super_admin via isManager) can edit Floor/Security/Office schedules.
  // Pit can navigate here (read-only) but must not write to non-Live-Game personnel.
  const canManagePersonnel = isMgr || roles.includes("hr");
  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const businessToday = serverBusinessDate || getBusinessDate();
  const currentMonth = useMemo(() => {
    const [y, m] = businessToday.split("-").map(Number);
    return `${y}-${String(m).padStart(2, "0")}`;
  }, [businessToday]);
  const [month, setMonth] = useState(currentMonth);

  const navigateMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setMonth(next);
  };

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
  }, [month]);

  const [searchParams] = useSearchParams();
  const activeTab = forcedTab || searchParams.get("tab") || "employee";

  const isRotaTab = activeTab.startsWith("rota_");
  const isPast = month < currentMonth;
  // Rota allows next month (filled in advance); Attendance does not.
  const canGoNext = isRotaTab ? true : month < currentMonth;

  const rotaGroupKey = isRotaTab ? activeTab.replace("rota_", "") as RotaGroupKey : null;
  const rotaGroup = rotaGroupKey ? ROTA_GROUPS[rotaGroupKey] : null;

  // Map staff rota group → rota_locks scope
  const lockScope: RotaScope | null = rotaGroupKey === "floor" ? "floor" : rotaGroupKey === "security" ? "security" : rotaGroupKey === "office" ? "office" : null;
  const { data: groupLock } = useRotaLock(lockScope ?? "floor", month);
  const isLocked = isRotaTab && !!groupLock;

  // Attendance is scoped to a group (mirrors Rota grouping). Default: floor.
  const attGroupParam = (forcedGroup || searchParams.get("group") || "floor") as RotaGroupKey;
  const attGroupKey: RotaGroupKey = (ROTA_GROUPS as any)[attGroupParam] ? attGroupParam : "floor";

  const showMonthNav = isRotaTab || activeTab === "attendance";

  const TAB_TITLES: Record<string, string> = {
    employee: "Floor Staff",
    rota_office: "Office Rota",
    rota_floor: "Floor Rota",
    rota_security: "Security Rota",
    attendance: "Floor Attendance",
  };

  const printRota = () => {
    const html = document.documentElement;
    const wasDark = html.classList.contains('dark');
    if (wasDark) html.classList.remove('dark');
    window.print();
    if (wasDark) html.classList.add('dark');
  };

  // Excel template/import for Staff rotas (Floor / Security / Office)
  const rotaMonthStart = `${month}-01`;
  const rotaMonthEnd = useMemo(() => {
    const [yy, mm] = month.split("-").map(Number);
    const dim = new Date(yy, mm, 0).getDate();
    return `${month}-${String(dim).padStart(2, "0")}`;
  }, [month]);
  const { data: allStaff = [] } = useStaffMembers();
  const { data: staffRotaForExcel = [] } = useStaffRotaRange(rotaMonthStart, rotaMonthEnd);
  const setStaffRotaForExcel = useSetStaffRota();
  const excelEmployees = useMemo(() => {
    if (!rotaGroup) return [];
    const deptSet = new Set(rotaGroup.departments as readonly string[]);
    return (allStaff as any[])
      .filter(s => s.is_active && deptSet.has(s.department))
      .map(s => ({ id: s.id as string, name: s.name as string, department: DEPARTMENT_LABELS[s.department as StaffDepartment] || null }));
  }, [allStaff, rotaGroup]);
  const excelExisting = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of staffRotaForExcel as any[]) {
      if (r?.shift) m.set(`${r.staff_id}|${r.date}`, String(r.shift).toUpperCase());
    }
    return m;
  }, [staffRotaForExcel]);


  return (
    <div>
      <PageHeader
        icon={Building2}
        title={activeTab === "attendance" ? `${ROTA_GROUPS[attGroupKey].label} Attendance` : (TAB_TITLES[activeTab] || "Floor")}
        subtitle="Floor Management"
        centerSlot={
          <div className="flex items-center gap-3 flex-wrap justify-center no-print">
            {showMonthNav && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateMonth(-1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-semibold text-card-foreground min-w-[140px] text-center inline-flex items-center justify-center gap-1.5">
                  {monthLabel}
                  {isPast && !isMgr && <Lock className="w-3 h-3 text-muted-foreground" />}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => canGoNext && navigateMonth(1)} disabled={!canGoNext}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
            {isRotaTab && lockScope && <RotaLockButton scope={lockScope} month={month} />}
            {isRotaTab && rotaGroup && (
              <div className="flex items-center gap-1.5 flex-nowrap whitespace-nowrap overflow-x-auto py-0.5">
                {rotaGroup.shifts.map(s => (
                  <span key={s} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono ${STAFF_SHIFT_COLORS[s]}`}>
                    <span className="font-bold">{s}</span>
                    <span className="opacity-80">{rotaGroup.shiftLabels[s]}</span>
                  </span>
                ))}
              </div>
            )}
            {activeTab === "attendance" && (
              <div className="flex items-center gap-1.5 flex-nowrap whitespace-nowrap overflow-x-auto py-0.5">
                {(["D", "N"] as const).map(s => (
                  <span key={s} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono ${STAFF_SHIFT_COLORS[s]}`}>
                    <span className="font-bold">{s}</span>
                    <span className="opacity-80">{STAFF_SHIFT_LABELS[s]}</span>
                  </span>
                ))}
                <span className="mx-1 h-4 w-px bg-border" />
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono ${ATT_COLORS["A"]}`}>
                  <span className="font-bold">A</span><span className="opacity-80">Absent</span>
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono ${ATT_COLORS["S"]}`}>
                  <span className="font-bold">S</span><span className="opacity-80">Sick</span>
                </span>
              </div>
            )}
          </div>
        }
      >
        {isRotaTab && rotaGroup && canManagePersonnel && (
          <RotaExcelButtons
            scope={rotaGroupKey || "floor"}
            month={month}
            title={`${rotaGroup.label} Rota — ${monthLabel}`}
            employees={excelEmployees}
            existing={excelExisting}
            allowedShifts={rotaGroup.shifts}
            shiftLabels={rotaGroup.shiftLabels}
            onSetCell={(id, date, shift) => setStaffRotaForExcel.mutateAsync({ staff_id: id, date, shift })}
            disabled={isLocked}
          />
        )}
        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={printRota}>
          <Printer className="w-3.5 h-3.5" /> Print
        </Button>
      </PageHeader>


      {activeTab === "employee" && <EmployeeList />}
      {isRotaTab && rotaGroupKey && <StaffRotaGrid month={month} groupKey={rotaGroupKey} monthLabel={monthLabel} readOnly={(isPast && !isMgr) || !canManagePersonnel || isLocked} />}
      {activeTab === "attendance" && <StaffAttendanceGrid month={month} monthLabel={monthLabel} groupKey={attGroupKey} readOnly={(isPast && !isMgr) || !canManagePersonnel} />}
    </div>
  );
};

// =================== EMPLOYEE LIST (UNIFIED TABLE WITH SORTING) ===================
const getDaysLeft = (contractEnd: string | null): number | null => {
  if (!contractEnd) return null;
  const end = new Date(contractEnd);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

const EmployeeList = () => {
  const { isManager, roles } = useAuth();
  // HR role has full personnel management access (no manager confirmation needed)
  const canManage = isManager || roles.includes("hr");
  const { data: staff = [] } = useStaffMembers();
  const createStaff = useCreateStaffMember();
  const updateStaff = useUpdateStaffMember();
  const deleteStaff = useDeleteStaffMember();
  const [name, setName] = useState("");
  const [dept, setDept] = useState<StaffDepartment>("waiter");
  const [sortBy, setSortBy] = useState<string>("department");
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  const canSeePhoto = roles.some(r => ["manager", "surveillance", "hr", "super_admin", "finance_manager"].includes(r));

  const sorted = useMemo(() => {
    let list = [...staff] as any[];
    if (filterDept !== "all") list = list.filter(s => s.department === filterDept);
    if (filterStatus === "active") list = list.filter(s => s.is_active);
    else if (filterStatus === "fired") list = list.filter(s => !s.is_active);

    list.sort((a, b) => {
      switch (sortBy) {
        case "department": {
          const dA = DEPARTMENT_ORDER.indexOf(a.department as StaffDepartment);
          const dB = DEPARTMENT_ORDER.indexOf(b.department as StaffDepartment);
          return dA !== dB ? dA - dB : a.name.localeCompare(b.name);
        }
        case "name": return a.name.localeCompare(b.name);
        case "salary": return (b.salary || 0) - (a.salary || 0);
        case "onboarding": return (a.onboarding_date || "9999").localeCompare(b.onboarding_date || "9999");
        case "contract_end": return (a.contract_end || "9999").localeCompare(b.contract_end || "9999");
        case "days_left": {
          const daysA = getDaysLeft(a.contract_end);
          const daysB = getDaysLeft(b.contract_end);
          return (daysA ?? 99999) - (daysB ?? 99999);
        }
        default: return 0;
      }
    });
    return list;
  }, [staff, sortBy, filterDept, filterStatus]);

  const calcYears = (startDate: string | null) => {
    if (!startDate) return "—";
    const start = new Date(startDate);
    const now = new Date();
    const years = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (years < 1) return `${Math.floor(years * 12)}m`;
    return `${Math.floor(years)}y ${Math.floor((years % 1) * 12)}m`;
  };

  const formatSalary = (s: number | null) => {
    if (!s) return "—";
    return s.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };

  const startEdit = (id: string, field: string, currentValue: string) => {
    setEditingCell({ id, field });
    setEditValue(currentValue);
  };

  const saveEdit = () => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    if (field === "name") {
      if (editValue.trim()) updateStaff.mutate({ id, name: editValue.trim() });
    } else if (field === "salary") {
      const num = parseInt(editValue.replace(/\s/g, ""), 10);
      updateStaff.mutate({ id, salary: isNaN(num) ? null : num });
    } else if (field === "contract_start" || field === "contract_end" || field === "onboarding_date") {
      updateStaff.mutate({ id, [field]: editValue || null });
    }
    setEditingCell(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") setEditingCell(null);
  };

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-2 cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => setSortBy(field)}>
      <span className="inline-flex items-center gap-1">{label} {sortBy === field && <ArrowUpDown className="w-3 h-3" />}</span>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {DEPARTMENT_ORDER.map(d => (
              <SelectItem key={d} value={d}>{DEPARTMENT_LABELS[d]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="fired">Fired</SelectItem>
          </SelectContent>
        </Select>
        <div className="w-px h-6 bg-border mx-1" />
        <Input placeholder="Name" value={name} onChange={e => setName(e.target.value)} className="w-[200px]" disabled={!canManage}
          onKeyDown={e => { if (e.key === "Enter" && name && canManage) { createStaff.mutate({ name, department: dept }); setName(""); } }}
        />
        <Select value={dept} onValueChange={v => setDept(v as StaffDepartment)} disabled={!canManage}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DEPARTMENT_ORDER.map(d => (
              <SelectItem key={d} value={d}>{DEPARTMENT_LABELS[d]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => { if (name && canManage) { createStaff.mutate({ name, department: dept }); setName(""); } else if (!canManage) { toast.error("Manager or HR access required"); } }} disabled={!name || !canManage}>
          <UserPlus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      <div className="cms-panel overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {canSeePhoto && <th className="text-left text-xs font-medium text-muted-foreground uppercase px-2 py-2 w-10">📷</th>}
              <SortHeader field="name" label="Name" />
              <SortHeader field="department" label="Department" />
              <SortHeader field="salary" label="Salary" />
              <SortHeader field="onboarding" label="Onboarding" />
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-2">Contract Start</th>
              <SortHeader field="contract_end" label="Contract End" />
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-2">Years</th>
              <SortHeader field="days_left" label="Days Left" />
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-2">Status</th>
              {canManage && <th className="text-center text-xs font-medium text-muted-foreground uppercase px-2 py-2 w-10">Del</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s: any) => {
              const daysLeft = getDaysLeft(s.contract_end);
              return (
                <tr key={s.id} className={`border-b border-border last:border-0 ${DEPT_ROW_COLORS[s.department] || ""}`}>
                  {canSeePhoto && (
                    <EmployeePhotoCell
                      id={s.id}
                      name={s.name}
                      photoUrl={s.photo_url}
                      onUpdate={(id, url) => updateStaff.mutate({ id, photo_url: url })}
                      canManage={canManage}
                    />
                  )}
                  <td className="px-4 py-2 text-sm text-card-foreground font-medium cursor-pointer hover:bg-muted/30"
                    onClick={() => canManage && startEdit(s.id, "name", s.name)}>
                    {editingCell?.id === s.id && editingCell.field === "name" ? (
                      <Input className="h-7 w-40 text-sm" value={editValue} autoFocus
                        onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={handleEditKeyDown} />
                    ) : s.name}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium border ${DEPT_BADGE_COLORS[s.department] || ""}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${DEPT_DOT_COLORS[s.department] || "bg-muted-foreground"}`} />
                      {DEPARTMENT_LABELS[s.department as StaffDepartment]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-card-foreground font-mono cursor-pointer hover:bg-muted/30"
                    onClick={() => startEdit(s.id, "salary", s.salary?.toString() || "")}>
                    {editingCell?.id === s.id && editingCell.field === "salary" ? (
                      <Input className="h-7 w-24 font-mono text-sm" value={editValue} autoFocus
                        onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={handleEditKeyDown} />
                    ) : formatSalary(s.salary)}
                  </td>
                  <td className="px-4 py-2 text-sm text-muted-foreground font-mono cursor-pointer hover:bg-muted/30"
                    onClick={() => startEdit(s.id, "onboarding_date", s.onboarding_date || "")}>
                    {editingCell?.id === s.id && editingCell.field === "onboarding_date" ? (
                      <input type="date" className="h-7 bg-background border border-border rounded px-2 text-sm font-mono text-foreground"
                        value={editValue} autoFocus onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={handleEditKeyDown} />
                    ) : s.onboarding_date || "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-muted-foreground font-mono cursor-pointer hover:bg-muted/30"
                    onClick={() => startEdit(s.id, "contract_start", s.contract_start || "")}>
                    {editingCell?.id === s.id && editingCell.field === "contract_start" ? (
                      <input type="date" className="h-7 bg-background border border-border rounded px-2 text-sm font-mono text-foreground"
                        value={editValue} autoFocus onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={handleEditKeyDown} />
                    ) : s.contract_start || "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-muted-foreground font-mono cursor-pointer hover:bg-muted/30"
                    onClick={() => startEdit(s.id, "contract_end", s.contract_end || "")}>
                    {editingCell?.id === s.id && editingCell.field === "contract_end" ? (
                      <input type="date" className="h-7 bg-background border border-border rounded px-2 text-sm font-mono text-foreground"
                        value={editValue} autoFocus onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={handleEditKeyDown} />
                    ) : s.contract_end || "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-muted-foreground font-mono">{calcYears(s.onboarding_date)}</td>
                  <td className="px-4 py-2">
                    <span className={`font-mono text-xs font-bold ${daysLeft === null ? "text-muted-foreground" : daysLeft <= 40 ? "text-red-600 dark:text-red-400" : daysLeft <= 90 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {daysLeft === null ? "—" : `${daysLeft}d`}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <button onClick={() => {
                      if (!canManage) { toast.error("Manager or HR access required"); return; }
                      updateStaff.mutate({ id: s.id, is_active: !s.is_active });
                    }}
                      className={`text-xs font-medium cursor-pointer hover:underline ${s.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {s.is_active ? "Active" : "Fired"}
                    </button>
                  </td>
                  {canManage && (
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => {
                          if (!window.confirm(`Permanently delete "${s.name}"? This cannot be undone. Use only to remove mistakenly entered names.`)) return;
                          deleteStaff.mutate(s.id, {
                            onSuccess: () => toast.success("Employee deleted"),
                            onError: (e: any) => toast.error(e?.message || "Delete failed"),
                          });
                        }}
                        title="Delete employee permanently"
                        className="inline-flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};


// =================== STAFF ROTA GRID ===================
const StaffRotaGrid = ({ month, groupKey, monthLabel, readOnly = false }: { month: string; groupKey: RotaGroupKey; monthLabel: string; readOnly?: boolean }) => {
  const group = ROTA_GROUPS[groupKey];
  const groupShifts = group.shifts as readonly string[];
  const [filterDept, setFilterDept] = useState<string>("all");
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const startDate = `${month}-01`;
  const endDate = `${month}-${String(daysInMonth).padStart(2, "0")}`;

  const { data: staff = [] } = useStaffMembers();
  const { data: rota = [] } = useStaffRotaRange(startDate, endDate);
  const { data: monthAttendance = [] } = useStaffAttendanceRange(startDate, endDate);
  const setRotaRaw = useSetStaffRota();
  const deleteRotaRaw = useDeleteStaffRota();
  const guard = () => { if (readOnly) { toast.error("Read-only — Manager or HR access required"); return false; } return true; };
  const setRota = { mutate: (v: any) => { if (guard()) setRotaRaw.mutate(v); } };
  const deleteRota = { mutate: (v: any) => { if (guard()) deleteRotaRaw.mutate(v); } };

  const activeStaff = useMemo(() =>
    staff.filter(s => s.is_active && (group.departments as readonly string[]).includes(s.department)),
    [staff, group.departments]
  );

  const today = new Date();
  const todayDay = today.getDate();
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m;

  const getRotaEntry = (staffId: string, day: number) => {
    const dateStr = `${month}-${String(day).padStart(2, "0")}`;
    return rota.find((r: any) => r.staff_id === staffId && r.date === dateStr);
  };

  const getAttendanceEntry = (staffId: string, day: number) => {
    const dateStr = `${month}-${String(day).padStart(2, "0")}`;
    return monthAttendance.find((a: any) => a.staff_id === staffId && a.date === dateStr);
  };

  const getDisplayShift = (staffId: string, day: number): { shift: string; isAuto: boolean } | null => {
    const rotaEntry = getRotaEntry(staffId, day);
    if (rotaEntry) return { shift: rotaEntry.shift, isAuto: false };
    const att = getAttendanceEntry(staffId, day);
    if (att) {
      const val = String((att as any).value);
      const num = Number(val);
      if (!isNaN(num) && num > 0) return { shift: "E", isAuto: true };
    }
    return null;
  };

  const handleClick = (staffId: string, day: number) => {
    const dateStr = `${month}-${String(day).padStart(2, "0")}`;
    const current = getRotaEntry(staffId, day);
    if (!current) {
      setRota.mutate({ staff_id: staffId, date: dateStr, shift: groupShifts[0] });
    } else {
      const idx = groupShifts.indexOf(current.shift);
      if (idx >= 0 && idx < groupShifts.length - 1) {
        setRota.mutate({ staff_id: staffId, date: dateStr, shift: groupShifts[idx + 1] });
      } else {
        deleteRota.mutate({ staff_id: staffId, date: dateStr });
      }
    }
  };

  const focusNextCell = (current: HTMLElement) => {
    const td = current.closest("td");
    const nextTd = td?.nextElementSibling;
    const nextBtn = nextTd?.querySelector("button") as HTMLElement;
    if (nextBtn) { nextBtn.focus(); return; }
    const tr = td?.closest("tr");
    const nextRow = tr?.nextElementSibling;
    const firstBtn = nextRow?.querySelector("td:nth-child(2) button") as HTMLElement;
    firstBtn?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent, staffId: string, day: number) => {
    const key = e.key.toUpperCase();
    const dateStr = `${month}-${String(day).padStart(2, "0")}`;
    if (groupShifts.includes(key)) {
      e.preventDefault();
      setRota.mutate({ staff_id: staffId, date: dateStr, shift: key });
      focusNextCell(e.target as HTMLElement);
    } else if (key === " " || e.code === "Space") {
      e.preventDefault();
      focusNextCell(e.target as HTMLElement);
    } else if (key === "BACKSPACE" || key === "DELETE") {
      e.preventDefault();
      deleteRota.mutate({ staff_id: staffId, date: dateStr });
    } else if (key === "ARROWRIGHT" || key === "TAB") {
      e.preventDefault();
      focusNextCell(e.target as HTMLElement);
    } else if (key === "ARROWLEFT") {
      e.preventDefault();
      const prev = (e.target as HTMLElement)?.closest("td")?.previousElementSibling?.querySelector("button") as HTMLElement;
      prev?.focus();
    } else if (key === "ARROWDOWN") {
      e.preventDefault();
      const td = (e.target as HTMLElement).closest("td");
      const idx2 = td ? Array.from(td.parentElement!.children).indexOf(td) : -1;
      const nextRow = td?.closest("tr")?.nextElementSibling;
      (nextRow?.children[idx2]?.querySelector("button") as HTMLElement)?.focus();
    } else if (key === "ARROWUP") {
      e.preventDefault();
      const td = (e.target as HTMLElement).closest("td");
      const idx2 = td ? Array.from(td.parentElement!.children).indexOf(td) : -1;
      const prevRow = td?.closest("tr")?.previousElementSibling;
      (prevRow?.children[idx2]?.querySelector("button") as HTMLElement)?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent, staffId: string, day: number) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").trim().toUpperCase();
    const dateStr = `${month}-${String(day).padStart(2, "0")}`;
    const values = text.split(/[\s,]+/);
    if (values.length === 1 && groupShifts.includes(values[0])) {
      setRota.mutate({ staff_id: staffId, date: dateStr, shift: values[0] });
    } else if (values.length > 1) {
      values.forEach((v, i) => {
        const d = day + i;
        if (d <= daysInMonth && groupShifts.includes(v)) {
          const ds = `${month}-${String(d).padStart(2, "0")}`;
          setRota.mutate({ staff_id: staffId, date: ds, shift: v });
        }
      });
    }
  };

  const grouped = useMemo(() => {
    const groups: Record<string, typeof activeStaff> = {};
    (group.departments as readonly string[]).forEach(d => { groups[d] = []; });
    activeStaff.forEach(s => {
      if (!groups[s.department]) groups[s.department] = [];
      groups[s.department].push(s);
    });
    return groups;
  }, [activeStaff, group.departments]);

  const deptList = group.departments as readonly StaffDepartment[];
  const showFilter = deptList.length > 1;

  const visibleDepts = useMemo(() => {
    const nonEmpty = deptList.filter(d => (grouped[d] || []).length > 0);
    if (filterDept === "all") return nonEmpty;
    return nonEmpty.filter(d => d === filterDept);
  }, [filterDept, grouped, deptList]);

  const getStats = (staffId: string) => {
    const counts: Record<string, number> = {};
    days.forEach(day => {
      const display = getDisplayShift(staffId, day);
      if (display) counts[display.shift] = (counts[display.shift] || 0) + 1;
    });
    return counts;
  };

  // Determine summary shift keys (first two non-leave/off shifts)
  const summaryShifts = groupShifts.filter(s => s !== "L" && s !== "E" && s !== "O");

  const renderTableHeader = () => (
    <thead>
      <tr className="border-b border-border">
        <th className="text-left text-xs font-medium text-muted-foreground uppercase px-1 py-2 sticky left-0 bg-card z-10 w-[180px]">
          Staff
        </th>
        {days.map(day => {
          const dateObj = new Date(y, m - 1, day);
          const weekday = WEEKDAYS[dateObj.getDay()];
          const isToday = isCurrentMonth && day === todayDay;
          const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
          return (
            <th key={day} className={`text-center px-0 py-1 border-l border-border/25 ${isToday ? "bg-primary/40" : isWeekend ? "bg-muted/30" : ""}`}>
              <div className="text-[9px] text-muted-foreground leading-tight">{weekday}</div>
              <div className={`text-xs font-mono leading-tight ${isToday ? "text-primary font-bold" : "text-card-foreground"}`}>{day}</div>
            </th>
          );
        })}
        {summaryShifts.slice(0, 2).map(s => (
          <th key={s} className="text-center text-[10px] font-medium text-muted-foreground uppercase px-1 py-2 w-8">{s}</th>
        ))}
      </tr>
    </thead>
  );

  // Floor page break logic: Bar+Housekeeping on page 1, Waiters+Hostess+Reception on page 2
  const FLOOR_PAGE1_DEPTS = ["bartender", "cleaner"];

  const shouldBreakAfter = (dept: string, idx: number) => {
    // If only one dept visible (filtered), no break
    if (visibleDepts.length <= 1) return false;
    // Last dept never gets a break
    if (idx === visibleDepts.length - 1) return false;
    // For floor group with "all" filter: break after cleaner (page 1 = bar+housekeeping)
    if (groupKey === "floor" && filterDept === "all" && FLOOR_PAGE1_DEPTS.includes(dept)) {
      const nextDept = visibleDepts[idx + 1];
      return !FLOOR_PAGE1_DEPTS.includes(nextDept);
    }
    // For other groups or single-dept groups: break between each dept table
    if (groupKey !== "floor" || filterDept !== "all") return true;
    return false;
  };

  const printTitle = `${group.label} Rota`;
  const printLegend = group.shifts.filter(s => s !== "O").map(s => ({
    code: s,
    label: group.shiftLabels[s],
  }));

  return (
    <>
      {/* Department filter (only if multiple departments) */}
      {showFilter && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap no-print">
          <button
            onClick={() => setFilterDept("all")}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${filterDept === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            All
          </button>
          {deptList.map(d => {
            const count = (grouped[d] || []).length;
            if (count === 0) return null;
            return (
              <button
                key={d}
                onClick={() => setFilterDept(filterDept === d ? "all" : d)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                  filterDept === d
                    ? DEPT_BADGE_COLORS[d]
                    : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${DEPT_DOT_COLORS[d]}`} />
                {DEPARTMENT_LABELS[d]} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Render each department as a separate table for clean page breaks */}
      {visibleDepts.map((dept, deptIdx) => {
        const members = grouped[dept] || [];
        const isFirstOnPage = deptIdx === 0 ||
          (groupKey === "floor" && filterDept === "all" && !FLOOR_PAGE1_DEPTS.includes(dept) && FLOOR_PAGE1_DEPTS.includes(visibleDepts[deptIdx - 1]));

        return (
          <div
            key={dept}
            className={`cms-panel overflow-hidden print-target ${deptIdx < visibleDepts.length - 1 ? "mb-3" : ""} ${shouldBreakAfter(dept, deptIdx) ? "print-page-break" : ""}`}
          >
            {/* Print header — visible only when printing, shown at top of each page section */}
            {isFirstOnPage && (
              <div className="hidden print-header">
                <span className="print-header-title">{printTitle}</span>
                <span className="print-header-month">{monthLabel}</span>
                <div className="print-header-legend">
                  {printLegend.map(l => (
                    <span key={l.code} style={{
                      background: l.code === "D" || l.code === "M" ? "#fef3c7" : l.code === "N" ? "#e0f2fe" : l.code === "G" ? "#e0e7ff" : l.code === "L" ? "#d1fae5" : l.code === "E" ? "#f3e8ff" : "#f3f4f6",
                      color: l.code === "D" || l.code === "M" ? "#b45309" : l.code === "N" ? "#0369a1" : l.code === "G" ? "#4338ca" : l.code === "L" ? "#047857" : l.code === "E" ? "#6b21a8" : "#374151",
                    }}>
                      {l.code} = {l.label}
                    </span>
                  ))}
                  <span style={{ background: "#f3f4f6", color: "#374151" }}>O = Off</span>
                </div>
              </div>
            )}
            <table className="w-full border-collapse table-fixed">
              {renderTableHeader()}
              <tbody>
                <DepartmentBlock
                  dept={dept}
                  members={members}
                  days={days}
                  month={month}
                  y={y}
                  m={m}
                  isCurrentMonth={isCurrentMonth}
                  todayDay={todayDay}
                  getDisplayShift={getDisplayShift}
                  groupShifts={groupShifts as readonly string[]}
                  shiftLabels={group.shiftLabels as Record<string, string>}
                  handleKeyDown={handleKeyDown}
                  handlePaste={handlePaste}
                  onSet={(staffId, day, shift) => {
                    const ds = `${month}-${String(day).padStart(2, "0")}`;
                    setRota.mutate({ staff_id: staffId, date: ds, shift });
                  }}
                  onClear={(staffId, day) => {
                    const ds = `${month}-${String(day).padStart(2, "0")}`;
                    deleteRota.mutate({ staff_id: staffId, date: ds });
                  }}
                  getStats={getStats}
                  summaryShifts={summaryShifts}
                />
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Summary per day */}
      <div className="cms-panel overflow-hidden print-target print-summary-section mt-3">
        <table className="w-full border-collapse table-fixed">
          {renderTableHeader()}
          <tbody>
            {summaryShifts.map((shiftKey, si) => (
              <tr key={shiftKey} className={si === 0 ? "border-t-2 border-border" : ""}>
                <td className="px-1 py-1 text-[9px] font-mono font-bold text-card-foreground sticky left-0 bg-card z-10">Σ {shiftKey}</td>
                {days.map(day => {
                  const filteredStaff = filterDept === "all" ? activeStaff : activeStaff.filter(s => s.department === filterDept);
                  const count = filteredStaff.filter(s => getDisplayShift(s.id, day)?.shift === shiftKey).length;
                  return <td key={day} className="text-center text-[9px] font-mono font-bold text-card-foreground">{count || ""}</td>;
                })}
                <td colSpan={2} />
              </tr>
            ))}
            <tr>
              <td className="px-1 py-1 text-[9px] font-mono font-bold text-card-foreground sticky left-0 bg-card z-10">Σ All</td>
              {days.map(day => {
                const filteredStaff = filterDept === "all" ? activeStaff : activeStaff.filter(s => s.department === filterDept);
                const count = filteredStaff.filter(s => {
                  const sh = getDisplayShift(s.id, day)?.shift;
                  return sh && summaryShifts.includes(sh);
                }).length;
                return <td key={day} className="text-center text-[9px] font-mono font-bold text-card-foreground">{count || ""}</td>;
              })}
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
};
const DepartmentBlock = ({
  dept, members, days, month, y, m, isCurrentMonth, todayDay,
  getDisplayShift, groupShifts, shiftLabels, handleKeyDown, handlePaste, onSet, onClear, getStats, summaryShifts,
}: {
  dept: string;
  members: any[];
  days: number[];
  month: string;
  y: number;
  m: number;
  isCurrentMonth: boolean;
  todayDay: number;
  getDisplayShift: (id: string, day: number) => { shift: string; isAuto: boolean } | null;
  groupShifts: readonly string[];
  shiftLabels: Record<string, string>;
  handleKeyDown: (e: React.KeyboardEvent, id: string, day: number) => void;
  handlePaste: (e: React.ClipboardEvent, id: string, day: number) => void;
  onSet: (id: string, day: number, shift: string) => void;
  onClear: (id: string, day: number) => void;
  getStats: (id: string) => Record<string, number>;
  summaryShifts: string[];
}) => (
  <>
    <tr>
      <td colSpan={days.length + 1 + summaryShifts.slice(0, 2).length} className="px-0 py-0 sticky left-0">
        <div className={`flex items-center gap-2 px-3 py-1 border-b-2 ${DEPT_BORDER_COLORS[dept] || "border-muted"}`}>
          <span className={`w-2 h-2 rounded-full ${DEPT_DOT_COLORS[dept] || "bg-muted-foreground"}`} />
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-card-foreground">{DEPARTMENT_LABELS[dept as StaffDepartment]}</span>
          <span className="text-[10px] font-mono text-muted-foreground">({members.length})</span>
        </div>
      </td>
    </tr>
    {members.map((staff, idx) => {
      const stats = getStats(staff.id);
      return (
        <tr key={staff.id} className={`border-b border-border last:border-0 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
          <td className={`px-3 py-1 text-[13px] font-medium text-card-foreground sticky left-0 z-10 ${idx % 2 === 0 ? "bg-card" : "bg-card/95"}`}>
            <span className="text-muted-foreground font-mono mr-1.5">{idx + 1}.</span>{staff.name}
          </td>
          {days.map(day => {
            const display = getDisplayShift(staff.id, day);
            const isToday = isCurrentMonth && day === todayDay;
            const dateObj = new Date(y, m - 1, day);
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
            return (
              <td key={day} className={`px-0.5 py-0.5 text-center border-l border-border/25 ${isToday ? "bg-primary/25" : isWeekend ? "bg-muted/15" : ""}`}>
                <CellPicker
                  value={display?.shift ?? null}
                  display={display?.shift || "·"}
                  rows={[{
                    options: groupShifts.map(s => ({
                      value: s, label: s,
                      title: shiftLabels[s],
                      className: STAFF_SHIFT_COLORS[s],
                    })),
                  }]}
                  onSelect={(v) => v === null ? onClear(staff.id, day) : onSet(staff.id, day, v)}
                  onKeyDown={e => handleKeyDown(e, staff.id, day)}
                  onPaste={e => handlePaste(e as any, staff.id, day)}
                  cellClassName={`w-full h-8 rounded text-xs font-mono font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-primary ${
                    display
                      ? `${STAFF_SHIFT_COLORS[display.shift] || "bg-muted text-muted-foreground"} ${display.isAuto ? "border border-dashed border-amber-500/50" : ""}`
                      : "bg-transparent hover:bg-muted/50 text-muted-foreground/40 hover:text-muted-foreground"
                  }`}
                />
              </td>
            );
          })}
          {summaryShifts.slice(0, 2).map(s => (
            <td key={s} className="px-2 py-1 text-center border-l border-border/25">
              <span className="text-xs font-mono font-bold text-card-foreground">{stats[s] || ""}</span>
            </td>
          ))}
        </tr>
      );
    })}
  </>
);

// =================== STAFF ATTENDANCE GRID ===================
const StaffAttendanceGrid = ({ month, monthLabel, groupKey = "floor", readOnly = false }: { month: string; monthLabel: string; groupKey?: RotaGroupKey; readOnly?: boolean }) => {
  const group = ROTA_GROUPS[groupKey];
  const groupDepts = group.departments as readonly StaffDepartment[];
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const [filterDept, setFilterDept] = useState<string>("all");

  const startDate = `${month}-01`;
  const endDate = `${month}-${String(daysInMonth).padStart(2, "0")}`;

  const { data: staff = [] } = useStaffMembers();
  const { data: attendance = [] } = useStaffAttendanceRange(startDate, endDate);
  const { data: rota = [] } = useStaffRotaRange(startDate, endDate);
  const { data: closedDates = new Set<string>() } = useClosedBusinessDates(startDate, endDate);
  const { data: effectiveBusinessDate } = useEffectiveBusinessDate();
  const setAttendanceRaw = useSetStaffAttendance();
  const setAttendance = { mutate: (v: any) => {
    if (readOnly) { toast.error("Read-only — Manager or HR access required"); return; }
    setAttendanceRaw.mutate(v);
  } };

  const activeStaff = useMemo(
    () => staff.filter(s => s.is_active && groupDepts.includes(s.department as StaffDepartment)),
    [staff, groupDepts]
  );

  const today = new Date();
  const todayDay = today.getDate();
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m;

  const getValue = (staffId: string, day: number) => {
    const dateStr = `${month}-${String(day).padStart(2, "0")}`;
    const entry = attendance.find((a: any) => a.staff_id === staffId && a.date === dateStr);
    return entry ? String(entry.value) : "";
  };

  const getRotaShift = (staffId: string, day: number): string | null => {
    const dateStr = `${month}-${String(day).padStart(2, "0")}`;
    const entry = rota.find((r: any) => r.staff_id === staffId && r.date === dateStr);
    if (!entry) return null;
    const s = entry.shift as string;
    return (s === "D" || s === "N") ? s : null;
  };

  const handleSave = (staffId: string, day: number, val: string) => {
    const dateStr = `${month}-${String(day).padStart(2, "0")}`;
    const trimmed = val.trim().toUpperCase();
    if (trimmed === "") { setAttendance.mutate({ staff_id: staffId, date: dateStr, value: "" }); return; }
    if (trimmed === "A" || trimmed === "S" || trimmed === "SP") { setAttendance.mutate({ staff_id: staffId, date: dateStr, value: trimmed }); return; }
    // Shift code shortcuts: EM=11h, EN/ED/G=8h
    if (trimmed === "EM") { setAttendance.mutate({ staff_id: staffId, date: dateStr, value: "11" }); return; }
    if (trimmed === "EN" || trimmed === "ED" || trimmed === "G") { setAttendance.mutate({ staff_id: staffId, date: dateStr, value: "8" }); return; }
    const num = Number(trimmed);
    if (!isNaN(num) && num >= 0 && num <= 24) { setAttendance.mutate({ staff_id: staffId, date: dateStr, value: String(num) }); }
  };

  // Auto-fill: a day is auto-filled with 9 hours ONLY if its business day has
  // been CLOSED (record exists in `business_day_closures`). The current open
  // business day is never auto-filled, regardless of wall-clock time.
  // Cells that already have any value (S, A, hours number) are skipped.
  const autoFilledRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (readOnly) return;
    if (!staff.length) return;
    if (!closedDates || closedDates.size === 0) return;

    const todayBd = effectiveBusinessDate || getBusinessDate();
    if (!todayBd) return;
    for (const s of activeStaff) {
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${month}-${String(day).padStart(2, "0")}`;
        // HARD GUARD #1: never auto-fill current open business day or future.
        if (dateStr >= todayBd) continue;
        // HARD GUARD #2: closure record must exist for that date.
        if (!closedDates.has(dateStr)) continue;
        const key = `${s.id}|${dateStr}`;
        if (autoFilledRef.current.has(key)) continue;

        const rotaShift = getRotaShift(s.id, day);
        if (rotaShift !== "D" && rotaShift !== "N" && rotaShift !== "G") continue;

        const current = getValue(s.id, day);
        if (current !== "") continue;

        // Shift-aware: D = 8h, N = 8h.
        const fillValue = "8";
        autoFilledRef.current.add(key);
        setAttendanceRaw.mutate({ staff_id: s.id, date: dateStr, value: fillValue });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, attendance, rota, month, readOnly, closedDates, effectiveBusinessDate]);

  const getTotals = (staffId: string) => {
    let shifts = 0;
    let hours = 0;
    let absent = 0;
    let sick = 0;
    days.forEach(day => {
      const val = getValue(staffId, day);
      if (val === "A") { absent += 1; return; }
      if (val === "S") { sick += 1; return; }
      const num = Number(val);
      if (!isNaN(num) && num > 0) {
        shifts += 1;
        hours += num;
      }
    });
    return { shifts, hours, absent, sick };
  };

  const visibleDepts = filterDept === "all" ? groupDepts : groupDepts.filter(d => d === filterDept);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof activeStaff> = {};
    groupDepts.forEach(d => { groups[d] = []; });
    activeStaff.forEach(s => {
      if (!groups[s.department]) groups[s.department] = [];
      groups[s.department].push(s);
    });
    return groups;
  }, [activeStaff, groupDepts]);

  // Departments that actually have members
  const availableDepts = groupDepts.filter(d => (grouped[d] || []).length > 0);

  return (
    <>
      <div className="flex items-center gap-1.5 mb-3 flex-wrap no-print">
        <button
          onClick={() => setFilterDept("all")}
          className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${filterDept === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
        >
          All
        </button>
        {availableDepts.map(d => {
          const count = (grouped[d] || []).length;
          if (count === 0) return null;
          return (
            <button
              key={d}
              onClick={() => setFilterDept(filterDept === d ? "all" : d)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                filterDept === d
                  ? DEPT_BADGE_COLORS[d]
                  : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${DEPT_DOT_COLORS[d]}`} />
              {DEPARTMENT_LABELS[d]} ({count})
            </button>
          );
        })}
      </div>
      <div className="cms-panel overflow-hidden print-target">
        {/* Print header for attendance */}
        <div className="hidden print-header">
          <span className="print-header-title">Floor Attendance{filterDept !== "all" ? ` — ${DEPARTMENT_LABELS[filterDept as StaffDepartment]}` : ""}</span>
          <span className="print-header-month">{monthLabel}</span>
          <div className="print-header-legend">
            <span style={{ background: "#fee2e2", color: "#b91c1c" }}>A = Absent</span>
            <span style={{ background: "#ffedd5", color: "#c2410c" }}>S = Sick</span>
          </div>
        </div>
        <table className="w-full border-collapse table-fixed">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left text-xs font-medium text-muted-foreground uppercase px-1 py-2 sticky left-0 bg-card z-10 w-[180px]">
              Staff
            </th>
            {days.map(day => {
              const dateObj = new Date(y, m - 1, day);
              const weekday = WEEKDAYS[dateObj.getDay()];
              const isToday = isCurrentMonth && day === todayDay;
              const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
              return (
                <th key={day} className={`text-center px-0 py-1 border-l border-border/25 ${isToday ? "bg-primary/40" : isWeekend ? "bg-muted/30" : ""}`}>
                  <div className="text-[9px] text-muted-foreground leading-tight">{weekday}</div>
                  <div className={`text-xs font-mono leading-tight ${isToday ? "text-primary font-bold" : "text-card-foreground"}`}>{day}</div>
                </th>
              );
            })}
            <th className="text-center text-[10px] font-medium text-muted-foreground uppercase px-1 py-2 w-8">Σsh</th>
            <th className="text-center text-[10px] font-medium text-muted-foreground uppercase px-1 py-2 w-8">Σh</th>
            <th className="text-center text-[10px] font-medium text-rose-600 dark:text-rose-400 uppercase px-1 py-2 w-8">A</th>
            <th className="text-center text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase px-1 py-2 w-8">S</th>
          </tr>
        </thead>
        <tbody>
          {visibleDepts.map(dept => {
            const members = grouped[dept] || [];
            if (members.length === 0) return null;
            return (
              <AttendanceDepartmentBlock
                key={dept}
                dept={dept}
                members={members}
                days={days}
                month={month}
                y={y}
                m={m}
                isCurrentMonth={isCurrentMonth}
                todayDay={todayDay}
                getValue={getValue}
                getRotaShift={getRotaShift}
                handleSave={handleSave}
                getTotals={getTotals}
              />
            );
          })}
          {/* Summary: shifts per day across visible filter */}
          <tr className="border-t-2 border-border">
            <td className="px-1 py-1 text-[9px] font-mono font-bold text-blue-600 dark:text-blue-400 sticky left-0 bg-card z-10">Σ Shifts</td>
            {days.map(day => {
              const filtered = filterDept === "all" ? activeStaff : activeStaff.filter(s => s.department === filterDept);
              const count = filtered.filter(s => {
                const v = getValue(s.id, day);
                const n = Number(v);
                return !isNaN(n) && n > 0;
              }).length;
              return <td key={day} className="text-center text-[9px] font-mono font-bold text-blue-600 dark:text-blue-400">{count || ""}</td>;
            })}
            <td colSpan={4} />
          </tr>
        </tbody>
        </table>
      </div>
    </>
  );
};

const AttendanceDepartmentBlock = ({
  dept, members, days, month, y, m, isCurrentMonth, todayDay,
  getValue, getRotaShift, handleSave, getTotals,
}: {
  dept: string;
  members: any[];
  days: number[];
  month: string;
  y: number;
  m: number;
  isCurrentMonth: boolean;
  todayDay: number;
  getValue: (id: string, day: number) => string;
  getRotaShift: (id: string, day: number) => string | null;
  handleSave: (id: string, day: number, val: string) => void;
  getTotals: (id: string) => { shifts: number; hours: number; absent: number; sick: number };
}) => (
  <>
    <tr>
      <td colSpan={days.length + 5} className="px-0 py-0 sticky left-0">
        <div className={`flex items-center gap-2 px-3 py-1 border-b-2 ${DEPT_BORDER_COLORS[dept] || "border-muted"}`}>
          <span className={`w-2 h-2 rounded-full ${DEPT_DOT_COLORS[dept] || "bg-muted-foreground"}`} />
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-card-foreground">{DEPARTMENT_LABELS[dept as StaffDepartment]}</span>
          <span className="text-[10px] font-mono text-muted-foreground">({members.length})</span>
        </div>
      </td>
    </tr>
    {members.map((staff, idx) => {
      const totals = getTotals(staff.id);
      return (
        <tr key={staff.id} className={`border-b border-border last:border-0 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
          <td className={`px-3 py-1 text-[13px] font-medium text-card-foreground sticky left-0 z-10 ${idx % 2 === 0 ? "bg-card" : "bg-card/95"}`}>
            <span className="text-muted-foreground font-mono mr-1.5">{idx + 1}.</span>{staff.name}
          </td>
          {days.map(day => {
            const val = getValue(staff.id, day);
            const isToday = isCurrentMonth && day === todayDay;
            const dateObj = new Date(y, m - 1, day);
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
            const isStatus = val === "A" || val === "S";
            const isHours = val !== "" && !isStatus;
            const rotaShift = getRotaShift(staff.id, day);
            const isScheduled = !!rotaShift;
            const isEmpty = val === "";
            return (
              <td key={day} className={`px-0.5 py-0.5 text-center border-l border-border/25 ${isToday ? "bg-primary/25" : isWeekend ? "bg-muted/15" : ""}`}>
                <CellPicker
                  value={val || null}
                  display={val || (isScheduled && isEmpty ? rotaShift! : "·")}
                  rows={[
                    { options: [
                      { value: "A", label: "A", title: "Absent", className: ATT_COLORS["A"] },
                      { value: "S", label: "S", title: "Sick", className: ATT_COLORS["S"] },
                    ]},
                    { label: "Hours", options: Array.from({ length: 12 }, (_, i) => i + 1).map(n => ({
                      value: String(n), label: String(n),
                      className: "bg-card-foreground/5 text-card-foreground",
                    }))},
                  ]}
                  onSelect={(v) => handleSave(staff.id, day, v ?? "")}
                  onKeyDown={e => {
                    const k = e.key.toUpperCase();
                    if (k === "A" || k === "S") { e.preventDefault(); handleSave(staff.id, day, k); return; }
                    if (/^[0-9]$/.test(k)) { e.preventDefault(); handleSave(staff.id, day, k); return; }
                    if (k === "BACKSPACE" || k === "DELETE") { e.preventDefault(); handleSave(staff.id, day, ""); return; }
                  }}
                  cellClassName={`w-full h-8 rounded text-xs font-mono font-semibold text-center focus:outline-none focus:ring-1 focus:ring-primary transition-colors ${
                    isStatus
                      ? ATT_COLORS[val]
                      : isHours
                        ? "bg-transparent text-card-foreground font-bold"
                        : isScheduled && isEmpty
                          ? `${UNIFIED_SHIFT_TINTS[rotaShift!] || "bg-muted/30 text-muted-foreground"}`
                          : "bg-transparent text-muted-foreground/40 hover:text-muted-foreground"
                  }`}
                />
              </td>
            );
          })}
          <td className="px-2 py-1 text-center"><span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400">{totals.shifts || ""}</span></td>
          <td className="px-2 py-1 text-center"><span className="text-[10px] font-mono font-bold text-primary">{totals.hours || ""}</span></td>
          <td className="px-2 py-1 text-center"><span className="text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400">{totals.absent || ""}</span></td>
          <td className="px-2 py-1 text-center"><span className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400">{totals.sick || ""}</span></td>
        </tr>
      );
    })}
  </>
);

export default Staff;
