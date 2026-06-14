import { useMemo, useRef, useState, useCallback } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { UserCheck, Camera, RotateCw, Upload, Trash2, Plus, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { parseStaffMasterXlsx, type ParsedStaffRow } from "@/lib/staff-master-import";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import {
  useEmployees,
  useUpsertEmployee,
  usePatchEmployee,
  useDeleteEmployee,
  type Employee,
} from "@/hooks/use-payroll";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateEmployeeCaches } from "@/lib/invalidate-employees";
import {
  DEPARTMENTS,
  POSITIONS_BY_DEPT,
  ALL_POSITIONS,
  deriveCategory,
  splitName,
  joinName,
} from "@/lib/staff-dictionaries";
import { EditableCell } from "@/components/staff-master/editable-cell";
import { SignedImage } from "@/components/SignedImage";

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n).replace(/,/g, " ");

const yearsBetween = (date: string | null) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
};

const ageFromBirthday = (b: string | null) => {
  const y = yearsBetween(b);
  return y == null ? null : Math.floor(y);
};

const daysFromToday = (date: string | null) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - Date.now()) / (24 * 3600 * 1000));
};

const monthLabel = (date: string | null) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", month: "short", year: "numeric" });
};

const fmtUTC = (date: string | null) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

const dot = <span className="text-muted-foreground">·</span>;

const signedDays = (n: number | null) => {
  if (n == null) return dot;
  const cls = n < 0 ? "text-destructive" : n < 30 ? "text-amber-600" : "text-emerald-600";
  return <span className={cls}>{n}</span>;
};

const calc = "bg-muted/30";

// Sticky column offsets
const STICKY = {
  photo: { left: 0, w: 36 },
  sn: { left: 36, w: 40 },
  first: { left: 76, w: 130 },
  last: { left: 206, w: 150 },
};
const HEADER_BG = "bg-muted";
const ROW_BG = "bg-background";

const stickyCell = (left: number, w: number, bg = ROW_BG) => ({
  position: "sticky" as const,
  left,
  zIndex: 1,
  minWidth: w,
  maxWidth: w,
  width: w,
  background: undefined,
  // bg via className so dark mode works
  className: bg,
});

// ===== Sorting =====
type SortDir = "asc" | "desc";
type SortKey =
  | "first_name" | "last_name" | "remain" | "department" | "position" | "contract_type"
  | "basic_salary" | "onboarding_date" | "exp_years" | "birthday" | "age" | "phone"
  | "job_description" | "general_details" | "intro_to_work" | "staff_rules_acknowledged"
  | "disciplinary_acknowledged" | "confidentiality_agreement" | "contract_start" | "contract_end"
  | "end_month" | "annual_leave_earned" | "annual_leave_used" | "annual_leave_sold"
  | "corporate_mail" | "gender" | "nationality" | "license_type" | "license_available"
  | "license_pass_date" | "renew_days" | "uniform_issued";

const sortEmployees = (list: Employee[], key: SortKey, dir: SortDir): Employee[] => {
  const m = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "first_name":
        cmp = (a.first_name ?? "").toLowerCase().localeCompare((b.first_name ?? "").toLowerCase());
        break;
      case "last_name":
        cmp = (a.last_name ?? a.full_name ?? "").toLowerCase().localeCompare((b.last_name ?? b.full_name ?? "").toLowerCase());
        break;
      case "remain": {
        const ra = (Number(a.annual_leave_earned) || 0) - (Number(a.annual_leave_used) || 0) - (Number(a.annual_leave_sold) || 0);
        const rb = (Number(b.annual_leave_earned) || 0) - (Number(b.annual_leave_used) || 0) - (Number(b.annual_leave_sold) || 0);
        cmp = ra - rb;
        break;
      }
      case "department": cmp = (a.department || "").localeCompare(b.department || ""); break;
      case "position": cmp = (a.position || "").localeCompare(b.position || ""); break;
      case "contract_type": cmp = (a.contract_type || "").localeCompare(b.contract_type || ""); break;
      case "basic_salary": cmp = (Number(a.basic_salary) || 0) - (Number(b.basic_salary) || 0); break;
      case "onboarding_date": {
        const da = a.onboarding_date ? new Date(a.onboarding_date).getTime() : 0;
        const db = b.onboarding_date ? new Date(b.onboarding_date).getTime() : 0;
        cmp = da - db;
        break;
      }
      case "exp_years": {
        const ya = yearsBetween(a.onboarding_date) ?? -1;
        const yb = yearsBetween(b.onboarding_date) ?? -1;
        cmp = ya - yb;
        break;
      }
      case "birthday": {
        const ba = a.birthday ? new Date(a.birthday).getTime() : 0;
        const bb = b.birthday ? new Date(b.birthday).getTime() : 0;
        cmp = ba - bb;
        break;
      }
      case "age": {
        const aa = ageFromBirthday(a.birthday) ?? -1;
        const ab = ageFromBirthday(b.birthday) ?? -1;
        cmp = aa - ab;
        break;
      }
      case "phone": cmp = (a.phone || "").localeCompare(b.phone || ""); break;
      case "job_description": cmp = (a.job_description || "").localeCompare(b.job_description || ""); break;
      case "general_details": cmp = (a.general_details || "").localeCompare(b.general_details || ""); break;
      case "intro_to_work": cmp = (a.intro_to_work ? 1 : 0) - (b.intro_to_work ? 1 : 0); break;
      case "staff_rules_acknowledged": cmp = (a.staff_rules_acknowledged ? 1 : 0) - (b.staff_rules_acknowledged ? 1 : 0); break;
      case "disciplinary_acknowledged": cmp = (a.disciplinary_acknowledged ? 1 : 0) - (b.disciplinary_acknowledged ? 1 : 0); break;
      case "confidentiality_agreement": cmp = (a.confidentiality_agreement ? 1 : 0) - (b.confidentiality_agreement ? 1 : 0); break;
      case "contract_start": {
        const sa = a.contract_start ? new Date(a.contract_start).getTime() : 0;
        const sb = b.contract_start ? new Date(b.contract_start).getTime() : 0;
        cmp = sa - sb;
        break;
      }
      case "contract_end": {
        const ea = a.contract_end ? new Date(a.contract_end).getTime() : 0;
        const eb = b.contract_end ? new Date(b.contract_end).getTime() : 0;
        cmp = ea - eb;
        break;
      }
      case "end_month": {
        const ma = monthLabel(a.contract_end) || "";
        const mb = monthLabel(b.contract_end) || "";
        cmp = ma.localeCompare(mb);
        break;
      }
      case "annual_leave_earned": cmp = (Number(a.annual_leave_earned) || 0) - (Number(b.annual_leave_earned) || 0); break;
      case "annual_leave_used": cmp = (Number(a.annual_leave_used) || 0) - (Number(b.annual_leave_used) || 0); break;
      case "annual_leave_sold": cmp = (Number(a.annual_leave_sold) || 0) - (Number(b.annual_leave_sold) || 0); break;
      case "corporate_mail": cmp = (a.corporate_mail || "").localeCompare(b.corporate_mail || ""); break;
      case "gender": cmp = (a.gender || "").localeCompare(b.gender || ""); break;
      case "nationality": cmp = (a.nationality || "").localeCompare(b.nationality || ""); break;
      case "license_type": cmp = (a.license_type || "").localeCompare(b.license_type || ""); break;
      case "license_available": cmp = (a.license_available ? 1 : 0) - (b.license_available ? 1 : 0); break;
      case "license_pass_date": {
        const pa = a.license_pass_date ? new Date(a.license_pass_date).getTime() : 0;
        const pb = b.license_pass_date ? new Date(b.license_pass_date).getTime() : 0;
        cmp = pa - pb;
        break;
      }
      case "renew_days": {
        const ra = daysFromToday(a.license_pass_date) ?? Infinity;
        const rb = daysFromToday(b.license_pass_date) ?? Infinity;
        cmp = ra - rb;
        break;
      }
      case "uniform_issued": cmp = (a.uniform_issued ? 1 : 0) - (b.uniform_issued ? 1 : 0); break;
    }
    if (cmp !== 0) return cmp * m;
    return a.full_name.localeCompare(b.full_name) * m;
  });
};

function SortHeaderTh({
  sortKey: key,
  label,
  sticky: isSticky,
  left,
  w,
  extraClass,
  align,
  current,
  dir,
  onClick,
}: {
  sortKey: SortKey;
  label: string;
  sticky?: boolean;
  left?: number;
  w?: number;
  extraClass?: string;
  align?: "left" | "right" | "center";
  current: SortKey | null;
  dir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const active = current === key;
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const stickyStyle = isSticky && left !== undefined && w !== undefined
    ? { position: "sticky" as const, left, minWidth: w, width: w, maxWidth: w, zIndex: 30 }
    : undefined;
  return (
    <th
      onClick={() => onClick(key)}
      className={`cursor-pointer select-none hover:text-foreground transition-colors ${alignCls} ${extraClass ?? ""} ${isSticky ? HEADER_BG : ""}`}
      style={stickyStyle}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          dir === "asc" ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );
}

const StaffMaster = () => {
  const { roles } = useAuth();
  const { activeCasinoId } = useCasino();
  const qc = useQueryClient();
  const canEdit = roles.includes("hr") || roles.includes("manager") || roles.includes("super_admin");
  const { data: employees = [], isLoading } = useEmployees();
  const patch = usePatchEmployee();
  const upsert = useUpsertEmployee();
  const del = useDeleteEmployee();
  const [reimporting, setReimporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ParsedStaffRow[] | null>(null);
  const [wipeFirst, setWipeFirst] = useState(true);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sorting state
  const [sortKey, setSortKey] = useSessionState<SortKey | null>("sortKey", null);
  const [sortDir, setSortDir] = useSessionState<SortDir>("sortDir", "asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Group by department in DEPARTMENTS order; unknown depts → "Other"
  const grouped = useMemo(() => {
    const by: Record<string, Employee[]> = {};
    for (const k of DEPARTMENTS) by[k] = [];
    by["Other"] = [];
    for (const e of employees) {
      const k = (DEPARTMENTS as readonly string[]).includes(e.department) ? e.department : "Other";
      (by[k] ||= []).push(e);
    }
    for (const k of Object.keys(by)) {
      if (sortKey) {
        by[k] = sortEmployees(by[k], sortKey, sortDir);
      } else {
        by[k].sort((a, b) =>
          ((a.first_name ?? "").toLowerCase().localeCompare((b.first_name ?? "").toLowerCase())) ||
          ((a.last_name  ?? "").toLowerCase().localeCompare((b.last_name  ?? "").toLowerCase())) ||
          a.full_name.localeCompare(b.full_name)
        );
      }
    }
    return by;
  }, [employees, sortKey, sortDir]);

  const TOTAL_COLS = 35;

  const onPatch = useCallback(
    (id: string, key: keyof Employee, value: any) => patch.mutate({ id, patch: { [key]: value } as any }),
    [patch],
  );

  const onPatchPosition = useCallback(
    (e: Employee, position: string | null) => {
      const cat = deriveCategory(e.department, position);
      patch.mutate({
        id: e.id,
        patch: { position: position ?? "", dealer_category: cat.dealer_category, is_pit_boss: cat.is_pit_boss } as any,
      });
    },
    [patch],
  );

  const onPatchDepartment = useCallback(
    (e: Employee, department: string | null) => {
      // Reset position if it's not valid in the new dept
      const newDept = department ?? "";
      const validPositions = POSITIONS_BY_DEPT[newDept] ?? [];
      const keep = !e.position || validPositions.includes(e.position);
      const cat = deriveCategory(newDept, keep ? e.position : null);
      patch.mutate({
        id: e.id,
        patch: {
          department: newDept,
          position: keep ? e.position : "",
          dealer_category: cat.dealer_category,
          is_pit_boss: cat.is_pit_boss,
        } as any,
      });
    },
    [patch],
  );

  const onPatchName = useCallback(
    (e: Employee, first: string | null, last: string | null) => {
      const nextFirst = first !== null ? first.trim() : (e.first_name ?? "").trim();
      const nextLast = last !== null ? last.trim() : (e.last_name ?? "").trim();
      if (!nextFirst && !nextLast) { toast.error("Name cannot be empty"); return; }
      patch.mutate({ id: e.id, patch: { first_name: nextFirst, last_name: nextLast } as any });
    },
    [patch],
  );

  const handleReimport = async () => {
    if (!activeCasinoId) return;
    if (!confirm("Rebuild the entire Staff Master from current Staff and Pit Personnel? Bank/NSSF/Tax info entered manually for this casino will be cleared.")) return;
    setReimporting(true);
    try {
      const { data, error } = await supabase.rpc("reimport_staff_master", { p_casino_id: activeCasinoId });
      if (error) throw error;
      const r = data as any;
      toast.success(`Imported ${r.total} employees (Pit ${r.dealers_imported} + Staff ${r.staff_imported})`);
      invalidateEmployeeCaches(qc);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReimporting(false);
    }
  };

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const rows = await parseStaffMasterXlsx(f);
      if (!rows.length) { toast.error("No rows found in file"); return; }
      setImportPreview(rows);
      setWipeFirst(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse file");
    }
  };

  const handleConfirmImport = async () => {
    if (!activeCasinoId || !importPreview) return;
    setImporting(true);
    try {
      if (wipeFirst) {
        const { error } = await supabase.from("employees").delete().eq("casino_id", activeCasinoId);
        if (error) throw error;
      }
      const payload = importPreview.map(r => ({ ...r, casino_id: activeCasinoId, payroll_status: "active" as const }));
      for (let i = 0; i < payload.length; i += 100) {
        const slice = payload.slice(i, i + 100);
        const { error } = await supabase.from("employees").insert(slice as any);
        if (error) throw error;
      }
      toast.success(`Imported ${payload.length} employees`);
      invalidateEmployeeCaches(qc);
      setImportPreview(null);
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // ===== Render =====
  return (
    <PageShell>
      <PageHeader icon={UserCheck} title="Staff Master" subtitle="Universal directory of all casino personnel">
        {canEdit && (
          <>
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handlePickFile} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4 mr-1" /> Import from Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleReimport} disabled={reimporting}>
              <RotateCw className={`w-4 h-4 mr-1 ${reimporting ? "animate-spin" : ""}`} /> Reimport
            </Button>
          </>
        )}
      </PageHeader>

      <PageSection card={false}>
        {isLoading ? (
          <div className="text-sm text-muted-foreground p-4">Loading…</div>
        ) : (
          <div className="w-full overflow-auto rounded-md border border-border max-h-[calc(100vh-180px)]">
            <table className="text-xs border-collapse min-w-max">
              <thead className={`${HEADER_BG} sticky top-0 z-20`}>
                <tr className="border-b border-border [&_th]:px-2 [&_th]:h-8 [&_th]:text-[10px] [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground [&_th]:font-semibold [&_th]:text-left [&_th]:whitespace-nowrap [&_th]:border-r [&_th]:border-border/40">
                  <th className={`sticky left-0 z-30 ${HEADER_BG}`} style={{ minWidth: STICKY.photo.w, width: STICKY.photo.w }}></th>
                  <th className={`sticky z-30 ${HEADER_BG} text-center`} style={{ left: STICKY.sn.left, minWidth: STICKY.sn.w, width: STICKY.sn.w }}>#</th>
                  <SortHeaderTh sortKey="first_name" label="Name" sticky left={STICKY.first.left} w={STICKY.first.w} extraClass="border-l border-border" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="last_name" label="Surname" sticky left={STICKY.last.left} w={STICKY.last.w} extraClass="border-r border-border" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="remain" label="Remain" extraClass={calc} current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="department" label="Dept" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="position" label="Position" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="contract_type" label="Contract" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="basic_salary" label="Salary" align="right" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="onboarding_date" label="Joining" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="exp_years" label="Exp YY" extraClass={calc} current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="birthday" label="Birthday" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="age" label="Age" extraClass={calc} current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="phone" label="Phone" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="job_description" label="Job Desc" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="general_details" label="Gen Det" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="intro_to_work" label="Intro" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="staff_rules_acknowledged" label="Rules" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="disciplinary_acknowledged" label="Discip" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="confidentiality_agreement" label="Confid" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="contract_start" label="Contr Start" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="contract_end" label="Contr End" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="end_month" label="End Mon" extraClass={calc} current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="annual_leave_earned" label="AL Earn" align="right" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="annual_leave_used" label="AL Used" align="right" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="annual_leave_sold" label="AL Sold" align="right" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="corporate_mail" label="Corp Mail" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="gender" label="Gend" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="nationality" label="Nation" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="license_type" label="Lic Type" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="license_available" label="Lic Av" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="license_pass_date" label="Pass Date" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="renew_days" label="Renew" extraClass={calc} current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeaderTh sortKey="uniform_issued" label="Uniform" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 && (
                  <tr><td colSpan={TOTAL_COLS} className="text-center text-muted-foreground py-8">No employees yet — click Reimport to build from Staff and Pit Personnel, or use the bottom row to add one</td></tr>
                )}
                {([...DEPARTMENTS, "Other"] as const).flatMap(dept => {
                  const list = grouped[dept];
                  if (!list || list.length === 0) return [] as JSX.Element[];
                  const rows: JSX.Element[] = [];
                  rows.push(
                    <tr key={`hdr-${dept}`} className="bg-muted/50">
                      <td colSpan={TOTAL_COLS} className="font-semibold text-xs uppercase tracking-wider text-muted-foreground py-1.5 px-3">
                        {dept} <span className="ml-2 text-[10px]">({list.length})</span>
                      </td>
                    </tr>
                  );
                  list.forEach((e, idx) => {
                    rows.push(<EmployeeRow key={e.id} e={e} idx={idx + 1} canEdit={canEdit} onPatch={onPatch} onPatchName={onPatchName} onPatchPosition={onPatchPosition} onPatchDepartment={onPatchDepartment} onDelete={() => del.mutate(e.id)} />);
                  });
                  return rows;
                })}

                {canEdit && <NewEmployeeRow casinoId={activeCasinoId} onSave={(p) => upsert.mutate(p as any)} />}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>

      {importPreview && (
        <Dialog open onOpenChange={() => !importing && setImportPreview(null)}>
          <DialogContent className="max-w-[95vw] w-[95vw] max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>
                Import Staff Master — Preview {importPreview.length} rows
              </DialogTitle>
            </DialogHeader>
            <div className="text-xs text-muted-foreground space-y-1 pb-2">
              <div>Existing in this casino: <span className="font-mono">{employees.length}</span> · Departments: {Array.from(new Set(importPreview.map(r => r.department).filter(Boolean))).join(", ") || "—"}</div>
              <label className="flex items-center gap-2 pt-1">
                <Checkbox checked={wipeFirst} onCheckedChange={(c) => setWipeFirst(!!c)} />
                <span>Wipe existing employees for this casino before import</span>
              </label>
              {wipeFirst && employees.length > 0 && (
                <div className="text-destructive">All {employees.length} current employees will be deleted. Payroll history is kept (employee link cleared).</div>
              )}
            </div>
            <ImportPreviewTable rows={importPreview} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportPreview(null)} disabled={importing}>Cancel</Button>
              <Button onClick={handleConfirmImport} disabled={importing}>
                {importing ? "Importing…" : `Import ${importPreview.length}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
};

// ===================== ROW =====================
const EmployeeRow = ({ e, idx, canEdit, onPatch, onPatchName, onPatchPosition, onPatchDepartment, onDelete }: {
  e: Employee;
  idx: number;
  canEdit: boolean;
  onPatch: (id: string, key: keyof Employee, value: any) => void;
  onPatchName: (e: Employee, first: string | null, last: string | null) => void;
  onPatchPosition: (e: Employee, position: string | null) => void;
  onPatchDepartment: (e: Employee, department: string | null) => void;
  onDelete: () => void;
}) => {
  const exp = yearsBetween(e.onboarding_date);
  const age = ageFromBirthday(e.birthday);
  const remain = (Number(e.annual_leave_earned) || 0) - (Number(e.annual_leave_used) || 0) - (Number(e.annual_leave_sold) || 0);
  const renew = daysFromToday(e.license_pass_date);
  const first = e.first_name ?? "";
  const last = e.last_name ?? (e.first_name ? "" : (e.full_name ?? ""));
  const positions = POSITIONS_BY_DEPT[e.department] ?? ALL_POSITIONS;

  const ro = !canEdit;
  const td = "h-9 align-middle border-b border-r border-border/40 whitespace-nowrap";

  return (
    <tr className="hover:bg-muted/30 group">
      <td className={`${td} sticky left-0 z-10 ${ROW_BG} group-hover:bg-muted/30`} style={{ minWidth: STICKY.photo.w, width: STICKY.photo.w }}>
        <PhotoBadge employee={e} canEdit={canEdit} />
      </td>
      <td className={`${td} sticky z-10 ${ROW_BG} group-hover:bg-muted/30 ${calc} font-mono text-center`} style={{ left: STICKY.sn.left, minWidth: STICKY.sn.w, width: STICKY.sn.w }}>{idx}</td>
      <td className={`${td} sticky z-10 ${ROW_BG} group-hover:bg-muted/30 border-l border-border font-medium`} style={{ left: STICKY.first.left, minWidth: STICKY.first.w, width: STICKY.first.w }}>
        <EditableCell type="text" value={first} readOnly={ro} onSave={(v) => onPatchName(e, v ?? "", null)} />
      </td>
      <td className={`${td} sticky z-10 ${ROW_BG} group-hover:bg-muted/30 border-r border-border font-medium`} style={{ left: STICKY.last.left, minWidth: STICKY.last.w, width: STICKY.last.w }}>
        <EditableCell type="text" value={last} readOnly={ro} onSave={(v) => onPatchName(e, null, v ?? "")} />
      </td>
      <td className={`${td} ${calc} font-mono text-right px-2`}>{signedDays(remain)}</td>
      <td className={td}>
        <EditableCell type="select" value={e.department || null} options={DEPARTMENTS} readOnly={ro} onSave={(v) => onPatchDepartment(e, v)} />
      </td>
      <td className={td}>
        <span className="inline-flex items-center gap-1 w-full">
          <span className="flex-1 min-w-0">
            <EditableCell type="select" value={e.position || null} options={positions} readOnly={ro} onSave={(v) => onPatchPosition(e, v)} />
          </span>
          {e.is_pit_boss && <Badge variant="secondary" className="px-1 text-[10px]">PB</Badge>}
          {e.dealer_category === "dealer" && <Badge variant="outline" className="px-1 text-[10px]">D</Badge>}
          {e.dealer_category === "inspector" && <Badge variant="outline" className="px-1 text-[10px]">I</Badge>}
          {e.dealer_category === "trainee" && <Badge variant="outline" className="px-1 text-[10px]">T</Badge>}
        </span>
      </td>
      <td className={td}><EditableCell type="select" value={e.contract_type || null} options={["FT", "PT", "PM"]} readOnly={ro} onSave={(v) => onPatch(e.id, "contract_type", v)} /></td>
      <td className={`${td} text-right font-mono px-2`}><EditableCell type="number" align="right" value={Number(e.basic_salary) || 0} readOnly={ro} onSave={(v) => onPatch(e.id, "basic_salary", v)} /></td>
      <td className={td}><EditableCell type="date" value={e.onboarding_date} readOnly={ro} onSave={(v) => onPatch(e.id, "onboarding_date", v)} /></td>
      <td className={`${td} ${calc} font-mono px-2`}>{exp != null ? exp.toFixed(1) : dot}</td>
      <td className={td}><EditableCell type="date" value={e.birthday} readOnly={ro} onSave={(v) => onPatch(e.id, "birthday", v)} /></td>
      <td className={`${td} ${calc} font-mono px-2`}>{age ?? dot}</td>
      <td className={`${td} font-mono`}><EditableCell type="text" value={e.phone} readOnly={ro} onSave={(v) => onPatch(e.id, "phone", v)} /></td>
      <td className={`${td} max-w-[160px]`}><EditableCell type="text" value={e.job_description} readOnly={ro} onSave={(v) => onPatch(e.id, "job_description", v)} /></td>
      <td className={`${td} max-w-[160px]`}><EditableCell type="text" value={e.general_details} readOnly={ro} onSave={(v) => onPatch(e.id, "general_details", v)} /></td>
      <td className={td}><EditableCell type="yesno" value={e.intro_to_work} readOnly={ro} onSave={(v) => onPatch(e.id, "intro_to_work", v)} /></td>
      <td className={td}><EditableCell type="yesno" value={e.staff_rules_acknowledged} readOnly={ro} onSave={(v) => onPatch(e.id, "staff_rules_acknowledged", v)} /></td>
      <td className={td}><EditableCell type="yesno" value={e.disciplinary_acknowledged} readOnly={ro} onSave={(v) => onPatch(e.id, "disciplinary_acknowledged", v)} /></td>
      <td className={td}><EditableCell type="yesno" value={e.confidentiality_agreement} readOnly={ro} onSave={(v) => onPatch(e.id, "confidentiality_agreement", v)} /></td>
      <td className={td}><EditableCell type="date" value={e.contract_start} readOnly={ro} onSave={(v) => onPatch(e.id, "contract_start", v)} /></td>
      <td className={td}><EditableCell type="date" value={e.contract_end} readOnly={ro} onSave={(v) => onPatch(e.id, "contract_end", v)} /></td>
      <td className={`${td} ${calc} px-2`}>{monthLabel(e.contract_end) ?? dot}</td>
      <td className={`${td} text-right font-mono px-2`}><EditableCell type="number" align="right" value={Number(e.annual_leave_earned) || 0} readOnly={ro} onSave={(v) => onPatch(e.id, "annual_leave_earned", v)} /></td>
      <td className={`${td} text-right font-mono px-2`}><EditableCell type="number" align="right" value={Number(e.annual_leave_used) || 0} readOnly={ro} onSave={(v) => onPatch(e.id, "annual_leave_used", v)} /></td>
      <td className={`${td} text-right font-mono px-2`}><EditableCell type="number" align="right" value={Number(e.annual_leave_sold) || 0} readOnly={ro} onSave={(v) => onPatch(e.id, "annual_leave_sold", v)} /></td>
      <td className={`${td} max-w-[180px]`}><EditableCell type="text" value={e.corporate_mail} readOnly={ro} onSave={(v) => onPatch(e.id, "corporate_mail", v)} /></td>
      <td className={td}><EditableCell type="select" value={e.gender} options={["M", "F"]} readOnly={ro} onSave={(v) => onPatch(e.id, "gender", v)} /></td>
      <td className={td}><EditableCell type="text" value={e.nationality} readOnly={ro} onSave={(v) => onPatch(e.id, "nationality", v)} /></td>
      <td className={td}><EditableCell type="text" value={e.license_type} readOnly={ro} onSave={(v) => onPatch(e.id, "license_type", v)} /></td>
      <td className={td}><EditableCell type="yesno" value={e.license_available} readOnly={ro} onSave={(v) => onPatch(e.id, "license_available", v)} /></td>
      <td className={td}><EditableCell type="date" value={e.license_pass_date} readOnly={ro} onSave={(v) => onPatch(e.id, "license_pass_date", v)} /></td>
      <td className={`${td} ${calc} font-mono px-2`}>{signedDays(renew)}</td>
      <td className={td}><EditableCell type="yesno" value={e.uniform_issued} readOnly={ro} onSave={(v) => onPatch(e.id, "uniform_issued", v)} /></td>
      <td className={td}>
        {canEdit && (
          <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => { if (confirm(`Delete ${e.full_name}?`)) onDelete(); }}>
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </Button>
        )}
      </td>
    </tr>
  );
};

// ===================== NEW (BOTTOM) ROW =====================
const blankNew = () => ({
  first: "",
  last: "",
  department: "",
  position: "",
  contract_type: "",
  basic_salary: 0,
  phone: "",
  birthday: "" as string | "",
  onboarding_date: "" as string | "",
});

const NewEmployeeRow = ({ casinoId, onSave }: {
  casinoId: string | null;
  onSave: (payload: any) => void;
}) => {
  const [v, setV] = useState(blankNew());
  const set = (k: keyof ReturnType<typeof blankNew>, val: any) => setV((s) => ({ ...s, [k]: val }));

  const tryCommit = () => {
    if (!casinoId) return;
    if (!v.first.trim() && !v.last.trim()) return;
    if (!v.department) return;
    if (!v.position) return;
    const cat = deriveCategory(v.department, v.position);
    onSave({
      full_name: joinName(v.first, v.last),
      first_name: v.first.trim(),
      last_name: v.last.trim(),
      department: v.department,
      position: v.position,
      contract_type: v.contract_type || null,
      basic_salary: Number(v.basic_salary) || 0,
      phone: v.phone || null,
      birthday: v.birthday || null,
      onboarding_date: v.onboarding_date || null,
      payroll_status: "active",
      dealer_category: cat.dealer_category,
      is_pit_boss: cat.is_pit_boss,
    });
    setV(blankNew());
  };

  const positions = POSITIONS_BY_DEPT[v.department] ?? ALL_POSITIONS;
  const td = "h-9 align-middle border-b border-r border-border/40 whitespace-nowrap bg-primary/5";

  return (
    <tr className="bg-primary/5">
      <td className={`${td} sticky left-0 z-10`} style={{ minWidth: STICKY.photo.w, width: STICKY.photo.w, background: "hsl(var(--primary) / 0.05)" }}>
        <Plus className="w-3.5 h-3.5 text-muted-foreground mx-auto" />
      </td>
      <td className={`${td} sticky z-10`} style={{ left: STICKY.sn.left, minWidth: STICKY.sn.w, width: STICKY.sn.w, background: "hsl(var(--primary) / 0.05)" }}>
        <span className="text-muted-foreground text-[10px]">new</span>
      </td>
      <td className={`${td} sticky z-10 border-l border-border`} style={{ left: STICKY.first.left, minWidth: STICKY.first.w, width: STICKY.first.w, background: "hsl(var(--primary) / 0.05)" }}>
        <input
          autoFocus={false}
          placeholder="First name"
          value={v.first}
          onChange={(e) => set("first", e.target.value)}
          onBlur={tryCommit}
          onKeyDown={(e) => { if (e.key === "Enter") tryCommit(); }}
          className="w-full bg-transparent border-0 px-1 text-xs focus:outline-none focus:bg-background focus:border focus:border-primary/40"
        />
      </td>
      <td className={`${td} sticky z-10 border-r border-border`} style={{ left: STICKY.last.left, minWidth: STICKY.last.w, width: STICKY.last.w, background: "hsl(var(--primary) / 0.05)" }}>
        <input
          placeholder="Last name"
          value={v.last}
          onChange={(e) => set("last", e.target.value)}
          onBlur={tryCommit}
          onKeyDown={(e) => { if (e.key === "Enter") tryCommit(); }}
          className="w-full bg-transparent border-0 px-1 text-xs focus:outline-none focus:bg-background focus:border focus:border-primary/40"
        />
      </td>
      <td className={td}>{dot}</td>
      <td className={td}>
        <select
          value={v.department}
          onChange={(e) => { set("department", e.target.value); set("position", ""); }}
          onBlur={tryCommit}
          className="w-full bg-transparent border-0 px-1 text-xs focus:outline-none focus:bg-background focus:border focus:border-primary/40"
        >
          <option value="">— Dept —</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </td>
      <td className={td}>
        <select
          value={v.position}
          onChange={(e) => set("position", e.target.value)}
          onBlur={tryCommit}
          className="w-full bg-transparent border-0 px-1 text-xs focus:outline-none focus:bg-background focus:border focus:border-primary/40"
          disabled={!v.department}
        >
          <option value="">— Position —</option>
          {positions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </td>
      <td className={td}>
        <select value={v.contract_type} onChange={(e) => set("contract_type", e.target.value)} onBlur={tryCommit} className="w-full bg-transparent border-0 px-1 text-xs focus:outline-none">
          <option value="">—</option>
          {["FT", "PT", "PM"].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </td>
      <td className={`${td} text-right font-mono px-2`}>
        <input type="number" placeholder="0" value={v.basic_salary || ""} onChange={(e) => set("basic_salary", Number(e.target.value) || 0)} onBlur={tryCommit}
          className="w-full bg-transparent border-0 px-1 text-xs text-right focus:outline-none focus:bg-background focus:border focus:border-primary/40" />
      </td>
      <td className={td}>
        <input type="date" value={v.onboarding_date} onChange={(e) => set("onboarding_date", e.target.value)} onBlur={tryCommit}
          className="w-full bg-transparent border-0 px-1 text-xs focus:outline-none" />
      </td>
      <td className={`${td} ${calc}`}>{dot}</td>
      <td className={td}>
        <input type="date" value={v.birthday} onChange={(e) => set("birthday", e.target.value)} onBlur={tryCommit}
          className="w-full bg-transparent border-0 px-1 text-xs focus:outline-none" />
      </td>
      <td className={`${td} ${calc}`}>{dot}</td>
      <td className={td}>
        <input placeholder="Phone" value={v.phone} onChange={(e) => set("phone", e.target.value)} onBlur={tryCommit}
          className="w-full bg-transparent border-0 px-1 text-xs font-mono focus:outline-none focus:bg-background focus:border focus:border-primary/40" />
      </td>
      <td colSpan={21} className={`${td} text-[10px] text-muted-foreground italic px-3`}>
        Additional fields can be filled in after the employee is created — required: First, Last, Dept, Position.
      </td>
    </tr>
  );
};

// ===================== IMPORT PREVIEW TABLE =====================
const ImportPreviewTable = ({ rows }: { rows: ParsedStaffRow[] }) => {
  return (
    <div className="flex-1 min-h-0 overflow-auto rounded border border-border">
      <table className="text-[11px] border-collapse min-w-max">
        <thead className="bg-muted sticky top-0 z-10">
          <tr className="[&_th]:px-2 [&_th]:h-7 [&_th]:text-[10px] [&_th]:uppercase [&_th]:font-semibold [&_th]:text-muted-foreground [&_th]:text-left [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-border">
            <th className="sticky left-0 z-20 bg-muted" style={{ minWidth: 40 }}>#</th>
            <th className="sticky z-20 bg-muted border-r border-border" style={{ left: 40, minWidth: 200 }}>Name</th>
            <th>Dept</th><th>Position</th><th>Contract</th><th className="text-right">Salary</th>
            <th>Joining</th><th>Birthday</th><th>Phone</th>
            <th>Job Desc</th><th>Gen Det</th>
            <th>Intro</th><th>Rules</th><th>Discip</th><th>Confid</th>
            <th>Contr Start</th><th>Contr End</th>
            <th className="text-right">AL Earn</th><th className="text-right">AL Used</th><th className="text-right">AL Sold</th>
            <th>Corp Mail</th><th>Gend</th><th>Nation</th>
            <th>Lic Type</th><th>Lic Av</th><th>Pass Date</th><th>Uniform</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-muted/30 group">
              <td className="px-2 h-7 sticky left-0 bg-background group-hover:bg-muted/30 font-mono text-muted-foreground border-b border-border" style={{ minWidth: 40 }}>{i + 1}</td>
              <td className="px-2 h-7 sticky bg-background group-hover:bg-muted/30 font-medium border-r border-b border-border whitespace-nowrap" style={{ left: 40, minWidth: 200 }}>{r.full_name}</td>
              <td className="px-2 border-b border-border">{r.department || dot}</td>
              <td className="px-2 border-b border-border whitespace-nowrap">{r.position || dot}</td>
              <td className="px-2 border-b border-border">{r.contract_type || dot}</td>
              <td className="px-2 border-b border-border text-right font-mono">{fmt(r.basic_salary)}</td>
              <td className="px-2 border-b border-border">{fmtUTC(r.onboarding_date) || dot}</td>
              <td className="px-2 border-b border-border">{fmtUTC(r.birthday) || dot}</td>
              <td className="px-2 border-b border-border font-mono">{r.phone || dot}</td>
              <td className="px-2 border-b border-border max-w-[180px] truncate" title={r.job_description ?? ""}>{r.job_description || dot}</td>
              <td className="px-2 border-b border-border max-w-[180px] truncate" title={r.general_details ?? ""}>{r.general_details || dot}</td>
              <td className="px-2 border-b border-border">{r.intro_to_work ? "Yes" : dot}</td>
              <td className="px-2 border-b border-border">{r.staff_rules_acknowledged ? "Yes" : dot}</td>
              <td className="px-2 border-b border-border">{r.disciplinary_acknowledged ? "Yes" : dot}</td>
              <td className="px-2 border-b border-border">{r.confidentiality_agreement ? "Yes" : dot}</td>
              <td className="px-2 border-b border-border">{fmtUTC(r.contract_start) || dot}</td>
              <td className="px-2 border-b border-border">{fmtUTC(r.contract_end) || dot}</td>
              <td className="px-2 border-b border-border text-right font-mono">{r.annual_leave_earned || 0}</td>
              <td className="px-2 border-b border-border text-right font-mono">{r.annual_leave_used || 0}</td>
              <td className="px-2 border-b border-border text-right font-mono">{r.annual_leave_sold || 0}</td>
              <td className="px-2 border-b border-border max-w-[180px] truncate" title={r.corporate_mail ?? ""}>{r.corporate_mail || dot}</td>
              <td className="px-2 border-b border-border">{r.gender || dot}</td>
              <td className="px-2 border-b border-border">{r.nationality || dot}</td>
              <td className="px-2 border-b border-border">{r.license_type || dot}</td>
              <td className="px-2 border-b border-border">{r.license_available ? "Yes" : dot}</td>
              <td className="px-2 border-b border-border">{fmtUTC(r.license_pass_date) || dot}</td>
              <td className="px-2 border-b border-border">{r.uniform_issued ? "Yes" : dot}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ===================== PHOTO =====================
const PhotoBadge = ({ employee, canEdit }: { employee: Employee; canEdit: boolean }) => {
  const upsert = useUpsertEmployee();
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const path = `${employee.id}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("employee-photos").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("employee-photos").getPublicUrl(path);
    await upsert.mutateAsync({ id: employee.id, photo_url: data.publicUrl } as any);
  };
  return employee.photo_url ? (
    <SignedImage src={employee.photo_url} bucket="employee-photos" alt={employee.full_name} className="w-7 h-7 rounded object-cover mx-auto" />
  ) : canEdit ? (
    <label className="cursor-pointer inline-flex items-center justify-center w-7 h-7 rounded border border-dashed border-border text-muted-foreground hover:bg-muted mx-auto">
      <Camera className="w-3 h-3" />
      <input type="file" accept="image/*" className="hidden" onChange={onPick} />
    </label>
  ) : <span className="block text-center">{dot}</span>;
};

export default StaffMaster;
