import { describe, it, expect } from "vitest";
import { gameGroupOf } from "./table-game-group";

describe("gameGroupOf", () => {
  it("NU1 and N01 are Niu Niu even if stored as roulette", () => {
    expect(gameGroupOf("NU1", "Niu Niu")).toBe("NIU");
    expect(gameGroupOf("N01", "American Roulette")).toBe("NIU");
  });
  it("Baccarat tables are Baccarat even if stored as poker", () => {
    expect(gameGroupOf("Baccarat", "Texas Holdem")).toBe("BAC");
    expect(gameGroupOf("BC1", "Baccarat")).toBe("BAC");
  });
  it("roulette and card games are separate", () => {
    expect(gameGroupOf("AR2", "American Roulette")).toBe("AR");
    expect(gameGroupOf("P3", "Poker")).toBe("PK");
    expect(gameGroupOf("BJ1", "Blackjack")).toBe("BJ");
    expect(gameGroupOf("Club", "Club Poker")).toBe("CLUB");
  });
});
