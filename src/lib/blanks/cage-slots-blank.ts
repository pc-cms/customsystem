/**
 * Cage Slots Closing blank — A4 portrait.
 * Sections: movements, denomination count, totals, signatures.
 */
import { blankTable, createDoc, drawHeader, drawSignatures, savePdf } from "./pdf-blank";

const MOVEMENTS = [
  "Opening cash",
  "Slots IN",
  "Slots OUT",
  "Cashless IN",
  "Cashless OUT",
  "Expenses",
  "Collections",
  "Add float",
  "System result",
];

const DENOMS = ["10 000", "5 000", "2 000", "1 000", "Coins"];

export const downloadCageSlotsBlank = () => {
  const doc = createDoc("portrait");
  let y = drawHeader(doc, "Cage Slots — Shift Closing", "Blank form · fill in by hand");

  blankTable(doc, {
    startY: y,
    head: [["Movement", "Amount (TZS)", "Notes"]],
    body: MOVEMENTS.map((m) => [m, "", ""]),
    columnStyles: {
      0: { cellWidth: 55, fontStyle: "bold", halign: "left" },
      1: { cellWidth: 40, halign: "right" },
    },
    margin: { left: 10, right: 10 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("CLOSING CASH COUNT", 10, y);
  y += 3;

  blankTable(doc, {
    startY: y,
    head: [["Denomination", "Qty", "Amount (TZS)"]],
    body: [...DENOMS.map((d) => [d, "", ""]), ["TOTAL CASH", "", ""]],
    columnStyles: {
      0: { cellWidth: 55, fontStyle: "bold", halign: "left" },
      1: { cellWidth: 30, halign: "center" },
      2: { halign: "right" },
    },
    margin: { left: 10, right: 10 },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === DENOMS.length) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [246, 246, 246];
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  blankTable(doc, {
    startY: y,
    head: [["Cash desk result", "System result", "Balance / Difference"]],
    body: [["", "", ""]],
    styles: { minCellHeight: 16 },
    margin: { left: 10, right: 10 },
  });

  drawSignatures(doc, ["Cashier", "Slots Attendant", "Manager"]);
  savePdf(doc, "blank-cage-slots-closing.pdf");
};
