import { describe, it, expect } from "vitest";
import { formatSpacedInput, formatSpacedValue, parseSpacedNumber, numericNavDirection } from "@/components/ui/number-input";
describe("number input", () => {
  it("groups while typing", () => {
    expect(formatSpacedInput("1234567", 0, true)).toBe("1 234 567");
    expect(formatSpacedInput("1 234 5", 0, true)).toBe("12 345");
    expect(formatSpacedInput("-5000", 0, true)).toBe("-5 000");
    expect(formatSpacedInput("1000.", 2, true)).toBe("1 000.");
    expect(formatSpacedInput("1000.567", 2, true)).toBe("1 000.56");
    expect(formatSpacedInput("00123", 0, true)).toBe("123");
  });
  it("parses back", () => {
    expect(parseSpacedNumber("1 234 567")).toBe(1234567);
    expect(parseSpacedNumber("1,000,000.50")).toBe(1000000.5);
    expect(parseSpacedNumber("")).toBe(null);
  });
  it("formats values", () => {
    expect(formatSpacedValue(1000000, 0, true)).toBe("1 000 000");
    expect(formatSpacedValue(-1234.5, 2, true)).toBe("-1 234.50");
    expect(formatSpacedValue(0, 0, false)).toBe("");
  });
});

describe("arrow navigation", () => {
  it("moves on up/down", () => {
    expect(numericNavDirection("ArrowUp", 2, 2, 5)).toBe(-1);
    expect(numericNavDirection("ArrowDown", 2, 2, 5)).toBe(1);
  });
  it("left/right only at caret edges", () => {
    expect(numericNavDirection("ArrowLeft", 0, 0, 5)).toBe(-1);
    expect(numericNavDirection("ArrowLeft", 1, 1, 5)).toBe(null);
    expect(numericNavDirection("ArrowRight", 5, 5, 5)).toBe(1);
    expect(numericNavDirection("ArrowRight", 4, 4, 5)).toBe(null);
  });
  it("ignores selections and other keys", () => {
    expect(numericNavDirection("ArrowLeft", 0, 3, 5)).toBe(null);
    expect(numericNavDirection("Enter", 0, 0, 5)).toBe(null);
  });
});
