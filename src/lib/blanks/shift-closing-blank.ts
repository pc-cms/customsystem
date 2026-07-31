/**
 * Shift Closing blank — A4 landscape grid for live game tables.
 * Table names may be pre-printed; all numeric cells stay empty.
 */
import { blankTable, createDoc, drawHeader, drawSignatures, emptyRows, savePdf } from "./pdf-blank";

const COLUMNS = [
  "Table",
  "Opening chips",
  "Fill",
  "Credit",
  "Drop",
  "Closing chips",
  "Result",
  "Signature",
];

export const downloadShiftClosingBlank = (tableNames: string[] = []) => {
  const doc = createDoc("landscape");
  const startY = drawHeader(doc, "Shift Closing — Live Game", "Blank form · fill in by hand");

  const rowCount = Math.max(tableNames.length, 14);
  const body = emptyRows(rowCount, COLUMNS.length, (i) => tableNames[i] ?? "");
  body.push(["TOTAL", "", "", "", "", "", "", ""]);

  blankTable(doc, {
    startY,
    head: [COLUMNS],
    body,
    columnStyles: {
      0: { cellWidth: 42, fontStyle: "bold", halign: "left" },
      7: { cellWidth: 45 },
    },
    margin: { left: 10, right: 10, bottom: 24 },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [246, 246, 246];
      }
    },
  });

  drawSignatures(doc, ["Pit Boss", "Cashier", "Manager"]);
  savePdf(doc, "blank-shift-closing.pdf");
};
