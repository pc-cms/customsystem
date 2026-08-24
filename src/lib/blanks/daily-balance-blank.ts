/**
 * Daily Balance Sheet blank — A4 landscape, grouped rows and day columns.
 */
import { blankTable, createDoc, drawHeader, drawSignatures, savePdf } from "./pdf-blank";

const GROUPS: { title: string; rows: string[] }[] = [
  { title: "INCOMES", rows: ["Live Game", "Slots", "Poker / Club", "Bar / POS", "Commissions"] },
  { title: "EXPENSES", rows: ["Salary", "Operational", "Utilities", "Extra expenses"] },
  { title: "TRANSFERS", rows: ["Bank in", "Bank out", "Between wallets"] },
  { title: "MONEY", rows: ["Cash TZS", "Cash USD", "Bank", "Cashless"] },
  { title: "BALANCES", rows: ["Opening balance", "Closing balance", "Difference"] },
];

export const downloadDailyBalanceBlank = (dayColumns = 10) => {
  const doc = createDoc("landscape");
  const startY = drawHeader(doc, "Daily Balance Sheet", "Blank form · fill in by hand");

  const head = [["Item", ...Array.from({ length: dayColumns }, (_, i) => String(i + 1)), "TOTAL"]];
  const cols = dayColumns + 2;
  const body: (string)[][] = [];
  const groupRowIndexes: number[] = [];

  for (const g of GROUPS) {
    groupRowIndexes.push(body.length);
    body.push([g.title, ...Array.from({ length: cols - 1 }, () => "")]);
    for (const r of g.rows) body.push([r, ...Array.from({ length: cols - 1 }, () => "")]);
  }

  blankTable(doc, {
    startY,
    head,
    body,
    styles: { fontSize: 7, minCellHeight: 5.6, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 } },
    columnStyles: { 0: { cellWidth: 45, halign: "left" } },
    margin: { left: 8, right: 8, bottom: 22 },
    didParseCell: (data) => {
      if (data.section === "body" && groupRowIndexes.includes(data.row.index)) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [238, 238, 238];
      }
      if (data.section === "body" && data.column.index > 0) {
        data.cell.styles.halign = "right";
      }
    },
  });

  drawSignatures(doc, ["Accountant", "Finance Manager", "General Manager"]);
  savePdf(doc, "blank-daily-balance-sheet.pdf");
};
