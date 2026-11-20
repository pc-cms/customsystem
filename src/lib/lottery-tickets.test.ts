import { describe, it, expect } from "vitest";
import { ticketsForResult, ticketsForDays } from "./lottery-tickets";

describe("lottery tickets", () => {
  it("losing day of 1 000 000 gives 4", () => expect(ticketsForResult(-1_000_000)).toBe(4));
  it("winning day of 300 000 gives 1", () => expect(ticketsForResult(300_000)).toBe(1));
  it("269 999 gives 0", () => expect(ticketsForResult(269_999)).toBe(0));
  it("770 000 gives 2", () => expect(ticketsForResult(770_000)).toBe(2));
  it("week sums days independently", () => expect(ticketsForDays([-1_000_000, 300_000])).toBe(5));
});
