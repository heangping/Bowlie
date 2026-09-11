<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
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
import {
  MIN_WINDOW_SIZE,
  PET_BASE_SIZE,
  RESIZE_CURSORS,
  drawResizeHint as paintResizeHint,
  fadeHintAlpha,
  isSameResizeTarget,
  maxWindowSize,
  resizeDirectionAt,
  resizeTarget,
  type ResizeDirection,
  type ResizeGeometry,
  type ResizeTarget,
} from "./windowResize";
import { AudioPool, type Stoppable } from "./audio/pool";
import {
  speakApology,
  stopApologySpeech,
  warmUpApologySpeech,
} from "./audio/apologySpeech";
import { playBowlSound } from "./audio/bowlSynth";
import { painVariantForLevel, playPainSound } from "./audio/painSynth";

/** 所有绘制逻辑都基于这套基准坐标，窗口尺寸变化通过整体变换实现等比缩放 */
const BASE_SIZE = PET_BASE_SIZE;
/** 缩放提示框相对窗口边缘的内缩距离 */
const HINT_INSET = 4;

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
/** contain 模式的等比缩放：把基准坐标映射到当前窗口 */
let viewScale = 1;
let viewOffsetX = 0;
let viewOffsetY = 0;
let viewDpr = 1;

/** 指针当前压在哪条边/哪个角上（仅用于提示，不触发缩放） */
let hintDirection: ResizeDirection | null = null;
/** 缩放提示的当前透明度，向目标值平滑过渡 */
let hintAlpha = 0;
/** 拖拽中显示的边长读数 */
let dragSize = MIN_WINDOW_SIZE;
/** 读数是否已经顶到本次拖拽的最大边长 */
let dragAtMax = false;
/** 窗口左上角在屏幕上的逻辑坐标；读不到准确值时不启动缩放，避免窗口瞬移 */
let appliedOrigin = { x: 0, y: 0 };

type ResizeSession = {
  direction: ResizeDirection;
  pointerId: number;
  /** 起始几何是异步读出来的，读到之前先丢弃 pointermove */
  geometry: ResizeGeometry | null;
};

let resizeSession: ResizeSession | null = null;
/** 待下发的目标；同一帧内多次移动只保留最后一个 */
let pendingResize: ResizeTarget | null = null;
/** 已经下发过的目标，用于过滤"指针在动但尺寸没变"（例如撞到最小边长）的重复调用 */
let lastResizeTarget: ResizeTarget | null = null;
let resizeApplying = false;
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

/** 当前画布的 CSS 尺寸；布局尚未就绪时退回基准值，避免边缘命中误判。 */
const canvasSize = (): { width: number; height: number } => {
  const canvas = canvasRef.value;
  return {
    width: canvas?.clientWidth || BASE_SIZE,
    height: canvas?.clientHeight || BASE_SIZE,
  };
};

/**
 * 指针的屏幕坐标。必须用 screenX / screenY：拖西边或北边时我们会同时移动窗口
 * 本身，指针相对窗口的 clientX 会被我们自己的位移抵消掉，缩放拖一下就卡住。
 */
const pointerScreenX = (event: PointerEvent): number =>
  event.screenX || event.screenY ? event.screenX : event.clientX + appliedOrigin.x;
const pointerScreenY = (event: PointerEvent): number =>
  event.screenX || event.screenY ? event.screenY : event.clientY + appliedOrigin.y;

/** 读出窗口左上角的逻辑坐标；缩放起始基准必须准，否则窗口会瞬移 */
const refreshOrigin = async (): Promise<void> => {
  try {
    const win = getCurrentWindow();
    const [position, scale] = await Promise.all([win.outerPosition(), win.scaleFactor()]);
    if (!Number.isFinite(scale) || scale <= 0) return;
    appliedOrigin = { x: position.x / scale, y: position.y / scale };
  } catch (error) {
    console.error("read window position failed:", error);
  }
};

const flushResize = async (): Promise<void> => {
  if (resizeApplying) return;
  resizeApplying = true;
  try {
    while (pendingResize && resizeSession) {
      const target = pendingResize;
      pendingResize = null;
      const win = getCurrentWindow();
      await win.setSize(new LogicalSize(target.size, target.size));
      await win.setPosition(new LogicalPosition(target.x, target.y));
      appliedOrigin = { x: target.x, y: target.y };
      lastResizeTarget = target;
    }
  } catch (error) {
    console.error("window resize failed:", error);
  } finally {
    resizeApplying = false;
  }
};

const beginResize = (event: PointerEvent, direction: ResizeDirection): void => {
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  hintDirection = direction;
  const session: ResizeSession = { direction, pointerId: event.pointerId, geometry: null };
  resizeSession = session;
  pendingResize = null;
  lastResizeTarget = null;
  const pointerX = pointerScreenX(event);
  const pointerY = pointerScreenY(event);

  void (async () => {
    const win = getCurrentWindow();
    const [position, scale] = await Promise.all([win.outerPosition(), win.scaleFactor()]);
    if (resizeSession !== session) return; // 已经松手了
    const startSize = Math.max(Math.round(window.innerWidth), MIN_WINDOW_SIZE);
    appliedOrigin = { x: position.x / scale, y: position.y / scale };
    dragSize = startSize;
    dragAtMax = false;
    session.geometry = {
      direction,
      startSize,
      startX: appliedOrigin.x,
      startY: appliedOrigin.y,
      startPointerX: pointerX,
      startPointerY: pointerY,
      // 上限 = 硬上限与显示器可用边长取小值（见 windowResize.maxWindowSize）
      maxSize: maxWindowSize(),
    };
  })().catch((error: unknown) => {
    resizeSession = null;
    console.error("start window resize failed:", error);
  });
};

const endResize = (event?: PointerEvent): void => {
  if (!resizeSession) return;
  resizeSession = null;
  pendingResize = null;
  lastResizeTarget = null;
  hintDirection = null;
  if (
    event &&
    event.currentTarget instanceof HTMLElement &&
    event.currentTarget.hasPointerCapture(event.pointerId)
  ) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  queueSaveSettings();
};

const moveResize = (event: PointerEvent): void => {
  const session = resizeSession;
  if (!session?.geometry) return;
  const target = resizeTarget(
    session.geometry,
    pointerScreenX(event),
    pointerScreenY(event),
  );
  dragSize = target.size;
  dragAtMax = target.size >= session.geometry.maxSize;
  if (isSameResizeTarget(pendingResize, target) || isSameResizeTarget(lastResizeTarget, target)) {
    return;
  }
  pendingResize = target;
  void flushResize();
};

const toBaseX = (clientX: number): number => (clientX - viewOffsetX) / viewScale;
const toBaseY = (clientY: number): number => (clientY - viewOffsetY) / viewScale;

/**
 * 画布尺寸与窗口对齐。做成幂等的：拖动缩放时 window.resize 可能一帧触发好几次，
 * 每次都重分配位图会明显掉帧，这里只在尺寸真的变了才重建。
 */
const resize = (): void => {
  const canvas = canvasRef.value;
  if (!canvas || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvasSize();
  const pixelWidth = Math.max(Math.round(width * dpr), 1);
  const pixelHeight = Math.max(Math.round(height * dpr), 1);
  if (canvas.width === pixelWidth && canvas.height === pixelHeight && viewDpr === dpr) {
    return;
  }
  viewDpr = dpr;
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  viewScale = Math.min(width, height) / BASE_SIZE;
  viewOffsetX = (width - BASE_SIZE * viewScale) / 2;
  viewOffsetY = (height - BASE_SIZE * viewScale) / 2;
};

/** 把"基准坐标 → 窗口像素"的变换装回画布；绘制提示框会临时改掉它 */
const applyBaseTransform = (): void => {
  if (!ctx) return;
  ctx.setTransform(
    viewDpr * viewScale,
    0,
    0,
    viewDpr * viewScale,
    viewDpr * viewOffsetX,
    viewDpr * viewOffsetY,
  );
};

/**
 * 悬停/拖拽时的缩放提示。这是个透明无边框窗口，桌面上看不出边界在哪，所以把
 * 窗口边界画出来、把该条边高亮，拖拽中再报一个边长读数 —— 让"隐形的窗口"变成
 * 看得见、摸得着的边框。
 */
const drawResizeHint = (width: number, height: number, deltaSeconds: number): void => {
  if (!ctx) return;
  const targetAlpha = resizeSession ? 1 : hintDirection ? 0.7 : 0;
  hintAlpha = fadeHintAlpha(hintAlpha, targetAlpha, deltaSeconds);
  if (hintAlpha === 0) return;

  ctx.setTransform(viewDpr, 0, 0, viewDpr, 0, 0);
  paintResizeHint(ctx, {
    width,
    height,
    alpha: hintAlpha,
    direction: resizeSession?.direction ?? hintDirection,
    sizeLabel: resizeSession ? dragSize : null,
    atMax: resizeSession ? dragAtMax : false,
    inset: HINT_INSET,
  });
  applyBaseTransform();
};

const frame = (): void => {
  const now = performance.now();
  if (!ctx) return;
  if (lastFrameAt === 0) lastFrameAt = now;
  const deltaSeconds = Math.min(Math.max((now - lastFrameAt) / 1000, 0), 0.05);
  lastFrameAt = now;
  const { width, height } = canvasSize();
  // 每帧对齐一次画布尺寸：窗口拖动缩放时把一帧内的多次 resize 事件合并成一次重建
  resize();
  applyBaseTransform();
  ctx.clearRect(0, 0, BASE_SIZE, BASE_SIZE);
  if (state.mode === "bowl") {
    drawBowl(ctx, BASE_SIZE, BASE_SIZE, now, state.bowlHitAt);
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
    drawCharacter(ctx, BASE_SIZE, BASE_SIZE, now, displayLevel, circlePressAt);
  }
  drawResizeHint(width, height, deltaSeconds);
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
  const { width, height } = canvasSize();
  const direction = resizeDirectionAt(width, height, event.clientX, event.clientY);
  if (direction) {
    beginResize(event, direction);
    return;
  }
  const x = toBaseX(event.clientX);
  const y = toBaseY(event.clientY);
  if (state.mode === "bowl") {
    if (bowlHitTest(x, y, BASE_SIZE, BASE_SIZE)) {
      const now = performance.now();
      state.bowlHitAt = now;
      const waveSpeed = registerBowlClick();
      void invoke("spawn_wave", { x: event.clientX, y: event.clientY, speed: waveSpeed });
      if (state.soundEnabled) audioPool.play(bowlSoundFactories);
    } else {
      beginBackgroundDrag(event);
    }
    return;
  }
  if (characterHitTest(x, y, BASE_SIZE, BASE_SIZE)) {
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

const onPointerMove = (event: PointerEvent): void => {
  const canvas = canvasRef.value;
  if (resizeSession) {
    if (event.pointerId !== resizeSession.pointerId) return;
    if (canvas) canvas.style.cursor = RESIZE_CURSORS[resizeSession.direction];
    moveResize(event);
    return;
  }
  if (canvas && !dragStart) {
    const { width, height } = canvasSize();
    const direction = resizeDirectionAt(width, height, event.clientX, event.clientY);
    canvas.style.cursor = direction ? RESIZE_CURSORS[direction] : "";
    hintDirection = direction;
    if (direction) return;
  }
  onDragMove(event);
};

const onPointerLeave = (): void => {
  if (resizeSession) return;
  const canvas = canvasRef.value;
  if (canvas) canvas.style.cursor = "";
  hintDirection = null;
};

const endPointerInteraction = (event?: PointerEvent): void => {
  endResize(event);
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
  const { width, height } = canvasSize();
  menu.show = true;
  menu.x = Math.min(Math.max(event.clientX, 8), Math.max(width - 124, 8));
  menu.y = Math.min(Math.max(event.clientY, 8), Math.max(height - 136, 8));
};

const onGlobalMouseDown = (event: MouseEvent): void => {
  const target = event.target as HTMLElement | null;
  if (!target?.closest(".menu")) {
    menu.show = false;
  }
};

const onWindowResize = (): void => {
  resize();
  queueSaveSettings();
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
  window.addEventListener("resize", onWindowResize);

  void (async () => {
    unlistenMoved = await getCurrentWindow().onMoved(() => {
      queueSaveSettings();
      // 缩放过程中位置由我们自己驱动，别用系统回报的中间态覆盖起始基准
      if (!resizeSession) void refreshOrigin();
    });
    unlistenScaleChanged = await getCurrentWindow().onScaleChanged(() => {
      resize();
      queueSaveSettings();
      if (!resizeSession) void refreshOrigin();
    });
    await loadSettings();
    resize();
    await refreshOrigin();
  })().catch((error) => {
    console.error("load settings failed:", error);
  });
});

onBeforeUnmount(() => {
  window.clearTimeout(timerId);
  window.removeEventListener("mousedown", onGlobalMouseDown);
  window.removeEventListener("resize", onWindowResize);
  unlistenMoved?.();
  unlistenScaleChanged?.();
  endCircleHold();
  endDrag();
  endResize();
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
      @pointermove="onPointerMove"
      @pointerleave="onPointerLeave"
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
  width: 100%;
  height: 100%;
  user-select: none;
}
.pet-canvas {
  position: absolute;
  inset: 0;
  display: block;
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
