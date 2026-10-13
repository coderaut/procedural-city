import type { Grid, LayerName, Rect } from './grid';
import { unionRect } from './grid';
import type { RoadSegment } from './roads';

/**
 * One undoable change. Cell edits are stored sparsely — only the cells a stroke
 * actually touched — so a small brush dab costs a few hundred bytes rather than a
 * copy of the whole layer. Road edits snapshot the segment list, which is tiny.
 */
export type Patch =
  | {
      kind: 'cells';
      layer: LayerName;
      indices: Int32Array;
      before: Float32Array;
      after: Float32Array;
      rect: Rect;
      label: string;
    }
  | {
      kind: 'roads';
      before: RoadSegment[];
      after: RoadSegment[];
      rect: Rect;
      label: string;
    };

/**
 * Accumulates one stroke's worth of writes to a single layer, remembering each
 * cell's original value the first time it is touched.
 */
export class Edit {
  readonly layer: LayerName;
  rect: Rect | null = null;

  private readonly grid: Grid;
  private readonly target: Float32Array | Uint8Array;
  private readonly before = new Map<number, number>();

  constructor(grid: Grid, layer: LayerName) {
    this.grid = grid;
    this.layer = layer;
    this.target = grid.layer(layer);
  }

  get isEmpty(): boolean {
    return this.before.size === 0;
  }

  read(cx: number, cy: number): number {
    if (!this.grid.inBounds(cx, cy)) return 0;
    return this.target[cy * this.grid.size + cx]!;
  }

  write(cx: number, cy: number, value: number): void {
    if (!this.grid.inBounds(cx, cy)) return;
    const i = cy * this.grid.size + cx;
    const current = this.target[i]!;
    if (value === current) return;
    if (!this.before.has(i)) this.before.set(i, current);
    this.target[i] = value;
    this.rect = unionRect(this.rect, { x0: cx, y0: cy, x1: cx, y1: cy });
  }

  /** Freezes the stroke into a patch, or null if nothing changed. */
  commit(label: string): Patch | null {
    if (this.before.size === 0 || !this.rect) return null;
    const count = this.before.size;
    const indices = new Int32Array(count);
    const before = new Float32Array(count);
    const after = new Float32Array(count);
    let n = 0;
    for (const [index, old] of this.before) {
      indices[n] = index;
      before[n] = old;
      after[n] = this.target[index]!;
      n++;
    }
    return { kind: 'cells', layer: this.layer, indices, before, after, rect: this.rect, label };
  }
}

export function applyPatch(grid: Grid, patch: Patch, direction: 'undo' | 'redo'): Rect {
  if (patch.kind === 'cells') {
    const target = grid.layer(patch.layer);
    const values = direction === 'undo' ? patch.before : patch.after;
    for (let i = 0; i < patch.indices.length; i++) {
      target[patch.indices[i]!] = values[i]!;
    }
  }
  return patch.rect;
}

const LIMIT = 80;

export class History {
  private past: Patch[] = [];
  private future: Patch[] = [];

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get lastLabel(): string | null {
    return this.past.length > 0 ? this.past[this.past.length - 1]!.label : null;
  }

  push(patch: Patch): void {
    this.past.push(patch);
    if (this.past.length > LIMIT) this.past.shift();
    this.future.length = 0;
  }

  /** Pops the newest change; the caller applies it and repaints the returned rect. */
  undo(): Patch | null {
    const patch = this.past.pop();
    if (!patch) return null;
    this.future.push(patch);
    return patch;
  }

  redo(): Patch | null {
    const patch = this.future.pop();
    if (!patch) return null;
    this.past.push(patch);
    return patch;
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
  }
}
