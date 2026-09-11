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

  it("covers the cartoon head and body as one interaction area", () => {
    expect(characterHitTest(200, 90, 400, 400)).toBe(true);
    expect(characterHitTest(200, 230, 400, 400)).toBe(true);
    expect(characterHitTest(95, 230, 400, 400)).toBe(false);
    expect(characterHitTest(305, 230, 400, 400)).toBe(false);
    expect(characterHitTest(200, 370, 400, 400)).toBe(false);
  });
});
