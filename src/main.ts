import './ui/style.css';
import { generateCity } from './core/generate';
import { randomSeed } from './core/rng';
import { DEFAULT_PARAMS } from './core/types';
import type { City, CityParams } from './core/types';
import { Camera } from './render/camera';
import { blockColor, buildingColor, PALETTES } from './render/palette';
import type { ThemeName } from './render/palette';
import { CityRenderer, renderToCanvas } from './render/renderer';
import { buildControls } from './ui/controls';

const canvas = must<HTMLCanvasElement>('#map');
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D is not available in this browser.');

const params: CityParams = { ...DEFAULT_PARAMS, seed: randomSeed() };
const camera = new Camera();
const renderer = new CityRenderer();

let theme: ThemeName = localStorage.getItem('pc:theme') === 'dark' ? 'dark' : 'light';
let city: City = generateCity(params);
let view = { w: 0, h: 0, dpr: 1 };
let drawQueued = false;
let regenQueued = false;

const panel = buildControls(must<HTMLElement>('#controls'), params, (patch) => {
  Object.assign(params, patch);
  panel.sync(params);
  queueRegenerate();
});

/** Slider drags fire fast; collapse every pending change into one frame. */
function queueRegenerate(): void {
  if (regenQueued) return;
  regenQueued = true;
  requestAnimationFrame(() => {
    regenQueued = false;
    city = generateCity(params);
    renderStats();
    queueDraw();
  });
}

function queueDraw(): void {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => {
    drawQueued = false;
    renderer.draw(ctx!, city, camera, PALETTES[theme], view.w, view.h, view.dpr);
  });
}

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  const first = view.w === 0;
  view = { w, h, dpr };
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  if (first) camera.fit(city.size, w, h);
  queueDraw();
}

new ResizeObserver(resize).observe(canvas);
resize();

/* ---- stats + legend ------------------------------------------------------ */

const statsEl = must<HTMLElement>('#stats');

function renderStats(): void {
  const s = city.stats;
  const rows: [string, string][] = [
    ['Seed', params.seed || '(blank)'],
    ['Built area', `${s.areaKm2.toFixed(2)} km²`],
    ['Blocks', s.blocks.toLocaleString()],
    ['Buildings', s.buildings.toLocaleString()],
    ['Parks', s.parks.toLocaleString()],
    ['Est. people', s.population.toLocaleString()],
  ];
  statsEl.replaceChildren(
    ...rows.flatMap(([key, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = key;
      const dd = document.createElement('dd');
      dd.textContent = value;
      return [dt, dd];
    }),
  );
}

const legendEl = must<HTMLElement>('#legend');

function renderLegend(): void {
  const palette = PALETTES[theme];
  const entries: [string, string][] = [
    ['Downtown', buildingColor(palette, 'downtown', 0.95)],
    ['Commercial', buildingColor(palette, 'commercial', 0.5)],
    ['Residential', buildingColor(palette, 'residential', 0.25)],
    ['Industrial', buildingColor(palette, 'industrial', 0.3)],
    ['Park', blockColor(palette, 'park')],
    ['Water', palette.water],
    ['Street', palette.street],
  ];
  legendEl.replaceChildren(
    ...entries.map(([label, color]) => {
      const li = document.createElement('li');
      const swatch = document.createElement('i');
      swatch.style.color = color;
      const text = document.createElement('span');
      text.textContent = label;
      li.append(swatch, text);
      return li;
    }),
  );
}

/* ---- camera interaction -------------------------------------------------- */

let dragging: number | null = null;
let last = { x: 0, y: 0 };

canvas.addEventListener('pointerdown', (e) => {
  dragging = e.pointerId;
  last = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});

canvas.addEventListener('pointermove', (e) => {
  if (dragging !== e.pointerId) return;
  camera.panByPixels(e.clientX - last.x, e.clientY - last.y);
  last = { x: e.clientX, y: e.clientY };
  queueDraw();
});

function endDrag(e: PointerEvent): void {
  if (dragging !== e.pointerId) return;
  dragging = null;
  canvas.classList.remove('dragging');
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
    camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor, view.w, view.h);
    queueDraw();
  },
  { passive: false },
);

canvas.addEventListener('dblclick', fitView);

function fitView(): void {
  camera.fit(city.size, view.w, view.h);
  queueDraw();
}

/* ---- buttons + shortcuts ------------------------------------------------- */

function newSeed(): void {
  params.seed = randomSeed();
  panel.sync(params);
  queueRegenerate();
}

function toggleTheme(): void {
  theme = theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('pc:theme', theme);
  renderLegend();
  queueDraw();
}

function exportPng(): void {
  const out = renderToCanvas(city, PALETTES[theme], 2048);
  out.toBlob((blob) => {
    if (blob) download(blob, `city-${slug(params.seed)}-${params.layout}.png`);
  }, 'image/png');
}

function exportJson(): void {
  const blob = new Blob([serialise(city)], { type: 'application/json' });
  download(blob, `city-${slug(params.seed)}-${params.layout}.json`);
}

must<HTMLButtonElement>('#randomize').addEventListener('click', newSeed);
must<HTMLButtonElement>('#fit').addEventListener('click', fitView);
must<HTMLButtonElement>('#theme').addEventListener('click', toggleTheme);
must<HTMLButtonElement>('#png').addEventListener('click', exportPng);
must<HTMLButtonElement>('#json').addEventListener('click', exportJson);

window.addEventListener('keydown', (e) => {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  switch (e.key.toLowerCase()) {
    case 'r':
      newSeed();
      break;
    case 'f':
      fitView();
      break;
    case 't':
      toggleTheme();
      break;
    case 'e':
      exportPng();
      break;
    default:
      break;
  }
});

/* ---- helpers ------------------------------------------------------------- */

function serialise(c: City): string {
  const round = (n: number): number => Math.round(n * 10) / 10;
  return JSON.stringify(
    {
      params: c.params,
      stats: c.stats,
      blocks: c.blocks.map((b) => ({
        zone: b.zone,
        poly: b.poly.map((p) => [round(p.x), round(p.y)]),
        buildings: b.buildings.map((x) => ({
          floors: x.floors,
          poly: x.poly.map((p) => [round(p.x), round(p.y)]),
        })),
      })),
    },
    null,
    1,
  );
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  );
}

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

renderStats();
renderLegend();
queueDraw();
