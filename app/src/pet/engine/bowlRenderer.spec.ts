import { describe, expect, it } from "vitest";
import { bowlHitTest } from "./bowlRenderer";

describe("bowl hit test", () => {
  it("matches the visible ellipse", () => {
    expect(bowlHitTest(200, 232, 400, 400)).toBe(true);
    expect(bowlHitTest(200, 180, 400, 400)).toBe(false);
    expect(bowlHitTest(200, 284, 400, 400)).toBe(false);
    expect(bowlHitTest(125, 232, 400, 400)).toBe(true);
    expect(bowlHitTest(285, 232, 400, 400)).toBe(false);
  });
});
