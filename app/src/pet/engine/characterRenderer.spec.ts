import { describe, expect, it } from "vitest";
import { characterHitTest, pressureForLevel } from "./characterRenderer";

describe("character renderer", () => {
  it("maps levels to the PRD pressure gradient", () => {
    expect(pressureForLevel(0)).toBe(0);
    expect(pressureForLevel(1)).toBeCloseTo(0.2);
    expect(pressureForLevel(2)).toBeCloseTo(0.4);
    expect(pressureForLevel(3)).toBeCloseTo(0.7);
    expect(pressureForLevel(4)).toBe(1);
    expect(pressureForLevel(2.5)).toBeCloseTo(0.55);
  });

  it("uses a rectangular hit area", () => {
    expect(characterHitTest(200, 200, 400, 400)).toBe(true);
    expect(characterHitTest(100, 200, 400, 400)).toBe(false);
    expect(characterHitTest(300, 200, 400, 400)).toBe(false);
    expect(characterHitTest(200, 70, 400, 400)).toBe(false);
    expect(characterHitTest(200, 390, 400, 400)).toBe(false);
  });
});
