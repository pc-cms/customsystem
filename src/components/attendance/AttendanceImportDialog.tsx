/**
 * Shared "Import Attendance" dialog for every monthly attendance grid
 * (Live Game / Floor / Security / Office / Monthly Attendance).
 *
 * Accepts an .xlsx or .csv file laid out like the exported grid:
 * one row per person, a name column, and one column per day of the month.
 * Values use the same codes as the grid (hours, A, S, SP, L, 8S, 6L …).
 *
 * Nothing is written until the user confirms in the preview.
 */
import { useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { normalizeAttInput } from "@/lib/attendance-code";
import { toast } from "sonner";

export interface ImportPerson {
  id: string;
  name: string;
}

export interface ParsedAttRow {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  day: number;
  value: string;
}

interface Props {
  /** People shown in the grid — import only touches these. */
  people: ImportPerson[];
  /** Month being displayed, "YYYY-MM". */
  month: string;
  /** Persist one cell. Called once per changed value. */
  onApply: (rows: ParsedAttRow[]) => void | Promise<void>;
  disabled?: boolean;
  label?: string;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const readSheet = async (file: File): Promise<string[][]> => {
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "")
      .map((line) => line.split(/[,;\t]/).map((c) => c.replace(/^"|"$/g, "").trim()));
  }
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    const count = Math.max(Number(row.cellCount) || 0, Number((ws as any).columnCount) || 0);
    for (let c = 1; c <= count; c++) {
      const v = row.getCell(c).value as any;
      let text = "";
      if (v == null) text = "";
      else if (typeof v === "object" && "result" in v) text = String(v.result ?? "");
      else if (typeof v === "object" && "richText" in v) text = (v.richText as any[]).map((t) => t.text).join("");
      else if (typeof v === "object" && "text" in v) text = String((v as any).text ?? "");
      else text = String(v);
      cells.push(text.trim());
    }
    out.push(cells);
  });
  return out;
};

export const AttendanceImportDialog = ({ people, month, onApply, disabled, label = "Import" }: Props) => {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedAttRow[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const daysInMonth = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  }, [month]);

  const nameIndex = useMemo(() => {
    const exact = new Map<string, ImportPerson>();
    const firstCount = new Map<string, number>();
    for (const p of people) {
      exact.set(norm(p.name), p);
      const f = norm(p.name).split(" ")[0];
      firstCount.set(f, (firstCount.get(f) || 0) + 1);
    }
    const byFirst = new Map<string, ImportPerson>();
    for (const p of people) {
      const f = norm(p.name).split(" ")[0];
      if ((firstCount.get(f) || 0) === 1) byFirst.set(f, p);
    }
    return { exact, byFirst };
  }, [people]);

  const matchPerson = (raw: string): ImportPerson | null => {
    const n = norm(raw);
    if (!n) return null;
    const hit = nameIndex.exact.get(n);
    if (hit) return hit;
    const first = nameIndex.byFirst.get(n.split(" ")[0]);
    if (first) return first;
    // last resort: unique substring match
    const cands = people.filter((p) => norm(p.name).includes(n) || n.includes(norm(p.name)));
    return cands.length === 1 ? cands[0] : null;
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const grid = await readSheet(file);
      if (!grid.length) { toast.error("File is empty"); return; }

      // Locate the header row: the row containing the most day numbers 1..daysInMonth.
      let headerRow = -1;
      let best = 0;
      grid.slice(0, 15).forEach((r, i) => {
        const hits = r.filter((c) => {
          const n = parseInt(c, 10);
          return String(n) === c.trim() && n >= 1 && n <= daysInMonth;
        }).length;
        if (hits > best) { best = hits; headerRow = i; }
      });

      const dayByCol = new Map<number, number>();
      if (headerRow >= 0 && best >= 5) {
        grid[headerRow].forEach((c, ci) => {
          const n = parseInt(c, 10);
          if (String(n) === c.trim() && n >= 1 && n <= daysInMonth) dayByCol.set(ci, n);
        });
      }

      const parsed: ParsedAttRow[] = [];
      const missing: string[] = [];
      const [y, m] = month.split("-").map(Number);

      grid.forEach((r, ri) => {
        if (ri <= headerRow) return;
        // Name cell = first non-numeric, non-empty cell.
        let nameCol = -1;
        for (let c = 0; c < r.length; c++) {
          const v = (r[c] || "").trim();
          if (!v) continue;
          if (/^[0-9.]+$/.test(v)) continue;
          nameCol = c;
          break;
        }
        if (nameCol < 0) return;
        const person = matchPerson(r[nameCol]);
        if (!person) {
          const label = r[nameCol].trim();
          if (label && label.length > 1 && !/^(department|employee|name|total|totals)$/i.test(label)) missing.push(label);
          return;
        }
        for (let c = 0; c < r.length; c++) {
          const day = dayByCol.size ? dayByCol.get(c) : (c > nameCol ? c - nameCol : undefined);
          if (!day || day < 1 || day > daysInMonth) continue;
          const raw = (r[c] || "").trim();
          if (raw === "") continue;
          const value = normalizeAttInput(raw);
          if (value === null || value === "") continue;
          parsed.push({
            id: person.id,
            name: person.name,
            day,
            date: `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
            value,
          });
        }
      });

      setRows(parsed);
      setUnmatched(Array.from(new Set(missing)).slice(0, 20));
      setOpen(true);
      if (!parsed.length) toast.error("No attendance values recognised in this file");
    } catch (e: any) {
      toast.error(e?.message || "Could not read the file");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await onApply(rows);
      toast.success(`Imported ${rows.length} attendance values`);
      setOpen(false);
      setRows([]);
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const peopleCount = new Set(rows.map((r) => r.id)).size;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
      />
      <Button
        variant="outline"
        size="sm"
        className="gap-1 text-xs no-print"
        disabled={disabled || busy}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="w-3.5 h-3.5" /> {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" /> Import Attendance
            </DialogTitle>
            <DialogDescription>
              Review before applying — existing values for the same day are overwritten.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="flex gap-6 font-mono">
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Values</div>
                <div className="text-xl font-bold">{rows.length}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">People</div>
                <div className="text-xl font-bold">{peopleCount}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Month</div>
                <div className="text-xl font-bold">{month}</div>
              </div>
            </div>

            {unmatched.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                <div className="flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" /> Not matched ({unmatched.length})
                </div>
                <div className="mt-1 text-muted-foreground">{unmatched.join(", ")}</div>
              </div>
            )}

            <div className="max-h-52 overflow-auto rounded-md border border-border">
              <table className="w-full text-xs font-mono">
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="px-2 py-0.5 truncate max-w-[180px]">{r.name}</td>
                      <td className="px-2 py-0.5 text-muted-foreground">{r.date}</td>
                      <td className="px-2 py-0.5 font-bold text-right">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={confirm} disabled={busy || rows.length === 0}>
              Apply {rows.length > 0 ? `(${rows.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AttendanceImportDialog;
