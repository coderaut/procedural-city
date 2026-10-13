import type { Edit } from './edit';
import type { Grid } from './grid';
import type { Vec2 } from './geom';

export interface StampContext {
  grid: Grid;
  cx: number;
  cy: number;
  /** 0..1 brush pressure for this cell, already shaped by hardness. */
  falloff: number;
  /** Tool strength, 0..1. */
  strength: number;
  /** Height under the cursor when the stroke began — used by flatten. */
  anchor: number;
  /** Extra per-tool value: the water/resource/zone kind being painted. */
  value: number;
}

/** A tool's rule for turning an old cell value into a new one. */
export interface StampOp {
  /** Cells below this falloff are left alone — keeps painted regions hard-edged. */
  threshold?: number;
  apply(old: number, ctx: StampContext): number;
}

/**
 * Elevation moves in metres per dab; a full-strength pass over a cell shifts it
 * this much, and repeated dabs accumulate while the pointer is held down.
 */
export const HEIGHT_STEP = 2.6;
const FOREST_STEP = 70;

export const OPS = {
  raise: {
    apply: (old, c) => old + HEIGHT_STEP * c.strength * c.falloff,
  },
  lower: {
    apply: (old, c) => old - HEIGHT_STEP * c.strength * c.falloff,
  },
  smooth: {
    apply: (old, c) => {
      const g = c.grid;
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += g.heightAt(c.cx + dx, c.cy + dy);
          n++;
        }
      }
      return old + (sum / n - old) * c.strength * c.falloff * 0.8;
    },
  },
  flatten: {
    apply: (old, c) => old + (c.anchor - old) * c.strength * c.falloff * 0.8,
  },
  setWater: {
    threshold: 0.5,
    apply: (_old, c) => c.value,
  },
  setResource: {
    threshold: 0.5,
    apply: (_old, c) => c.value,
  },
  setZone: {
    threshold: 0.5,
    apply: (_old, c) => c.value,
  },
  addForest: {
    apply: (old, c) => clamp255(old + FOREST_STEP * c.strength * c.falloff),
  },
  removeForest: {
    apply: (old, c) => clamp255(old - FOREST_STEP * c.strength * c.falloff * 1.6),
  },
} satisfies Record<string, StampOp>;

export type OpName = keyof typeof OPS;

function clamp255(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : Math.round(n);
}

export interface StampSettings {
  /** Brush radius in metres. */
  radius: number;
  /** 0..1. */
  strength: number;
  /** 0 = soft edge, 1 = hard edge. */
  hardness: number;
}

/** Paints a circular dab centred on a world position, in metres. */
export function stampCircle(
  edit: Edit,
  grid: Grid,
  worldX: number,
  worldY: number,
  settings: StampSettings,
  op: StampOp,
  value = 0,
  anchor = 0,
): void {
  const radiusCells = Math.max(0.5, settings.radius / grid.cellSize);
  const ccx = worldX / grid.cellSize - 0.5;
  const ccy = worldY / grid.cellSize - 0.5;
  const x0 = Math.max(0, Math.floor(ccx - radiusCells));
  const y0 = Math.max(0, Math.floor(ccy - radiusCells));
  const x1 = Math.min(grid.size - 1, Math.ceil(ccx + radiusCells));
  const y1 = Math.min(grid.size - 1, Math.ceil(ccy + radiusCells));
  const threshold = op.threshold ?? 0;

  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const d = Math.hypot(cx - ccx, cy - ccy) / radiusCells;
      if (d > 1) continue;
      const falloff = shape(d, settings.hardness);
      if (falloff <= threshold) continue;
      const old = edit.read(cx, cy);
      const next = op.apply(old, { grid, cx, cy, falloff, strength: settings.strength, anchor, value });
      edit.write(cx, cy, next);
    }
  }
}

/** Paints every cell inside a world-space polygon (the pen tool). */
export function fillPolygon(
  edit: Edit,
  grid: Grid,
  poly: Vec2[],
  settings: StampSettings,
  op: StampOp,
  value = 0,
  anchor = 0,
): void {
  if (poly.length < 3) return;
  const pts = poly.map((p) => [p.x / grid.cellSize - 0.5, p.y / grid.cellSize - 0.5] as const);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const y0 = Math.max(0, Math.ceil(minY));
  const y1 = Math.min(grid.size - 1, Math.floor(maxY));

  for (let cy = y0; cy <= y1; cy++) {
    const crossings: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[(i + 1) % pts.length]!;
      if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) {
        crossings.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const xa = Math.max(0, Math.ceil(crossings[k]!));
      const xb = Math.min(grid.size - 1, Math.floor(crossings[k + 1]!));
      for (let cx = xa; cx <= xb; cx++) {
        const old = edit.read(cx, cy);
        const next = op.apply(old, {
          grid,
          cx,
          cy,
          falloff: 1,
          strength: settings.strength,
          anchor,
          value,
        });
        edit.write(cx, cy, next);
      }
    }
  }
}

/** Brush profile: hardness 1 is a flat disc, hardness 0 a smooth dome. */
function shape(d: number, hardness: number): number {
  const edge = Math.max(0.0001, 1 - Math.min(0.98, hardness));
  const t = Math.min(1, (1 - d) / edge);
  return t * t * (3 - 2 * t);
}
