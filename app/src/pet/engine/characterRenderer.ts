const HEAD_R = 18;
const PRESSURE_BY_LEVEL = [0, 0.2, 0.4, 0.7, 1] as const;

export function pressureForLevel(level: number): number {
  if (level <= 0) return 0;
  if (level >= 4) return 1;
  const lower = Math.floor(level);
  const upper = Math.ceil(level);
  const ratio = level - lower;
  return PRESSURE_BY_LEVEL[lower] + (PRESSURE_BY_LEVEL[upper] - PRESSURE_BY_LEVEL[lower]) * ratio;
}

/** tightness/level 由外部插值后的 0~4 连续值 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tMs: number,
  level: number,
): void {
  const cx = w / 2;
  const top = h * 0.32;
  const tight = pressureForLevel(level);
  const idleBreathe = level < 0.1 ? Math.sin((2 * Math.PI * tMs) / 3200) * 1.5 : 0;

  const shakeHz = 2 + tight * 8;
  const shakeAmp = tight * 4;
  const sx = Math.sin((2 * Math.PI * shakeHz * tMs) / 1000) * shakeAmp;
  const sy = Math.cos((2 * Math.PI * (shakeHz * 0.8) * tMs) / 1000) * shakeAmp * 0.5;

  const squashX = 1 + 0.06 * tight;
  const squashY = 1 - 0.18 * tight;
  const headX = cx + sx;
  const headY = top + sy + idleBreathe;
  const neckY = headY + HEAD_R;
  const hipY = neckY + (h * 0.3) * squashY;

  ctx.save();
  ctx.strokeStyle = "#3a2c18";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";

  // 身体
  ctx.beginPath();
  ctx.moveTo(headX, neckY);
  ctx.quadraticCurveTo(headX + 6 * tight, (neckY + hipY) / 2, headX, hipY);
  ctx.stroke();

  // 腿
  const legSpread = 16 - 6 * tight;
  ctx.beginPath();
  ctx.moveTo(headX, hipY);
  ctx.lineTo(headX - legSpread + sx * 0.3, hipY + h * 0.16);
  ctx.moveTo(headX, hipY);
  ctx.lineTo(headX + legSpread + sx * 0.3, hipY + h * 0.16);
  ctx.stroke();

  // 手臂：等级越高越抱头
  const armLift = tight;
  const handTargetY = neckY + 24 - armLift * 34;
  const handTargetX = HEAD_R + 4 - armLift * 14;
  ctx.beginPath();
  ctx.moveTo(headX, neckY + 8);
  ctx.lineTo(headX - handTargetX, handTargetY);
  ctx.moveTo(headX, neckY + 8);
  ctx.lineTo(headX + handTargetX, handTargetY);
  ctx.stroke();

  // 头
  ctx.beginPath();
  ctx.ellipse(headX, headY, HEAD_R * squashX, HEAD_R * squashY, 0, 0, 2 * Math.PI);
  ctx.fillStyle = "#f2e3c2";
  ctx.fill();
  ctx.stroke();

  // 紧箍：椭圆环，收紧 = 短轴压缩
  const ringRy = 7 * (1 - 0.35 * tight);
  const ringR = (HEAD_R + 4) * (1 - 0.18 * tight);
  ctx.beginPath();
  ctx.ellipse(headX, headY - HEAD_R * 0.55, ringR * squashX, ringRy, 0, 0, 2 * Math.PI);
  ctx.strokeStyle = "#d4a017";
  ctx.lineWidth = 4;
  ctx.stroke();

  // 表情
  ctx.strokeStyle = "#3a2c18";
  ctx.lineWidth = 2.5;
  const eyeY = headY - 2;
  const eyeDx = 7 * squashX;
  if (level >= 3.5) {
    for (const ex of [headX - eyeDx, headX + eyeDx]) {
      ctx.beginPath();
      ctx.moveTo(ex - 3, eyeY - 3);
      ctx.lineTo(ex + 3, eyeY + 3);
      ctx.moveTo(ex + 3, eyeY - 3);
      ctx.lineTo(ex - 3, eyeY + 3);
      ctx.stroke();
    }
  } else if (level >= 1) {
    for (const ex of [headX - eyeDx, headX + eyeDx]) {
      ctx.beginPath();
      ctx.arc(ex, eyeY + 1, 3, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = "#3a2c18";
    for (const ex of [headX - eyeDx, headX + eyeDx]) {
      ctx.beginPath();
      ctx.arc(ex, eyeY, 2.2, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function characterHitTest(x: number, y: number, w: number, h: number): boolean {
  const cx = w / 2;
  return x > cx - 55 && x < cx + 55 && y > h * 0.2 && y < h * 0.9;
}
