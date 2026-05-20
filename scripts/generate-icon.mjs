// Gera assets/sprites/icon.png a partir da sprite IDLE do Claude Buddy.
//
// Roda com `node scripts/generate-icon.mjs`. Sem dependências externas — usa
// zlib nativo + impl manual de CRC32 pra escrever PNG cru.
//
// Layout do sprite (espelha src/services/crab-renderer.ts no estado idle,
// frame 0 — corpo em altura normal, pernas height=2, olhos abertos, claws
// nas laterais, sem boca/sem Z's).

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '..', 'assets', 'sprites', 'icon.png');

// ── Cores (RGBA) ──────────────────────────────────────────────────────────────
const SHELL = [0xcc, 0x78, 0x5c, 0xff];
const EYE   = [0x1a, 0x18, 0x16, 0xff];
const TRANSPARENT = [0, 0, 0, 0];

// ── Sprite logical grid ──────────────────────────────────────────────────────
// O sprite no app é desenhado num grid 18x10, mas só ocupa cols 2-15 (com
// claws) e rows 1-9. Pro ícone, recoordeno pra um grid 14x9 local (subtraio 2
// de cada col e 1 de cada row) e descarto o whitespace ao redor.
const SPRITE_W = 14;
const SPRITE_H = 9;

const grid = Array.from({ length: SPRITE_H }, () =>
  Array.from({ length: SPRITE_W }, () => null),
);

function rect(x, y, w, h, color) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (x + dx >= 0 && x + dx < SPRITE_W && y + dy >= 0 && y + dy < SPRITE_H) {
        grid[y + dy][x + dx] = color;
      }
    }
  }
}

// Body (orig cols 4-13 rows 1-7 → local cols 2-11 rows 0-6, 10x7)
rect(2, 0, 10, 7, SHELL);
// Claws (orig cols 2-3 + 14-15, rows 4-5 → local cols 0-1 + 12-13, rows 3-4)
rect(0, 3, 2, 2, SHELL);
rect(12, 3, 2, 2, SHELL);
// Eyes (orig col 6 + 11, rows 3-4 → local col 4 + 9, rows 2-3, 1x2 each)
rect(4, 2, 1, 2, EYE);
rect(9, 2, 1, 2, EYE);
// Feet (orig cols 5, 7, 10, 12, rows 8-9 → local cols 3, 5, 8, 10, rows 7-8)
rect(3, 7, 1, 2, SHELL);
rect(5, 7, 1, 2, SHELL);
rect(8, 7, 1, 2, SHELL);
rect(10, 7, 1, 2, SHELL);

// ── Rasterização pro PNG final ────────────────────────────────────────────────
const ICON_SIZE = 256;
// Cada cell do sprite vai virar PIXEL_SCALE x PIXEL_SCALE px no PNG. Calculo
// o maior scale que cabe no canvas mantendo proporção (14:9 não preenche
// inteiro o quadrado — sobra margem simétrica em cima/embaixo).
const PIXEL_SCALE = Math.floor(Math.min(ICON_SIZE / SPRITE_W, ICON_SIZE / SPRITE_H));
const RENDER_W = SPRITE_W * PIXEL_SCALE;
const RENDER_H = SPRITE_H * PIXEL_SCALE;
const OFFSET_X = Math.floor((ICON_SIZE - RENDER_W) / 2);
const OFFSET_Y = Math.floor((ICON_SIZE - RENDER_H) / 2);

const pixels = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4);
for (let py = 0; py < ICON_SIZE; py++) {
  for (let px = 0; px < ICON_SIZE; px++) {
    const localX = Math.floor((px - OFFSET_X) / PIXEL_SCALE);
    const localY = Math.floor((py - OFFSET_Y) / PIXEL_SCALE);
    let color = TRANSPARENT;
    if (localX >= 0 && localX < SPRITE_W && localY >= 0 && localY < SPRITE_H) {
      const c = grid[localY][localX];
      if (c) color = c;
    }
    const idx = (py * ICON_SIZE + px) * 4;
    pixels[idx]     = color[0];
    pixels[idx + 1] = color[1];
    pixels[idx + 2] = color[2];
    pixels[idx + 3] = color[3];
  }
}

// ── Encoder PNG mínimo ───────────────────────────────────────────────────────
// CRC32 standard (polinômio 0xedb88320, table-based).
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// IHDR: width(4) height(4) bit_depth(1) color_type(1) compression(1) filter(1) interlace(1)
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(ICON_SIZE, 0);
ihdr.writeUInt32BE(ICON_SIZE, 4);
ihdr[8]  = 8; // bit depth per channel
ihdr[9]  = 6; // color type: RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

// IDAT: cada linha tem um filter byte (0 = sem filter) seguido pelos pixels RGBA.
const stride = ICON_SIZE * 4;
const raw = Buffer.alloc(ICON_SIZE * (stride + 1));
for (let y = 0; y < ICON_SIZE; y++) {
  raw[y * (stride + 1)] = 0;
  pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
}
const idatData = deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  PNG_SIGNATURE,
  chunk('IHDR', ihdr),
  chunk('IDAT', idatData),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, png);

console.log(`✓ wrote ${OUT_PATH} (${ICON_SIZE}x${ICON_SIZE}, ${png.length} bytes)`);
