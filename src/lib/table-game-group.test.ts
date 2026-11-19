import { describe, it, expect } from "vitest";
import { gameGroupOf, setGameTypes, GAME_GROUP_ORDER } from "./table-game-group";

describe("gameGroupOf", () => {
  it("stored game decides the type", () => {
    expect(gameGroupOf("NU1", "Niu Niu")).toBe("NIU");
    expect(gameGroupOf("N01", "Niu Niu")).toBe("NIU");
    expect(gameGroupOf("Baccarat", "Baccarat")).toBe("BAC");
    expect(gameGroupOf("P3", "Texas Holdem")).toBe("PK");
    expect(gameGroupOf("AR2", "American Roulette")).toBe("AR");
    expect(gameGroupOf("Club", "Club Poker")).toBe("CLUB");
  });
  it("no Other group: a new managed type is its own group", () => {
    setGameTypes([{ code: "SB", label: "Sic Bo", sort_order: 70, legacy_games: [] },
      { code: "AR", label: "American Roulette", sort_order: 10, legacy_games: [] }]);
    expect(gameGroupOf("SB1", "Sic Bo")).toBe("SB");
    expect(GAME_GROUP_ORDER).not.toContain("OTHER");
  });
});
