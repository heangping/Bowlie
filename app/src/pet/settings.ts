import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { availableMonitors, getCurrentWindow } from "@tauri-apps/api/window";
import { Store } from "@tauri-apps/plugin-store";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { state } from "./state";
import type { Mode } from "../shared/types";

const SETTINGS_FILE = "settings.json";
const PET_WINDOW_LOGICAL_SIZE = 400;
const RESTORE_VISIBLE_MARGIN = 40;

type WindowPosition = {
  x: number;
  y: number;
};

let store: Store | null = null;
let saveTimer: number | undefined;
let saveChain: Promise<void> = Promise.resolve();

function isMode(value: unknown): value is Mode {
  return value === "bowl" || value === "circle";
}

export async function isRestorablePosition(position: WindowPosition): Promise<boolean> {
  const monitors = await availableMonitors();
  return monitors.some((monitor) => {
    const scale = monitor.scaleFactor;
    const windowSize = PET_WINDOW_LOGICAL_SIZE * scale;
    const margin = RESTORE_VISIBLE_MARGIN * scale;
    const workArea = monitor.workArea;
    return (
      position.x + windowSize - margin > workArea.position.x &&
      position.x + margin < workArea.position.x + workArea.size.width &&
      position.y + windowSize - margin > workArea.position.y &&
      position.y + margin < workArea.position.y + workArea.size.height
    );
  });
}

export async function loadSettings(): Promise<void> {
  store = await Store.load(SETTINGS_FILE, { autoSave: false });

  const savedMode = await store.get<Mode>("mode");
  if (isMode(savedMode)) state.mode = savedMode;

  const savedSoundEnabled = await store.get<boolean>("soundEnabled");
  if (typeof savedSoundEnabled === "boolean") {
    state.soundEnabled = savedSoundEnabled;
  }

  const savedPosition = await store.get<WindowPosition>("windowPosition");
  if (
    savedPosition &&
    Number.isFinite(savedPosition.x) &&
    Number.isFinite(savedPosition.y) &&
    (await isRestorablePosition(savedPosition))
  ) {
    await getCurrentWindow().setPosition(
      new PhysicalPosition(savedPosition.x, savedPosition.y),
    );
  }

  state.autoStartEnabled = await isEnabled();
  await persistCurrentSettings();
}

async function persistCurrentSettings(): Promise<void> {
  if (!store) return;

  const position = await getCurrentWindow().outerPosition();
  await store.set("mode", state.mode);
  await store.set("soundEnabled", state.soundEnabled);
  await store.set("autoStartEnabled", state.autoStartEnabled);
  await store.set("windowPosition", { x: position.x, y: position.y });
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
