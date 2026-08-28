/**
 * Payroll export builders — bank CSV, salary slips, tax reports, journal.
 * Pluggable bank format registry: BANK1 (default) + extension point for CRDB.
 */
import { downloadXlsx } from "@/lib/excel-export";
import type { PayrollEntry, PayrollPeriod } from "@/hooks/use-payroll";

const MONTH_NAMES = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];

const monthLabel = (p: PayrollPeriod) => `${MONTH_NAMES[p.month - 1]} ${p.year}`;

const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const csv = rows.map(r => r.map(c => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// ============= BANK CSV =============
export type BankFormat = "default" | "crdb";

export const exportBankCsv = (entries: PayrollEntry[], period: PayrollPeriod, format: BankFormat = "default") => {
  const monthName = MONTH_NAMES[period.month - 1];
  const desc = `${monthName} SALARY ${period.year}`;
  // CRDB format (matches CRDB_SALARY template): ID, NAME, ACCOUNT NUMBER, AMOUNT, BANK, BRANCH, DESCRIPTION
  // BANK and BRANCH are numeric codes; DESCRIPTION is "<MONTH> SALARY <YEAR>"
  const rows: (string|number)[][] = [["ID","NAME","ACCOUNT NUMBER","AMOUNT","BANK","BRANCH","DESCRIPTION"]];
  entries.forEach((e, i) => rows.push([
    i + 1,
    e.snapshot_full_name,
    e.snapshot_account_number,
    e.net_salary,
    e.snapshot_bank_code,
    e.snapshot_branch_code,
    desc,
  ]));
  const prefix = format === "crdb" ? "CRDB_SALARY" : "BANK_SALARY";
  downloadCsv(`${prefix}_${monthName}_${period.year}.csv`, rows);
};

// ============= TAX REPORTS =============
export const exportNssfReport = (entries: PayrollEntry[], period: PayrollPeriod) => {
  const rows: (string|number|null)[][] = [
    [`NSSF — ${monthLabel(period)}`, "", "", "", "", ""],
    ["#", "NAME", "NSSF NO.", "GROSS SALARY", "EMPLOYEE 10%", "EMPLOYER 10%"],
  ];
  entries.forEach((e, i) => rows.push([i+1, e.snapshot_full_name, "", e.gross_salary, e.nssf_employee, e.nssf_employer]));
  const totals = entries.reduce((a, e) => ({ g: a.g+e.gross_salary, em: a.em+e.nssf_employee, er: a.er+e.nssf_employer }), { g:0, em:0, er:0 });
  rows.push(["", "TOTAL", "", totals.g, totals.em, totals.er]);
  downloadXlsx(`NSSF_${period.year}_${period.month}.xlsx`, [{ name: "NSSF", rows }]);
};

export const exportPayeReport = (entries: PayrollEntry[], period: PayrollPeriod) => {
  const rows: (string|number|null)[][] = [
    [`PAYE — ${monthLabel(period)}`, "", "", "", ""],
    ["#", "NAME", "TAX ID", "TAXABLE PAY", "PAYE"],
  ];
  entries.forEach((e, i) => rows.push([i+1, e.snapshot_full_name, "", e.taxable_pay, e.paye]));
  const total = entries.reduce((a, e) => a + e.paye, 0);
  rows.push(["", "TOTAL", "", "", total]);
  downloadXlsx(`PAYE_${period.year}_${period.month}.xlsx`, [{ name: "PAYE", rows }]);
};

export const exportSdlReport = (entries: PayrollEntry[], period: PayrollPeriod) => {
  const rows: (string|number|null)[][] = [
    [`SDL 3.5% — ${monthLabel(period)}`, "", "", ""],
    ["#", "NAME", "GROSS SALARY", "SDL"],
  ];
  entries.forEach((e, i) => rows.push([i+1, e.snapshot_full_name, e.gross_salary, e.sdl_amount]));
  const total = entries.reduce((a, e) => a + e.sdl_amount, 0);
  rows.push(["", "TOTAL", "", total]);
  downloadXlsx(`SDL_${period.year}_${period.month}.xlsx`, [{ name: "SDL", rows }]);
};

export const exportWcfReport = (entries: PayrollEntry[], period: PayrollPeriod) => {
  const rows: (string|number|null)[][] = [
    [`WCF 1% — ${monthLabel(period)}`, "", "", ""],
    ["#", "NAME", "GROSS SALARY", "WCF"],
  ];
  entries.forEach((e, i) => rows.push([i+1, e.snapshot_full_name, e.gross_salary, e.wcf_amount]));
  const total = entries.reduce((a, e) => a + e.wcf_amount, 0);
  rows.push(["", "TOTAL", "", total]);
  downloadXlsx(`WCF_${period.year}_${period.month}.xlsx`, [{ name: "WCF", rows }]);
};

export const exportJournal = (entries: PayrollEntry[], period: PayrollPeriod) => {
  const sum = entries.reduce((a, e) => ({
    gross: a.gross + e.gross_salary,
    gepf: a.gepf + e.gepf_employee,
    nssf: a.nssf + e.nssf_employee,
    paye: a.paye + e.paye,
    cash: a.cash + e.cash_shortage,
    adv:  a.adv  + e.salary_advances,
    net:  a.net  + e.net_salary,
  }), { gross:0, gepf:0, nssf:0, paye:0, cash:0, adv:0, net:0 });
  const rows: (string|number|null)[][] = [
    [`SALARY JOURNAL — ${monthLabel(period)}`, "", ""],
    ["Account", "Dr", "Cr"],
    ["Gross Salaries", sum.gross, ""],
    ["GEPF Payable (10%)", "", sum.gepf],
    ["NSSF Payable (10%)", "", sum.nssf],
    ["PAYE Payable", "", sum.paye],
    ["Cash Shortages", "", sum.cash],
    ["Salary Advances", "", sum.adv],
    ["Net Salary Payable", "", sum.net],
  ];
  downloadXlsx(`JOURNAL_${period.year}_${period.month}.xlsx`, [{ name: "Journal", rows }]);
};

// ============= SALARY SLIPS (HTML print, opens print dialog) =============
const fmt = (n: number) => new Intl.NumberFormat("en-US", { useGrouping: true }).format(n).replace(/,/g, " ");

export const exportSingleSalarySlip = (entry: PayrollEntry, period: PayrollPeriod) =>
  exportSalarySlipsPrint([entry], period);

export const exportSalarySlipsPrint = (entries: PayrollEntry[], period: PayrollPeriod) => {
  const label = monthLabel(period);
  const slips = entries.map(e => `
    <div class="slip">
      <h2>SALARY SLIP — ${label}</h2>
      <table><tbody>
        <tr><td>Employee</td><td><b>${e.snapshot_full_name}</b></td></tr>
        <tr><td>Position</td><td>${e.snapshot_position}</td></tr>
        <tr><td>Basic Salary</td><td>${fmt(e.snapshot_basic_salary)}</td></tr>
        ${Number(e.prorata_factor ?? 1) < 1 ? `<tr><td>Pro-rata (paid days)</td><td>${e.prorata_days}</td></tr>` : ""}
        <tr><td>Public Holiday Earned</td><td>${fmt(e.public_holiday_earned)}</td></tr>
        <tr><td>Off Days Total</td><td>${fmt(e.off_days_total)}</td></tr>
        ${Number(e.overtime_amount ?? 0) > 0 ? `<tr><td>Overtime (${e.overtime_hours} h)</td><td>${fmt(e.overtime_amount)}</td></tr>` : ""}
        <tr><th>Gross Salary</th><th>${fmt(e.gross_salary)}</th></tr>
        <tr><td>GEPF 10%</td><td>(${fmt(e.gepf_employee)})</td></tr>
        <tr><td>NSSF 10%</td><td>(${fmt(e.nssf_employee)})</td></tr>
        <tr><td>PAYE</td><td>(${fmt(e.paye)})</td></tr>
        <tr><td>Salary Advances</td><td>(${fmt(e.salary_advances)})</td></tr>
        <tr><td>Cash Shortage</td><td>(${fmt(e.cash_shortage)})</td></tr>
        <tr><td>Missing Days</td><td>(${fmt(e.deductions_missing_days)})</td></tr>
        <tr><td>GEPF Loan</td><td>(${fmt(e.gepf_loan)})</td></tr>
        ${Number(e.loan_installment ?? 0) > 0 ? `<tr><td>Loan Installment</td><td>(${fmt(e.loan_installment)})</td></tr>` : ""}
        <tr><th>NET SALARY PAYABLE</th><th>${fmt(e.net_salary)}</th></tr>

      </tbody></table>
    </div>`).join("");
  const w = window.open("", "_blank");
  if (!w) { alert("Popup blocked — allow popups for this site"); return; }
  w.document.write(`<!doctype html><html><head><title>Salary Slips ${label}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:0;padding:0}
      .slip{padding:24px;border-bottom:2px dashed #888;page-break-after:always}
      h2{margin:0 0 12px 0;font-size:14px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      td,th{padding:4px 8px;border-bottom:1px solid #ddd;text-align:left}
      td:last-child,th:last-child{text-align:right;font-family:'Courier New',monospace}
      th{background:#f3f3f3}
    </style></head><body>${slips}<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
  w.document.close();
};
