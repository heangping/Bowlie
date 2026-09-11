import { reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { Mode } from "../shared/types";
import { setSoundEnabled } from "./audio/engine";

const MAX_LEVEL = 4;
const CIRCLE_HOLD_MAX_MS = 1600;
const RESTORE_DELAY_MS = 1500;
const RESTORE_DURATION_MS = 1600;
const FAST_CLICK_MS = 120;
const SLOW_CLICK_MS = 800;
const FAHAI_WINDOW_MS = 30000;
const FAHAI_TRIGGER_COUNT = 30;
const FAHAI_COOLDOWN_MS = 30000;
const FAHAI_DISPLAY_MS = 2500;

interface PetStore {
  mode: Mode;
  bowlHitAt: number;
  circleLevel: number;
  circleHolding: boolean;
  restoring: boolean;
  soundEnabled: boolean;
  autoStartEnabled: boolean;
  fahaiVisible: boolean;
}

export const state = reactive<PetStore>({
  mode: "bowl",
  bowlHitAt: 0,
  circleLevel: 0,
  circleHolding: false,
  restoring: false,
  soundEnabled: true,
  autoStartEnabled: false,
  fahaiVisible: false,
});

let restoreTimer: number | undefined;
let restoreEndTimer: number | undefined;
let restoreFromLevel = 0;
let circleHoldStartedAt = 0;
let circleHoldBaseLevel = 0;
let bowlClicks: number[] = [];
let lastBowlClickAt = Number.NEGATIVE_INFINITY;
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
  state.circleHolding = false;
  state.restoring = false;
  restoreFromLevel = 0;
  clearRestoreTimers();
  clearFahai();
  void invoke("clear_waves");
}

export function beginCircleHold(now = performance.now()): void {
  clearRestoreTimers();
  circleHoldBaseLevel = state.restoring ? restoreFromLevel : state.circleLevel;
  state.restoring = false;
  restoreFromLevel = 0;
  state.circleHolding = true;
  circleHoldStartedAt = now;
  state.circleLevel = circleHoldBaseLevel;
}

export function updateCircleHold(now = performance.now()): void {
  if (!state.circleHolding) return;
  const holdMs = Math.max(now - circleHoldStartedAt, 0);
  state.circleLevel = Math.min(
    circleHoldBaseLevel + (holdMs / CIRCLE_HOLD_MAX_MS) * MAX_LEVEL,
    MAX_LEVEL,
  );
}

export function endCircleHold(): number {
  if (!state.circleHolding) return state.circleLevel;
  state.circleHolding = false;
  if (state.circleLevel > 0) scheduleRestore();
  return state.circleLevel;
}

export function bowlWaveSpeed(intervalMs: number): number {
  if (!Number.isFinite(intervalMs)) return 1;
  if (intervalMs <= FAST_CLICK_MS) return 3;
  if (intervalMs >= SLOW_CLICK_MS) return 1;
  return 1 + (2 * (SLOW_CLICK_MS - intervalMs)) / (SLOW_CLICK_MS - FAST_CLICK_MS);
}

/**
 * 法海彩蛋：30 秒滑动窗口内第 31 次点击触发。
 * 返回值同时作为波纹速度：点击间隔越短，波纹扩散越快。
 */
export function registerBowlClick(now = performance.now()): number {
  const speed = bowlWaveSpeed(now - lastBowlClickAt);
  lastBowlClickAt = now;
  if (now >= fahaiCooldownUntil) {
    bowlClicks.push(now);
    const windowStart = now - FAHAI_WINDOW_MS;
    while (bowlClicks.length > 0 && bowlClicks[0] <= windowStart) {
      bowlClicks.shift();
    }
    if (bowlClicks.length > FAHAI_TRIGGER_COUNT) {
      bowlClicks = [];
      fahaiCooldownUntil = now + FAHAI_COOLDOWN_MS;
      state.fahaiVisible = true;
      window.clearTimeout(fahaiTimer);
      fahaiTimer = window.setTimeout(() => {
        state.fahaiVisible = false;
      }, FAHAI_DISPLAY_MS);
    }
  }
  return speed;
}

export function toggleSound(): void {
  state.soundEnabled = !state.soundEnabled;
  setSoundEnabled(state.soundEnabled);
}
