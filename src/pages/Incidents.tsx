/**
 * Incidents — CCTV/Manager violation journal.
 * Inline row entry (no modal): draft row at the top of the table, save in place.
 * Roles: super_admin, manager, surveillance can post; pit/finance read-only.
 *
 * Columns:
 *  - Date + Time are sticky to the left.
 *  - Tables come from breaklist (open gaming tables).
 *  - Dealer & Inspector share the same list (rota dealers + inspectors).
 *  - Staff list (Employee) = floor + office + security + pit bosses (for non-game departments).
 *  - Employee column is enabled only when department != "game".
 *  - Min column widths so inputs are comfortable (~100px+); page scrolls horizontally.
 */
import { useMemo, useRef, useState } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Camera, Check, ChevronLeft, ChevronRight, ImageIcon, Loader2, RotateCcw, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DateRangePresets, type DatePreset, presetRange } from "@/components/ui/date-range-presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useIncidents, useCreateIncident, useUpdateIncidentFollowup, type IncidentInput, type Incident } from "@/hooks/use-incidents";
import { usePitRota, useDealers } from "@/hooks/use-dealers";
import { useStaffMembers } from "@/hooks/use-staff";
import { useGamingTables } from "@/hooks/use-tables";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image-compress";
import { SignedImage } from "@/components/SignedImage";
import { toast } from "sonner";

const DEPARTMENTS = ["game", "cash", "reception", "floor", "bar", "security", "pit"];

// Map incident department → staff_members.department values to filter Employee list.
const DEPT_STAFF_FILTER: Record<string, string[]> = {
  cash: ["cashier"],
  reception: ["reception"],
  floor: ["bartender", "hostess", "waiter", "cleaner", "it", "hr", "driver"],
  bar: ["bartender"],
  security: ["security"],
  pit: [], // pit bosses only — handled separately
};
const VIOLATION_TYPES = ["procedural", "financial", "disciplinary", "technical", "other"];

// Standing managers — always selectable, independent of rota.
const STANDING_MANAGERS = [
  "Bakha",
  "Daniyar",
  "Hussein",
  "Oxana",
  "Peter",
  "Raushan",
  "Sergey T",
  "Sveta",
  "Taras",
  "Yurii",
];

// Standing CCTV observers — always selectable, independent of rota.
const STANDING_CCTV = ["Andrew", "Alex", "Vladimir", "Vitalii"];

const todayDate = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);

const emptyForm = (): IncidentInput => ({
  incident_date: todayDate(),
  incident_time: nowTime(),
  cctv_observer: "",
  manager: "",
  department: "game",
  employees: "",
  table_name: "",
  dealer_name: "",
  inspector_name: "",
  violation_type: "procedural",
  incident: "",
  outcome: "",
  points: 0,
  comments: "",
  photo_url: null,
});

const cellInput =
  "h-10 px-2 text-sm font-mono border-0 bg-transparent focus-visible:bg-background focus-visible:ring-1 rounded-sm w-full";

// Column widths — generous so inputs are readable. (≈ +25% vs original)
const COLS = {
  date: 140,
  time: 110,
  cctv: 110,
  manager: 110,
  dept: 90,
  table: 70,
  dealer: 120,
  inspector: 120,
  employee: 130,
  type: 120,
  incident: 320,
  outcome: 230,
  points: 64,
  comments: 280,
  photo: 70,
  save: 80,
};

const Incidents = () => {
  const { roles } = useAuth();
  const canPost = roles.some((r) => ["super_admin", "manager", "surveillance"].includes(r));
  // Managers / Shift Managers / Super Admin / Surveillance see the full history by default.
  // Operational roles (pit etc.) default to the current business day.
  const isPrivileged = roles.some((r) =>
    ["super_admin", "manager", "shift_manager", "surveillance", "finance_manager"].includes(r),
  );

  const [search, setSearch] = useSessionState<string>("search", "");
  const [form, setForm] = useState<IncidentInput>(emptyForm());
  const [uploading, setUploading] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  // Journal view mode — "day" uses business-day window (D 11:00 → D+1 11:00 EAT).
  // Other presets (week/month/year/custom) use a plain calendar-date range.
  const initialPreset: DatePreset = isPrivileged ? "month" : "day";
  const [datePreset, setDatePreset] = useSessionState<DatePreset>("preset", initialPreset);
  const initialRange = presetRange(initialPreset);
  const [rangeFrom, setRangeFrom] = useSessionState<string>("from", initialRange.from);
  const [rangeTo, setRangeTo] = useSessionState<string>("to", initialRange.to);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: incidents = [], isLoading } = useIncidents(
    null,
    datePreset === "day" ? form.incident_date : null,
    datePreset === "day" ? null : { from: rangeFrom, to: rangeTo },
  );
  const createMut = useCreateIncident();

  const { data: rota = [] } = usePitRota(form.incident_date);
  const { data: allDealers = [] } = useDealers();
  const { data: gamingTables = [] } = useGamingTables();
  const { data: staffMembers = [] } = useStaffMembers();
  

  // All non-archived gaming tables. We don't filter by status — incidents
  // can be logged any time of day, including when tables are closed.
  const tableOptions = useMemo(
    () =>
      (gamingTables as any[])
        .filter((t) => !t.is_archived)
        .map((t) => t.name)
        .sort(),
    [gamingTables],
  );

  // Dealer / Inspector / Pit Boss lists — from the FULL employees roster,
  // independent of the day's rota. Incidents can involve any staff member.
  const rotaNames = useMemo(() => {
    const dealers = new Set<string>();
    const inspectors = new Set<string>();
    const pitBosses = new Set<string>();
    for (const d of allDealers as any[]) {
      if (d.is_active === false) continue;
      const name = d.name;
      if (!name) continue;
      if (d.is_pit_boss) pitBosses.add(name);
      else if (d.category === "I" || d.category === "inspector") inspectors.add(name);
      else dealers.add(name);
    }
    const dealerInspector = [...new Set([...dealers, ...inspectors])].sort();
    return {
      dealerInspector,
      managers: [...STANDING_MANAGERS].sort(),
      pitBosses: [...pitBosses].sort(),
    };
  }, [allDealers]);

  // Full staff list for "Employee" column, filtered by selected department.
  // Always from the full roster (not rota-bound).
  const staffOptions = useMemo(() => {
    const dept = form.department || "";
    if (dept === "game" || !dept) return [];
    const names = new Set<string>();
    if (dept === "pit") {
      for (const pb of rotaNames.pitBosses) names.add(pb);
      return [...names].sort();
    }
    const allowed = new Set(DEPT_STAFF_FILTER[dept] || []);
    if (allowed.size > 0) {
      for (const s of staffMembers as any[]) {
        if (s.is_active !== false && allowed.has(s.department)) names.add(s.name);
      }
    }
    return [...names].sort();
  }, [form.department, staffMembers, rotaNames.pitBosses]);

  const filtered = useMemo(() => {
    if (!search.trim()) return incidents;
    const q = search.toLowerCase();
    return incidents.filter((i) =>
      [
        i.dealer_name,
        i.inspector_name,
        i.manager,
        i.cctv_observer,
        i.violation_type,
        i.incident,
        i.outcome,
        i.comments,
        i.table_name,
        i.department,
        i.employees,
        i.incident_date,
      ].some((v) => (v || "").toLowerCase().includes(q)),
    );
  }, [incidents, search]);

  const totalPts = useMemo(() => filtered.reduce((s, i) => s + (i.points || 0), 0), [filtered]);

  const setF = <K extends keyof IncidentInput>(k: K, v: IncidentInput[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const isGame = (form.department || "game") === "game";

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const path = `${new Date().toISOString().slice(0, 10)}/${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("incident-photos")
        .upload(path, compressed.thumbnail, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("incident-photos").getPublicUrl(path);
      setF("photo_url", publicUrl);
      toast.success("Photo attached");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!form.incident.trim()) {
      toast.error("Incident description is required");
      return;
    }
    try {
      await createMut.mutateAsync(form);
      toast.success("Incident logged");
      setForm(emptyForm());
    } catch (e: any) {
      toast.error(e.message || "Failed to log");
    }
  };

  // Helpers for sticky-left columns. Header uses muted band; body uses solid background.
  // Inset shadow replaces border-r so border-collapse cannot eat/duplicate the 1px divider during scroll.
  const stickyDivider = "shadow-[inset_-1px_0_0_hsl(var(--border))]";
  const stickyDateHead = "sticky left-0 z-30 bg-muted overflow-hidden";
  const stickyTimeHead = "sticky z-30 bg-muted overflow-hidden";
  const stickyDate = "sticky left-0 z-30 bg-background overflow-hidden";
  const stickyTime = "sticky z-30 bg-background overflow-hidden";
  const stickyTimeLeft = { left: COLS.date };

  return (
    <PageShell>
      <PageHeader
        icon={AlertTriangle}
        title="Incidents"
        subtitle={`Violation journal · ${filtered.length} entries · ${totalPts} pts`}
        belowHeader={
          <div className="flex items-center gap-2 flex-wrap w-full">
            <DateRangePresets
              preset={datePreset}
              from={datePreset === "day" ? form.incident_date : rangeFrom}
              to={datePreset === "day" ? form.incident_date : rangeTo}
              onChange={({ preset, from: f, to: t }) => {
                setDatePreset(preset);
                if (preset === "day") {
                  setF("incident_date", f);
                } else {
                  setRangeFrom(f);
                  setRangeTo(t);
                }
              }}
            />
            {datePreset === "day" && form.incident_date !== todayDate() && (
              <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setF("incident_date", todayDate())}>
                Today
              </Button>
            )}
            <div className="relative ml-auto">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-56"
              />
            </div>
          </div>
        }
      />


      <PageSection title="Journal" card={false}>
        <div className="rounded-md border border-border overflow-x-auto">
          <table className="text-sm font-mono border-collapse" style={{ minWidth: "2250px" }}>
            <colgroup>
              <col style={{ width: COLS.date }} />
              <col style={{ width: COLS.time }} />
              <col style={{ width: COLS.cctv }} />
              <col style={{ width: COLS.manager }} />
              <col style={{ width: COLS.dept }} />
              <col style={{ width: COLS.table }} />
              <col style={{ width: COLS.dealer }} />
              <col style={{ width: COLS.inspector }} />
              <col style={{ width: COLS.employee }} />
              <col style={{ width: COLS.type }} />
              <col style={{ width: COLS.incident }} />
              <col style={{ width: COLS.outcome }} />
              <col style={{ width: COLS.points }} />
              <col style={{ width: COLS.comments }} />
              <col style={{ width: COLS.photo }} />
              {canPost && <col style={{ width: COLS.save }} />}
            </colgroup>
            <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className={`px-3 py-2.5 text-left ${stickyDateHead} ${stickyDivider}`}>Date</th>
                <th className={`px-3 py-2.5 text-left ${stickyTimeHead} ${stickyDivider}`} style={stickyTimeLeft}>
                  Time
                </th>
                <th className="px-3 py-2.5 text-left">CCTV</th>
                <th className="px-3 py-2.5 text-left">Manager</th>
                <th className="px-3 py-2.5 text-left">Dept</th>
                <th className="px-3 py-2.5 text-left">Table</th>
                <th className="px-3 py-2.5 text-left">Dealer</th>
                <th className="px-3 py-2.5 text-left">Inspector</th>
                <th className="px-3 py-2.5 text-left">Employee</th>
                <th className="px-3 py-2.5 text-left">Type</th>
                <th className="px-3 py-2.5 text-left">Incident *</th>
                <th className="px-3 py-2.5 text-left">Outcome</th>
                <th className="px-3 py-2.5 text-right">Pts</th>
                <th className="px-3 py-2.5 text-left">Comments</th>
                <th className="px-3 py-2.5 text-center">Photo</th>
                {canPost && <th className="px-3 py-2.5 text-center">Save</th>}
              </tr>
            </thead>
            <tbody>
              {/* Draft row — inline entry */}
              {canPost && (
                <tr className="border-t border-border bg-primary/5">
                  <td className={`px-1 py-1 ${stickyDate} ${stickyDivider}`}>
                    <Input
                      type="date"
                      value={form.incident_date}
                      onChange={(e) => setF("incident_date", e.target.value)}
                      className={cellInput}
                    />
                  </td>
                  <td className={`px-1 py-1 ${stickyTime} ${stickyDivider}`} style={stickyTimeLeft}>
                    <Input
                      type="time"
                      value={form.incident_time}
                      onChange={(e) => setF("incident_time", e.target.value)}
                      className={cellInput}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      list="incident-cctv"
                      value={form.cctv_observer || ""}
                      onChange={(e) => setF("cctv_observer", e.target.value)}
                      placeholder="…"
                      className={cellInput}
                    />
                    <datalist id="incident-cctv">
                      {STANDING_CCTV.map((n) => <option key={n} value={n} />)}
                    </datalist>
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      list="incident-managers"
                      value={form.manager || ""}
                      onChange={(e) => setF("manager", e.target.value)}
                      placeholder="…"
                      className={cellInput}
                    />
                    <datalist id="incident-managers">
                      {rotaNames.managers.map((n) => <option key={n} value={n} />)}
                    </datalist>
                  </td>
                  <td className="px-1 py-1">
                    <select
                      value={form.department || ""}
                      onChange={(e) => setF("department", e.target.value)}
                      className={`${cellInput} bg-transparent`}
                    >
                      {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      list="incident-tables"
                      value={form.table_name || ""}
                      onChange={(e) => setF("table_name", e.target.value)}
                      placeholder={isGame ? "…" : "—"}
                      className={cellInput}
                      disabled={!isGame}
                    />
                    <datalist id="incident-tables">
                      {tableOptions.map((n) => <option key={n} value={n} />)}
                    </datalist>
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      list="incident-dealers"
                      value={form.dealer_name || ""}
                      onChange={(e) => setF("dealer_name", e.target.value)}
                      placeholder={isGame ? "…" : "—"}
                      className={cellInput}
                      disabled={!isGame}
                    />
                    <datalist id="incident-dealers">
                      {rotaNames.dealerInspector.map((n) => <option key={n} value={n} />)}
                    </datalist>
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      list="incident-dealers"
                      value={form.inspector_name || ""}
                      onChange={(e) => setF("inspector_name", e.target.value)}
                      placeholder={isGame ? "…" : "—"}
                      className={cellInput}
                      disabled={!isGame}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      list="incident-staff"
                      value={form.employees || ""}
                      onChange={(e) => setF("employees", e.target.value)}
                      placeholder={isGame ? "—" : "…"}
                      className={cellInput}
                      disabled={isGame}
                    />
                    <datalist id="incident-staff">
                      {staffOptions.map((n) => <option key={n} value={n} />)}
                    </datalist>
                  </td>
                  <td className="px-1 py-1">
                    <select
                      value={form.violation_type || ""}
                      onChange={(e) => setF("violation_type", e.target.value)}
                      className={`${cellInput} bg-transparent`}
                    >
                      {VIOLATION_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={form.incident}
                      onChange={(e) => setF("incident", e.target.value)}
                      placeholder="describe…"
                      className={cellInput}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={form.outcome || ""}
                      onChange={(e) => setF("outcome", e.target.value)}
                      placeholder="…"
                      className={cellInput}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="number"
                      min={0}
                      value={form.points || 0}
                      onChange={(e) => setF("points", Number(e.target.value) || 0)}
                      className={`${cellInput} text-right`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={form.comments || ""}
                      onChange={(e) => setF("comments", e.target.value)}
                      placeholder="…"
                      className={cellInput}
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                    {form.photo_url ? (
                      <div className="relative inline-block">
                        <SignedImage
                          src={form.photo_url}
                          bucket="incident-photos"
                          alt=""
                          className="h-7 w-7 object-cover rounded cursor-pointer"
                          onClick={() => setViewPhoto(form.photo_url)}
                        />
                        <button
                          type="button"
                          onClick={() => setF("photo_url", null)}
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center"
                        >
                          <X className="w-2 h-2" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-muted hover:bg-muted/70 text-muted-foreground"
                        title="Attach photo"
                      >
                        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </td>
                  <td className="px-1 py-1">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        size="sm"
                        onClick={handleSubmit}
                        disabled={createMut.isPending || !form.incident.trim()}
                        className="h-7 w-7 p-0"
                        title="Save"
                      >
                        {createMut.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setForm(emptyForm())}
                        className="h-7 w-7 p-0"
                        title="Reset"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}

              {isLoading ? (
                <tr>
                  <td colSpan={canPost ? 16 : 15} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={canPost ? 16 : 15} className="text-center py-8 text-muted-foreground">
                    {incidents.length === 0 ? "No incidents yet." : "No matches for the search."}
                  </td>
                </tr>
              ) : (
                filtered.map((i) => (
                  <IncidentRow
                    key={i.id}
                    incident={i}
                    canEdit={canPost}
                    onView={(url) => setViewPhoto(url)}
                    stickyDate={stickyDate}
                    stickyTime={stickyTime}
                    stickyDivider={stickyDivider}
                    stickyTimeLeft={stickyTimeLeft}
                    cellInput={cellInput}
                    tableOptions={tableOptions}
                    dealerOptions={rotaNames.dealerInspector}
                    managerOptions={rotaNames.managers}
                    pitBosses={rotaNames.pitBosses}
                    staffMembers={staffMembers as any[]}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageSection>

      <Dialog open={!!viewPhoto} onOpenChange={(o) => !o && setViewPhoto(null)}>
        <DialogContent className="max-w-5xl p-0 bg-background border-border overflow-hidden">
          {viewPhoto && (
            <SignedImage
              src={viewPhoto}
              bucket="incident-photos"
              alt="Incident photo"
              className="w-full h-auto max-h-[90vh] object-contain bg-muted"
            />
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
};

export default Incidents;

// ─────────────────────────────────────────────────────────────────────────────
// Row renderer with inline edit for outcome / points / comments.
// Other fields are read-only (DB trigger blocks any other change).
// ─────────────────────────────────────────────────────────────────────────────
interface IncidentRowProps {
  incident: Incident;
  canEdit: boolean;
  onView: (url: string) => void;
  stickyDate: string;
  stickyTime: string;
  stickyDivider: string;
  stickyTimeLeft: React.CSSProperties;
  cellInput: string;
  tableOptions: string[];
  dealerOptions: string[];
  managerOptions: string[];
  pitBosses: string[];
  staffMembers: any[];
}

const IncidentRow = ({
  incident: i,
  canEdit,
  onView,
  stickyDate,
  stickyTime,
  stickyDivider,
  stickyTimeLeft,
  cellInput,
  tableOptions,
  dealerOptions,
  managerOptions,
  pitBosses,
  staffMembers,
}: IncidentRowProps) => {
  const updateMut = useUpdateIncidentFollowup();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>({});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const editFileRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft({
      incident_date: i.incident_date,
      incident_time: (i.incident_time || "").slice(0, 5),
      cctv_observer: i.cctv_observer || "",
      manager: i.manager || "",
      department: i.department || "game",
      employees: i.employees || "",
      table_name: i.table_name || "",
      dealer_name: i.dealer_name || "",
      inspector_name: i.inspector_name || "",
      violation_type: i.violation_type || "procedural",
      incident: i.incident || "",
      outcome: i.outcome || "",
      points: i.points || 0,
      comments: i.comments || "",
      photo_url: i.photo_url,
    });
    setEditing(true);
  };

  const setD = (k: string, v: any) => setDraft((p: any) => ({ ...p, [k]: v }));
  const isGameDraft = (draft.department || "game") === "game";

  const staffOptions = useMemo(() => {
    const dept = draft.department || "";
    if (dept === "game" || !dept) return [];
    if (dept === "pit") return [...pitBosses].sort();
    const allowed = new Set(DEPT_STAFF_FILTER[dept] || []);
    if (allowed.size === 0) return [];
    return [...new Set(
      (staffMembers as any[])
        .filter((s) => s.is_active !== false && allowed.has(s.department))
        .map((s) => s.name)
    )].sort();
  }, [draft.department, staffMembers, pitBosses]);

  const handleEditPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const compressed = await compressImage(file);
      const path = `${new Date().toISOString().slice(0, 10)}/${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("incident-photos")
        .upload(path, compressed.thumbnail, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("incident-photos").getPublicUrl(path);
      setD("photo_url", publicUrl);
      toast.success("Photo replaced");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploadingPhoto(false);
      if (editFileRef.current) editFileRef.current.value = "";
    }
  };

  const save = async () => {
    if (!String(draft.incident || "").trim()) {
      toast.error("Incident description is required");
      return;
    }
    try {
      await updateMut.mutateAsync({
        id: i.id,
        patch: {
          incident_date: draft.incident_date,
          incident_time: draft.incident_time || i.incident_time,
          cctv_observer: draft.cctv_observer || null,
          manager: draft.manager || null,
          department: draft.department || null,
          employees: draft.employees || null,
          table_name: draft.table_name || null,
          dealer_name: draft.dealer_name || null,
          inspector_name: draft.inspector_name || null,
          violation_type: draft.violation_type || null,
          incident: draft.incident,
          outcome: draft.outcome || null,
          points: Number(draft.points) || 0,
          comments: draft.comments || null,
          photo_url: draft.photo_url,
        },
      });
      toast.success("Updated · audit logged");
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message || "Update failed");
    }
  };

  const ro = (v: any) => v || "·";

  return (
    <tr className="border-t border-border hover:bg-muted/30">
      <td className={`px-1 py-1 whitespace-nowrap ${stickyDate} ${stickyDivider}`}>
        {editing ? (
          <Input type="date" value={draft.incident_date} onChange={(e) => setD("incident_date", e.target.value)} className={cellInput} />
        ) : i.incident_date}
      </td>
      <td className={`px-1 py-1 whitespace-nowrap ${stickyTime} ${stickyDivider}`} style={stickyTimeLeft}>
        {editing ? (
          <Input type="time" value={draft.incident_time} onChange={(e) => setD("incident_time", e.target.value)} className={cellInput} />
        ) : i.incident_time?.slice(0, 5)}
      </td>
      <td className="px-1 py-1">
        {editing ? (
          <>
            <Input list={`row-cctv-${i.id}`} value={draft.cctv_observer} onChange={(e) => setD("cctv_observer", e.target.value)} className={cellInput} />
            <datalist id={`row-cctv-${i.id}`}>{STANDING_CCTV.map((n) => <option key={n} value={n} />)}</datalist>
          </>
        ) : ro(i.cctv_observer)}
      </td>
      <td className="px-1 py-1">
        {editing ? (
          <>
            <Input list={`row-mgr-${i.id}`} value={draft.manager} onChange={(e) => setD("manager", e.target.value)} className={cellInput} />
            <datalist id={`row-mgr-${i.id}`}>{managerOptions.map((n) => <option key={n} value={n} />)}</datalist>
          </>
        ) : ro(i.manager)}
      </td>
      <td className="px-1 py-1">
        {editing ? (
          <select value={draft.department || ""} onChange={(e) => setD("department", e.target.value)} className={`${cellInput} bg-transparent`}>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        ) : ro(i.department)}
      </td>
      <td className="px-1 py-1">
        {editing ? (
          <>
            <Input list={`row-tab-${i.id}`} value={draft.table_name} onChange={(e) => setD("table_name", e.target.value)} className={cellInput} disabled={!isGameDraft} />
            <datalist id={`row-tab-${i.id}`}>{tableOptions.map((n) => <option key={n} value={n} />)}</datalist>
          </>
        ) : ro(i.table_name)}
      </td>
      <td className="px-1 py-1">
        {editing ? (
          <>
            <Input list={`row-dl-${i.id}`} value={draft.dealer_name} onChange={(e) => setD("dealer_name", e.target.value)} className={cellInput} disabled={!isGameDraft} />
            <datalist id={`row-dl-${i.id}`}>{dealerOptions.map((n) => <option key={n} value={n} />)}</datalist>
          </>
        ) : ro(i.dealer_name)}
      </td>
      <td className="px-1 py-1">
        {editing ? (
          <Input list={`row-dl-${i.id}`} value={draft.inspector_name} onChange={(e) => setD("inspector_name", e.target.value)} className={cellInput} disabled={!isGameDraft} />
        ) : ro(i.inspector_name)}
      </td>
      <td className="px-1 py-1">
        {editing ? (
          <>
            <Input list={`row-st-${i.id}`} value={draft.employees} onChange={(e) => setD("employees", e.target.value)} className={cellInput} disabled={isGameDraft} />
            <datalist id={`row-st-${i.id}`}>{staffOptions.map((n) => <option key={n} value={n} />)}</datalist>
          </>
        ) : ro(i.employees)}
      </td>
      <td className="px-1 py-1">
        {editing ? (
          <select value={draft.violation_type || ""} onChange={(e) => setD("violation_type", e.target.value)} className={`${cellInput} bg-transparent`}>
            {VIOLATION_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        ) : i.violation_type ? <Badge variant="outline" className="text-xs">{i.violation_type}</Badge> : "·"}
      </td>
      <td className="px-1 py-1 whitespace-normal break-words">
        {editing ? (
          <Input value={draft.incident} onChange={(e) => setD("incident", e.target.value)} className={cellInput} />
        ) : i.incident}
      </td>
      <td className="px-1 py-1 whitespace-normal break-words">
        {editing ? (
          <Input value={draft.outcome} onChange={(e) => setD("outcome", e.target.value)} className={cellInput} />
        ) : ro(i.outcome)}
      </td>
      <td className="px-1 py-1 text-right font-semibold">
        {editing ? (
          <Input type="number" min={0} value={draft.points} onChange={(e) => setD("points", Number(e.target.value) || 0)} className={`${cellInput} text-right`} />
        ) : (i.points || 0)}
      </td>
      <td className="px-1 py-1 whitespace-normal break-words text-muted-foreground">
        {editing ? (
          <Input value={draft.comments} onChange={(e) => setD("comments", e.target.value)} className={cellInput} />
        ) : ro(i.comments)}
      </td>
      <td className="px-1 py-1 text-center">
        <input ref={editFileRef} type="file" accept="image/*" className="hidden" onChange={handleEditPhoto} />
        {editing ? (
          draft.photo_url ? (
            <div className="relative inline-block">
              <SignedImage src={draft.photo_url} bucket="incident-photos" alt="" className="h-7 w-7 object-cover rounded cursor-pointer" onClick={() => onView(draft.photo_url)} />
              <button type="button" onClick={() => setD("photo_url", null)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center" title="Remove photo">
                <X className="w-2 h-2" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => editFileRef.current?.click()} disabled={uploadingPhoto} className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-muted hover:bg-muted/70 text-muted-foreground" title="Attach photo">
              {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            </button>
          )
        ) : i.photo_url ? (
          <button type="button" onClick={() => onView(i.photo_url!)} className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 hover:bg-primary/20 text-primary" title="View photo">
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="text-muted-foreground">·</span>
        )}
      </td>

      {canEdit && (
        <td className="px-1 py-1">
          <div className="flex items-center justify-center gap-1">
            {editing ? (
              <>
                <Button size="sm" onClick={save} disabled={updateMut.isPending} className="h-7 w-7 p-0" title="Save">
                  {updateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 w-7 p-0" title="Cancel">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={startEdit} className="h-9 px-3 text-xs" title="Edit (audit-logged)">
                Edit
              </Button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
};

