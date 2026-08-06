/**
 * DEMO data for the Company reports.
 *
 * Purely synthetic, generated in code — nothing is read from or written to the
 * database. Numbers are modelled on Arusha July so the layout, heat map and
 * drill-downs can be demonstrated on a full month.
 */
import type { DailyBalanceRow } from "@/hooks/use-daily-balance-report";
import type { OfficeBalanceData, OfficeBalanceRow } from "@/hooks/use-office-balance-report";
import type { ExpensesMatrix, ExpenseCategoryRow } from "@/hooks/use-expenses-matrix";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const RATE = 2600;

/** Deterministic pseudo-random in [0,1) — same demo figures on every render. */
const rnd = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export const demoMonthDays = (month: string): string[] => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
};

const round = (n: number, step = 1000) => Math.round(n / step) * step;

/** Casino Monthly Balance — one synthetic row per day. */
export const demoDailyBalanceRows = (month: string): DailyBalanceRow[] => {
  const days = demoMonthDays(month);
  let cage = 42_000_000;
  let manager = 18_000_000;
  let bankTzs = 96_000_000;
  let bankUsdRaw = 21_000;
  let prevMoney = cage + manager + bankTzs + bankUsdRaw * RATE;

  return days.map((date, i) => {
    const r = (k: number) => rnd(i * 7 + k);
    const weekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
    const scale = weekend ? 1.35 : 1;

    const tables = round((r(1) * 26_000_000 - 6_000_000) * scale, 5000);
    const slots = round(r(2) * 9_000_000 * scale, 5000);
    const bar = round(r(3) * 1_400_000, 1000);
    const chipDiff = round((r(4) - 0.55) * 900_000, 1000);
    const slotsDiff = round((r(5) - 0.5) * 700_000, 1000);
    const expenses = round(1_200_000 + r(6) * 3_600_000, 1000);
    const tips = round(r(7) * 800_000, 1000);
    const fees = round(r(8) * 260_000, 1000);
    const moneyIn = i % 9 === 3 ? round(5_000_000 + r(9) * 6_000_000, 100_000) : 0;
    const moneyOut = i % 7 === 5 ? round(8_000_000 + r(10) * 9_000_000, 100_000) : 0;
    const free = Math.max(0, cage - 15_000_000);
    const trfManager = i % 3 === 0 ? round(Math.min(free * 0.35, 4_000_000 + r(11) * 8_000_000), 100_000) : 0;
    const trfBank = i % 5 === 2 ? round(Math.min(free * 0.5, 10_000_000 + r(12) * 15_000_000), 100_000) : 0;


    const result = tables + slots + bar;
    const diffTotal = chipDiff + slotsDiff;
    const officeNet = moneyIn - moneyOut;
    // Money must move exactly by the day's economics; transfers only reshuffle
    // between buckets, so the day balance stays at (or very near) zero.
    const delta = result + diffTotal + fees + officeNet - expenses;
    const noise = i % 6 === 4 ? round((r(18) - 0.5) * 60_000, 1000) : 0;

    cage = cage + delta - trfManager - trfBank + noise;
    manager = manager + trfManager;
    bankTzs = bankTzs + trfBank;
    const bankUsd = bankUsdRaw * RATE;
    const moneyTotal = cage + manager + bankTzs + bankUsd;

    const balanceCheck = prevMoney + delta;
    const balance = balanceCheck - moneyTotal;
    prevMoney = moneyTotal;


    const cashDenoms = [10000, 5000, 2000, 1000].map((den, k) => {
      const qty = Math.round(200 + rnd(i * 31 + k) * 2200);
      return { currency: "TZS", denomination: den, quantity: qty, tzs: den * qty };
    });
    const usdQty = Math.round(20 + rnd(i * 13) * 260);
    cashDenoms.push({ currency: "USD", denomination: 100, quantity: usdQty, tzs: 100 * usdQty * RATE });

    return {
      date,
      weekday: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()],
      rate_usd: RATE,
      casino_result: result,
      cash_desk_result: round(result * 0.9, 1000),
      tables_result: tables,
      slots_result: slots,
      bar_result: bar,
      cage_cash: cage,
      collection_bank: trfBank,
      chip_difference: chipDiff,
      tips_tables: round(tips * 0.7, 1000),
      tips_slots: round(tips * 0.3, 1000),
      office_cash: manager,
      office_transfer: trfManager,
      office_in: moneyIn,
      office_out: moneyOut,
      bank_terminal: round(r(13) * 4_000_000, 1000),
      bank_fee: fees,
      bank_account: bankTzs,
      bank_expenses: 0,
      credit_deposit: 0,
      expenses,
      fees,
      chips_float: 120_000_000,
      day_total: result,
      day_balance: 0,
      live_cash_result: tables,
      slots_diff: slotsDiff,
      cage_casino: cage,
      cage_cash_part: round(cage * 0.82, 1000),
      cage_cashless_part: round(cage * 0.18, 1000),
      cage_carried: false,
      transfer_cage_manager: trfManager,
      cage_manager: manager,
      transfer_bank: trfBank,
      bank_tzs: bankTzs,
      bank_usd: bankUsd,
      bank_usd_raw: bankUsdRaw,
      bank_tzs_manual: false,
      bank_usd_manual: false,
      money_in: moneyIn,
      money_out: moneyOut,
      money_total: moneyTotal,
      fin_result: result + diffTotal - expenses,
      balance,
      balance_check: balanceCheck,
      diff_total: diffTotal,
      chips_detail: [10000, 5000, 2000, 1000].map((den, k) => ({
        denomination: den,
        quantity: Math.round(300 + rnd(i * 17 + k) * 1500),
        miss: Math.round((rnd(i * 19 + k) - 0.5) * 40),
      })),
      cage_detail: {
        cash: cashDenoms,
        cashless: [
          { name: "M PESA", amount: round(r(14) * 3_000_000, 1000) },
          { name: "AirTell", amount: round(r(15) * 1_800_000, 1000) },
          { name: "Halo", amount: round(r(16) * 1_200_000, 1000) },
        ],
        slots_total: round(r(17) * 9_000_000, 1000),
      },
      transfers_manager: trfManager ? [{ amount: trfManager, from: "Safe Live", to: "Safe TZS" }] : [],
      transfers_bank: trfBank ? [{ amount: trfBank, from: "Cage", to: "NBC TZS" }] : [],
      office_wallets: [
        { name: "Safe TZS", currency: "TZS", balance: round(manager * 0.7, 1000) },
        { name: "Safe USD", currency: "USD", balance: round(manager * 0.2, 1000) },
        { name: "M PESA", currency: "TZS", balance: round(manager * 0.1, 1000) },
      ],
      bank_wallets: [
        { name: "NBC TZS", currency: "TZS", balance: round(bankTzs * 0.6, 1000) },
        { name: "CRDB TZS", currency: "TZS", balance: round(bankTzs * 0.4, 1000) },
        { name: "NBC USD", currency: "USD", balance: bankUsd },
      ],
      office_movements: [
        ...(moneyIn ? [{ amount: moneyIn, from: "Owner", to: "Safe TZS" }] : []),
        ...(moneyOut ? [{ amount: -moneyOut, from: "Safe TZS", to: "Collection" }] : []),
      ],
      expenses_detail: [
        { label: "Salary", value: round(expenses * 0.42, 1000) },
        { label: "Fuel", value: round(expenses * 0.18, 1000) },
        { label: "Utilities", value: round(expenses * 0.22, 1000) },
        { label: "Other", value: round(expenses * 0.18, 1000) },
      ],
      tips_total: tips,
      legacy: false,
      hasSystemData: true,
      day_closed: true,
      snapshot: true,
    } as DailyBalanceRow;
  });
};

const DEMO_CASINOS = [
  { id: "demo-arusha", name: "Arusha" },
  { id: "demo-mwanza", name: "Mwanza" },
  { id: "demo-mbeya", name: "Mbeya" },
];

/** Office Monthly Balance — synthetic company-wide month. */
export const demoOfficeBalance = (month: string): OfficeBalanceData => {
  const days = demoMonthDays(month);
  let office = 34_000_000;
  let bank = 210_000_000;

  const rows: OfficeBalanceRow[] = days.map((date, i) => {
    const r = (k: number) => rnd(i * 11 + k);
    const ins: Record<string, number> = {};
    DEMO_CASINOS.forEach((c, k) => {
      const on = (i + k) % 3 === 0;
      ins[c.id] = on ? round(6_000_000 + r(k + 1) * 22_000_000, 100_000) : 0;
    });
    const inTotal = Object.values(ins).reduce((s, v) => s + v, 0);
    const expenses = round(800_000 + r(5) * 5_500_000, 1000);
    // Office cash never goes negative and is swept out so it stays in a
    // realistic band — every movement is backed by the day's inflow.
    const avail = Math.max(0, office + inTotal - expenses);
    const transfer = i % 6 === 2 ? round(Math.min(avail * 0.3, 4_000_000 + r(6) * 9_000_000), 100_000) : 0;
    const rest = avail - transfer;
    const excess = Math.max(0, rest - 30_000_000);
    const out = i % 4 === 1 || excess > 0 ? round(Math.min(rest, Math.max(excess, r(7) * 12_000_000)), 100_000) : 0;

    office = rest - out;
    bank = bank + Math.round(out * 0.4);


    // Office cage split into TZS notes + a USD stack, summing exactly to `office`.
    const denoms = [10000, 5000, 2000, 1000];
    const usdQty = Math.max(0, Math.round((office * 0.08) / (100 * RATE)));
    let rest = office - usdQty * 100 * RATE;
    const cageDetail = denoms.map((den, k) => {
      const share = k === denoms.length - 1 ? rest : Math.floor((rest * [0.55, 0.25, 0.13, 0.07][k]) / den) * den;
      const qty = Math.max(0, Math.floor(share / den));
      if (k < denoms.length - 1) rest -= qty * den;
      return { currency: "TZS", denomination: den, quantity: qty, tzs: qty * den };
    });
    if (usdQty) cageDetail.push({ currency: "USD", denomination: 100, quantity: usdQty, tzs: usdQty * 100 * RATE });

    return {
      date,
      weekday: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()],
      in_by_casino: ins,
      in_total: inTotal,
      cage_office: office,
      bank,
      expenses,
      transfer_casino: transfer,
      out_ak: out,
      fin_result: inTotal - expenses - out,
      cage_detail: cageDetail,
      expenses_detail: [
        { label: "Head office salary", value: round(expenses * 0.5, 1000) },
        { label: "IT & services", value: round(expenses * 0.2, 1000) },
        { label: "Licences & tax", value: round(expenses * 0.3, 1000) },
      ],
      in_detail: DEMO_CASINOS.filter((c) => ins[c.id]).map((c) => ({
        label: `${c.name} · Collection`, value: ins[c.id],
      })),
      out_detail: out ? [{ label: "Payout IK", value: out }] : [],
    };

  });

  return { casinos: DEMO_CASINOS, rows };
};

const CASINO_CATS = [
  "Salary", "Fuel", "Taxi", "Food & Alcohol", "Repairs", "Cleaning",
  "Security", "Internet & IT", "Utilities", "Gaming tax", "Advertising", "Other",
];
const OFFICE_CATS = [
  "Head office salary", "Rent", "Licences", "IT & services", "Bank charges",
  "Travel & visa", "Legal & audit", "Office supplies", "Other office",
];

/** Expenses matrix — synthetic categories × days. */
export const demoExpensesMatrix = (month: string, scope: "casino" | "office"): ExpensesMatrix => {
  const days = demoMonthDays(month);
  const cats = scope === "office" ? OFFICE_CATS : CASINO_CATS;
  const items: ExpensesMatrix["items"] = {};

  const rows: ExpenseCategoryRow[] = cats.map((label, ci) => {
    const code = `demo-${scope}-${ci}`;
    const byDay: Record<string, number> = {};
    let total = 0;
    days.forEach((d, di) => {
      const seed = rnd(ci * 53 + di * 3);
      if (seed < (scope === "office" ? 0.72 : 0.55)) return;
      const v = round((scope === "office" ? 300_000 : 150_000) + seed * (scope === "office" ? 4_000_000 : 2_400_000), 1000);
      byDay[d] = v;
      total += v;
      items[`${code}|${d}`] = [
        { id: `${code}-${d}-1`, date: d, amount: round(v * 0.6, 1000), description: `${label} · invoice`, wallet: "Safe TZS" },
        { id: `${code}-${d}-2`, date: d, amount: v - round(v * 0.6, 1000), description: `${label} · cash`, wallet: "M PESA" },
      ];
    });
    return { code, label, byDay, total };
  });

  return { rows, items, days };
};
