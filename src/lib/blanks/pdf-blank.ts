/**
 * Shared helpers for printable BLANK forms (empty PDF templates).
 *
 * These PDFs contain no system data — only headers, labels and empty grid
 * cells to be filled in by hand. Generated fully client-side with jsPDF.
 */
import jsPDF from "jspdf";
import autoTable, { type RowInput, type UserOptions } from "jspdf-autotable";

export type Orientation = "portrait" | "landscape";

export const INK = 30;
export const LINE = 160;

export const createDoc = (orientation: Orientation) =>
  new jsPDF({ orientation, unit: "mm", format: "a4" });

/** Draws the standard header: title, casino / date / shift blank lines. */
export const drawHeader = (doc: jsPDF, title: string, subtitle?: string) => {
  const pageW = doc.internal.pageSize.getWidth();
  const m = 10;

  doc.setTextColor(INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title.toUpperCase(), m, 14);

  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(subtitle, m, 19.5);
    doc.setTextColor(INK);
  }

  const y = 27;
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.2);

  const fields: { label: string; w: number }[] = [
    { label: "CASINO", w: (pageW - m * 2) * 0.34 },
    { label: "DATE", w: (pageW - m * 2) * 0.22 },
    { label: "SHIFT", w: (pageW - m * 2) * 0.19 },
    { label: "PREPARED BY", w: (pageW - m * 2) * 0.25 },
  ];

  let x = m;
  doc.setFontSize(7);
  for (const f of fields) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(120);
    doc.text(f.label, x, y - 3);
    doc.setTextColor(INK);
    doc.line(x, y, x + f.w - 6, y);
    x += f.w;
  }

  return y + 6;
};

/** Signature strip at the bottom of the current page. */
export const drawSignatures = (doc: jsPDF, labels: string[], y?: number) => {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const m = 10;
  const baseY = y ?? pageH - 16;
  const w = (pageW - m * 2) / labels.length;

  doc.setDrawColor(LINE);
  doc.setLineWidth(0.2);
  doc.setFontSize(7);

  labels.forEach((label, i) => {
    const x = m + i * w;
    doc.line(x, baseY, x + w - 8, baseY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(120);
    doc.text(label.toUpperCase(), x, baseY + 4);
  });
  doc.setTextColor(INK);
};

/** Consistent grid styling for every blank. */
export const blankTable = (doc: jsPDF, options: UserOptions) =>
  autoTable(doc, {
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: { top: 2.6, bottom: 2.6, left: 2, right: 2 },
      lineColor: [LINE, LINE, LINE],
      lineWidth: 0.2,
      textColor: [INK, INK, INK],
      minCellHeight: 8,
    },
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [INK, INK, INK],
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "center",
      minCellHeight: 7,
    },
    ...options,
  });

export const emptyRows = (count: number, cols: number, firstCol?: (i: number) => string): RowInput[] =>
  Array.from({ length: count }, (_, i) => [
    firstCol ? firstCol(i) : "",
    ...Array.from({ length: cols - 1 }, () => ""),
  ]);

export const savePdf = (doc: jsPDF, filename: string) => doc.save(filename);
