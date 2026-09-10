import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { setSoundEnabled } from "./audio/engine";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("./audio/engine", () => ({
  setSoundEnabled: vi.fn(),
}));

type StateModule = typeof import("./state");

let stateModule: StateModule;
let now = 0;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.useFakeTimers();
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  stateModule = await import("./state");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("pet state", () => {
  it("increments circle level and caps at max", () => {
    stateModule.switchMode("circle");

    expect(stateModule.pressCircle()).toBe(1);
    expect(stateModule.pressCircle()).toBe(2);
    expect(stateModule.pressCircle()).toBe(3);
    expect(stateModule.pressCircle()).toBe(4);
    expect(stateModule.pressCircle()).toBe(4);
  });

  it("restores from the pre-restore level plus one", () => {
    stateModule.switchMode("circle");
    stateModule.pressCircle();
    stateModule.pressCircle();

    vi.advanceTimersByTime(1500);
    expect(stateModule.state.restoring).toBe(true);
    expect(stateModule.state.circleLevel).toBe(0);

    expect(stateModule.pressCircle()).toBe(3);
    expect(stateModule.state.restoring).toBe(false);
  });

  it("finishes restore and starts from idle", () => {
    stateModule.switchMode("circle");
    stateModule.pressCircle();
    stateModule.pressCircle();

    vi.advanceTimersByTime(1500 + 1600);
    expect(stateModule.state.restoring).toBe(false);
    expect(stateModule.state.circleLevel).toBe(0);

    expect(stateModule.pressCircle()).toBe(1);
  });

  it("resets mode state and clears waves on switch", () => {
    stateModule.switchMode("circle");
    stateModule.pressCircle();
    stateModule.pressCircle();

    stateModule.switchMode("bowl");

    expect(stateModule.state.mode).toBe("bowl");
    expect(stateModule.state.circleLevel).toBe(0);
    expect(stateModule.state.restoring).toBe(false);
    expect(invoke).toHaveBeenCalledWith("clear_waves");
  });

  it("triggers fahai after 31 clicks in a 30-second window", () => {
    for (let index = 0; index < 31; index += 1) {
      now = index * 100;
      stateModule.registerBowlClick();
    }

    expect(stateModule.state.fahaiVisible).toBe(true);
  });

  it("keeps fahai cooldown across mode switches", () => {
    for (let index = 0; index < 31; index += 1) {
      now = index * 100;
      stateModule.registerBowlClick();
    }
    expect(stateModule.state.fahaiVisible).toBe(true);

    vi.advanceTimersByTime(2500);
    stateModule.switchMode("circle");
    stateModule.switchMode("bowl");
    expect(stateModule.state.fahaiVisible).toBe(false);

    now = 5000;
    for (let index = 0; index < 31; index += 1) {
      stateModule.registerBowlClick();
    }
    expect(stateModule.state.fahaiVisible).toBe(false);
  });

  it("allows fahai to trigger again after cooldown", () => {
    for (let index = 0; index < 31; index += 1) {
      now = index * 100;
      stateModule.registerBowlClick();
    }
    vi.advanceTimersByTime(2500);

    now = 34000;
    for (let index = 0; index < 31; index += 1) {
      stateModule.registerBowlClick();
    }

    expect(stateModule.state.fahaiVisible).toBe(true);
  });

  it("toggles sound and updates the audio engine", () => {
    stateModule.toggleSound();
    expect(stateModule.state.soundEnabled).toBe(false);
    expect(setSoundEnabled).toHaveBeenCalledWith(false);

    stateModule.toggleSound();
    expect(stateModule.state.soundEnabled).toBe(true);
    expect(setSoundEnabled).toHaveBeenCalledWith(true);
  });
});
