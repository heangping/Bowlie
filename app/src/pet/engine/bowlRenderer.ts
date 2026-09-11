const BOWL_RADIUS = 92;
const BOWL_DEPTH = 116;
const BREATH_PERIOD_MS = 3200;
const HIT_DURATION_MS = 240;
const MALLET_REST_ANGLE = -0.82;
const MALLET_STRIKE_ANGLE = -0.08;

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

/** 确定性伪随机：同一序号每帧返回同一值，避免金属纹理逐帧闪烁。 */
function hashNoise(index: number): number {
  const value = Math.sin(index * 12.9898 + 4.1414) * 43758.5453;
  return value - Math.floor(value);
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

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawMallet(
  ctx: CanvasRenderingContext2D,
  pivotX: number,
  pivotY: number,
  angle: number,
): void {
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(angle);

  // 木柄：横向渐变制造圆柱受光面
  const shaft = ctx.createLinearGradient(-6, 0, 6, 0);
  shaft.addColorStop(0, "#4a2a10");
  shaft.addColorStop(0.32, "#a9711f");
  shaft.addColorStop(0.5, "#e6b45e");
  shaft.addColorStop(0.72, "#8d5715");
  shaft.addColorStop(1, "#3d2007");
  ctx.strokeStyle = shaft;
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -36);
  ctx.lineTo(0, 88);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 238, 192, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-2.6, -32);
  ctx.lineTo(-2.6, 84);
  ctx.stroke();

  // 槌头：木质圆柱，中间缠线
  const headX = -19;
  const headY = 82;
  const headW = 38;
  const headH = 58;

  roundedRectPath(ctx, headX, headY, headW, headH, 16);
  const head = ctx.createLinearGradient(headX, 0, headX + headW, 0);
  head.addColorStop(0, "#45200a");
  head.addColorStop(0.18, "#8f5a1c");
  head.addColorStop(0.4, "#e0aa56");
  head.addColorStop(0.6, "#a06a24");
  head.addColorStop(0.84, "#6b3d11");
  head.addColorStop(1, "#331806");
  ctx.fillStyle = head;
  ctx.fill();
  ctx.strokeStyle = "rgba(48, 24, 5, 0.7)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // 缠线
  ctx.strokeStyle = "rgba(62, 30, 7, 0.42)";
  ctx.lineWidth = 2.6;
  for (const lineY of [headY + 15, headY + 29, headY + 43]) {
    ctx.beginPath();
    ctx.moveTo(headX + 3, lineY);
    ctx.lineTo(headX + headW - 3, lineY);
    ctx.stroke();
  }

  // 槌头顶部受光
  ctx.strokeStyle = "rgba(255, 236, 186, 0.42)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, headY + 6, 13, 5, 0, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();

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
  const rimRy = r * 0.24;

  const bodyPath = (): void => {
    ctx.beginPath();
    ctx.moveTo(cx - r, rimY);
    ctx.bezierCurveTo(
      cx - r * 0.97,
      rimY + depth * 0.46,
      cx - r * 0.74,
      rimY + depth * 0.84,
      cx - r * 0.4,
      rimY + depth * 0.96,
    );
    ctx.bezierCurveTo(
      cx - r * 0.15,
      rimY + depth * 1.02,
      cx + r * 0.15,
      rimY + depth * 1.02,
      cx + r * 0.4,
      rimY + depth * 0.96,
    );
    ctx.bezierCurveTo(
      cx + r * 0.74,
      rimY + depth * 0.84,
      cx + r * 0.97,
      rimY + depth * 0.46,
      cx + r,
      rimY,
    );
    ctx.closePath();
  };

  // 呼吸光晕。
  //
  // 形状必须和渐变的外沿重合：径向渐变在半径之外会直接取最后一个 stop，所以只要
  // 形状边界落在"还没衰减到 0"的位置，就会被硬切出一条直边。旧版用 fillRect
  // 填充，矩形的上/下边（以及画布下边缘）都在 alpha≈0.1 处切断了渐变，于是整个
  // 光晕看上去是个方块 —— 也就是"钵体旁边的正方形阴影"。
  // 这里改成外沿正好落在边界上的椭圆：纵向按画布余量压扁，保证边界处 alpha 恰好
  // 为 0，任何方向上都不会出现直边。
  const glowY = rimY + depth * 0.4;
  const glowR = Math.min(r * 2.1, cx, w - cx);
  const fitVertical = Math.min(glowY, h - glowY) / glowR;
  const glowSquash = Math.min(1, Math.max(fitVertical, 0.3));
  ctx.save();
  ctx.translate(cx, glowY);
  ctx.scale(1, glowSquash);
  const glow = ctx.createRadialGradient(0, 0, r * 0.16, 0, 0, glowR);
  glow.addColorStop(0, `rgba(255, 203, 104, ${0.2 + 0.15 * phase})`);
  glow.addColorStop(0.55, `rgba(255, 203, 104, ${0.07 + 0.05 * phase})`);
  glow.addColorStop(1, "rgba(255, 203, 104, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, glowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 接触落影
  ctx.beginPath();
  ctx.ellipse(cx, rimY + depth * 1.005, r * 0.96, 13, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(50, 28, 6, 0.2)";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, rimY + depth * 1.005, r * 0.6, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(38, 20, 4, 0.22)";
  ctx.fill();

  // 钵身：黄铜横向反射条带
  const body = ctx.createLinearGradient(cx - r * 0.95, rimY, cx + r * 0.95, rimY + depth);
  body.addColorStop(0, "#6d4114");
  body.addColorStop(0.13, "#a8701f");
  body.addColorStop(0.29, "#e2ad57");
  body.addColorStop(0.45, "#8f5c18");
  body.addColorStop(0.63, "#c99433");
  body.addColorStop(0.82, "#7a4712");
  body.addColorStop(1, "#3a2007");
  bodyPath();
  ctx.fillStyle = body;
  ctx.fill();

  // 钵身表面细节
  ctx.save();
  bodyPath();
  ctx.clip();

  // 竖向拉丝反光
  const strandCount = 22;
  ctx.lineWidth = 1.6;
  for (let i = 0; i <= strandCount; i += 1) {
    const t = i / strandCount;
    const topX = cx - r + t * 2 * r;
    const bottomX = cx + (topX - cx) * 0.42;
    ctx.beginPath();
    ctx.moveTo(topX, rimY - 4);
    ctx.quadraticCurveTo(
      topX,
      rimY + depth * 0.55,
      bottomX,
      rimY + depth * 0.98,
    );
    ctx.strokeStyle = `rgba(255, 234, 186, ${0.035 + 0.075 * hashNoise(i * 3.7)})`;
    ctx.stroke();
  }

  // 手工锤纹：三圈锤点，每个锤点用暗弧 + 亮弧表现凹陷
  const hammerRings = [
    { y: rimY + depth * 0.26, rx: r * 0.88, ry: 13, count: 19, size: 8 },
    { y: rimY + depth * 0.54, rx: r * 0.7, ry: 11, count: 15, size: 7.5 },
    { y: rimY + depth * 0.79, rx: r * 0.44, ry: 9, count: 10, size: 7 },
  ];
  ctx.beginPath();
  for (const ring of hammerRings) {
    for (let i = 0; i < ring.count; i += 1) {
      const ang = (i / ring.count) * Math.PI * 2;
      const px = cx + ring.rx * Math.cos(ang);
      const py = ring.y + ring.ry * Math.sin(ang);
      const start = Math.PI * 0.12;
      ctx.moveTo(px + ring.size * Math.cos(start), py + ring.size * Math.sin(start));
      ctx.arc(px, py, ring.size, start, Math.PI * 0.88);
    }
  }
  ctx.strokeStyle = "rgba(54, 29, 6, 0.3)";
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.beginPath();
  for (const ring of hammerRings) {
    for (let i = 0; i < ring.count; i += 1) {
      const ang = (i / ring.count) * Math.PI * 2;
      const px = cx + ring.rx * Math.cos(ang);
      const py = ring.y + ring.ry * Math.sin(ang);
      const start = Math.PI * 1.14;
      ctx.moveTo(px + ring.size * Math.cos(start), py + ring.size * Math.sin(start));
      ctx.arc(px, py, ring.size, start, Math.PI * 1.86);
    }
  }
  ctx.strokeStyle = "rgba(255, 232, 180, 0.2)";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // 底部内收处的暖色反光。
  // 同样要"外沿=边界"：这里的填充被 clip 到钵身轮廓，矩形边落在渐变中间就会在
  // 钵身上横切出一条直边，所以用正好外接渐变圆的正方形。
  const underY = rimY + depth * 0.72;
  const underR = r * 0.9;
  const underGlow = ctx.createRadialGradient(cx, underY, 0, cx, underY, underR);
  underGlow.addColorStop(0, "rgba(255, 196, 96, 0.2)");
  underGlow.addColorStop(1, "rgba(255, 196, 96, 0)");
  ctx.fillStyle = underGlow;
  ctx.fillRect(cx - underR, underY - underR, underR * 2, underR * 2);

  // 口沿在钵身上投下的阴影带
  const rimShadow = ctx.createLinearGradient(0, rimY, 0, rimY + depth * 0.17);
  rimShadow.addColorStop(0, "rgba(46, 23, 4, 0.55)");
  rimShadow.addColorStop(1, "rgba(46, 23, 4, 0)");
  ctx.fillStyle = rimShadow;
  ctx.fillRect(cx - r, rimY, r * 2, depth * 0.17);

  ctx.restore();

  // 钵身轮廓
  bodyPath();
  ctx.strokeStyle = "rgba(58, 33, 8, 0.7)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // 口沿：外圈金属环
  ctx.beginPath();
  ctx.ellipse(cx, rimY, r, rimRy, 0, 0, Math.PI * 2);
  const rim = ctx.createLinearGradient(cx - r, rimY, cx + r, rimY);
  rim.addColorStop(0, "#8c5817");
  rim.addColorStop(0.16, "#d5a04a");
  rim.addColorStop(0.38, "#f8e0a4");
  rim.addColorStop(0.56, "#c08f34");
  rim.addColorStop(0.8, "#a8721f");
  rim.addColorStop(1, "#6b3f10");
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.strokeStyle = "rgba(58, 33, 8, 0.75)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // 钵内壁：越往深处越暗
  const innerRx = r * 0.855;
  const innerRy = rimRy * 0.855;
  ctx.beginPath();
  ctx.ellipse(cx, rimY, innerRx, innerRy, 0, 0, Math.PI * 2);
  const inner = ctx.createRadialGradient(
    cx,
    rimY + innerRy * 0.35,
    innerRx * 0.1,
    cx,
    rimY,
    innerRx * 1.05,
  );
  inner.addColorStop(0, "#2b1704");
  inner.addColorStop(0.55, "#412208");
  inner.addColorStop(0.85, "#6d4114");
  inner.addColorStop(1, "#8a5a1c");
  ctx.fillStyle = inner;
  ctx.fill();

  // 钵内底部反光
  ctx.beginPath();
  ctx.ellipse(cx, rimY + innerRy * 0.4, innerRx * 0.46, innerRy * 0.46, 0, 0, Math.PI * 2);
  const innerFloor = ctx.createRadialGradient(
    cx,
    rimY + innerRy * 0.4,
    0,
    cx,
    rimY + innerRy * 0.4,
    innerRx * 0.46,
  );
  innerFloor.addColorStop(0, "rgba(196, 138, 54, 0.5)");
  innerFloor.addColorStop(1, "rgba(120, 74, 20, 0)");
  ctx.fillStyle = innerFloor;
  ctx.fill();

  // 内壁受光的一侧（左上）
  ctx.beginPath();
  ctx.ellipse(cx, rimY, innerRx, innerRy, 0, Math.PI * 1.08, Math.PI * 1.92);
  ctx.strokeStyle = "rgba(214, 160, 74, 0.4)";
  ctx.lineWidth = 6;
  ctx.stroke();

  // 口沿前沿高光 + 后沿轮廓光
  ctx.beginPath();
  ctx.ellipse(cx, rimY, r, rimRy, 0, Math.PI * 0.07, Math.PI * 0.93);
  ctx.strokeStyle = `rgba(255, 246, 220, ${0.6 + 0.28 * phase})`;
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(cx, rimY, r * 0.99, rimRy * 0.99, 0, Math.PI * 1.12, Math.PI * 1.88);
  ctx.strokeStyle = `rgba(255, 236, 184, ${0.3 + 0.18 * phase})`;
  ctx.lineWidth = 3;
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
