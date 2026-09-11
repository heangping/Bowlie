const HEAD_R = 55;
const PRESSURE_BY_LEVEL = [0, 0.2, 0.4, 0.7, 1] as const;

export function pressureForLevel(level: number): number {
  if (level <= 0) return 0;
  if (level >= 4) return 1;
  const lower = Math.floor(level);
  const upper = Math.ceil(level);
  const ratio = level - lower;
  return PRESSURE_BY_LEVEL[lower] + (PRESSURE_BY_LEVEL[upper] - PRESSURE_BY_LEVEL[lower]) * ratio;
}

/** level 是外部插值后的 0~4 连续值，pressAt 用于点击瞬间的头身弹动。 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tMs: number,
  level: number,
  pressAt = 0,
): void {
  const cx = w / 2;
  const tight = pressureForLevel(level);
  const idleBreathe = level < 0.1 ? Math.sin((2 * Math.PI * tMs) / 2600) * 2 : 0;
  const pressProgress = pressAt > 0 ? Math.min(Math.max((tMs - pressAt) / 260, 0), 1) : 1;
  const pressBounce = pressProgress < 1 ? Math.sin(Math.PI * pressProgress) * 10 * (1 - pressProgress) : 0;

  const shakeHz = 2.2 + tight * 9;
  const shakeAmp = tight * 5;
  const shakeX = Math.sin((2 * Math.PI * shakeHz * tMs) / 1000) * shakeAmp;
  const headY = h * 0.25 + idleBreathe - pressBounce;
  const bodyY = h * 0.5 + idleBreathe * 0.4 + pressBounce * 0.45;
  const squashX = 1 + 0.05 * tight;
  const squashY = 1 - 0.14 * tight;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 金色尾巴
  ctx.strokeStyle = "#c98727";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(cx + 55, bodyY + 45);
  ctx.quadraticCurveTo(cx + 118, bodyY + 12, cx + 88, bodyY - 50 + Math.sin(tMs / 450) * 8);
  ctx.stroke();

  // 腿与云鞋
  ctx.strokeStyle = "#7c4a15";
  ctx.lineWidth = 15;
  const legLift = tight * 7;
  ctx.beginPath();
  ctx.moveTo(cx - 26, bodyY + 62);
  ctx.lineTo(cx - 43, h * 0.83 - legLift);
  ctx.moveTo(cx + 26, bodyY + 62);
  ctx.lineTo(cx + 43, h * 0.83);
  ctx.stroke();
  ctx.fillStyle = "#d4462f";
  for (const shoeX of [cx - 48, cx + 38]) {
    ctx.beginPath();
    ctx.ellipse(shoeX, h * 0.86, 25, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 卡通身体：小金甲 + 虎皮裙
  const torsoRy = 48 * squashY;
  ctx.beginPath();
  ctx.ellipse(cx + shakeX * 0.3, bodyY, 48 * squashX, torsoRy, 0, 0, Math.PI * 2);
  const torso = ctx.createLinearGradient(cx - 45, bodyY - 50, cx + 45, bodyY + 55);
  torso.addColorStop(0, "#ffd76a");
  torso.addColorStop(0.52, "#e09a25");
  torso.addColorStop(1, "#97580f");
  ctx.fillStyle = torso;
  ctx.fill();
  ctx.strokeStyle = "#6d3f0e";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx + shakeX * 0.3, bodyY, 48 * squashX, torsoRy, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#f4dfae";
  ctx.fillRect(cx - 55, bodyY + 20, 110, 35);
  ctx.fillStyle = "#8b5a24";
  for (const patch of [
    { x: cx - 29, y: bodyY + 32, rx: 11, ry: 8 },
    { x: cx - 2, y: bodyY + 43, rx: 13, ry: 8 },
    { x: cx + 26, y: bodyY + 31, rx: 10, ry: 7 },
  ]) {
    ctx.beginPath();
    ctx.ellipse(patch.x, patch.y, patch.rx, patch.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 手臂：压力越高越抱头
  const armLift = tight;
  const handY = bodyY - 15 - armLift * 38;
  const handDx = 44 + armLift * 12;
  ctx.strokeStyle = "#c98727";
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(cx - 40, bodyY - 12);
  ctx.quadraticCurveTo(cx - 72, bodyY + 18 - armLift * 25, cx - handDx + 8, handY);
  ctx.moveTo(cx + 40, bodyY - 12);
  ctx.quadraticCurveTo(cx + 72, bodyY + 18 - armLift * 25, cx + handDx - 8, handY);
  ctx.stroke();
  ctx.fillStyle = "#f0c177";
  for (const handX of [cx - handDx, cx + handDx]) {
    ctx.beginPath();
    ctx.arc(handX, handY, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // 猴脸轮廓、耳朵和脸颊毛发
  const faceX = cx + shakeX;
  const faceRx = HEAD_R * squashX;
  const faceRy = HEAD_R * squashY;
  ctx.fillStyle = "#7c4a15";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(faceX + side * (faceRx + 8), headY + 7, 15, 21, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(faceX, headY, faceRx, faceRy, 0, 0, Math.PI * 2);
  const face = ctx.createRadialGradient(faceX - 12, headY - 20, 10, faceX, headY, HEAD_R + 14);
  face.addColorStop(0, "#ffdca1");
  face.addColorStop(0.66, "#efb162");
  face.addColorStop(1, "#c07825");
  ctx.fillStyle = face;
  ctx.fill();
  ctx.strokeStyle = "#6d3f0e";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = "#fff4d8";
  ctx.beginPath();
  ctx.ellipse(faceX, headY + 16, faceRx * 0.66, faceRy * 0.54, 0, 0, Math.PI * 2);
  ctx.fill();

  // 紧箍咒：受压时缩短并切入头部
  const bandY = headY - faceRy * 0.56;
  const bandRx = faceRx * (1.04 - 0.14 * tight);
  const bandRy = 11 * (1 - 0.34 * tight) + 3;
  ctx.beginPath();
  ctx.ellipse(faceX, bandY, bandRx, bandRy, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "#f2c231";
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.strokeStyle = "#8a5b0b";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(faceX, bandY, bandRx, bandRy, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 火眼金睛与表情
  const eyeDx = 20 * squashX;
  const eyeY = headY + 2;
  ctx.fillStyle = "#31220e";
  for (const eyeX of [faceX - eyeDx, faceX + eyeDx]) {
    ctx.beginPath();
    if (level >= 3.5) {
      ctx.ellipse(eyeX, eyeY, 8, 5, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(eyeX, eyeY, 7, level >= 1 ? 6 : 8, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    if (level < 3.5) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(eyeX + 2, eyeY - 2, 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#31220e";
    }
  }

  ctx.strokeStyle = "#31220e";
  ctx.lineWidth = 4;
  ctx.beginPath();
  if (level >= 2) {
    ctx.moveTo(faceX - 15, headY + 34);
    ctx.quadraticCurveTo(faceX, headY + 22, faceX + 15, headY + 34);
  } else {
    ctx.moveTo(faceX - 14, headY + 32);
    ctx.quadraticCurveTo(faceX, headY + 43, faceX + 14, headY + 32);
  }
  ctx.stroke();

  if (level >= 3) {
    ctx.strokeStyle = "rgba(226, 74, 57, 0.75)";
    ctx.lineWidth = 3;
    for (const veinX of [faceX - 32, faceX + 32]) {
      ctx.beginPath();
      ctx.moveTo(veinX, bandY + 12);
      ctx.quadraticCurveTo(veinX + Math.sign(veinX - faceX) * 12, bandY + 24, veinX + Math.sign(veinX - faceX) * 4, bandY + 36);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function characterHitTest(x: number, y: number, w: number, h: number): boolean {
  const cx = w / 2;
  return x > cx - 70 && x < cx + 70 && y > h * 0.1 && y < h * 0.9;
}
