# HR & Payroll: gap analysis

Current state (verified in DB): payroll is hours-only, gross = basic + holiday hours + off-day hours, deductions = GEPF, NSSF, PAYE, cash shortage, advances, missing days, GEPF loan. Employer cost = NSSF employer, WCF, SDL. Worked days/hours come from attendance but are reference-only.

## What is missing (ordered by impact)

### 1. Hours actually do not affect pay
`worked_hours` is imported but gross is always full basic salary. Nothing pays overtime above the monthly norm (195 h) and nothing reduces pay for under-worked hours — the only reduction is a manually typed `missing_days`.
Fix: derive missing days/hours automatically from attendance, and add an overtime line (hours above norm x hourly rate x multiplier from settings).

### 2. Pro-rata for joiners and leavers
An employee hired or terminated mid-month gets a full month's basic. Needed: pro-rata by employment/termination date, plus a final-settlement entry (unused leave payout, notice).

### 3. Annual leave has no money side
`employees.annual_leave_earned/used/sold` exist, but there is no monthly accrual, no leave request/approval flow, and "sold" leave is never paid through payroll.
Fix: monthly accrual job, leave register (type: annual, sick, unpaid, maternity), unpaid leave feeding missing days, leave-sold payout line.

### 4. Advances and loans have no ledger
`salary_advances` and `gepf_loan` are single numbers retyped each month. No loan balance, no installment schedule, no remaining amount, no protection against over-deduction (net going negative).
Fix: `staff_loans` + `staff_loan_installments`, auto-pull the month's installment into the entry, block net < 0.

### 5. No payslip
There is a bank export, but no per-employee payslip (PDF/print) with earnings, deductions and employer contributions — usually a legal requirement.

### 6. No statutory returns
PAYE, NSSF, WCF, SDL are computed but there is no monthly export/report per authority, and no year-to-date totals per employee (needed for annual reconciliation).

### 7. Bonuses and tips are outside payroll
Monthly tips pools and manager bonuses live in separate modules and never show as taxable earnings, so gross/PAYE can be understated.

### 8. HR data is not enforced
Contract end, license expiry, probation, missing NSSF/TIN/bank account are stored but not validated: an entry can be created for an employee with no account number, expired contract, or missing tax ID. No expiry alerts on the HR dashboard.

### 9. Warnings and disciplinary have no payroll effect
`staff_warnings` are not linked to deductions or suspensions.

### 10. Period control
Recompute, lock and audit exist, but there is no visible pre-close checklist (employees with zero attendance, entries with negative net, employees missing from the period, salary changed mid-month).

## Suggested first phase

1. Attendance-driven missing days/hours + overtime line (settings-driven).
2. Pro-rata for joiners/leavers.
3. Loans/advances ledger with automatic installments and negative-net protection.
4. Payslip PDF and a pre-close validation checklist.

Leave, statutory returns, tips/bonus integration and HR alerts follow in a second phase.

## Technical notes

Changes concentrate in `compute_payroll_entry` and `payroll_refresh_period` (new columns: overtime hours/amount, pro-rata factor, leave payout, loan installment), new tables for leave and loans with the standard grants/RLS/HR-scope pattern, and UI in `PayrollPeriodPage.tsx`, `PayrollSettingsPage.tsx` plus a new payslip view. Version bump on release.
