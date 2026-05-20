// Mascote Claude — versão fiel ao oficial: corpo retangular limpo,
// 4 pernas iguais, sem orelhinhas, com bounce ao acordar.

const SHELL = '#cc785c';
const EYE = '#1a1816';

type SpriteState = 'sleeping' | 'waking' | 'idle' | 'thinking' | 'talking';

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  size: { w: number; h: number };
  scale: number;
  state: SpriteState;
  frame: number;
}

function fill(c: RenderContext, x: number, y: number, color: string) {
  if (x < 0 || y < 0 || x >= c.size.w || y >= c.size.h) return;
  c.ctx.fillStyle = color;
  c.ctx.fillRect(x * c.scale, y * c.scale, c.scale, c.scale);
}

function rect(c: RenderContext, x: number, y: number, w: number, h: number, color: string) {
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) fill(c, x + i, y + j, color);
}

// Grid: 18 wide x 10 tall.
// Body: cols 2-15 (14 wide), rows 2-7 (6 tall).
// Claws: cols 0-1 (left) and 16-17 (right), rows 4-5 — 2x2 each.
// Eyes: cols 5-6 (left) and 11-12 (right), rows 4-5 — 2x2 each.
// Feet: cols 2-3, 6-7, 10-11, 14-15 (4 equal feet).

function drawBody(c: RenderContext, bodyOffsetY: number) {
  rect(c, 2, 2 + bodyOffsetY, 14, 6, SHELL);
}

function drawClaws(c: RenderContext, bodyOffsetY: number) {
  rect(c, 0, 4 + bodyOffsetY, 2, 2, SHELL);   // left
  rect(c, 16, 4 + bodyOffsetY, 2, 2, SHELL);  // right
}

function drawFeet(c: RenderContext, height: number, bodyOffsetY: number) {
  if (height <= 0) return;
  const y = 8 + bodyOffsetY;
  rect(c, 2, y, 2, height, SHELL);
  rect(c, 6, y, 2, height, SHELL);
  rect(c, 10, y, 2, height, SHELL);
  rect(c, 14, y, 2, height, SHELL);
}

function drawEyes(c: RenderContext, openness: number, bodyOffsetY: number) {
  // openness: 0 closed (1px line), 1 sleepy/squint, 2 normal (2x2)
  const baseY = 4 + bodyOffsetY;
  if (openness === 0 || openness === 1) {
    rect(c, 5, baseY + 1, 2, 1, EYE);
    rect(c, 11, baseY + 1, 2, 1, EYE);
  } else {
    rect(c, 5, baseY, 2, 2, EYE);
    rect(c, 11, baseY, 2, 2, EYE);
  }
}

function drawMouth(c: RenderContext, open: boolean, bodyOffsetY: number) {
  const y = 6 + bodyOffsetY;
  if (open) rect(c, 8, y, 2, 1, EYE);
  else fill(c, 8, y, EYE);
}

function drawZzz(c: RenderContext, frame: number) {
  const phase = frame % 3;
  const baseY = 1 - phase * 0.5;
  c.ctx.font = `bold ${Math.floor(3 * c.scale)}px Georgia, serif`;
  c.ctx.textBaseline = 'top';
  c.ctx.fillStyle = 'rgba(26,24,22,0.5)';
  c.ctx.fillText(['z', 'zZ', 'zZz'][phase], 18 * c.scale + 4, baseY * c.scale);
}

export function renderCrab(rc: RenderContext) {
  const { ctx, size, scale } = rc;
  ctx.clearRect(0, 0, (size.w + 12) * scale, size.h * scale + 4);

  if (rc.state === 'sleeping') {
    drawBody(rc, 0);
    drawClaws(rc, 0);
    drawFeet(rc, 2, 0);
    drawEyes(rc, 0, 0);
    drawZzz(rc, rc.frame);
    return;
  }

  if (rc.state === 'waking') {
    // Bounce animation: crouch -> stand -> crouch -> stand (8 frames)
    // legHeight 0 = full crouch, 2 = stand. bodyOffsetY follows so body sits on feet.
    const legHeights = [0, 0, 1, 2, 1, 2, 2, 2];
    const legHeight = legHeights[rc.frame] ?? 2;
    const bodyOffsetY = 2 - legHeight; // body sinks when crouched
    const openness = rc.frame < 2 ? 0 : rc.frame < 4 ? 1 : 2;
    drawBody(rc, bodyOffsetY);
    drawClaws(rc, bodyOffsetY);
    drawFeet(rc, legHeight, bodyOffsetY);
    drawEyes(rc, openness, bodyOffsetY);
    return;
  }

  if (rc.state === 'idle') {
    // Breathing — exaggerated so it's visible. Frame 0 = standing tall, frame 1 = crouched.
    const bent = rc.frame === 1;
    const legHeight = bent ? 1 : 2;
    const bodyOffsetY = bent ? 2 : 0;
    drawBody(rc, bodyOffsetY);
    drawClaws(rc, bodyOffsetY);
    drawFeet(rc, legHeight, bodyOffsetY);
    drawEyes(rc, 2, bodyOffsetY);
    return;
  }

  if (rc.state === 'thinking') {
    // Claws oscillate up/down alternately. Eyes squinted.
    const phase = rc.frame % 4;
    const leftOff = phase === 0 ? -1 : phase === 2 ? 1 : 0;
    const rightOff = phase === 0 ? 1 : phase === 2 ? -1 : 0;
    drawBody(rc, 0);
    rect(rc, 0, 4 + leftOff, 2, 2, SHELL);
    rect(rc, 16, 4 + rightOff, 2, 2, SHELL);
    drawFeet(rc, 2, 0);
    drawEyes(rc, 1, 0);
    return;
  }

  if (rc.state === 'talking') {
    drawBody(rc, 0);
    drawClaws(rc, 0);
    drawFeet(rc, 2, 0);
    drawEyes(rc, 2, 0);
    drawMouth(rc, rc.frame % 2 === 0, 0);
    return;
  }
}
