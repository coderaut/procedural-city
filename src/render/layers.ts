import type { Grid, Rect } from '../world/grid';
import { RESOURCE, WATER, ZONE } from '../world/kinds';
import type { ResourceKind } from '../world/kinds';
import { PALETTE, terrainColour } from './palette';
import type { RGB } from './palette';

/**
 * Pure pixel painters: they fill an RGBA buffer the size of the grid and touch
 * nothing in the DOM, so the same code runs in the browser and in the headless
 * preview script. The caller wraps the buffer in an ImageData and blits it.
 */

export interface TerrainOptions {
  contours: boolean;
  /** Contour spacing in metres. */
  contourInterval: number;
  forest: boolean;
  resources: boolean;
  /** 0 = flat colour, 1 = strong relief. */
  relief: number;
}

export const DEFAULT_TERRAIN_OPTIONS: TerrainOptions = {
  contours: true,
  contourInterval: 10,
  forest: true,
  resources: true,
  relief: 0.85,
};

/** Light from the north-west, the cartographic convention. */
const LIGHT_X = -0.6;
const LIGHT_Y = -0.8;

export function paintTerrain(
  grid: Grid,
  out: Uint8ClampedArray,
  options: TerrainOptions,
  rect: Rect = grid.fullRect(),
): void {
  const size = grid.size;
  const area = grid.clipRect(rect);
  if (!area) return;

  for (let cy = area.y0; cy <= area.y1; cy++) {
    for (let cx = area.x0; cx <= area.x1; cx++) {
      const i = cy * size + cx;
      const h = grid.height[i]!;
      const water = grid.water[i]!;
      let colour: RGB;

      if (water !== WATER.none) {
        colour = waterColour(water, h);
      } else {
        colour = terrainColour(h);

        if (options.relief > 0) {
          const dx = (grid.heightAt(cx + 1, cy) - grid.heightAt(cx - 1, cy)) / (grid.cellSize * 2);
          const dy = (grid.heightAt(cx, cy + 1) - grid.heightAt(cx, cy - 1)) / (grid.cellSize * 2);
          const lambert = 1 + (dx * LIGHT_X + dy * LIGHT_Y) * 2.1;
          const shade = clamp(1 + (lambert - 1) * options.relief, 0.55, 1.5);
          colour = [colour[0] * shade, colour[1] * shade, colour[2] * shade];
        }

        if (options.forest) {
          const density = grid.forest[i]! / 255;
          if (density > 0.02) colour = blend(colour, PALETTE.forest, density * 0.78);
        }

        if (options.contours) {
          const line = contourLine(grid, cx, cy, options.contourInterval);
          if (line > 0) {
            colour = blend(colour, line === 2 ? PALETTE.contourIndex : PALETTE.contour, line === 2 ? 0.55 : 0.34);
          }
        }

        if (options.resources) {
          const kind = grid.resource[i] as ResourceKind;
          if (kind !== RESOURCE.none && resourcePattern(kind, cx, cy)) {
            colour = blend(colour, PALETTE.resource[kind], 0.5);
          }
        }
      }

      const o = i * 4;
      out[o] = colour[0];
      out[o + 1] = colour[1];
      out[o + 2] = colour[2];
      out[o + 3] = 255;
    }
  }
}

export interface ZoneOptions {
  /** Fill opacity for designated land, 0..1. */
  alpha: number;
  /** Draw a solid edge where a region meets something else. */
  outline: boolean;
}

export const DEFAULT_ZONE_OPTIONS: ZoneOptions = { alpha: 0.28, outline: true };

export function paintZones(
  grid: Grid,
  out: Uint8ClampedArray,
  options: ZoneOptions,
  rect: Rect = grid.fullRect(),
): void {
  const size = grid.size;
  const area = grid.clipRect(rect);
  if (!area) return;

  for (let cy = area.y0; cy <= area.y1; cy++) {
    for (let cx = area.x0; cx <= area.x1; cx++) {
      const i = cy * size + cx;
      const zone = grid.zone[i]!;
      const o = i * 4;

      if (zone === ZONE.none) {
        out[o + 3] = 0;
        continue;
      }

      const colour = PALETTE.zone[zone as keyof typeof PALETTE.zone] ?? [0, 0, 0];
      const edge =
        options.outline &&
        (grid.zoneAt(cx + 1, cy) !== zone ||
          grid.zoneAt(cx - 1, cy) !== zone ||
          grid.zoneAt(cx, cy + 1) !== zone ||
          grid.zoneAt(cx, cy - 1) !== zone);

      out[o] = colour[0];
      out[o + 1] = colour[1];
      out[o + 2] = colour[2];
      out[o + 3] = Math.round(255 * (edge ? Math.min(1, options.alpha + 0.45) : options.alpha));
    }
  }
}

function waterColour(kind: number, height: number): RGB {
  if (kind === WATER.river) return PALETTE.river;
  if (kind === WATER.lake) return PALETTE.lake;
  // Sea darkens with depth below zero.
  const depth = clamp(-height / 40, 0, 1);
  return blend(PALETTE.seaShallow, PALETTE.seaDeep, depth);
}

/** 0 = none, 1 = ordinary contour, 2 = index contour (every fifth). */
function contourLine(grid: Grid, cx: number, cy: number, interval: number): number {
  const h = grid.heightAt(cx, cy);
  const band = Math.floor(h / interval);
  if (band === Math.floor(grid.heightAt(cx + 1, cy) / interval) && band === Math.floor(grid.heightAt(cx, cy + 1) / interval)) {
    return 0;
  }
  const upper = Math.max(band, Math.floor(grid.heightAt(cx + 1, cy) / interval));
  return upper % 5 === 0 ? 2 : 1;
}

/** Each resource gets its own hatch so they stay distinguishable in one colour family. */
function resourcePattern(kind: ResourceKind, cx: number, cy: number): boolean {
  switch (kind) {
    case RESOURCE.ore:
      return cx % 4 === 0 && cy % 4 === 0;
    case RESOURCE.fertile:
      return cy % 4 === 0;
    case RESOURCE.stone:
      return (cx + cy) % 5 === 0;
    case RESOURCE.oil:
      return (cx - cy + 1000) % 6 < 2;
    default:
      return false;
  }
}

function blend(a: RGB, b: RGB, t: number): RGB {
  const k = clamp(t, 0, 1);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}
