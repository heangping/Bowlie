const BOWL_RADIUS = 92;
const BOWL_DEPTH = 116;
const BREATH_PERIOD_MS = 3200;
const HIT_DURATION_MS = 240;
const MALLET_REST_ANGLE = -0.82;
const MALLET_STRIKE_ANGLE = -0.08;

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

export function malletAngleFor(hitAt: number, tMs: number): number {
  if (hitAt <= 0 || tMs <= hitAt) return MALLET_REST_ANGLE;
  const progress = Math.min((tMs - hitAt) / HIT_DURATION_MS, 1);
  if (progress >= 1) return MALLET_REST_ANGLE;
  if (progress < 0.28) {
    const strikeProgress = easeOutCubic(progress / 0.28);
    return MALLET_REST_ANGLE + (MALLET_STRIKE_ANGLE - MALLET_REST_ANGLE) * strikeProgress;
  }
  const reboundProgress = (progress - 0.28) / 0.72;
  const rebound = 1 - (1 - reboundProgress) ** 2;
  return MALLET_STRIKE_ANGLE + (MALLET_REST_ANGLE - MALLET_STRIKE_ANGLE) * rebound;
}

function drawMallet(ctx: CanvasRenderingContext2D, pivotX: number, pivotY: number, angle: number): void {
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(angle);
  ctx.strokeStyle = "#7b4a22";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(0, 96);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(0, 112, 20, 26, 0, 0, Math.PI * 2);
  const head = ctx.createLinearGradient(-20, 86, 20, 138);
  head.addColorStop(0, "#a82624");
  head.addColorStop(0.55, "#6d1614");
  head.addColorStop(1, "#3d0b0a");
  ctx.fillStyle = head;
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 206, 116, 0.75)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-7, 102, 5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 214, 140, 0.55)";
  ctx.fill();
  ctx.restore();
}

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
  const hitScale = hitActive ? 1 - 0.025 * Math.sin(Math.PI * hitProgress) : 1;
  const hitShakeX = hitActive
    ? 1.8 * Math.sin(hitProgress * Math.PI * 7) * (1 - hitProgress)
    : 0;
  const cx = w / 2 + hitShakeX;
  const rimY = h * 0.57;
  const scale = 1 + 0.012 * phase;
  const r = BOWL_RADIUS * scale * hitScale;
  const depth = BOWL_DEPTH * scale * hitScale;
  const glow = ctx.createRadialGradient(cx, rimY + depth * 0.42, r * 0.25, cx, rimY + depth * 0.42, r * 2);
  glow.addColorStop(0, `rgba(255, 215, 120, ${0.24 + 0.16 * phase})`);
  glow.addColorStop(1, "rgba(255, 215, 120, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r * 2, rimY - r * 0.6, r * 4, depth + r);

  ctx.beginPath();
  ctx.moveTo(cx - r, rimY);
  ctx.bezierCurveTo(cx - r * 0.95, rimY + depth * 0.72, cx - r * 0.58, rimY + depth, cx, rimY + depth);
  ctx.bezierCurveTo(cx + r * 0.58, rimY + depth, cx + r * 0.95, rimY + depth * 0.72, cx + r, rimY);
  ctx.closePath();
  const body = ctx.createLinearGradient(cx - r, rimY, cx + r, rimY + depth);
  body.addColorStop(0, "#8a5a18");
  body.addColorStop(0.28, "#e8b45a");
  body.addColorStop(0.62, "#b07f2e");
  body.addColorStop(1, "#66420f");
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = "rgba(73, 45, 10, 0.75)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - r, rimY);
  ctx.bezierCurveTo(cx - r * 0.95, rimY + depth * 0.72, cx - r * 0.58, rimY + depth, cx, rimY + depth);
  ctx.bezierCurveTo(cx + r * 0.58, rimY + depth, cx + r * 0.95, rimY + depth * 0.72, cx + r, rimY);
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = "rgba(128, 43, 32, 0.5)";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.ellipse(cx, rimY + depth * 0.68, r * 0.72, 18, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 226, 145, 0.35)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(cx, rimY + depth * 0.34, r * 0.78, 16, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.ellipse(cx, rimY, r, r * 0.24, 0, 0, Math.PI, true);
  ctx.fillStyle = "#43270a";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, rimY, r, r * 0.24, 0, 0, Math.PI * 2);
  const rim = ctx.createLinearGradient(cx - r, rimY, cx + r, rimY);
  rim.addColorStop(0, "#a97020");
  rim.addColorStop(0.5, "#ffe6a7");
  rim.addColorStop(1, "#a97020");
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 240, 195, ${0.72 + 0.24 * phase})`;
  ctx.lineWidth = 4;
  ctx.stroke();

  drawMallet(ctx, cx + r * 0.66, rimY - 124, malletAngleFor(hitAt, tMs));
}

export function bowlHitTest(x: number, y: number, w: number, h: number): boolean {
  const cx = w / 2;
  const rimY = h * 0.57;
  const dx = x - cx;
  const dy = y - (rimY + BOWL_DEPTH * 0.45);
  const rx = BOWL_RADIUS * 1.08;
  const ry = (BOWL_DEPTH * 0.62) * 1.04;
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
}
