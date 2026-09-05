# Closing Reports V2 — visual style pass ("Clear Cards")

The data and page fitting are done. What is missing is the look of the PDF you sent: right now our pages are flat, tightly packed, with a light-grey office feel. The reference has clean, well-separated white cards on a soft grey page.

## What changes

1. **Cards, not boxes**
   Each block (Cash Flow Opening/Closing, Bank Accounts, Cashless, Closing Record, signatures) becomes a rounded white card with a thin grey outline and a small drop of breathing room around it, on a very light grey page background.

2. **Section titles with the accent bar**
   Every section gets the reference title bar: light grey strip, short dark vertical accent mark on the left, bold uppercase title.

3. **Top KPI tiles**
   Cards Opening / Fill / Credit / Closing / Closing Card Value / Card Difference and the second strip (System Result, Cash Flow Fill/Credit, Expenses, Tips, Total Money) become separate rounded tiles with visible gaps between them, small grey caption on top and a large bold number below — as in the PDF, instead of one continuous grid.

4. **Header block**
   Report title on the left, Report ID and the controls note right-aligned; below it a single rounded card split into four fields (Business Date, Cashier, Closing Manager, Generated) with grey captions and bold values. Cashier and manager show `Name | EMP-xxx` when the employee code exists.

5. **Numbers and typography**
   Drop the typewriter-style figures; use the same bold proportional numerals as the reference, right-aligned, with the space separator we already use. Table rows get thin light separators, header rows a grey fill, total rows a bold top rule and grey background.

6. **Signature blocks**
   Two side-by-side cards ("Closing Cashier" / "Closing Manager", "Counted By" / "Verified By" on the chips page) with the name inside the card and the signature line to the right, exactly like the PDF.

7. **Footer**
   Casino name left, report style label centre, "Page N of 4" right — with the branch name fixed (the chips page currently prints "CASINO" instead of the branch).

## Applies to

All four pages: Slots Cash Desk, Live Game Cash Desk, Casino Chips Movement, Total Closing — so the set looks like one document.

## Technical notes

- Purely presentational: styling inside `src/components/cage/report-v2/primitives.tsx` (`Card`, `CardTable`, `KpiStrip`, `ReportHeader`, `Signatures`, `PageFooter`) plus the print rules in `src/index.css` (`.rv2-page`, `.rv2-card`). No data, query or business-logic changes.
- Card radius/border/shading added as print-safe styles (`print-color-adjust: exact`) so greys survive printing.
- Keep the existing page-fit guarantees: `.rv2-page` 281 mm, `overflow: hidden`, `break-inside: avoid` on cards and tables. Extra card gaps are tuned so each page still holds one sheet.
- Employee code shown next to signatory names comes from the existing employees lookup in `use-signatory-options.ts`; falls back to the plain name when absent.
- Verification: regenerate the slots and live PDFs for Arusha, render every page to an image and check fit, greys and alignment before reporting done.
