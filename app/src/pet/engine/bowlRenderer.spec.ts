import { describe, expect, it } from "vitest";
import { bowlHitTest, malletAngleFor } from "./bowlRenderer";

describe("bowl renderer", () => {
  it("matches the visible deep bowl body", () => {
    expect(bowlHitTest(200, 280, 400, 400)).toBe(true);
    expect(bowlHitTest(115, 280, 400, 400)).toBe(true);
    expect(bowlHitTest(200, 170, 400, 400)).toBe(false);
    expect(bowlHitTest(200, 385, 400, 400)).toBe(false);
  });

  it("swings the mallet toward the bowl then returns it", () => {
    const before = malletAngleFor(1000, 999);
    const striking = malletAngleFor(1000, 1070);
    const settled = malletAngleFor(1000, 1240);

    expect(striking).toBeGreaterThan(before);
    expect(settled).toBe(before);
  });
});
