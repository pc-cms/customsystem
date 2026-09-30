/**
 * Single source for department → sub-department (unit) order and labels.
 * Mirrors DB employee_unit_key(department, position, is_pit_boss).
 */
export const DEPT_ORDER = ["Pit", "Floor", "Security", "Office", "Unassigned"] as const;

export const DEPT_LABEL: Record<string, string> = {
  Pit: "Live Game", Floor: "Floor", Security: "Security", Office: "Office", Unassigned: "Unassigned",
};

export const UNITS: { key: string; label: string; dept: string }[] = [
  { key: "dealers", label: "Dealers", dept: "Pit" },
  { key: "pit_bosses", label: "Pit Bosses", dept: "Pit" },
  { key: "cashier", label: "Cash Desk", dept: "Floor" },
  { key: "bartender", label: "Bar", dept: "Floor" },
  { key: "cleaner", label: "Housekeeping", dept: "Floor" },
  { key: "hostess", label: "Slots", dept: "Floor" },
  { key: "reception", label: "Reception", dept: "Floor" },
  { key: "security", label: "Security", dept: "Security" },
  { key: "hr", label: "HR", dept: "Office" },
  { key: "it", label: "Tech", dept: "Office" },
  { key: "unassigned", label: "Unassigned", dept: "Unassigned" },
];

export const UNIT_LABEL: Record<string, string> = Object.fromEntries(UNITS.map((u) => [u.key, u.label]));

/** Normalise any stored department to one of DEPT_ORDER. */
export const normDept = (d: string | null | undefined): string =>
  (DEPT_ORDER as readonly string[]).includes(d || "") ? (d as string) : "Unassigned";

export const unitKeyOf = (department: string | null | undefined, position: string | null | undefined, isPitBoss?: boolean | null): string => {
  const pos = (position || "").trim().toLowerCase();
  switch (normDept(department)) {
    case "Pit": return isPitBoss || pos === "pit boss" || pos === "trainer" ? "pit_bosses" : "dealers";
    case "Security": return "security";
    case "Office": return pos === "it" ? "it" : "hr";
    case "Floor":
      if (pos === "cashier" || pos === "head cashier") return "cashier";
      if (pos === "bartender" || pos === "supervisor") return "bartender";
      if (pos === "attendant" || pos === "hostess" || pos === "waiter") return "hostess";
      if (pos === "receptionist") return "reception";
      return "cleaner";
    default: return "unassigned";
  }
};

export const unitIndex = (k: string) => {
  const i = UNITS.findIndex((u) => u.key === k);
  return i < 0 ? 999 : i;
};
