const BOWL_RADIUS = 72;
const BREATH_PERIOD_MS = 3200;
const HIT_DURATION_MS = 160;

export function drawBowl(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tMs: number,
  hitAt = 0,
): void {
  const phase = (Math.sin((2 * Math.PI * tMs) / BREATH_PERIOD_MS) + 1) / 2;
  const hitProgress = hitAt > 0 ? Math.min((tMs - hitAt) / HIT_DURATION_MS, 1) : 1;
  const hitActive = hitAt > 0 && hitProgress >= 0 && hitProgress < 1;
  const hitScale = hitActive ? 1 - 0.03 * Math.sin(Math.PI * hitProgress) : 1;
  const hitShakeX = hitActive
    ? 1.5 * Math.sin(hitProgress * Math.PI * 8) * (1 - hitProgress)
    : 0;
  const cx = w / 2 + hitShakeX;
  const cy = h * 0.58;
  const scale = 1 + 0.02 * phase;
  const glowAlpha = 0.25 + 0.2 * phase;
  const r = BOWL_RADIUS * scale * hitScale;

  const glow = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 2.1);
  glow.addColorStop(0, `rgba(255, 215, 120, ${glowAlpha})`);
  glow.addColorStop(1, "rgba(255, 215, 120, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r * 2.1, cy - r * 2.1, r * 4.2, r * 4.2);

  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.62, 0, 0, Math.PI);
  const body = ctx.createLinearGradient(cx, cy - r * 0.2, cx, cy + r * 0.65);
  body.addColorStop(0, "#e8b45a");
  body.addColorStop(0.5, "#b07f2e");
  body.addColorStop(1, "#6e4a14");
  ctx.fillStyle = body;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.2, 0, 0, Math.PI, true);
  ctx.fillStyle = "rgba(60, 38, 8, 0.85)";
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.2, 0, 0, 2 * Math.PI);
  ctx.strokeStyle = `rgba(255, 224, 150, ${0.7 + 0.3 * phase})`;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

export function bowlHitTest(x: number, y: number, w: number, h: number): boolean {
  const cx = w / 2;
  const cy = h * 0.58;
  const dx = x - cx;
  const dy = y - cy;
  const rx = BOWL_RADIUS * 1.1;
  const ry = BOWL_RADIUS * 0.62 * 1.1;
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
}
