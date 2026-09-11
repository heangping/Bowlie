<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  state,
  switchMode,
  beginCircleHold,
  updateCircleHold,
  endCircleHold,
  toggleSound,
  registerBowlClick,
} from "./state";
import {
  disposeSettings,
  loadSettings,
  queueSaveSettings,
  saveSettings,
  toggleAutoStart,
} from "./settings";
import { drawBowl, bowlHitTest } from "./engine/bowlRenderer";
import { drawCharacter, characterHitTest } from "./engine/characterRenderer";
import { AudioPool, type Stoppable } from "./audio/pool";
import {
  speakApology,
  stopApologySpeech,
  warmUpApologySpeech,
} from "./audio/apologySpeech";
import { playBowlSound } from "./audio/bowlSynth";
import { painVariantForLevel, playPainSound } from "./audio/painSynth";

const canvasRef = ref<HTMLCanvasElement | null>(null);
const menu = reactive({ show: false, x: 0, y: 0 });

let ctx: CanvasRenderingContext2D | null = null;
let timerId = 0;
let unlistenMoved: (() => void) | null = null;
let unlistenScaleChanged: (() => void) | null = null;
/** 紧箍咒显示等级的连续插值，向 circleLevel 逼近 */
let displayLevel = 0;
let lastFrameAt = 0;
let dragStart: { x: number; y: number } | null = null;
let dragStarted = false;
let dragPointerId: number | null = null;
let circlePointerId: number | null = null;
let circlePressAt = 0;
let lastPainLevel = 0;
const audioPool = new AudioPool(4);
const bowlSoundFactories: Array<() => Stoppable> = [
  () => playBowlSound(0),
  () => playBowlSound(1),
  () => playBowlSound(2),
];
const painAudioPool = new AudioPool(2, 250);
const painSoundFactories: Array<() => Stoppable> = [
  () => playPainSound(0),
  () => playPainSound(1),
  () => playPainSound(2),
];

const resize = (): void => {
  const canvas = canvasRef.value;
  if (!canvas || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 400 * dpr;
  canvas.height = 400 * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};

const frame = (): void => {
  const now = performance.now();
  if (!ctx) return;
  if (lastFrameAt === 0) lastFrameAt = now;
  const deltaSeconds = Math.min(Math.max((now - lastFrameAt) / 1000, 0), 0.05);
  lastFrameAt = now;
  ctx.clearRect(0, 0, 400, 400);
  if (state.mode === "bowl") {
    drawBowl(ctx, 400, 400, now, state.bowlHitAt);
  } else {
    updateCircleHold(now);
    const smoothing = 1 - Math.exp(-deltaSeconds / 0.16);
    displayLevel += (state.circleLevel - displayLevel) * smoothing;
    if (Math.abs(state.circleLevel - displayLevel) < 0.01) displayLevel = state.circleLevel;
    const painLevel = Math.min(Math.floor(displayLevel) + 1, 4);
    if (state.circleHolding && painLevel > lastPainLevel) {
      lastPainLevel = painLevel;
      if (state.soundEnabled) {
        if (!speakApology(painLevel)) {
          painAudioPool.playAt(painVariantForLevel(painLevel), painSoundFactories);
        }
      }
    }
    drawCharacter(ctx, 400, 400, now, displayLevel, circlePressAt);
  }
  timerId = window.setTimeout(frame, 16);
};

const beginBackgroundDrag = (event: PointerEvent): void => {
  dragStart = { x: event.clientX, y: event.clientY };
  dragStarted = false;
  dragPointerId = event.pointerId;
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
};

const onPointerDown = (event: PointerEvent): void => {
  if (event.button !== 0) return;
  const x = event.clientX;
  const y = event.clientY;
  if (state.mode === "bowl") {
    if (bowlHitTest(x, y, 400, 400)) {
      const now = performance.now();
      state.bowlHitAt = now;
      const waveSpeed = registerBowlClick();
      void invoke("spawn_wave", { x, y, speed: waveSpeed });
      if (state.soundEnabled) audioPool.play(bowlSoundFactories);
    } else {
      beginBackgroundDrag(event);
    }
    return;
  }
  if (characterHitTest(x, y, 400, 400)) {
    const now = performance.now();
    circlePointerId = event.pointerId;
    circlePressAt = now;
    lastPainLevel = Math.min(Math.floor(state.circleLevel) + 1, 4);
    beginCircleHold(now);
    updateCircleHold(now);
    if (state.soundEnabled && !speakApology(Math.max(lastPainLevel, 1))) {
      painAudioPool.playAt(painVariantForLevel(lastPainLevel), painSoundFactories);
    }
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  } else {
    beginBackgroundDrag(event);
  }
};

const onDragMove = (event: PointerEvent): void => {
  if (!dragStart || dragStarted) return;
  const dx = event.clientX - dragStart.x;
  const dy = event.clientY - dragStart.y;
  if (Math.hypot(dx, dy) < 5) return;
  dragStarted = true;
  void getCurrentWindow().startDragging();
};

const endPointerInteraction = (event?: PointerEvent): void => {
  if (
    event &&
    circlePointerId === event.pointerId &&
    event.currentTarget instanceof HTMLElement &&
    event.currentTarget.hasPointerCapture(circlePointerId)
  ) {
    event.currentTarget.releasePointerCapture(circlePointerId);
  }
  if (circlePointerId === event?.pointerId || event?.type === "lostpointercapture") {
    endCircleHold();
    circlePointerId = null;
    circlePressAt = 0;
    lastPainLevel = 0;
  }
  endDrag(event);
};

const endDrag = (event?: PointerEvent): void => {
  if (
    event &&
    dragPointerId !== null &&
    event.currentTarget instanceof HTMLElement &&
    event.currentTarget.hasPointerCapture(dragPointerId)
  ) {
    event.currentTarget.releasePointerCapture(dragPointerId);
  }
  dragStart = null;
  dragStarted = false;
  dragPointerId = null;
};

const onSwitchMode = (mode: "bowl" | "circle"): void => {
  stopApologySpeech();
  switchMode(mode);
  displayLevel = 0;
  lastFrameAt = performance.now();
  void saveSettings().catch((error) => {
    console.error("save settings failed:", error);
  });
};

const onToggleSound = (): void => {
  if (state.soundEnabled) {
    stopApologySpeech();
    audioPool.stopAll();
    painAudioPool.stopAll();
  }
  toggleSound();
  void saveSettings().catch((error) => {
    console.error("save settings failed:", error);
  });
};

const onToggleAutoStart = (): void => {
  menu.show = false;
  void toggleAutoStart().catch((error) => {
    console.error("toggle autostart failed:", error);
  });
};

const onContextMenu = (event: MouseEvent): void => {
  event.preventDefault();
  menu.show = true;
  menu.x = Math.min(Math.max(event.clientX, 8), 400 - 124);
  menu.y = Math.min(Math.max(event.clientY, 8), 400 - 136);
};

const onGlobalMouseDown = (event: MouseEvent): void => {
  const target = event.target as HTMLElement | null;
  if (!target?.closest(".menu")) {
    menu.show = false;
  }
};

const quit = (): void => {
  menu.show = false;
  void (async () => {
    await saveSettings().catch((error) => {
      console.error("save settings failed:", error);
    });
    await invoke("quit_app");
  })();
};

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  ctx = canvas.getContext("2d");
  resize();
  timerId = window.setTimeout(frame, 16);
  warmUpApologySpeech();
  window.addEventListener("mousedown", onGlobalMouseDown);

  void (async () => {
    unlistenMoved = await getCurrentWindow().onMoved(() => {
      queueSaveSettings();
    });
    unlistenScaleChanged = await getCurrentWindow().onScaleChanged(() => {
      resize();
    });
    await loadSettings();
  })().catch((error) => {
    console.error("load settings failed:", error);
  });
});

onBeforeUnmount(() => {
  window.clearTimeout(timerId);
  window.removeEventListener("mousedown", onGlobalMouseDown);
  unlistenMoved?.();
  unlistenScaleChanged?.();
  endCircleHold();
  endDrag();
  stopApologySpeech();
  disposeSettings();
});
</script>

<template>
  <div class="root">
    <canvas
      ref="canvasRef"
      class="pet-canvas"
      width="400"
      height="400"
      @pointerdown="onPointerDown"
      @pointermove="onDragMove"
      @pointerup="endPointerInteraction"
      @pointercancel="endPointerInteraction"
      @lostpointercapture="endPointerInteraction"
      @contextmenu="onContextMenu"
    ></canvas>
    <div v-if="state.fahaiVisible" class="fahai-bubble">你是法海，在这收妖呢？</div>
    <div v-if="menu.show" class="menu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }">
      <div class="menu-item" @click="onSwitchMode(state.mode === 'bowl' ? 'circle' : 'bowl'); menu.show = false">
        {{ state.mode === "bowl" ? "切换为紧箍咒" : "切换为颂钵" }}
      </div>
      <div class="menu-item" @click="onToggleSound(); menu.show = false">
        {{ state.soundEnabled ? "静音" : "取消静音" }}
      </div>
      <div class="menu-item" @click="onToggleAutoStart">
        {{ state.autoStartEnabled ? "关闭开机自启" : "开启开机自启" }}
      </div>
      <div class="menu-item" @click="quit">退出</div>
    </div>
  </div>
</template>

<style scoped>
.root {
  position: relative;
  width: 400px;
  height: 400px;
  user-select: none;
}
.pet-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
}
.fahai-bubble {
  position: absolute;
  top: 86px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 8;
  max-width: 360px;
  padding: 7px 12px;
  border: 1px solid rgba(212, 160, 23, 0.65);
  border-radius: 14px;
  background: rgba(30, 22, 10, 0.9);
  color: #ffe4a3;
  font-size: 14px;
  white-space: nowrap;
  pointer-events: none;
  animation: fahai-bubble 2.5s ease forwards;
}
.menu {
  position: fixed;
  z-index: 10;
  min-width: 120px;
  background: rgba(30, 22, 10, 0.92);
  border: 1px solid rgba(212, 160, 23, 0.4);
  border-radius: 8px;
  padding: 4px 0;
}
.menu-item {
  color: #e8c97a;
  font-size: 13px;
  padding: 6px 14px;
  cursor: pointer;
}
.menu-item:hover {
  background: rgba(212, 160, 23, 0.25);
}
@keyframes fahai-bubble {
  0% {
    opacity: 0;
    transform: translateX(-50%) translateY(6px);
  }
  12% {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  82% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateX(-50%) translateY(-8px);
  }
}
</style>
