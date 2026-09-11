import { describe, expect, it } from "vitest";
import {
  MAX_WINDOW_SIZE,
  MIN_WINDOW_SIZE,
  clampWindowSize,
  fadeHintAlpha,
  isSameResizeTarget,
  maxWindowSize,
  resizeDirectionAt,
  resizeSides,
  resizeTarget,
  type ResizeDirection,
  type ResizeGeometry,
} from "./windowResize";

function geometry(
  direction: ResizeDirection,
  overrides: Partial<ResizeGeometry> = {},
): ResizeGeometry {
  return {
    direction,
    startSize: 400,
    startX: 1000,
    startY: 500,
    startPointerX: 2000,
    startPointerY: 900,
    maxSize: 1200,
    ...overrides,
  };
}

describe("window resize hit testing", () => {
  it("ignores the middle of the window so the pet stays clickable", () => {
    expect(resizeDirectionAt(400, 400, 200, 200)).toBeNull();
    expect(resizeDirectionAt(400, 400, 100, 300)).toBeNull();
  });

  it("matches the four edges", () => {
    expect(resizeDirectionAt(400, 400, 4, 200)).toBe("West");
    expect(resizeDirectionAt(400, 400, 396, 200)).toBe("East");
    expect(resizeDirectionAt(400, 400, 200, 4)).toBe("North");
    expect(resizeDirectionAt(400, 400, 200, 396)).toBe("South");
  });

  it("prefers corners over edges", () => {
    expect(resizeDirectionAt(400, 400, 6, 6)).toBe("NorthWest");
    expect(resizeDirectionAt(400, 400, 394, 6)).toBe("NorthEast");
    expect(resizeDirectionAt(400, 400, 6, 394)).toBe("SouthWest");
    expect(resizeDirectionAt(400, 400, 394, 394)).toBe("SouthEast");
  });

  it("narrows the bands on small windows instead of swallowing them", () => {
    expect(resizeDirectionAt(120, 120, 60, 60)).toBeNull();
    expect(resizeDirectionAt(120, 120, 2, 60)).toBe("West");
  });

  it("reports which sides a direction touches", () => {
    expect(resizeSides("East")).toEqual({
      north: false,
      east: true,
      south: false,
      west: false,
    });
    expect(resizeSides("NorthWest")).toEqual({
      north: true,
      east: false,
      south: false,
      west: true,
    });
  });
});

describe("window resize geometry", () => {
  it("grows from the east edge while the west edge stays put", () => {
    const target = resizeTarget(geometry("East"), 2060, 900);
    expect(target).toEqual({ size: 460, x: 1000, y: 500 });
  });

  it("moves the origin when growing from the west edge", () => {
    const target = resizeTarget(geometry("West"), 1960, 900);
    expect(target).toEqual({ size: 440, x: 960, y: 500 });
    // 右边缘保持不动，这是"锚定对侧边"的关键
    expect(target.x + target.size).toBe(1000 + 400);
  });

  it("moves the origin when growing from the north edge", () => {
    const target = resizeTarget(geometry("North"), 2000, 860);
    expect(target).toEqual({ size: 440, x: 1000, y: 460 });
    expect(target.y + target.size).toBe(500 + 400);
  });

  it("keeps the top edge fixed when growing from the south edge", () => {
    const target = resizeTarget(geometry("South"), 2000, 960);
    expect(target).toEqual({ size: 460, x: 1000, y: 500 });
  });

  it("uses the dominant axis for corners so square stays square", () => {
    expect(resizeTarget(geometry("SouthEast"), 2060, 910)).toEqual({
      size: 460,
      x: 1000,
      y: 500,
    });
    expect(resizeTarget(geometry("NorthEast"), 2060, 890)).toEqual({
      size: 460,
      x: 1000,
      y: 440,
    });
    expect(resizeTarget(geometry("NorthWest"), 1940, 880)).toEqual({
      size: 460,
      x: 940,
      y: 440,
    });
  });

  it("never shrinks below the minimum side", () => {
    const target = resizeTarget(geometry("West"), 2500, 900);
    expect(target.size).toBe(MIN_WINDOW_SIZE);
    expect(target.x + target.size).toBe(1400);
  });

  it("never grows past the maximum side", () => {
    const target = resizeTarget(geometry("East", { maxSize: 800 }), 2600, 900);
    expect(target.size).toBe(800);
  });

  it("keeps the anchored edge still when the cap is hit", () => {
    // 顶到上限后继续往西拖，右边缘必须纹丝不动，否则会看到窗口"漏"出去
    const target = resizeTarget(
      geometry("West", { maxSize: MAX_WINDOW_SIZE }),
      0,
      900,
    );
    expect(target.size).toBe(MAX_WINDOW_SIZE);
    expect(target.x + target.size).toBe(1000 + 400);
  });

  it("detects no-op targets so the window is not repositioned needlessly", () => {
    const target = resizeTarget(geometry("East"), 2060, 900);
    expect(isSameResizeTarget(target, { ...target })).toBe(true);
    expect(isSameResizeTarget(target, { ...target, size: 461 })).toBe(false);
    expect(isSameResizeTarget(null, target)).toBe(false);
  });
});

describe("window size limits", () => {
  it("caps the maximum side at the hard limit", () => {
    const max = maxWindowSize();
    expect(max).toBeLessThanOrEqual(MAX_WINDOW_SIZE);
    expect(max).toBeGreaterThanOrEqual(MIN_WINDOW_SIZE);
  });

  it("clamps overshooting values back into range", () => {
    expect(clampWindowSize(2000, maxWindowSize())).toBe(maxWindowSize());
    expect(clampWindowSize(10, maxWindowSize())).toBe(MIN_WINDOW_SIZE);
    expect(clampWindowSize(600, maxWindowSize())).toBe(
      Math.min(600, maxWindowSize()),
    );
  });

  it("keeps a sane minimum even if the cap somehow comes in under it", () => {
    expect(clampWindowSize(400, 0)).toBe(MIN_WINDOW_SIZE);
  });
});

describe("resize hint", () => {
  it("fades in, holds, and settles back to exactly zero", () => {
    let alpha = 0;
    for (let i = 0; i < 60; i += 1) alpha = fadeHintAlpha(alpha, 1, 1 / 60);
    expect(alpha).toBeGreaterThan(0.9);

    for (let i = 0; i < 60; i += 1) alpha = fadeHintAlpha(alpha, 0, 1 / 60);
    // 必须精确归零：画布里靠它做"完全透明就跳过绘制"的短路判断
    expect(alpha).toBe(0);
  });
});
