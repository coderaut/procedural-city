import './ui/style.css';
import { Editor } from './input/editor';
import type { CellInfo } from './input/editor';
import { Camera } from './render/camera';
import { defaultView, previewRoad, Scene } from './render/scene';
import { buildPanel } from './ui/panel';
import { buildToolbar } from './ui/toolbar';
import { buildDemoWorld } from './world/demo';
import type { Rect } from './world/grid';
import { World } from './world/world';
import type { WorldFile } from './world/world';

const AUTOSAVE_KEY = 'cityplanner:autosave:v1';

const canvas = must<HTMLCanvasElement>('#map');
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D is not available in this browser.');

let world = restore() ?? new World();
const camera = new Camera();
const view = defaultView();
let scene = new Scene(world);

let viewport = { w: 0, h: 0, dpr: 1 };
let drawQueued = false;
let recomputeQueued = false;
let hover: { x: number; y: number } | null = null;

const statusEl = must<HTMLElement>('#status');
const inspectEl = must<HTMLElement>('#inspect');
const cursorEl = must<HTMLElement>('#cursor-readout');
const zoomEl = must<HTMLElement>('#zoom-readout');
const nameInput = must<HTMLInputElement>('#world-name');

const panel = buildPanel(must<HTMLElement>('#panel'));

const editor = new Editor(world, {
  terrainDirty: (rect) => scene.invalidateTerrain(rect),
  zonesDirty: (rect) => scene.invalidateZones(rect),
  recompute: () => queueRecompute(),
  inspect: (info) => showInspect(info),
  status: (message) => {
    statusEl.textContent = message;
  },
  draw: () => queueDraw(),
});

const toolbar = buildToolbar(must<HTMLElement>('#toolbar'), editor, () => queueDraw());

/* ---- frame loop ---------------------------------------------------------- */

function queueDraw(): void {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => {
    drawQueued = false;
    scene.draw(ctx!, camera, view, viewport.w, viewport.h, viewport.dpr, drawOverlay);
    zoomEl.textContent = `${Math.round(camera.zoom * 100)}%`;
  });
}

/** Growth is rebuilt once per frame at most, after an edit settles. */
function queueRecompute(): void {
  if (recomputeQueued) return;
  recomputeQueued = true;
  requestAnimationFrame(() => {
    recomputeQueued = false;
    const started = performance.now();
    world.recompute();
    panel.update(world.report);
    syncHistoryButtons();
    scheduleAutosave();
    queueDraw();
    const ms = performance.now() - started;
    if (ms > 120) statusEl.textContent = `Recomputed in ${Math.round(ms)} ms`;
  });
}

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  const first = viewport.w === 0;
  viewport = { w, h, dpr };
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  if (first) camera.fit(world.metres, w, h);
  queueDraw();
}

new ResizeObserver(resize).observe(canvas);
resize();

/* ---- overlay ------------------------------------------------------------- */

function drawOverlay(c: CanvasRenderingContext2D): void {
  // Road being drawn.
  if (editor.road.length > 1) {
    previewRoad(c, editor.road, editor.tool.roadClass ?? 1);
  }

  // Open pen polygon.
  if (editor.pen.length > 0) {
    const points = [...editor.pen];
    if (hover) points.push(hover);
    c.save();
    c.fillStyle = 'rgba(127, 176, 138, 0.22)';
    c.strokeStyle = 'rgba(220, 230, 215, 0.9)';
    c.lineWidth = 1.5 / camera.zoom;
    c.beginPath();
    c.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i]!.x, points[i]!.y);
    c.closePath();
    c.fill();
    c.stroke();
    const dot = 3 / camera.zoom;
    c.fillStyle = '#dce6d7';
    for (const p of editor.pen) c.fillRect(p.x - dot, p.y - dot, dot * 2, dot * 2);
    c.restore();
  }

  // Brush footprint.
  if (hover && editor.shapeMode === 'brush' && editor.tool.kind !== 'inspect') {
    const radius = editor.tool.kind === 'road' ? 4 : editor.brush.radius;
    c.save();
    c.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    c.lineWidth = 1 / camera.zoom;
    c.beginPath();
    c.arc(hover.x, hover.y, radius, 0, Math.PI * 2);
    c.stroke();
    if (editor.brush.hardness < 0.9 && editor.tool.kind === 'paint') {
      c.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      c.beginPath();
      c.arc(hover.x, hover.y, radius * Math.max(0.1, 1 - editor.brush.hardness), 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }
}

/* ---- pointer ------------------------------------------------------------- */

let panning: number | null = null;
let panLast = { x: 0, y: 0 };
let spaceHeld = false;

function worldAt(e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top, viewport.w, viewport.h);
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  editor.modifiers.shift = e.shiftKey;
  editor.modifiers.alt = e.altKey;

  if (e.button === 1 || e.button === 2 || spaceHeld) {
    panning = e.pointerId;
    panLast = { x: e.clientX, y: e.clientY };
    canvas.classList.add('panning');
    return;
  }
  if (e.button !== 0) return;
  editor.pointerDown(worldAt(e));
});

canvas.addEventListener('pointermove', (e) => {
  editor.modifiers.shift = e.shiftKey;
  hover = worldAt(e);
  updateCursorReadout();

  if (panning === e.pointerId) {
    camera.panByPixels(e.clientX - panLast.x, e.clientY - panLast.y);
    panLast = { x: e.clientX, y: e.clientY };
    queueDraw();
    return;
  }
  editor.pointerMove(hover);
  queueDraw();
});

function endPointer(e: PointerEvent): void {
  if (panning === e.pointerId) {
    panning = null;
    canvas.classList.remove('panning');
    return;
  }
  editor.pointerUp();
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => {
  hover = null;
  cursorEl.textContent = '';
  queueDraw();
});

canvas.addEventListener('dblclick', (e) => {
  e.preventDefault();
  if (editor.pen.length >= 3) editor.closePen();
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
    camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor, viewport.w, viewport.h);
    queueDraw();
  },
  { passive: false },
);

function updateCursorReadout(): void {
  if (!hover) return;
  const grid = world.grid;
  const cx = Math.floor(hover.x / grid.cellSize);
  const cy = Math.floor(hover.y / grid.cellSize);
  if (!grid.inBounds(cx, cy)) {
    cursorEl.textContent = '';
    return;
  }
  const height = grid.heightAt(cx, cy);
  const slope = grid.slopeAt(cx, cy) * 100;
  cursorEl.textContent = `${Math.round(hover.x)}, ${Math.round(hover.y)} m   ${height.toFixed(1)} m elev   ${slope.toFixed(0)}% slope`;
}

function showInspect(info: CellInfo | null): void {
  if (!info) {
    inspectEl.textContent = '';
    return;
  }
  const parts = [
    `${info.height.toFixed(1)} m`,
    `${info.slopePercent.toFixed(0)}% slope`,
    info.water !== 'Dry' ? info.water : null,
    info.zone !== 'Unzoned' ? info.zone : null,
    info.resource !== 'None' ? info.resource : null,
    info.forest > 5 ? `${info.forest}% trees` : null,
    info.road !== 'None' ? info.road : null,
    info.building ? `${info.building.zone} · ${info.building.floors} fl · ${info.building.capacity}` : null,
  ].filter(Boolean);
  inspectEl.textContent = parts.join('   ');
}

/* ---- keyboard ------------------------------------------------------------ */

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;

  if (e.code === 'Space') {
    spaceHeld = true;
    e.preventDefault();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    applyHistory(e.shiftKey ? 'redo' : 'undo');
    return;
  }

  switch (e.key) {
    case 'Escape':
      editor.cancel();
      statusEl.textContent = editor.tool.hint;
      break;
    case 'Enter':
      editor.closePen();
      break;
    case 'f':
    case 'F':
      fitView();
      break;
    case 'b':
    case 'B':
      editor.shapeMode = 'brush';
      toolbar.sync();
      break;
    case 'p':
    case 'P':
      if (editor.canUsePen) {
        editor.shapeMode = 'pen';
        toolbar.sync();
      }
      break;
    case '[':
      editor.brush.radius = Math.max(8, editor.brush.radius / 1.25);
      toolbar.sync();
      queueDraw();
      break;
    case ']':
      editor.brush.radius = Math.min(600, editor.brush.radius * 1.25);
      toolbar.sync();
      queueDraw();
      break;
    default:
      break;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') spaceHeld = false;
});

/* ---- actions ------------------------------------------------------------- */

function fitView(): void {
  camera.fit(world.metres, viewport.w, viewport.h);
  queueDraw();
}

function applyHistory(direction: 'undo' | 'redo'): void {
  const rect: Rect | null = direction === 'undo' ? world.undo() : world.redo();
  if (!rect) return;
  scene.invalidateTerrain(rect);
  scene.invalidateZones(rect);
  panel.update(world.report);
  syncHistoryButtons();
  scheduleAutosave();
  queueDraw();
}

function syncHistoryButtons(): void {
  must<HTMLButtonElement>('#act-undo').disabled = !world.history.canUndo;
  must<HTMLButtonElement>('#act-redo').disabled = !world.history.canRedo;
}

function swapWorld(next: World, fit: boolean): void {
  world = next;
  editor.setWorld(world);
  scene.setWorld(world);
  nameInput.value = world.name;
  panel.update(world.report);
  syncHistoryButtons();
  if (fit) camera.fit(world.metres, viewport.w, viewport.h);
  scheduleAutosave();
  queueDraw();
}

must<HTMLButtonElement>('#act-new').addEventListener('click', () => {
  if (world.buildings.length > 0 || world.history.canUndo) {
    if (!confirm('Start a new blank map? Unsaved work on this one is lost.')) return;
  }
  swapWorld(new World(), true);
  statusEl.textContent = 'Blank map. Raise ground, paint a zone, then draw a street into it.';
});

must<HTMLButtonElement>('#act-example').addEventListener('click', () => {
  if (world.history.canUndo && !confirm('Replace this map with the example?')) return;
  swapWorld(buildDemoWorld(), true);
  statusEl.textContent = 'Example: Kestrel Bay. Try extending a street into the stranded land.';
});

must<HTMLButtonElement>('#act-fit').addEventListener('click', fitView);
must<HTMLButtonElement>('#act-undo').addEventListener('click', () => applyHistory('undo'));
must<HTMLButtonElement>('#act-redo').addEventListener('click', () => applyHistory('redo'));

nameInput.addEventListener('input', () => {
  world.name = nameInput.value;
  scheduleAutosave();
});

must<HTMLButtonElement>('#act-save').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(world.toJSON())], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug(world.name)}.city.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  statusEl.textContent = `Saved ${a.download}`;
});

const fileInput = must<HTMLInputElement>('#file-input');
must<HTMLButtonElement>('#act-load').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text()) as WorldFile;
    swapWorld(World.fromJSON(data), true);
    statusEl.textContent = `Loaded ${file.name}`;
  } catch (error) {
    statusEl.textContent = `Could not read that file: ${(error as Error).message}`;
  }
  fileInput.value = '';
});

/* ---- layer toggles ------------------------------------------------------- */

bindToggle('#layer-terrain', (on) => {
  view.showTerrain = on;
});
bindToggle('#layer-contours', (on) => {
  view.terrain.contours = on;
  scene.invalidateAll();
});
bindToggle('#layer-zones', (on) => {
  view.showZones = on;
});
bindToggle('#layer-roads', (on) => {
  view.showRoads = on;
});
bindToggle('#layer-buildings', (on) => {
  view.showBuildings = on;
});

function bindToggle(selector: string, apply: (on: boolean) => void): void {
  const input = must<HTMLInputElement>(selector);
  input.addEventListener('change', () => {
    apply(input.checked);
    queueDraw();
  });
}

/* ---- autosave ------------------------------------------------------------ */

let autosaveTimer: number | null = null;

function scheduleAutosave(): void {
  if (autosaveTimer !== null) clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null;
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(world.toJSON()));
    } catch {
      // Quota is tight for a big map; explicit Save still works.
    }
  }, 1200);
}

function restore(): World | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    return World.fromJSON(JSON.parse(raw) as WorldFile);
  } catch {
    return null;
  }
}

/* ---- helpers ------------------------------------------------------------- */

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

nameInput.value = world.name;
panel.update(world.report);
syncHistoryButtons();
editor.setTool('raise');
queueDraw();

