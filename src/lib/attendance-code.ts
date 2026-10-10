/**
 * Shared attendance code parsing for Pit (dealers) and Staff (all other
 * departments). Codes are stored raw in dealer_attendance.value /
 * staff_attendance.value and interpreted identically everywhere:
 *
 *   ""      — nothing entered
 *   "A"     — Absent (no hours)
 *   "S"     — Sick (no hours)
 *   "SP"    — Suspend (no hours)
 *   "L"     — Late (no hours recorded)
 *   "<n>"   — worked n hours
 *   "<n>S"  — worked n hours, then went sick
 *   "<n>L"  — came late, worked n hours
 *
 * Numeric prefixes ALWAYS count as worked hours (payroll, tips, bonuses).
 */

export type AttKind =
  | "empty"
  | "absent"
  | "sick"
  | "suspend"
  | "late"
  | "hours"
  | "hours-sick"
  | "hours-late";

export interface ParsedAtt {
  kind: AttKind;
  hours: number;
  /** true for any variant that carries worked hours */
  worked: boolean;
}

export const parseAttValue = (val: string | null | undefined): ParsedAtt => {
  const v = (val ?? "").trim().toUpperCase();
  if (!v) return { kind: "empty", hours: 0, worked: false };
  if (v === "A") return { kind: "absent", hours: 0, worked: false };
  if (v === "S") return { kind: "sick", hours: 0, worked: false };
  if (v === "SP") return { kind: "suspend", hours: 0, worked: false };
  if (v === "L") return { kind: "late", hours: 0, worked: false };
  const m = /^(\d+(?:\.\d+)?)(S|L)?$/.exec(v);
  if (m) {
    const n = Number(m[1]);
    if (!isNaN(n)) {
      const kind: AttKind = m[2] === "S" ? "hours-sick" : m[2] === "L" ? "hours-late" : "hours";
      return { kind, hours: n, worked: n > 0 };
    }
  }
  return { kind: "empty", hours: 0, worked: false };
};

/** Normalize free-text input into a storable attendance value ("" when invalid). */
export const normalizeAttInput = (raw: string, codeHours?: Record<string, number>): string | null => {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "") return "";
  if (v === "A" || v === "S" || v === "SP" || v === "L") return v;
  // Configured shift codes of this casino + sub-department win over legacy shortcuts.
  if (codeHours && v in codeHours) {
    const h = Number(codeHours[v]);
    return h > 0 ? String(h) : null;
  }
  // Legacy shift shortcuts
  if (v === "M" || v === "EM") return "11";
  if (v === "SW" || v === "ESW") return "11";
  if (v === "T") return "6";
  if (v === "N" || v === "EN" || v === "ED" || v === "G") return "8";
  const m = /^(\d+(?:\.\d+)?)(S|L)?$/.exec(v);
  if (m) {
    const n = Number(m[1]);
    if (!isNaN(n) && n >= 0 && n <= 24) return `${n}${m[2] ?? ""}`;
  }
  return null; // invalid — caller should ignore
};

/** Status codes that carry no hours. */
export const isStatusCode = (kind: AttKind) =>
  kind === "absent" || kind === "sick" || kind === "suspend" || kind === "late";

const NON_WORKING_ROTA = new Set(["", "O", "OFF", "L", "V", "A", "S", "SP"]);

/**
 * A rota code counts as a scheduled working shift when it is not a status/off
 * code and, if configured for the unit, has hours > 0.
 */
export const isWorkingRotaCode = (code: string | null | undefined, codeHours?: Record<string, number>): boolean => {
  const c = (code ?? "").trim().toUpperCase();
  if (NON_WORKING_ROTA.has(c)) return false;
  if (codeHours && c in codeHours) return Number(codeHours[c]) > 0;
  return true;
};
