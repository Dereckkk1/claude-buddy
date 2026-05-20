// Sprite do Claude Buddy — bonequinho boxy compacto, fiel à arte de referência:
// corpo retangular coral mais alto que largo, 2 garrinhas saindo das laterais
// (na meia-altura do corpo), olhos verticais bem finos (1px x 2px), boca só
// aparece quando ele tá falando, 4 perninhas pretas agrupadas em pares embaixo.

const SHELL = '#cc785c';   // coral / casca do bicho
const EYE = '#1a1816';     // preto dos olhos / boca aberta

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

// Layout em grid 18 wide x 10 tall.
//
// Body:  cols 4-13 (10 wide), rows 1-7 (7 tall) — mais alto que antes
// Claws: 2x2 nas laterais — cols 2-3 (esq) e cols 14-15 (dir), rows 4-5
//        (na meia-altura do corpo, coladas no flanco — não em cima)
// Eyes:  1 wide x 2 tall — col 6 (esq) e col 11 (dir), rows 3-4
// Mouth: cols 8-9, row 6 — SÓ renderiza no estado talking
// Feet:  cols 5, 7, 10, 12, rows 8-9 (1x2 each, agrupados em pares 5/7 e 10/12)

function drawBody(c: RenderContext, bodyOffsetY: number) {
  rect(c, 4, 1 + bodyOffsetY, 10, 7, SHELL);
}

function drawClaws(c: RenderContext, bodyOffsetY: number) {
  // 2x2 quadradinhos colados nos flancos do corpo, na meia-altura
  rect(c, 2, 4 + bodyOffsetY, 2, 2, SHELL);   // esquerda
  rect(c, 14, 4 + bodyOffsetY, 2, 2, SHELL);  // direita
}

function drawFeet(c: RenderContext, height: number, bodyOffsetY: number) {
  if (height <= 0) return;
  const y = 8 + bodyOffsetY;
  rect(c, 5, y, 1, height, SHELL);
  rect(c, 7, y, 1, height, SHELL);
  rect(c, 10, y, 1, height, SHELL);
  rect(c, 12, y, 1, height, SHELL);
}

function drawEyes(c: RenderContext, openness: number, bodyOffsetY: number) {
  // Olhos finos verticais 1x2. Quando fecha, só 1 pixel embaixo (sleepy line).
  const baseY = 3 + bodyOffsetY;
  if (openness === 0) {
    // dormindo: 1 pixel só
    fill(c, 6, baseY + 1, EYE);
    fill(c, 11, baseY + 1, EYE);
  } else if (openness === 1) {
    // semicerrado: 1 pixel no topo
    fill(c, 6, baseY, EYE);
    fill(c, 11, baseY, EYE);
  } else {
    // normal: vertical 1x2
    rect(c, 6, baseY, 1, 2, EYE);
    rect(c, 11, baseY, 1, 2, EYE);
  }
}

function drawMouthOpen(c: RenderContext, bodyOffsetY: number) {
  // boca aberta no talking: "O" 2x2 preto, na metade-baixo do corpo
  rect(c, 8, 5 + bodyOffsetY, 2, 2, EYE);
}

function drawZzz(c: RenderContext, frame: number) {
  const phase = frame % 3;
  const baseY = 0 - phase * 0.5;
  c.ctx.font = `bold ${Math.floor(3 * c.scale)}px Georgia, serif`;
  c.ctx.textBaseline = 'top';
  // Azul (paleta Anthropic) com leve transparência — luminância média garante
  // que aparece tanto em fundo claro quanto escuro, diferente do tom escuro
  // anterior que sumia em wallpapers pretos.
  c.ctx.fillStyle = 'rgba(106,155,204,0.85)';
  // Z's saem do canto superior-direito do bicho (depois das claws da direita)
  c.ctx.fillText(['z', 'zZ', 'zZz'][phase], 16 * c.scale + 2, baseY * c.scale);
}

export function renderCrab(rc: RenderContext) {
  const { ctx, size, scale } = rc;
  ctx.clearRect(0, 0, (size.w + 12) * scale, size.h * scale + 4);

  if (rc.state === 'sleeping') {
    drawBody(rc, 0);
    drawClaws(rc, 0);
    drawFeet(rc, 1, 0); // pernas curtinhas dormindo
    drawEyes(rc, 0, 0);
    drawZzz(rc, rc.frame);
    return;
  }

  if (rc.state === 'waking') {
    // Bounce: agacha → estica → agacha → fica em pé
    const legHeights = [0, 0, 1, 2, 1, 2, 2, 2];
    const legHeight = legHeights[rc.frame] ?? 2;
    const bodyOffsetY = 2 - legHeight; // corpo desce quando agacha
    const openness = rc.frame < 2 ? 0 : rc.frame < 4 ? 1 : 2;
    drawBody(rc, bodyOffsetY);
    drawClaws(rc, bodyOffsetY);
    drawFeet(rc, legHeight, bodyOffsetY);
    drawEyes(rc, openness, bodyOffsetY);
    return;
  }

  if (rc.state === 'idle') {
    // Respiração: 2 frames alternando entre normal e levemente agachado
    const bent = rc.frame === 1;
    const legHeight = bent ? 1 : 2;
    const bodyOffsetY = bent ? 1 : 0;
    drawBody(rc, bodyOffsetY);
    drawClaws(rc, bodyOffsetY);
    drawFeet(rc, legHeight, bodyOffsetY);
    drawEyes(rc, 2, bodyOffsetY);
    return;
  }

  if (rc.state === 'thinking') {
    // Claws oscilam alternadamente (sobem/descem); olhos semicerrados
    const phase = rc.frame % 4;
    const leftOff = phase === 0 ? -1 : phase === 2 ? 1 : 0;
    const rightOff = phase === 0 ? 1 : phase === 2 ? -1 : 0;
    drawBody(rc, 0);
    rect(rc, 2, 4 + leftOff, 2, 2, SHELL);
    rect(rc, 14, 4 + rightOff, 2, 2, SHELL);
    drawFeet(rc, 2, 0);
    drawEyes(rc, 1, 0);
    return;
  }

  if (rc.state === 'talking') {
    drawBody(rc, 0);
    drawClaws(rc, 0);
    drawFeet(rc, 2, 0);
    drawEyes(rc, 2, 0);
    // Boca alterna entre aberta e fechada-invisível pra dar efeito de fala
    if (rc.frame % 2 === 0) drawMouthOpen(rc, 0);
    return;
  }
}
