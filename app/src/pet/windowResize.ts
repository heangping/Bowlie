/**
 * 窗口缩放的几何计算（全部使用逻辑/CSS 像素，与 Tauri 的 Logical* API 对齐）。
 *
 * 这里没有用 Tauri 的 `startResizeDragging`（原生缩放），原因是原生缩放有两个
 * 绕不开的问题：
 *
 * 1. tao（Tauri 的窗口层）不支持宽高比约束。拖动单条边会让窗口变成非正方形，
 *    而画面是按 contain 等比缩放的，多出来的那条边长只会变成空白 —— 用户看到
 *    的现象就是"拖了半天，桌宠纹丝不动，只是旁边多了块空地"。
 * 2. 原生缩放的命中带和光标由系统决定。这是个透明无边框窗口，桌面上根本看不出
 *    窗口边界在哪，用户找不到该从哪里下拖。
 *
 * 所以缩放完全由前端接管：按住边缘 → 自己算目标尺寸和目标位置 → setSize +
 * setPosition。这样能同时保证三件事：
 *
 * - 窗口恒为正方形，画面永远填满窗口（contain 退化成 fill），拖动距离与视觉
 *   缩放比例 1:1，不会有"拖了没反应"的死区；
 * - 锚定对侧边：拖右边时左边不动，拖左边时右边不动 —— 这是符合直觉的缩放手感；
 * - 光标和命中带由我们自己控制，并且可以在悬停时把窗口边界画出来。
 */

/** 桌宠画面的基准边长 */
export const PET_BASE_SIZE = 400;
/** 最小窗口边长，需与 tauri.conf.json 的 minWidth / minHeight 保持一致 */
export const MIN_WINDOW_SIZE = 240;
/**
 * 最大窗口边长（硬上限），基准的 2 倍。
 *
 * 上限只能由前端来夹：macOS 上 tao 的 `set_content_size_async` 直接调
 * `NSWindow.setContentSize`，压根不读 tauri.conf.json 里的 min/max，所以
 * 配置层面留不住后手 —— 之前"看起来没有限制"就是这个原因。
 */
export const MAX_WINDOW_SIZE = 800;
/** 边缘命中带宽度 */
export const RESIZE_EDGE = 10;
/** 角落命中带宽度：角比边更难对准，所以给更宽的范围 */
export const RESIZE_CORNER = 22;
/** 缩放提示（窗口边界框 + 边长读数）的淡入淡出速度，单位 1/秒 */
export const HINT_FADE_SPEED = 14;

export type ResizeDirection =
  | "North"
  | "South"
  | "East"
  | "West"
  | "NorthEast"
  | "NorthWest"
  | "SouthEast"
  | "SouthWest";

/** h > 0 表示"东边跟着指针横向位移走"，v > 0 表示"南边跟着纵向位移走" */
const AXIS: Record<ResizeDirection, { h: number; v: number }> = {
  East: { h: 1, v: 0 },
  West: { h: -1, v: 0 },
  South: { h: 0, v: 1 },
  North: { h: 0, v: -1 },
  NorthEast: { h: 1, v: -1 },
  NorthWest: { h: -1, v: -1 },
  SouthEast: { h: 1, v: 1 },
  SouthWest: { h: -1, v: 1 },
};

export const RESIZE_CURSORS: Record<ResizeDirection, string> = {
  North: "ns-resize",
  South: "ns-resize",
  East: "ew-resize",
  West: "ew-resize",
  NorthEast: "nesw-resize",
  SouthWest: "nesw-resize",
  NorthWest: "nwse-resize",
  SouthEast: "nwse-resize",
};

export interface ResizeSides {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
}

/** 该方向牵动了哪几条边，用于在悬停/拖拽时高亮它们 */
export function resizeSides(direction: ResizeDirection): ResizeSides {
  const axis = AXIS[direction];
  return {
    north: axis.v < 0,
    east: axis.h > 0,
    south: axis.v > 0,
    west: axis.h < 0,
  };
}

/**
 * 命中哪条边/哪个角。坐标是相对窗口左上角的 CSS 像素。
 * 命中带会随窗口自适应收窄，避免小窗口整块都变成缩放区。
 */
export function resizeDirectionAt(
  width: number,
  height: number,
  x: number,
  y: number,
): ResizeDirection | null {
  if (width <= 0 || height <= 0) return null;
  const edge = Math.min(RESIZE_EDGE, width / 4, height / 4);
  const corner = Math.min(RESIZE_CORNER, width / 3, height / 3);

  const westCorner = x <= corner;
  const eastCorner = x >= width - corner;
  const northCorner = y <= corner;
  const southCorner = y >= height - corner;

  if (northCorner) {
    if (westCorner) return "NorthWest";
    if (eastCorner) return "NorthEast";
  }
  if (southCorner) {
    if (westCorner) return "SouthWest";
    if (eastCorner) return "SouthEast";
  }

  if (x <= edge) return "West";
  if (x >= width - edge) return "East";
  if (y <= edge) return "North";
  if (y >= height - edge) return "South";
  return null;
}

export function clampWindowSize(value: number, maxSize: number): number {
  const max = Math.max(maxSize, MIN_WINDOW_SIZE);
  return Math.min(Math.max(Math.round(value), MIN_WINDOW_SIZE), max);
}

/**
 * 当前允许的最大边长。两道限制取小值：
 * 1. 硬上限 MAX_WINDOW_SIZE；
 * 2. 显示器可用区域，桌宠不该能被拉到超出屏幕。
 *
 * 屏幕尺寸读不到时（例如单测环境）只留硬上限。
 */
export function maxWindowSize(): number {
  const available =
    typeof screen === "undefined"
      ? 0
      : Math.min(screen.availWidth || 0, screen.availHeight || 0);
  const monitorLimit =
    Number.isFinite(available) && available >= MIN_WINDOW_SIZE
      ? Math.floor(available)
      : MAX_WINDOW_SIZE;
  return Math.max(Math.min(MAX_WINDOW_SIZE, monitorLimit), MIN_WINDOW_SIZE);
}

export interface ResizeGeometry {
  direction: ResizeDirection;
  /** 按下时窗口的边长（恒为正方形） */
  startSize: number;
  /** 按下时窗口左上角在屏幕上的逻辑坐标 */
  startX: number;
  startY: number;
  /** 按下时指针在屏幕上的逻辑坐标 */
  startPointerX: number;
  startPointerY: number;
  /** 允许的最大边长 */
  maxSize: number;
}

export interface ResizeTarget {
  size: number;
  x: number;
  y: number;
}

/**
 * 根据指针位移算目标尺寸与目标位置。
 *
 * 指针坐标必须是**屏幕坐标**（`screenX` / `screenY`）。用相对窗口的 clientX
 * 会自激：拖西边时我们同时把窗口往左推，指针相对窗口的坐标就被我们自己的位移
 * 抵消掉了，结果拖一下就卡住不再变大。
 */
export function resizeTarget(
  geometry: ResizeGeometry,
  pointerX: number,
  pointerY: number,
): ResizeTarget {
  const axis = AXIS[geometry.direction];
  const horizontal = (pointerX - geometry.startPointerX) * axis.h;
  const vertical = (pointerY - geometry.startPointerY) * axis.v;

  let delta: number;
  if (axis.h === 0) {
    delta = vertical;
  } else if (axis.v === 0) {
    delta = horizontal;
  } else {
    // 角落：正方形窗口只有一个自由度，取用户推得更用力的那个轴
    delta = Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical;
  }

  const size = clampWindowSize(geometry.startSize + delta, geometry.maxSize);
  return {
    size,
    // 锚定对侧边：拖西/北边时，窗口左上角要反向补偿，让对侧边保持不动
    x: axis.h < 0 ? Math.round(geometry.startX + geometry.startSize - size) : Math.round(geometry.startX),
    y: axis.v < 0 ? Math.round(geometry.startY + geometry.startSize - size) : Math.round(geometry.startY),
  };
}

export function isSameResizeTarget(a: ResizeTarget | null, b: ResizeTarget): boolean {
  return a !== null && a.size === b.size && a.x === b.x && a.y === b.y;
}

/** 提示透明度的缓动；当前值由调用方持有 */
export function fadeHintAlpha(current: number, target: number, deltaSeconds: number): number {
  const step = Math.min(Math.max(deltaSeconds, 0) * HINT_FADE_SPEED, 1);
  const next = current + (target - current) * step;
  return next < 0.01 ? 0 : next;
}

function roundRectPath(
  target: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(Math.min(radius, width / 2, height / 2), 0);
  target.beginPath();
  target.moveTo(x + r, y);
  target.lineTo(x + width - r, y);
  target.arcTo(x + width, y, x + width, y + r, r);
  target.lineTo(x + width, y + height - r);
  target.arcTo(x + width, y + height, x + width - r, y + height, r);
  target.lineTo(x + r, y + height);
  target.arcTo(x, y + height, x, y + height - r, r);
  target.lineTo(x, y + r);
  target.arcTo(x, y, x + r, y, r);
  target.closePath();
}

export interface ResizeHintOptions {
  /** 窗口尺寸（CSS 像素） */
  width: number;
  height: number;
  /** 整体透明度 0~1 */
  alpha: number;
  /** 高亮哪条边/角；null 表示只画边框 */
  direction: ResizeDirection | null;
  /** 拖拽中显示的边长读数；null 表示不显示 */
  sizeLabel: number | null;
  /** 是否已经顶到最大边长，用于把读数标成"已达上限" */
  atMax?: boolean;
  /** 边框相对窗口边缘的内缩距离 */
  inset?: number;
}

/**
 * 悬停/拖拽时的缩放提示。
 *
 * 这是个透明无边框窗口，桌面上看不出边界在哪，用户根本无处下拖。所以把窗口边界
 * 画出来、把该条边高亮，拖拽中再报一个边长读数 —— 让"隐形的窗口"变成看得见、
 * 摸得着的边框。
 *
 * 调用方需先把变换设成"1 单位 = 1 CSS 像素"，函数内部只按 CSS 像素绘制。
 */
export function drawResizeHint(
  target: CanvasRenderingContext2D,
  options: ResizeHintOptions,
): void {
  const { width, height, alpha, direction, sizeLabel } = options;
  const inset = options.inset ?? 4;
  const radius = Math.max(14, Math.min(30, Math.min(width, height) * 0.08));

  target.save();
  target.globalAlpha = alpha;
  target.strokeStyle = "rgba(232, 201, 122, 0.5)";
  target.lineWidth = 1.5;
  target.shadowColor = "rgba(212, 160, 23, 0.45)";
  target.shadowBlur = 10;
  roundRectPath(target, inset, inset, width - inset * 2, height - inset * 2, radius);
  target.stroke();

  if (direction) {
    const sides = resizeSides(direction);
    const pad = radius + inset;
    target.shadowBlur = 0;
    target.strokeStyle = "rgba(255, 226, 150, 0.95)";
    target.lineWidth = 3;
    target.lineCap = "round";
    target.beginPath();
    if (sides.east) {
      target.moveTo(width - inset, pad);
      target.lineTo(width - inset, height - pad);
    }
    if (sides.west) {
      target.moveTo(inset, pad);
      target.lineTo(inset, height - pad);
    }
    if (sides.south) {
      target.moveTo(pad, height - inset);
      target.lineTo(width - pad, height - inset);
    }
    if (sides.north) {
      target.moveTo(pad, inset);
      target.lineTo(width - pad, inset);
    }
    target.stroke();
  }

  if (sizeLabel !== null) {
    const atMax = options.atMax === true;
    // 顶到上限时给出明确反馈：指针还在动但窗口不再变化，不说明白会被当成卡住
    const label = atMax ? `${sizeLabel} × ${sizeLabel} · 上限` : `${sizeLabel} × ${sizeLabel}`;
    target.shadowBlur = 0;
    target.font = "600 11px ui-monospace, 'SF Mono', Menlo, monospace";
    target.textAlign = "center";
    target.textBaseline = "middle";
    const badgeWidth = target.measureText(label).width + 18;
    const badgeHeight = 20;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = inset + 6;
    target.fillStyle = atMax ? "rgba(72, 46, 8, 0.92)" : "rgba(30, 22, 10, 0.86)";
    roundRectPath(target, badgeX, badgeY, badgeWidth, badgeHeight, badgeHeight / 2);
    target.fill();
    target.strokeStyle = atMax ? "rgba(255, 198, 96, 0.95)" : "rgba(212, 160, 23, 0.55)";
    target.lineWidth = atMax ? 1.5 : 1;
    target.stroke();
    target.fillStyle = atMax ? "#ffd894" : "#ffe4a3";
    target.fillText(label, width / 2, badgeY + badgeHeight / 2 + 0.5);
  }
  target.restore();
}
