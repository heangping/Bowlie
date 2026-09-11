import { listen } from "@tauri-apps/api/event";
import type { WaveSpawnPayload } from "../shared/types";

interface Wave {
  x: number;
  y: number;
  speed: number;
  endRadius: number;
  born: number;
  seed: number;
}

const START_R = 20;
/** 基准终点半径：速度以它为 1× 基准，保证既有单测的数值语义不漂移 */
const BASE_END_R = 600;
const V1 = 350;
const V2 = 210;
const BASE_DIST = BASE_END_R - START_R;
const MAX_WAVES = 32;
const MAX_SEGMENTS = 240;
const PARTICLE_COUNT = 18;

export interface WaveGeometry {
  startRadius: number;
  endRadius: number;
  /** 前半程速度（px/s） */
  v1: number;
  /** 后半程速度（px/s） */
  v2: number;
  /** 前半程结束时刻（秒） */
  t1: number;
  totalTime: number;
  fadeStart: number;
}

export interface WaveRing {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  /** 已归一化到自身速度的动画年龄，驱动环上的波动相位 */
  age: number;
  seed: number;
}

/**
 * 速度随终点半径等比放大，使总时长恒定在基准值（≈2.2s）。
 * 这样 4K 屏和 1080p 屏上的视觉节奏一致——波纹铺得更远，但不会慢吞吞。
 * endRadius 取基准值时 scale=1，与历史公式逐位相等。
 */
export function waveGeometry(endRadius = BASE_END_R): WaveGeometry {
  const distance = Math.max(endRadius - START_R, 1);
  const scale = distance / BASE_DIST;
  const v1 = V1 * scale;
  const v2 = V2 * scale;
  const half = distance / 2;
  const t1 = half / v1;
  const totalTime = t1 + half / v2;
  return {
    startRadius: START_R,
    endRadius,
    v1,
    v2,
    t1,
    totalTime,
    fadeStart: totalTime * 0.7,
  };
}

export function waveRadiusAt(
  ageSeconds: number,
  speed = 1,
  endRadius = BASE_END_R,
): number {
  const { v1, v2, t1 } = waveGeometry(endRadius);
  const age = ageSeconds * speed;
  if (age < t1) return START_R + v1 * age;
  return START_R + (endRadius - START_R) / 2 + v2 * (age - t1);
}

export function isWaveExpired(
  ageSeconds: number,
  speed = 1,
  endRadius = BASE_END_R,
): boolean {
  return ageSeconds * speed >= waveGeometry(endRadius).totalTime;
}

function ringPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  amplitude: number,
  t: number,
  seed: number,
): void {
  const segs = Math.min(Math.max(Math.round(r / 6), 64), MAX_SEGMENTS);
  ctx.beginPath();
  for (let i = 0; i <= segs; i += 1) {
    const ang = (i / segs) * 2 * Math.PI;
    const rad = r + amplitude * Math.sin(3 * ang + t * 1.8 + seed);
    const px = cx + rad * Math.cos(ang);
    const py = cy + rad * Math.sin(ang);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** 单圈声纹的完整绘制，供桌面声纹层与视觉预览共用。 */
export function drawWaveRing(ctx: CanvasRenderingContext2D, ring: WaveRing): void {
  const { x, y, radius: r, opacity, age: t, seed } = ring;
  // 半径越大，描边与粒子同步加粗，否则铺到屏幕边缘时细得看不见
  const thickness = 1 + Math.min(r / 420, 2.4);
  const amplitude = 6 + r * 0.014;

  const glowRadius = 46 * thickness;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
  glow.addColorStop(0, `rgba(255, 230, 160, ${0.55 * opacity})`);
  glow.addColorStop(1, "rgba(255, 230, 160, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - glowRadius, y - glowRadius, glowRadius * 2, glowRadius * 2);

  const layers = [
    { r, width: 3 * thickness, color: `rgba(255, 217, 122, ${0.9 * opacity})` },
    {
      r: r - 14 * thickness,
      width: 1.5 * thickness,
      color: `rgba(255, 191, 71, ${0.5 * opacity})`,
    },
    {
      r: r - 30 * thickness,
      width: 1 * thickness,
      color: `rgba(255, 242, 200, ${0.35 * opacity})`,
    },
  ];
  for (const layer of layers) {
    if (layer.r <= 1) continue;
    ringPath(ctx, x, y, layer.r, amplitude, t, seed);
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = layer.width;
    ctx.stroke();
  }

  // 粒子：沿环分布，随声纹同步淡出
  const particleRadius = 3 * thickness;
  ctx.fillStyle = `rgba(255, 217, 122, ${0.75 * opacity})`;
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const ang = (i / PARTICLE_COUNT) * 2 * Math.PI + seed;
    const pr = r * 0.92;
    ctx.beginPath();
    ctx.arc(x + pr * Math.cos(ang), y + pr * Math.sin(ang), particleRadius, 0, 2 * Math.PI);
    ctx.fill();
  }
}

function normalizeEndRadius(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return BASE_END_R;
  return Math.min(Math.max(value, BASE_END_R), 12000);
}

export function startWaveEngine(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const waves: Wave[] = [];
  let timerId = 0;

  const resize = (): void => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  const drawWave = (wave: Wave, now: number): void => {
    const ageSeconds = (now - wave.born) / 1000;
    if (isWaveExpired(ageSeconds, wave.speed, wave.endRadius)) return;

    const geometry = waveGeometry(wave.endRadius);
    const age = ageSeconds * wave.speed;
    const opacity =
      age <= geometry.fadeStart
        ? 1
        : 1 - (age - geometry.fadeStart) / (geometry.totalTime - geometry.fadeStart);

    drawWaveRing(ctx, {
      x: wave.x,
      y: wave.y,
      radius: waveRadiusAt(ageSeconds, wave.speed, wave.endRadius),
      opacity,
      age,
      seed: wave.seed,
    });
  };

  const frame = (): void => {
    const now = performance.now();
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (let i = waves.length - 1; i >= 0; i -= 1) {
      const wave = waves[i];
      if (isWaveExpired((now - wave.born) / 1000, wave.speed, wave.endRadius)) {
        waves.splice(i, 1);
        continue;
      }
      drawWave(wave, now);
    }
    if (waves.length > 0) {
      timerId = window.setTimeout(frame, 16);
    } else {
      timerId = 0;
    }
  };

  const kick = (): void => {
    if (timerId === 0) timerId = window.setTimeout(frame, 16);
  };

  void listen<WaveSpawnPayload>("wave:spawn", (event) => {
    waves.push({
      x: event.payload.x,
      y: event.payload.y,
      speed: event.payload.speed,
      endRadius: normalizeEndRadius(event.payload.endRadius),
      born: performance.now(),
      seed: Math.random() * Math.PI * 2,
    });
    if (waves.length > MAX_WAVES) waves.shift();
    kick();
  }).catch((error) => {
    console.error("wave spawn listener failed:", error);
  });

  void listen("wave:clear", () => {
    waves.length = 0;
    if (timerId !== 0) {
      window.clearTimeout(timerId);
      timerId = 0;
    }
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }).catch((error) => {
    console.error("wave clear listener failed:", error);
  });
}
