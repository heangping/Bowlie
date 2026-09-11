import { listen } from "@tauri-apps/api/event";
import type { WaveSpawnPayload } from "../shared/types";

interface Wave {
  x: number;
  y: number;
  speed: number;
  born: number;
  seed: number;
}

const START_R = 20;
const END_R = 600;
const V1 = 350;
const V2 = 210;
const DIST = END_R - START_R;
const HALF = DIST / 2;
const T1 = HALF / V1;
const TOTAL_T = T1 + HALF / V2;
const FADE_START = TOTAL_T * 0.7;
const MAX_WAVES = 32;

export function waveRadiusAt(ageSeconds: number, speed = 1): number {
  const age = ageSeconds * speed;
  if (age < T1) return START_R + V1 * age;
  return START_R + HALF + V2 * (age - T1);
}

export function isWaveExpired(ageSeconds: number, speed = 1): boolean {
  return ageSeconds * speed >= TOTAL_T;
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

  const ringPath = (cx: number, cy: number, r: number, t: number, seed: number): void => {
    const segs = 64;
    ctx.beginPath();
    for (let i = 0; i <= segs; i += 1) {
      const ang = (i / segs) * 2 * Math.PI;
      const rad = r + 8 * Math.sin(3 * ang + t * 1.8 + seed);
      const px = cx + rad * Math.cos(ang);
      const py = cy + rad * Math.sin(ang);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };

  const drawWave = (wave: Wave, now: number): void => {
    const ageSeconds = (now - wave.born) / 1000;
    if (isWaveExpired(ageSeconds, wave.speed)) return;
    const age = ageSeconds * wave.speed;
    const r = waveRadiusAt(ageSeconds, wave.speed);
    const opacity = age <= FADE_START ? 1 : 1 - (age - FADE_START) / (TOTAL_T - FADE_START);

    const { x, y, seed } = wave;
    const t = age;

    const glow = ctx.createRadialGradient(x, y, 0, x, y, 46);
    glow.addColorStop(0, `rgba(255, 230, 160, ${0.6 * opacity})`);
    glow.addColorStop(1, "rgba(255, 230, 160, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 46, y - 46, 92, 92);

    const layers = [
      { r: r, width: 3, color: `rgba(255, 217, 122, ${0.9 * opacity})` },
      { r: r - 12, width: 1.5, color: `rgba(255, 191, 71, ${0.5 * opacity})` },
      { r: r - 24, width: 1, color: `rgba(255, 242, 200, ${0.35 * opacity})` },
    ];
    for (const layer of layers) {
      if (layer.r <= 0) continue;
      ringPath(x, y, layer.r, t, seed);
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = layer.width;
      ctx.stroke();
    }

    // 粒子：沿环分布，随声纹淡出
    for (let i = 0; i < 12; i += 1) {
      const ang = (i / 12) * 2 * Math.PI + seed;
      const particleLife = Math.min(1, age / 1.2);
      const pr = r * 0.92;
      ctx.fillStyle = `rgba(255, 217, 122, ${0.7 * opacity * (1 - particleLife)})`;
      ctx.beginPath();
      ctx.arc(x + pr * Math.cos(ang), y + pr * Math.sin(ang), 3, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  const frame = (): void => {
    const now = performance.now();
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (let i = waves.length - 1; i >= 0; i -= 1) {
      const wave = waves[i];
      if (isWaveExpired((now - wave.born) / 1000, wave.speed)) {
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
