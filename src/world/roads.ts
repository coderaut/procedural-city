import { add, dist, distToSegment, len, norm, scale, sub, v } from './geom';
import type { Vec2 } from './geom';
import type { Grid } from './grid';
import { ROAD, ROAD_WIDTH } from './kinds';
import type { RoadClass } from './kinds';

export interface RoadSegment {
  id: number;
  cls: RoadClass;
  /** Centreline in world metres. */
  points: Vec2[];
}

/** A point along a road, with the direction of travel there. */
export interface Frontage {
  at: Vec2;
  tangent: Vec2;
  cls: RoadClass;
}

export class RoadNetwork {
  segments: RoadSegment[] = [];
  private nextId = 1;

  /**
   * Adds a drawn centreline. Freehand input is simplified first, then loose ends
   * snap to nearby roads so junctions actually connect.
   */
  add(points: Vec2[], cls: RoadClass, cellSize: number): RoadSegment | null {
    const simplified = simplify(points, cellSize * 0.7);
    if (simplified.length < 2) return null;
    if (pathLength(simplified) < cellSize) return null;

    const snapRadius = Math.max(ROAD_WIDTH[cls], cellSize * 2);
    const first = this.snapPoint(simplified[0]!, snapRadius);
    const last = this.snapPoint(simplified[simplified.length - 1]!, snapRadius);
    simplified[0] = first;
    simplified[simplified.length - 1] = last;

    const segment: RoadSegment = { id: this.nextId++, cls, points: simplified };
    this.segments.push(segment);
    return segment;
  }

  /** Nearest existing vertex within range, so drawn roads join up. */
  private snapPoint(p: Vec2, radius: number): Vec2 {
    let best = p;
    let bestDist = radius;
    for (const segment of this.segments) {
      for (const q of segment.points) {
        const d = dist(p, q);
        if (d < bestDist) {
          bestDist = d;
          best = q;
        }
      }
    }
    return v(best.x, best.y);
  }

  /** Deletes every segment passing within `radius` metres of a point. */
  removeNear(p: Vec2, radius: number): number {
    const before = this.segments.length;
    this.segments = this.segments.filter((segment) => {
      for (let i = 0; i < segment.points.length - 1; i++) {
        const d = distToSegment(p, segment.points[i]!, segment.points[i + 1]!);
        if (d <= radius + ROAD_WIDTH[segment.cls] / 2) return false;
      }
      return true;
    });
    return before - this.segments.length;
  }

  snapshot(): RoadSegment[] {
    return this.segments.map((s) => ({ id: s.id, cls: s.cls, points: s.points.map((p) => v(p.x, p.y)) }));
  }

  restore(segments: RoadSegment[]): void {
    this.segments = segments.map((s) => ({ id: s.id, cls: s.cls, points: s.points.map((p) => v(p.x, p.y)) }));
    this.nextId = this.segments.reduce((max, s) => Math.max(max, s.id + 1), 1);
  }

  clear(): void {
    this.segments = [];
    this.nextId = 1;
  }

  get length(): number {
    return this.segments.reduce((total, s) => total + pathLength(s.points), 0);
  }

  /** Burns road widths into `grid.road`; a wider class overwrites a narrower one. */
  rasterize(grid: Grid): void {
    grid.road.fill(ROAD.none);
    for (const segment of this.segments) {
      const halfWidth = ROAD_WIDTH[segment.cls] / 2;
      const radiusCells = halfWidth / grid.cellSize;
      for (let i = 0; i < segment.points.length - 1; i++) {
        const a = segment.points[i]!;
        const b = segment.points[i + 1]!;
        const span = dist(a, b);
        const steps = Math.max(1, Math.ceil(span / (grid.cellSize * 0.5)));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          stampDisc(grid, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, radiusCells, segment.cls);
        }
      }
    }
  }

  /** Evenly spaced points along every segment of a frontage-bearing class. */
  frontages(step: number, accept: (cls: RoadClass) => boolean): Frontage[] {
    const out: Frontage[] = [];
    for (const segment of this.segments) {
      if (!accept(segment.cls)) continue;
      for (const sample of sampleAlong(segment.points, step)) {
        out.push({ at: sample.at, tangent: sample.tangent, cls: segment.cls });
      }
    }
    return out;
  }
}

function stampDisc(grid: Grid, worldX: number, worldY: number, radiusCells: number, cls: RoadClass): void {
  const ccx = worldX / grid.cellSize - 0.5;
  const ccy = worldY / grid.cellSize - 0.5;
  const r = Math.max(0.6, radiusCells);
  const x0 = Math.max(0, Math.floor(ccx - r));
  const y0 = Math.max(0, Math.floor(ccy - r));
  const x1 = Math.min(grid.size - 1, Math.ceil(ccx + r));
  const y1 = Math.min(grid.size - 1, Math.ceil(ccy + r));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (Math.hypot(cx - ccx, cy - ccy) > r) continue;
      const i = cy * grid.size + cx;
      if (grid.road[i]! < cls) grid.road[i] = cls;
    }
  }
}

/** Walks a polyline at a fixed spacing, reporting position and direction. */
export function sampleAlong(points: Vec2[], step: number): { at: Vec2; tangent: Vec2 }[] {
  const out: { at: Vec2; tangent: Vec2 }[] = [];
  if (points.length < 2 || step <= 0) return out;
  let carry = step / 2;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const seg = sub(b, a);
    const segLen = len(seg);
    if (segLen < 1e-6) continue;
    const tangent = scale(seg, 1 / segLen);
    let travelled = carry;
    while (travelled <= segLen) {
      out.push({ at: add(a, scale(tangent, travelled)), tangent });
      travelled += step;
    }
    carry = travelled - segLen;
  }
  return out;
}

export function pathLength(points: Vec2[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += dist(points[i]!, points[i + 1]!);
  return total;
}

/** Douglas-Peucker, to turn a jittery freehand drag into a clean centreline. */
export function simplify(points: Vec2[], epsilon: number): Vec2[] {
  if (points.length <= 2) return points.map((p) => v(p.x, p.y));

  let worst = 0;
  let worstIndex = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distToSegment(points[i]!, first, last);
    if (d > worst) {
      worst = d;
      worstIndex = i;
    }
  }

  if (worst <= epsilon) return [v(first.x, first.y), v(last.x, last.y)];

  const head = simplify(points.slice(0, worstIndex + 1), epsilon);
  const tail = simplify(points.slice(worstIndex), epsilon);
  return [...head.slice(0, -1), ...tail];
}

/** Outline of a road's carriageway, for drawing and for hit tests. */
export function roadOutline(segment: RoadSegment, inflate = 0): Vec2[] {
  const half = ROAD_WIDTH[segment.cls] / 2 + inflate;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  const pts = segment.points;
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(pts.length - 1, i + 1)]!;
    const dir = norm(sub(next, prev));
    const n = v(-dir.y, dir.x);
    left.push(add(pts[i]!, scale(n, half)));
    right.push(sub(pts[i]!, scale(n, half)));
  }
  return [...left, ...right.reverse()];
}
