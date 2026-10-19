type PrintSource = "cash_desks" | "live_game" | "slots" | "office";

/** Presentation-only: callers retain their date, shift, currency and approval scope. */
export const filterExpensePrintRows = <T extends { source?: string | null }>(
  rows: T[],
  source: PrintSource,
): T[] => rows.filter(row => source === "cash_desks"
  ? row.source === "live_game" || row.source === "slots"
  : row.source === source);