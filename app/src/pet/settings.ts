import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { availableMonitors, getCurrentWindow } from "@tauri-apps/api/window";
import type { Monitor } from "@tauri-apps/api/window";
import { Store } from "@tauri-apps/plugin-store";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { state } from "./state";
import type { Mode } from "../shared/types";
import { clampWindowSize, maxWindowSize, MIN_WINDOW_SIZE, PET_BASE_SIZE } from "./windowResize";

const SETTINGS_FILE = "settings.json";
const PET_WINDOW_LOGICAL_SIZE = PET_BASE_SIZE;
const RESTORE_VISIBLE_MARGIN = 40;
const MIN_WINDOW_LOGICAL_SIZE = MIN_WINDOW_SIZE;
/**
 * 读取历史尺寸时的"垃圾值"兜底。真正的上下限由 clampWindowSize / maxWindowSize
 * 夹取 —— 这个常数只用来拒绝明显被写坏的值，不参与业务上的最大尺寸判定。
 */
const MAX_SANE_SIZE = 20000;

type WindowPosition = {
  x: number;
  y: number;
};

type WindowSize = {
  width: number;
  height: number;
};

const DEFAULT_WINDOW_SIZE: WindowSize = {
  width: PET_WINDOW_LOGICAL_SIZE,
  height: PET_WINDOW_LOGICAL_SIZE,
};

let store: Store | null = null;
let saveTimer: number | undefined;
let saveChain: Promise<void> = Promise.resolve();

function isMode(value: unknown): value is Mode {
  return value === "bowl" || value === "circle";
}

function isRestorableSize(value: unknown): value is WindowSize {
  if (typeof value !== "object" || value === null) return false;
  const size = value as WindowSize;
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0 &&
    size.width <= MAX_SANE_SIZE &&
    size.height <= MAX_SANE_SIZE
  );
}

/**
 * 历史尺寸恢复时的目标边长：先归一化成正方形（画面按边长等比缩放），
 * 再夹进当前允许的 [MIN_WINDOW_SIZE, maxWindowSize()] —— 旧版本可能存过一个
 * 超过上限的尺寸，不夹的话重启就会冒出个超大窗口。
 */
export function restorableWindowSide(size: WindowSize): number {
  return clampWindowSize(Math.max(size.width, size.height), maxWindowSize());
}

/**
 * 窗口尺寸可变后，可见性判定不能再假设 400×400，
 * 否则放大后的窗口会被判成"在屏内"而实际超出边界。
 */
function isRestorablePositionOnMonitors(
  monitors: Monitor[],
  position: WindowPosition,
  windowSize: WindowSize,
): boolean {
  return monitors.some((monitor) => {
    const scale = monitor.scaleFactor;
    const width = windowSize.width * scale;
    const height = windowSize.height * scale;
    const margin = RESTORE_VISIBLE_MARGIN * scale;
    const workArea = monitor.workArea;
    return (
      position.x + width - margin > workArea.position.x &&
      position.x + margin < workArea.position.x + workArea.size.width &&
      position.y + height - margin > workArea.position.y &&
      position.y + margin < workArea.position.y + workArea.size.height
    );
  });
}

export async function isRestorablePosition(
  position: WindowPosition,
  windowSize: WindowSize = DEFAULT_WINDOW_SIZE,
): Promise<boolean> {
  const monitors = await availableMonitors();
  return isRestorablePositionOnMonitors(monitors, position, windowSize);
}

function closestMonitor(
  monitors: Monitor[],
  position: PhysicalPosition,
): Monitor | null {
  return monitors.reduce<Monitor | null>((closest, monitor) => {
    const workArea = monitor.workArea;
    const centerX = workArea.position.x + workArea.size.width / 2;
    const centerY = workArea.position.y + workArea.size.height / 2;
    const distance = (position.x - centerX) ** 2 + (position.y - centerY) ** 2;
    if (closest === null) return monitor;
    const closestWorkArea = closest.workArea;
    const closestCenterX = closestWorkArea.position.x + closestWorkArea.size.width / 2;
    const closestCenterY = closestWorkArea.position.y + closestWorkArea.size.height / 2;
    const closestDistance =
      (position.x - closestCenterX) ** 2 + (position.y - closestCenterY) ** 2;
    return distance < closestDistance ? monitor : closest;
  }, null);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function visibleWindowPosition(
  monitors: Monitor[],
  position: PhysicalPosition,
  windowSize: WindowSize = DEFAULT_WINDOW_SIZE,
): PhysicalPosition {
  const monitor = closestMonitor(monitors, position);
  if (monitor === null) return position;

  const scale = monitor.scaleFactor;
  const width = windowSize.width * scale;
  const height = windowSize.height * scale;
  const margin = RESTORE_VISIBLE_MARGIN * scale;
  const workArea = monitor.workArea;
  const minX = workArea.position.x + margin;
  const maxX = workArea.position.x + workArea.size.width - width - margin;
  const minY = workArea.position.y + margin;
  const maxY = workArea.position.y + workArea.size.height - height - margin;

  return new PhysicalPosition(
    clamp(position.x, minX, Math.max(minX, maxX)),
    clamp(position.y, minY, Math.max(minY, maxY)),
  );
}

/** 当前窗口的逻辑尺寸；读不到时退回基准值。 */
async function currentWindowLogicalSize(): Promise<WindowSize> {
  try {
    const win = getCurrentWindow();
    const size = await win.innerSize();
    const scale = await win.scaleFactor();
    if (!Number.isFinite(scale) || scale <= 0) {
      return { width: size.width, height: size.height };
    }
    return {
      width: Math.max(size.width / scale, MIN_WINDOW_LOGICAL_SIZE),
      height: Math.max(size.height / scale, MIN_WINDOW_LOGICAL_SIZE),
    };
  } catch (error) {
    console.error("read window size failed:", error);
    return DEFAULT_WINDOW_SIZE;
  }
}

export async function loadSettings(): Promise<void> {
  store = await Store.load(SETTINGS_FILE, { autoSave: false });

  const savedMode = await store.get<Mode>("mode");
  if (isMode(savedMode)) state.mode = savedMode;

  const savedSoundEnabled = await store.get<boolean>("soundEnabled");
  if (typeof savedSoundEnabled === "boolean") {
    state.soundEnabled = savedSoundEnabled;
  }

  // 先恢复尺寸，再按实际尺寸夹取位置：放大后的窗口需要更多空间
  const savedSize = await store.get<WindowSize>("windowSize");
  if (isRestorableSize(savedSize)) {
    try {
      // 窗口恒为正方形（画面按边长等比缩放）。旧版本可能存过非正方形尺寸，取长边归一化，
      // 否则恢复出来会是一圈空白 —— 那正是"缩放不自然"的根源。顺带夹回上限内。
      const side = restorableWindowSide(savedSize);
      await getCurrentWindow().setSize(new PhysicalSize(side, side));
    } catch (error) {
      console.error("restore window size failed:", error);
    }
  }

  const windowSize = await currentWindowLogicalSize();
  const monitors = await availableMonitors();
  const savedPosition = await store.get<WindowPosition>("windowPosition");
  if (
    savedPosition &&
    Number.isFinite(savedPosition.x) &&
    Number.isFinite(savedPosition.y) &&
    isRestorablePositionOnMonitors(monitors, savedPosition, windowSize)
  ) {
    await getCurrentWindow().setPosition(
      new PhysicalPosition(savedPosition.x, savedPosition.y),
    );
  }

  const currentPosition = await getCurrentWindow().outerPosition();
  if (
    !isRestorablePositionOnMonitors(
      monitors,
      { x: currentPosition.x, y: currentPosition.y },
      windowSize,
    )
  ) {
    await getCurrentWindow().setPosition(
      visibleWindowPosition(monitors, currentPosition, windowSize),
    );
  }

  state.autoStartEnabled = await isEnabled();
  await persistCurrentSettings();
}

async function persistCurrentSettings(): Promise<void> {
  if (!store) return;

  const win = getCurrentWindow();
  const position = await win.outerPosition();
  const size = await win.innerSize();
  await store.set("mode", state.mode);
  await store.set("soundEnabled", state.soundEnabled);
  await store.set("autoStartEnabled", state.autoStartEnabled);
  await store.set("windowPosition", { x: position.x, y: position.y });
  await store.set("windowSize", { width: size.width, height: size.height });
  await store.save();
}

export async function saveSettings(): Promise<void> {
  window.clearTimeout(saveTimer);
  saveChain = saveChain
    .catch(() => undefined)
    .then(() => persistCurrentSettings());
  await saveChain;
}

export function queueSaveSettings(delayMs = 500): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void saveSettings();
  }, delayMs);
}

export async function toggleAutoStart(): Promise<void> {
  const nextEnabled = !state.autoStartEnabled;
  if (nextEnabled) {
    await enable();
  } else {
    await disable();
  }
  state.autoStartEnabled = nextEnabled;
  await saveSettings();
}

export function disposeSettings(): void {
  window.clearTimeout(saveTimer);
}
