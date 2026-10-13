import { ROAD, WATER, ZONE } from './kinds';
import type { ResourceKind, RoadClass, WaterKind, ZoneKind } from './kinds';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Layers an edit can touch. `road` and `occupancy` are derived, never edited directly. */
export type LayerName = 'height' | 'water' | 'forest' | 'resource' | 'zone';

/**
 * The world as a square cell raster. Every layer is a flat typed array of
 * `size * size`, indexed row-major, so edits and repaints can work on rectangles.
 *
 * Cell coordinates are integers; world coordinates are metres (`cell * cellSize`).
 */
export class Grid {
  readonly size: number;
  readonly cellSize: number;

  /** Ground elevation in metres. Negative is below sea level. */
  readonly height: Float32Array;
  /** Painted water bodies, see WATER. */
  readonly water: Uint8Array;
  /** Tree cover, 0-255. */
  readonly forest: Uint8Array;
  /** Natural resource deposits, see RESOURCE. */
  readonly resource: Uint8Array;
  /** Land-use designation, see ZONE. */
  readonly zone: Uint8Array;

  /** Derived from the road network each recompute: road class per cell. */
  readonly road: Uint8Array;
  /** Derived each recompute: 1 where a building or road already sits. */
  readonly occupancy: Uint8Array;
  /** Derived each recompute: cells to the nearest road with frontage (255 = far). */
  readonly reach: Uint8Array;

  constructor(size: number, cellSize: number) {
    this.size = size;
    this.cellSize = cellSize;
    const cells = size * size;
    this.height = new Float32Array(cells);
    this.water = new Uint8Array(cells);
    this.forest = new Uint8Array(cells);
    this.resource = new Uint8Array(cells);
    this.zone = new Uint8Array(cells);
    this.road = new Uint8Array(cells);
    this.occupancy = new Uint8Array(cells);
    this.reach = new Uint8Array(cells).fill(255);
  }

  /** World extent in metres. */
  get metres(): number {
    return this.size * this.cellSize;
  }

  get cells(): number {
    return this.size * this.size;
  }

  layer(name: LayerName): Float32Array | Uint8Array {
    switch (name) {
      case 'height':
        return this.height;
      case 'water':
        return this.water;
      case 'forest':
        return this.forest;
      case 'resource':
        return this.resource;
      case 'zone':
        return this.zone;
      default:
        throw new Error(`Unknown layer: ${String(name)}`);
    }
  }

  index(cx: number, cy: number): number {
    return cy * this.size + cx;
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.size && cy < this.size;
  }

  /** Clamps a cell coordinate into the grid. */
  clampCell(c: number): number {
    return c < 0 ? 0 : c > this.size - 1 ? this.size - 1 : c;
  }

  cellAtMetres(m: number): number {
    return this.clampCell(Math.floor(m / this.cellSize));
  }

  heightAt(cx: number, cy: number): number {
    const x = this.clampCell(cx);
    const y = this.clampCell(cy);
    return this.height[y * this.size + x]!;
  }

  waterAt(cx: number, cy: number): WaterKind {
    if (!this.inBounds(cx, cy)) return WATER.none;
    return this.water[cy * this.size + cx] as WaterKind;
  }

  zoneAt(cx: number, cy: number): ZoneKind {
    if (!this.inBounds(cx, cy)) return ZONE.none;
    return this.zone[cy * this.size + cx] as ZoneKind;
  }

  resourceAt(cx: number, cy: number): ResourceKind {
    if (!this.inBounds(cx, cy)) return 0;
    return this.resource[cy * this.size + cx] as ResourceKind;
  }

  roadAt(cx: number, cy: number): RoadClass {
    if (!this.inBounds(cx, cy)) return ROAD.none;
    return this.road[cy * this.size + cx] as RoadClass;
  }

  /** Steepest gradient at a cell (rise over run), from central differences. */
  slopeAt(cx: number, cy: number): number {
    const d = this.cellSize * 2;
    const dx = (this.heightAt(cx + 1, cy) - this.heightAt(cx - 1, cy)) / d;
    const dy = (this.heightAt(cx, cy + 1) - this.heightAt(cx, cy - 1)) / d;
    return Math.hypot(dx, dy);
  }

  /** Dry, unoccupied, inside the world. Slope is checked by the caller against its own limit. */
  isDryLand(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return false;
    const i = cy * this.size + cx;
    return this.water[i] === WATER.none;
  }

  fullRect(): Rect {
    return { x0: 0, y0: 0, x1: this.size - 1, y1: this.size - 1 };
  }

  /** Clips a rectangle to the grid, returning null if nothing is left. */
  clipRect(rect: Rect): Rect | null {
    const x0 = Math.max(0, Math.min(this.size - 1, Math.floor(rect.x0)));
    const y0 = Math.max(0, Math.min(this.size - 1, Math.floor(rect.y0)));
    const x1 = Math.max(0, Math.min(this.size - 1, Math.ceil(rect.x1)));
    const y1 = Math.max(0, Math.min(this.size - 1, Math.ceil(rect.y1)));
    if (x1 < x0 || y1 < y0) return null;
    return { x0, y0, x1, y1 };
  }
}

export function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

export function rectAround(cx: number, cy: number, radius: number): Rect {
  return {
    x0: Math.floor(cx - radius),
    y0: Math.floor(cy - radius),
    x1: Math.ceil(cx + radius),
    y1: Math.ceil(cy + radius),
  };
}
