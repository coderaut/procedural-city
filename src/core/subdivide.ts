import { area, clip, dot, longestAxis, rotate, scale, split } from './geom';
import type { Polygon, Vec2 } from './geom';
import type { Rng } from './rng';

const MAX_DEPTH = 16;

/**
 * Recursively halves a convex polygon until each piece is below `targetArea`.
 * Cuts run perpendicular to the longest edge, with position and angle jittered —
 * the same routine builds organic districts and the lots inside a block.
 */
export function subdivide(
  poly: Polygon,
  targetArea: number,
  rng: Rng,
  irregularity: number,
  depth = 0,
): Polygon[] {
  if (poly.length < 3) return [];
  if (depth >= MAX_DEPTH || area(poly) <= targetArea) return [poly];

  const axis = longestAxis(poly);
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const t = dot(p, axis);
    if (t < min) min = t;
    if (t > max) max = t;
  }

  const spread = 0.35 * irregularity;
  const f = clamp(0.5 + (rng.next() * 2 - 1) * spread, 0.25, 0.75);
  const cutAt = min + (max - min) * f;
  const normal = rotate(axis, (rng.next() * 2 - 1) * 0.45 * irregularity);
  const point = scale(axis, cutAt);

  const [a, b] = split(poly, point, normal);
  const out: Polygon[] = [];
  for (const half of [a, b]) {
    if (half.length < 3 || area(half) < targetArea * 0.08) continue;
    out.push(...subdivide(half, targetArea, rng, irregularity, depth + 1));
  }
  return out.length > 0 ? out : [poly];
}

/** Trims a polygon to the positive side of every supplied half-plane. */
export function clipAll(poly: Polygon, planes: readonly { p: Vec2; n: Vec2 }[]): Polygon {
  let out = poly;
  for (const { p, n } of planes) {
    if (out.length < 3) return [];
    out = clip(out, p, n);
  }
  return out.length >= 3 ? out : [];
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
