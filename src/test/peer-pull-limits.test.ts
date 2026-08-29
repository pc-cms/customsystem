import { describe, it, expect } from "vitest";
import {
  resolvePullLimit,
  capChangesByBytes,
  PULL_DEFAULT_LIMIT,
  PULL_MAX_LIMIT,
  PULL_MAX_BYTES,
} from "../../supabase/functions/peer-mesh/pull-limits";

describe("peer-mesh /peer/pull limits", () => {
  it("legacy client without a limit gets the safe default", () => {
    expect(resolvePullLimit(undefined)).toBe(PULL_DEFAULT_LIMIT);
    expect(resolvePullLimit(null)).toBe(PULL_DEFAULT_LIMIT);
    expect(resolvePullLimit("nope")).toBe(PULL_DEFAULT_LIMIT);
    expect(resolvePullLimit(0)).toBe(PULL_DEFAULT_LIMIT);
    expect(resolvePullLimit(-5)).toBe(PULL_DEFAULT_LIMIT);
  });

  it("clamps oversized requests (old clients asking 2000 keep working)", () => {
    expect(resolvePullLimit(2000)).toBe(PULL_MAX_LIMIT);
    expect(resolvePullLimit(400)).toBe(400);
    expect(resolvePullLimit(500)).toBe(PULL_MAX_LIMIT);
  });

  it("caps a page by serialized byte size", () => {
    const big = { id: 1, payload: "x".repeat(1_000_000) };
    const rows = Array.from({ length: 20 }, (_, i) => ({ ...big, id: i + 1 }));
    const capped = capChangesByBytes(rows);
    expect(capped.length).toBeLessThan(rows.length);
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(PULL_MAX_BYTES);
    // Cursor still advances monotonically from the trimmed page.
    expect(capped[capped.length - 1].id).toBeGreaterThan(0);
  });

  it("always emits at least one row so the cursor never stalls", () => {
    const monster = [{ id: 7, payload: "x".repeat(PULL_MAX_BYTES + 10) }];
    const capped = capChangesByBytes(monster);
    expect(capped).toHaveLength(1);
    expect(capped[0].id).toBe(7);
  });

  it("small pages pass through untouched (protocol shape unchanged)", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: i, payload: { a: i } }));
    expect(capChangesByBytes(rows)).toEqual(rows);
  });

  it("load-style: 500 average rows stay under the byte cap", () => {
    const rows = Array.from({ length: PULL_MAX_LIMIT }, (_, i) => ({
      id: i, table: "transactions", payload: { amount: i, note: "y".repeat(500) },
    }));
    expect(capChangesByBytes(rows)).toHaveLength(PULL_MAX_LIMIT);
  });
});
