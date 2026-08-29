import { describe, it, expect } from "vitest";
import { bankNetTzs, cageCountedTotalTzs, cageVariance } from "@/lib/cage-reconciliation";
import { emptyBanks, type Banks } from "@/components/cage/CageHelpers";

const rates = { USD: 2600, EUR: 2800, GBP: 3200, KES: 20 };

const banks = (ch: Record<string, { in?: number; out?: number }>): Banks => ({
  ...emptyBanks(),
  channels: { ...emptyBanks().channels, ...Object.fromEntries(
    Object.entries(ch).map(([k, v]) => [k, { in: v.in || 0, out: v.out || 0 }]),
  ) },
});

/** Reconciliation of a shift that started with `opening` cash. */
const check = (opts: {
  expected: number;
  cashTzs: number;
  chipsTzs?: number;
  banks?: Banks;
  cashlessIn?: number;
  cashlessOut?: number;
}) => {
  const counted = cageCountedTotalTzs({
    chipsTzs: opts.chipsTzs || 0,
    cashTzs: opts.cashTzs,
    bankNetTzs: bankNetTzs(opts.banks || emptyBanks(), rates),
    cashlessInTzs: opts.cashlessIn,
    cashlessOutTzs: opts.cashlessOut,
  });
  return cageVariance(counted, opts.expected);
};

describe("cage reconciliation — banks are movement only", () => {
  it("cash only: no variance", () => {
    expect(check({ expected: 10_000_000, cashTzs: 10_000_000 })).toBe(0);
  });

  it("sending 5m physical cash to CRDB TZS is variance neutral", () => {
    expect(check({
      expected: 10_000_000,
      cashTzs: 5_000_000,
      banks: banks({ CRDB_TZS: { in: 5_000_000 } }),
    })).toBe(0);
  });

  it("bank OUT (cash withdrawn from CRDB into the drawer) is neutral", () => {
    expect(check({
      expected: 10_000_000,
      cashTzs: 13_000_000,
      banks: banks({ CRDB_TZS: { out: 3_000_000 } }),
    })).toBe(0);
  });

  it("bank IN + OUT on the same channel nets correctly", () => {
    expect(check({
      expected: 10_000_000,
      cashTzs: 8_000_000,
      banks: banks({ CRDB_TZS: { in: 5_000_000, out: 3_000_000 } }),
    })).toBe(0);
  });

  it("multi-bank CRDB + NBC, TZS and USD", () => {
    const b = banks({
      CRDB_TZS: { in: 2_000_000 },
      NBC_TZS: { in: 1_000_000 },
      CRDB_USD: { in: 1_000 },       // 2 600 000 TZS
      NBC_USD: { out: 500 },         // −1 300 000 TZS
    });
    expect(bankNetTzs(b, rates)).toBe(2_000_000 + 1_000_000 + 2_600_000 - 1_300_000);
    expect(check({ expected: 10_000_000, cashTzs: 10_000_000 - 4_300_000, banks: b })).toBe(0);
  });

  it("mobile/cashless still shifts the counted side", () => {
    expect(check({
      expected: 10_000_000,
      cashTzs: 9_000_000,
      cashlessIn: 1_500_000,
      cashlessOut: 500_000,
    })).toBe(0);
  });

  it("mobile + bank combined", () => {
    expect(check({
      expected: 10_000_000,
      cashTzs: 4_000_000,
      banks: banks({ NBC_TZS: { in: 5_000_000 } }),
      cashlessIn: 1_000_000,
    })).toBe(0);
  });

  it("a real shortage is still reported", () => {
    expect(check({
      expected: 10_000_000,
      cashTzs: 4_500_000,
      banks: banks({ CRDB_TZS: { in: 5_000_000 } }),
    })).toBe(-500_000);
  });

  it("banks never move the Expected side", () => {
    const b = banks({ CRDB_TZS: { in: 7_000_000, out: 1_000_000 } });
    const expected = 10_000_000;
    // Expected is passed through untouched by design.
    expect(cageVariance(cageCountedTotalTzs({
      chipsTzs: 0, cashTzs: 4_000_000, bankNetTzs: bankNetTzs(b, rates),
    }), expected)).toBe(0);
  });
});
