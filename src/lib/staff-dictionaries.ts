/**
 * Canonical staff dictionaries for Staff Master dropdowns.
 * Position determines dealer_category and is_pit_boss for Live Game.
 */
export const DEPARTMENTS = [
  "Office",
  "Pit",
  "Floor",
  "Security",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const POSITIONS_BY_DEPT: Record<string, string[]> = {
  "Pit":      ["Dealer", "Inspector", "Trainee", "Pit Boss"],
  "Floor":    ["Cashier", "Head Cashier", "Bartender", "Waiter", "Hostess", "Receptionist", "Cleaner", "Housekeeper"],
  "Security": ["Security", "Supervisor Security"],
  "Office":   ["IT", "HR", "Manager", "Trainer"],
};

export const ALL_POSITIONS = Array.from(
  new Set(Object.values(POSITIONS_BY_DEPT).flat())
);

/** Derive dealer_category + is_pit_boss from a Live Game position string. */
export function deriveCategory(department: string | null, position: string | null): {
  dealer_category: "dealer" | "inspector" | "trainee" | null;
  is_pit_boss: boolean;
} {
  if (department !== "Pit") return { dealer_category: null, is_pit_boss: false };
  switch (position) {
    case "Dealer":    return { dealer_category: "dealer",    is_pit_boss: false };
    case "Inspector": return { dealer_category: "inspector", is_pit_boss: false };
    case "Trainee":   return { dealer_category: "trainee",   is_pit_boss: false };
    case "Pit Boss":  return { dealer_category: null,        is_pit_boss: true  };
    default:          return { dealer_category: null,        is_pit_boss: false };
  }
}

/** Split full_name → first / last on the fly. First word = first name. */
export function splitName(full: string | null | undefined): { first: string; last: string } {
  const s = (full || "").trim();
  if (!s) return { first: "", last: "" };
  const parts = s.split(/\s+/);
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export function joinName(first: string, last: string): string {
  return [first.trim(), last.trim()].filter(Boolean).join(" ");
}
