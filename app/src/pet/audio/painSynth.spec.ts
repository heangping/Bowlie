import { describe, expect, it } from "vitest";
import { painVariantForLevel } from "./painSynth";

describe("pain sound variants", () => {
  it("maps pressure levels to sound variants", () => {
    expect(painVariantForLevel(1)).toBe(0);
    expect(painVariantForLevel(2)).toBe(1);
    expect(painVariantForLevel(3)).toBe(2);
    expect(painVariantForLevel(4)).toBe(2);
  });
});
