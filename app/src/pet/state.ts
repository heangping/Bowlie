import { reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { Mode } from "../shared/types";
import { setSoundEnabled } from "./audio/engine";

const MAX_LEVEL = 4;
const RESTORE_DELAY_MS = 1500;
const RESTORE_DURATION_MS = 1600;
const FAHAI_WINDOW_MS = 30000;
const FAHAI_TRIGGER_COUNT = 30;
const FAHAI_COOLDOWN_MS = 30000;
const FAHAI_DISPLAY_MS = 2500;

interface PetStore {
  mode: Mode;
  bowlHitAt: number;
  circleLevel: number;
  restoring: boolean;
  soundEnabled: boolean;
  autoStartEnabled: boolean;
  fahaiVisible: boolean;
}

export const state = reactive<PetStore>({
  mode: "bowl",
  bowlHitAt: 0,
  circleLevel: 0,
  restoring: false,
  soundEnabled: true,
  autoStartEnabled: false,
  fahaiVisible: false,
});

let restoreTimer: number | undefined;
let restoreEndTimer: number | undefined;
let restoreFromLevel = 0;
let bowlClicks: number[] = [];
let fahaiCooldownUntil = 0;
let fahaiTimer: number | undefined;

function clearRestoreTimers(): void {
  window.clearTimeout(restoreTimer);
  window.clearTimeout(restoreEndTimer);
}

function clearFahai(): void {
  bowlClicks = [];
  state.fahaiVisible = false;
  window.clearTimeout(fahaiTimer);
}

function scheduleRestore(): void {
  clearRestoreTimers();
  restoreTimer = window.setTimeout(() => {
    restoreFromLevel = state.circleLevel;
    state.restoring = true;
    state.circleLevel = 0;
    restoreEndTimer = window.setTimeout(() => {
      state.restoring = false;
      restoreFromLevel = 0;
    }, RESTORE_DURATION_MS);
  }, RESTORE_DELAY_MS);
}

export function switchMode(mode: Mode): void {
  if (state.mode === mode) return;
  state.mode = mode;
  state.bowlHitAt = 0;
  state.circleLevel = 0;
  state.restoring = false;
  restoreFromLevel = 0;
  clearRestoreTimers();
  clearFahai();
  void invoke("clear_waves");
}

/**
 * 点击紧箍咒小人：等级 +1（封顶 MAX）。
 * R4 语义：恢复中点击 = 打断恢复，回到恢复前等级并 +1。
 */
export function pressCircle(): number {
  const baseLevel = state.restoring ? restoreFromLevel : state.circleLevel;
  state.restoring = false;
  state.circleLevel = Math.min(baseLevel + 1, MAX_LEVEL);
  scheduleRestore();
  return state.circleLevel;
}

/**
 * 法海彩蛋：30 秒滑动窗口内第 31 次点击触发。
 * 触发后清空计数，冷却 30 秒内不累计，避免冷却结束瞬间重复弹出。
 */
export function registerBowlClick(): void {
  const now = performance.now();
  if (now < fahaiCooldownUntil) return;

  bowlClicks.push(now);
  const windowStart = now - FAHAI_WINDOW_MS;
  while (bowlClicks.length > 0 && bowlClicks[0] <= windowStart) {
    bowlClicks.shift();
  }

  if (bowlClicks.length <= FAHAI_TRIGGER_COUNT) return;

  bowlClicks = [];
  fahaiCooldownUntil = now + FAHAI_COOLDOWN_MS;
  state.fahaiVisible = true;
  window.clearTimeout(fahaiTimer);
  fahaiTimer = window.setTimeout(() => {
    state.fahaiVisible = false;
  }, FAHAI_DISPLAY_MS);
}

export function toggleSound(): void {
  state.soundEnabled = !state.soundEnabled;
  setSoundEnabled(state.soundEnabled);
}
