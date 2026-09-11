import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { availableMonitors } from "@tauri-apps/api/window";
import { isRestorablePosition, restorableWindowSide, visibleWindowPosition } from "./settings";
import { MAX_WINDOW_SIZE, MIN_WINDOW_SIZE, maxWindowSize } from "./windowResize";

vi.mock("@tauri-apps/api/window", () => ({
  availableMonitors: vi.fn(),
  getCurrentWindow: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(availableMonitors).mockResolvedValue([
    {
      name: "test",
      position: new PhysicalPosition(0, 0),
      size: new PhysicalSize(1920, 1080),
      workArea: {
        position: new PhysicalPosition(0, 0),
        size: new PhysicalSize(1920, 1040),
      },
      scaleFactor: 1,
    },
  ]);
});

describe("settings", () => {
  it("accepts positions that remain visibly on-screen", async () => {
    await expect(isRestorablePosition({ x: 100, y: 100 })).resolves.toBe(true);
  });

  it("rejects positions outside the current work area", async () => {
    await expect(isRestorablePosition({ x: 10000, y: 10000 })).resolves.toBe(false);
  });

  it("clamps off-screen positions into the closest work area", () => {
    const monitors = [
      {
        name: "test",
        position: new PhysicalPosition(0, 0),
        size: new PhysicalSize(1920, 1080),
        workArea: {
          position: new PhysicalPosition(0, 0),
          size: new PhysicalSize(1920, 1040),
        },
        scaleFactor: 1,
      },
    ];
    const position = new PhysicalPosition(10000, 10000);
    const expected = new PhysicalPosition(1480, 600);
    expect(visibleWindowPosition(monitors, position)).toEqual(expected);
  });

  it("keeps valid positions unchanged", () => {
    const monitors = [
      {
        name: "test",
        position: new PhysicalPosition(0, 0),
        size: new PhysicalSize(1920, 1080),
        workArea: {
          position: new PhysicalPosition(0, 0),
          size: new PhysicalSize(1920, 1040),
        },
        scaleFactor: 1,
      },
    ];
    const position = new PhysicalPosition(100, 100);
    expect(visibleWindowPosition(monitors, position)).toEqual(position);
  });
});

describe("restored window size", () => {
  it("keeps a saved size that is within range", () => {
    expect(restorableWindowSide({ width: 600, height: 600 })).toBe(
      Math.min(600, maxWindowSize()),
    );
  });

  it("shrinks an oversized saved size back to the cap", () => {
    // 旧版本可能存过远超上限的尺寸，重启时必须夹回来，不能凭空冒出个巨窗
    expect(restorableWindowSide({ width: 4000, height: 4000 })).toBe(maxWindowSize());
    expect(maxWindowSize()).toBeLessThanOrEqual(MAX_WINDOW_SIZE);
  });

  it("normalises non-square saved sizes by their long side", () => {
    expect(restorableWindowSide({ width: 700, height: 420 })).toBe(
      Math.min(700, maxWindowSize()),
    );
  });

  it("never restores below the minimum side", () => {
    expect(restorableWindowSide({ width: 120, height: 120 })).toBe(MIN_WINDOW_SIZE);
  });
});
