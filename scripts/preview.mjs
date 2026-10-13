/**
 * Renders the README preview (three street plans, side by side) without a browser.
 *
 *   node scripts/preview.mjs docs/preview.png
 *
 * It bundles the real generator and palette with esbuild, then rasterises the result
 * with a scanline polygon fill and writes a PNG by hand. The draw order mirrors
 * src/render/renderer.ts — if you change the renderer's layering, change it here too.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { build } from 'esbuild';

const PANEL = 520;
const GAP = 10;
const W = PANEL * 3 + GAP * 2;
const H = PANEL;
const BACKDROP = '#f7f6f2';

const out = process.argv[2] ?? 'docs/preview.png';

const work = mkdtempSync(join(tmpdir(), 'city-preview-'));
await build({
  entryPoints: ['src/core/generate.ts', 'src/core/types.ts', 'src/render/palette.ts'],
  outdir: work,
  bundle: true,
  format: 'esm',
  logLevel: 'warning',
});

const { generateCity } = await import(pathToFileURL(join(work, 'core/generate.js')));
const { DEFAULT_PARAMS } = await import(pathToFileURL(join(work, 'core/types.js')));
const { PALETTES, blockColor, buildingColor } = await import(pathToFileURL(join(work, 'render/palette.js')));

const PANELS = [
  { ...DEFAULT_PARAMS, seed: 'ASTORIA', layout: 'grid' },
  { ...DEFAULT_PARAMS, seed: 'HALDEN', layout: 'radial' },
  { ...DEFAULT_PARAMS, seed: 'VERONA', layout: 'organic', irregularity: 0.7 },
];

const palette = PALETTES.light;
const pixels = Buffer.alloc(W * H * 3);
paint(pixels, rgb(BACKDROP));

PANELS.forEach((params, index) => {
  const city = generateCity(params);
  const scale = PANEL / city.size;
  const ox = index * (PANEL + GAP);

  fill(pixels, city.land, rgb(palette.street), scale, ox);
  for (const block of city.blocks) fill(pixels, block.poly, rgb(blockColor(palette, block.zone)), scale, ox);
  for (const block of city.blocks) {
    for (const b of block.buildings) {
      fill(pixels, b.poly, rgb(buildingColor(palette, b.zone, b.shade)), scale, ox);
    }
  }
  if (city.riverPoly) fill(pixels, city.riverPoly, rgb(palette.water), scale, ox);
  for (const deck of city.bridges) fill(pixels, deck, rgb(palette.street), scale, ox);

  console.log(`${params.layout.padEnd(8)} blocks=${city.blocks.length} buildings=${city.stats.buildings}`);
});

writeFileSync(out, encodePng(pixels));
console.log(`wrote ${out} (${W}x${H})`);

/* -------------------------------------------------------------------------- */

function paint(buf, [r, g, b]) {
  for (let i = 0; i < W * H; i++) {
    buf[i * 3] = r;
    buf[i * 3 + 1] = g;
    buf[i * 3 + 2] = b;
  }
}

function rgb(color) {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) throw new Error(`Unsupported colour: ${color}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Even-odd scanline fill, clipped to this panel's column. */
function fill(buf, poly, [r, g, b], scale, ox) {
  if (poly.length < 3) return;
  const pts = poly.map((p) => [p.x * scale + ox, p.y * scale]);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const yStart = Math.max(0, Math.ceil(minY));
  const yEnd = Math.min(H - 1, Math.floor(maxY));

  for (let y = yStart; y <= yEnd; y++) {
    const crossings = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        crossings.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
    }
    crossings.sort((m, n) => m - n);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const xa = Math.max(ox, Math.ceil(crossings[k]));
      const xb = Math.min(ox + PANEL - 1, Math.floor(crossings[k + 1]));
      for (let x = xa; x <= xb; x++) {
        const o = (y * W + x) * 3;
        buf[o] = r;
        buf[o + 1] = g;
        buf[o + 2] = b;
      }
    }
  }
}

function encodePng(buf) {
  const stride = W * 3 + 1;
  const raw = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) {
    raw[y * stride] = 0; // filter: none
    buf.copy(raw, y * stride + 1, y * W * 3, (y + 1) * W * 3);
  }

  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (bytes) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
