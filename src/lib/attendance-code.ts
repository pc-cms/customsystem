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
export const normalizeAttInput = (raw: string): string | null => {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "") return "";
  if (v === "A" || v === "S" || v === "SP" || v === "L") return v;
  // Shift shortcuts
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
