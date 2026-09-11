import { bowlHitTest, drawBowl } from "../pet/engine/bowlRenderer";
import { playBowlSound } from "../pet/audio/bowlSynth";
import {
  MIN_WINDOW_SIZE,
  RESIZE_CURSORS,
  clampWindowSize,
  drawResizeHint,
  fadeHintAlpha,
  maxWindowSize,
  resizeDirectionAt,
  resizeTarget,
  type ResizeDirection,
  type ResizeGeometry,
} from "../pet/windowResize";
import {
  drawWaveRing,
  isWaveExpired,
  waveGeometry,
  waveRadiusAt,
} from "../wave/waveEngine";

const BASE_SIZE = 400;

interface ActiveWave {
  x: number;
  y: number;
  endRadius: number;
  born: number;
  seed: number;
}

const canvas = document.createElement("canvas");
canvas.id = "preview-canvas";
document.body.prepend(canvas);

function requireContext2d(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const value = target.getContext("2d");
  if (!value) throw new Error("canvas 2d context unavailable");
  return value;
}

const context = requireContext2d(canvas);

let dpr = 1;
let viewWidth = 0;
let viewHeight = 0;
let petSize = 400;
let petLeft = 0;
let petTop = 0;
let hitAt = 0;
let soundEnabled = true;
let lastVariant: 0 | 1 | 2 = 0;
let lastFrameAt = 0;
/** 指针压在方格的哪条边/角上（仅提示） */
let hintDirection: ResizeDirection | null = null;
let hintAlpha = 0;
/** 拖拽中显示在提示框里的边长读数 */
let sizeLabel: number | null = null;
/** 读数是否已经顶到最大边长 */
let sizeAtMax = false;
/** 当前的缩放会话；这里用指针的 clientX/clientY 当作屏幕坐标 —— 方格在页面里，
 *  不会被自己的位移带偏，和真实窗口里必须用 screenX 的原因刚好互补 */
let resizeGeometry: ResizeGeometry | null = null;
const waves: ActiveWave[] = [];

function resize(): void {
  dpr = window.devicePixelRatio || 1;
  viewWidth = window.innerWidth;
  viewHeight = window.innerHeight;
  canvas.width = Math.round(viewWidth * dpr);
  canvas.height = Math.round(viewHeight * dpr);
  canvas.style.width = `${viewWidth}px`;
  canvas.style.height = `${viewHeight}px`;
  petLeft = (viewWidth - petSize) / 2;
  petTop = (viewHeight - petSize) / 2;
}

/** 与 Rust 侧一致：终点半径取点击点到屏幕四边的最远距离，留 5% 余量 */
function spawnWaveAt(x: number, y: number): void {
  const farthest = Math.max(x, viewWidth - x, y, viewHeight - y);
  waves.push({
    x,
    y,
    endRadius: farthest * 1.05,
    born: performance.now(),
    seed: Math.random() * Math.PI * 2,
  });
}

/** 相对方格左上角的坐标；不在方格内返回 null */
function frameLocal(x: number, y: number): { x: number; y: number } | null {
  const inside =
    x >= petLeft && x <= petLeft + petSize && y >= petTop && y <= petTop + petSize;
  return inside ? { x: x - petLeft, y: y - petTop } : null;
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const local = frameLocal(event.clientX, event.clientY);
  if (!local) return;

  const direction = resizeDirectionAt(petSize, petSize, local.x, local.y);
  if (direction) {
    canvas.setPointerCapture(event.pointerId);
    resizeGeometry = {
      direction,
      startSize: petSize,
      startX: petLeft,
      startY: petTop,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      // 和真实桌宠同一套上限，预览里看到的边界就是真机上的边界
      maxSize: maxWindowSize(),
    };
    sizeLabel = petSize;
    return;
  }

  const scale = petSize / BASE_SIZE;
  if (!bowlHitTest(local.x / scale, local.y / scale, BASE_SIZE, BASE_SIZE)) {
    return;
  }

  hitAt = performance.now();
  spawnWaveAt(event.clientX, event.clientY);

  if (soundEnabled) {
    let variant = Math.floor(Math.random() * 3) as 0 | 1 | 2;
    if (variant === lastVariant) variant = ((variant + 1) % 3) as 0 | 1 | 2;
    lastVariant = variant;
    playBowlSound(variant);
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (resizeGeometry) {
    const target = resizeTarget(resizeGeometry, event.clientX, event.clientY);
    petSize = target.size;
    petLeft = target.x;
    petTop = target.y;
    sizeLabel = target.size;
    sizeAtMax = target.size >= resizeGeometry.maxSize;
    canvas.style.cursor = RESIZE_CURSORS[resizeGeometry.direction];
    syncSizeControl();
    return;
  }
  const local = frameLocal(event.clientX, event.clientY);
  const direction = local ? resizeDirectionAt(petSize, petSize, local.x, local.y) : null;
  hintDirection = direction;
  canvas.style.cursor = direction ? RESIZE_CURSORS[direction] : "";
});

function endResize(event: PointerEvent): void {
  if (!resizeGeometry) return;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  resizeGeometry = null;
  sizeLabel = null;
  sizeAtMax = false;
  hintDirection = null;
}

canvas.addEventListener("pointerup", endResize);
canvas.addEventListener("pointercancel", endResize);
canvas.addEventListener("pointerleave", () => {
  if (resizeGeometry) return;
  hintDirection = null;
  canvas.style.cursor = "";
});

function frame(): void {
  const now = performance.now();
  if (lastFrameAt === 0) lastFrameAt = now;
  const deltaSeconds = Math.min(Math.max((now - lastFrameAt) / 1000, 0), 0.05);
  lastFrameAt = now;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, viewWidth, viewHeight);

  for (let i = waves.length - 1; i >= 0; i -= 1) {
    const wave = waves[i];
    const ageSeconds = (now - wave.born) / 1000;
    if (isWaveExpired(ageSeconds, 1, wave.endRadius)) {
      waves.splice(i, 1);
      continue;
    }
    const geometry = waveGeometry(wave.endRadius);
    const opacity =
      ageSeconds <= geometry.fadeStart
        ? 1
        : 1 - (ageSeconds - geometry.fadeStart) / (geometry.totalTime - geometry.fadeStart);
    drawWaveRing(context, {
      x: wave.x,
      y: wave.y,
      radius: waveRadiusAt(ageSeconds, 1, wave.endRadius),
      opacity,
      age: ageSeconds,
      seed: wave.seed,
    });
  }

  const scale = petSize / BASE_SIZE;
  context.save();
  context.translate(petLeft, petTop);
  context.scale(scale, scale);
  drawBowl(context, BASE_SIZE, BASE_SIZE, now, hitAt);
  context.restore();

  // 和桌宠里完全同一套提示绘制：悬停边缘画边界框并高亮该边，拖拽中报边长
  const targetAlpha = resizeGeometry ? 1 : hintDirection ? 0.7 : 0;
  hintAlpha = fadeHintAlpha(hintAlpha, targetAlpha, deltaSeconds);
  if (hintAlpha > 0) {
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.save();
    context.translate(petLeft, petTop);
    drawResizeHint(context, {
      width: petSize,
      height: petSize,
      alpha: hintAlpha,
      direction: resizeGeometry?.direction ?? hintDirection,
      sizeLabel,
      atMax: sizeAtMax,
    });
    context.restore();
  }

  requestAnimationFrame(frame);
}

const sizeInput = document.querySelector<HTMLInputElement>("#pet-size");
const sizeLabelEl = document.querySelector<HTMLElement>("#pet-size-label");

function syncSizeControl(): void {
  const side = Math.round(petSize);
  if (sizeInput) sizeInput.value = String(side);
  if (sizeLabelEl) sizeLabelEl.textContent = `${side} px`;
}

if (sizeInput && sizeLabelEl) {
  // 滑杆范围直接取真实上限，免得预览里能拉到真机拉不到的位置
  const maxSide = maxWindowSize();
  sizeInput.min = String(MIN_WINDOW_SIZE);
  sizeInput.max = String(maxSide);
  sizeInput.value = String(petSize);
  sizeLabelEl.textContent = `${petSize} px`;
  sizeInput.addEventListener("input", () => {
    petSize = clampWindowSize(Number(sizeInput.value), maxSide);
    sizeLabelEl.textContent = `${petSize} px`;
    resize();
  });
}

const backgroundButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-bg]"),
);
for (const button of backgroundButtons) {
  button.addEventListener("click", () => {
    document.body.className = button.dataset.bg ?? "";
    for (const other of backgroundButtons) {
      other.setAttribute("aria-pressed", String(other === button));
    }
  });
}

const soundButton = document.querySelector<HTMLButtonElement>("#sound-toggle");
if (soundButton) {
  soundButton.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    soundButton.setAttribute("aria-pressed", String(soundEnabled));
    soundButton.textContent = soundEnabled ? "声音：开" : "声音：关";
  });
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
