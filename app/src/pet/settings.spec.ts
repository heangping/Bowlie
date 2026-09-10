import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { availableMonitors } from "@tauri-apps/api/window";
import { isRestorablePosition } from "./settings";

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
});
