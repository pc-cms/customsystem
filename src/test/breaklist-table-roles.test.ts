import { describe, expect, it } from "vitest";
import { getRolesForTable } from "@/lib/currency";

describe("Break List table assignments", () => {
  it("offers dealer and inspector assignments for N01 Niu Niu", () => {
    expect(getRolesForTable("N01", "Niu Niu")).toEqual(["P", "Pi"]);
  });

  it.each(["Baccarat", "Poker", "Omaha", "PLO"])(
    "offers assignments for configured %s tables",
    (game) => {
      expect(getRolesForTable("T01", game)).toEqual(["P", "Pi"]);
    },
  );
});