import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick } from "vue";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onMoved: async () => () => undefined,
    onScaleChanged: async () => () => undefined,
    startDragging: vi.fn(),
  }),
}));

vi.mock("./settings", () => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(async () => undefined),
  queueSaveSettings: vi.fn(),
  disposeSettings: vi.fn(),
  toggleAutoStart: vi.fn(),
}));

vi.mock("./audio/engine", () => ({
  setSoundEnabled: vi.fn(),
}));

vi.mock("./audio/apologySpeech", () => ({
  speakApology: vi.fn(() => false),
  stopApologySpeech: vi.fn(),
  warmUpApologySpeech: vi.fn(),
}));

vi.mock("./audio/bowlSynth", () => ({
  playBowlSound: vi.fn(() => ({ stop: () => undefined })),
}));

vi.mock("./audio/painSynth", () => ({
  painVariantForLevel: vi.fn(() => 0),
  playPainSound: vi.fn(() => ({ stop: () => undefined })),
}));

vi.mock("./engine/bowlRenderer", () => ({
  drawBowl: vi.fn(),
  bowlHitTest: (x: number, y: number) => x >= 100 && x <= 300 && y >= 180 && y <= 350,
}));

vi.mock("./engine/characterRenderer", () => ({
  drawCharacter: vi.fn(),
  characterHitTest: (x: number, y: number) => x >= 100 && x <= 300 && y >= 60 && y <= 350,
}));

type AppModule = typeof import("./App.vue");
type StateModule = typeof import("./state");

let appModule: AppModule;
let stateModule: StateModule;
let app: ReturnType<typeof createApp> | null = null;
let container: HTMLElement | null = null;
let now = 0;
let getContext: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.useFakeTimers();
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
  };
  getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  appModule = await import("./App.vue");
  stateModule = await import("./state");
});

afterEach(() => {
  app?.unmount();
  container?.remove();
  getContext.mockRestore();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mountApp(): HTMLElement {
  container = document.createElement("div");
  document.body.append(container);
  app = createApp(appModule.default);
  app.mount(container);
  return container;
}

function canvasFrom(root: HTMLElement): HTMLCanvasElement {
  const canvas = root.querySelector<HTMLCanvasElement>(".pet-canvas");
  if (!canvas) throw new Error("pet canvas missing");
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  canvas.hasPointerCapture = vi.fn(() => false);
  return canvas;
}

function pointerEvent(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 7,
    button: 0,
    clientX: x,
    clientY: y,
  });
}

describe("pet interactions", () => {
  it("shows a right-click menu and switches modes from it", async () => {
    stateModule.state.mode = "bowl";
    stateModule.state.soundEnabled = true;
    stateModule.state.autoStartEnabled = false;
    const root = mountApp();
    const canvas = canvasFrom(root);
    await nextTick();
    stateModule.state.mode = "bowl";
    stateModule.state.soundEnabled = true;
    stateModule.state.autoStartEnabled = false;

    canvas.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 260 }),
    );
    await nextTick();

    const items = Array.from(root.querySelectorAll(".menu-item")).map((item) => item.textContent);
    expect(items[0]).toBe("切换为紧箍咒");
    expect(items[1]).toMatch(/^(静音|取消静音)$/);
    expect(items[2]).toMatch(/开机自启$/);
    expect(items[3]).toBe("退出");
    expect(root.querySelector(".mode-bar")).toBeNull();

    root.querySelectorAll(".menu-item")[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();

    expect(stateModule.state.mode).toBe("circle");
    expect(invoke).toHaveBeenCalledWith("clear_waves");
    expect(root.querySelector(".menu")).toBeNull();
  });

  it("passes click cadence to the wave speed", () => {
    stateModule.state.mode = "bowl";
    const root = mountApp();
    const canvas = canvasFrom(root);

    now = 0;
    canvas.dispatchEvent(pointerEvent("pointerdown", 200, 260));
    expect(invoke).toHaveBeenLastCalledWith("spawn_wave", { x: 200, y: 260, speed: 1 });

    now = 460;
    canvas.dispatchEvent(pointerEvent("pointerdown", 200, 260));
    expect(invoke).toHaveBeenLastCalledWith("spawn_wave", { x: 200, y: 260, speed: 2 });
  });

  it("tightens while holding and restores after release", async () => {
    stateModule.state.mode = "bowl";
    stateModule.state.soundEnabled = true;
    stateModule.state.autoStartEnabled = false;
    const root = mountApp();
    const canvas = canvasFrom(root);
    canvas.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 260 }),
    );
    await nextTick();
    root.querySelectorAll(".menu-item")[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    vi.mocked(invoke).mockClear();

    now = 1000;
    canvas.dispatchEvent(pointerEvent("pointerdown", 200, 200));
    expect(stateModule.state.circleHolding).toBe(true);

    now = 1700;
    vi.advanceTimersByTime(16);
    expect(stateModule.state.circleLevel).toBeGreaterThan(1);
    expect(stateModule.state.circleLevel).toBeLessThanOrEqual(4);

    canvas.dispatchEvent(pointerEvent("pointerup", 200, 200));
    expect(stateModule.state.circleHolding).toBe(false);

    vi.advanceTimersByTime(1500);
    expect(stateModule.state.restoring).toBe(true);
    expect(stateModule.state.circleLevel).toBe(0);
  });
});
