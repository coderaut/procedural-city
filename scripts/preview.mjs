/**
 * Renders a map to PNG without a browser, and prints the planner's report.
 *
 *   node scripts/preview.mjs docs/preview.png          # the example map
 *   node scripts/preview.mjs out.png --load map.json   # a saved map
 *
 * It bundles the real world model and the real layer painters with esbuild, so
 * terrain shading, zone tints, growth and the advisor are all exercised — only
 * the canvas compositing in src/render/scene.ts is reimplemented here (as a
 * scanline fill). If the draw order in scene.ts changes, change it here too.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { build } from 'esbuild';

const out = process.argv[2] ?? 'docs/preview.png';
const loadIndex = process.argv.indexOf('--load');
const cropIndex = process.argv.indexOf('--crop');
/** --crop x,y,size (metres) renders just that square, magnified. */
const crop = cropIndex > 0 ? process.argv[cropIndex + 1].split(',').map(Number) : null;
const SCALE = crop ? 8 : 2; // output pixels per cell

const work = mkdtempSync(join(tmpdir(), 'city-preview-'));
await build({
  entryPoints: [
    'src/world/demo.ts',
    'src/world/world.ts',
    'src/world/roads.ts',
    'src/render/layers.ts',
    'src/render/palette.ts',
  ],
  outdir: work,
  bundle: true,
  format: 'esm',
  logLevel: 'warning',
});

const load = (rel) => import(pathToFileURL(join(work, rel)));
const { buildDemoWorld } = await load('world/demo.js');
const { World } = await load('world/world.js');
const { roadOutline } = await load('world/roads.js');

const { paintTerrain, paintZones, DEFAULT_TERRAIN_OPTIONS, DEFAULT_ZONE_OPTIONS } = await load('render/layers.js');
const { PALETTE, buildingCss } = await load('render/palette.js');

const world =
  loadIndex > 0
    ? World.fromJSON(JSON.parse(readFileSync(process.argv[loadIndex + 1], 'utf8')))
    : buildDemoWorld();

const grid = world.grid;
const originX = crop ? crop[0] : 0;
const originY = crop ? crop[1] : 0;
const spanCells = crop ? Math.round(crop[2] / grid.cellSize) : grid.size;
const W = spanCells * SCALE;
const H = W;

/* ---- cell layers --------------------------------------------------------- */

const terrain = new Uint8ClampedArray(grid.cells * 4);
paintTerrain(grid, terrain, DEFAULT_TERRAIN_OPTIONS);

const zones = new Uint8ClampedArray(grid.cells * 4);
paintZones(grid, zones, DEFAULT_ZONE_OPTIONS);

const pixels = Buffer.alloc(W * H * 3);
const cellOffsetX = Math.floor(originX / grid.cellSize);
const cellOffsetY = Math.floor(originY / grid.cellSize);
for (let y = 0; y < H; y++) {
  const cy = Math.min(grid.size - 1, cellOffsetY + Math.floor(y / SCALE));
  for (let x = 0; x < W; x++) {
    const cx = Math.min(grid.size - 1, cellOffsetX + Math.floor(x / SCALE));
    const src = (cy * grid.size + cx) * 4;
    const zoneAlpha = zones[src + 3] / 255;
    const o = (y * W + x) * 3;
    for (let c = 0; c < 3; c++) {
      const base = terrain[src + c];
      pixels[o + c] = zoneAlpha > 0 ? base + (zones[src + c] - base) * zoneAlpha : base;
    }
  }
}

/* ---- vector layers ------------------------------------------------------- */

const mToPx = SCALE / grid.cellSize;

for (const segment of world.roads.segments) {
  fill(polyToPx(roadOutline(segment, 1.5)), [70, 68, 60]);
}
for (const segment of world.roads.segments) {
  fill(polyToPx(roadOutline(segment, 0)), rgb(PALETTE.roadFill[segment.cls]));
}
for (const b of world.buildings) {
  fill(polyToPx(b.poly), rgb(buildingCss(b.shade)));
}

writeFileSync(out, encodePng(pixels));

/* ---- report -------------------------------------------------------------- */

const r = world.report;
console.log(`map        ${world.name}  ${(grid.metres / 1000).toFixed(2)} km square, ${grid.size}x${grid.size} cells`);
console.log(`roads      ${world.roads.segments.length} segments, ${r.roadKm.toFixed(2)} km`);
console.log(`buildings  ${r.buildings}`);
console.log(`population ${r.population.toLocaleString()}   jobs ${r.jobs.toLocaleString()}`);
console.log(`unemployed ${r.unemployed}   unfilled jobs ${r.unfilledJobs}`);
console.log(`stranded   ${r.strandedHa.toFixed(1)} ha   unusable ${r.unusableHa.toFixed(1)} ha   flood risk ${r.floodRisk}`);
console.log(
  `demand     ${Object.entries(r.demand)
    .filter(([, value]) => value > 0)
    .map(([zone, value]) => `${zone}:${value.toFixed(2)}`)
    .join(' ')}`,
);
for (const advisory of r.advisories) {
  console.log(`  [${advisory.level}] ${advisory.title} — ${advisory.detail}`);
}
console.log(`wrote ${out} (${W}x${H})`);

/* -------------------------------------------------------------------------- */

function polyToPx(poly) {
  return poly.map((p) => [(p.x - originX) * mToPx, (p.y - originY) * mToPx]);
}

function rgb(colour) {
  if (Array.isArray(colour)) return colour;
  if (colour.startsWith('#')) {
    const hex = colour.slice(1);
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  }
  const m = colour.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) throw new Error(`Unsupported colour: ${colour}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Even-odd scanline polygon fill into the RGB buffer. */
function fill(pts, [r, g, b]) {
  if (pts.length < 3) return;
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
      const xa = Math.max(0, Math.ceil(crossings[k]));
      const xb = Math.min(W - 1, Math.floor(crossings[k + 1]));
      for (let x = xa; x <= xb; x++) {
        const o = (y * W + x) * 3;
        pixels[o] = r;
        pixels[o + 1] = g;
        pixels[o + 2] = b;
      }
    }
  }
}

function encodePng(buf) {
  const stride = W * 3 + 1;
  const raw = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) {
    raw[y * stride] = 0;
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
  ihdr[8] = 8;
  ihdr[9] = 2;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

