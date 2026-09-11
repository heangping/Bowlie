import { describe, expect, it } from "vitest";
import { isWaveExpired, waveRadiusAt } from "./waveEngine";

describe("wave engine", () => {
  it("expands faster as click cadence increases", () => {
    expect(waveRadiusAt(0.2, 1)).toBe(90);
    expect(waveRadiusAt(0.2, 3)).toBeCloseTo(230);
    expect(waveRadiusAt(0.2, 3)).toBeGreaterThan(waveRadiusAt(0.2, 1));
  });

  it("expires by normalized animation age", () => {
    expect(isWaveExpired(1, 1)).toBe(false);
    expect(isWaveExpired(1, 3)).toBe(true);
  });
});
