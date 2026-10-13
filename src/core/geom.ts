/**
 * Convex-polygon geometry. Every cell the generator produces stays convex, which
 * keeps the three operations we need (clip, split, inset) exact and cheap.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export type Polygon = Vec2[];

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  w: number;
  h: number;
}

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => v(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => v(a.x - b.x, a.y - b.y);
export const scale = (a: Vec2, k: number): Vec2 => v(a.x * k, a.y * k);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const perp = (a: Vec2): Vec2 => v(-a.y, a.x);
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export function norm(a: Vec2): Vec2 {
  const l = len(a);
  return l < 1e-12 ? v(0, 0) : v(a.x / l, a.y / l);
}

export function rotate(a: Vec2, rad: number): Vec2 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return v(a.x * c - a.y * s, a.x * s + a.y * c);
}

export function signedArea(poly: Polygon): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const area = (poly: Polygon): number => Math.abs(signedArea(poly));

export function centroid(poly: Polygon): Vec2 {
  const sa = signedArea(poly);
  if (Math.abs(sa) < 1e-9) {
    let x = 0;
    let y = 0;
    for (const p of poly) {
      x += p.x;
      y += p.y;
    }
    const n = Math.max(1, poly.length);
    return v(x / n, y / n);
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  return v(cx / (6 * sa), cy / (6 * sa));
}

export function bounds(poly: Polygon): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** Keeps the part of `poly` on the positive side of the line through `p` with normal `n`. */
export function clip(poly: Polygon, p: Vec2, n: Vec2): Polygon {
  const out: Polygon = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const da = dot(sub(a, p), n);
    const db = dot(sub(b, p), n);
    if (da >= 0) out.push(a);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      out.push(v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
    }
  }
  return out;
}

/** Cuts `poly` in two along the line through `p` with normal `n`. */
export function split(poly: Polygon, p: Vec2, n: Vec2): [Polygon, Polygon] {
  return [clip(poly, p, n), clip(poly, p, scale(n, -1))];
}

/** Shrinks a convex polygon by `d` on every edge. Returns [] if nothing survives. */
export function inset(poly: Polygon, d: number): Polygon {
  if (d <= 0) return poly;
  if (poly.length < 3) return [];
  const c = centroid(poly);
  let out: Polygon = poly;
  for (let i = 0; i < poly.length; i++) {
    if (out.length < 3) return [];
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const edge = sub(b, a);
    if (len(edge) < 1e-9) continue;
    let n = norm(perp(edge));
    if (dot(sub(c, a), n) < 0) n = scale(n, -1);
    out = clip(out, add(a, scale(n, d)), n);
  }
  return out.length >= 3 ? out : [];
}

/** Longest edge of a polygon, as a unit direction. */
export function longestAxis(poly: Polygon): Vec2 {
  let bestLen = -1;
  let best = v(1, 0);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const l = dist(a, b);
    if (l > bestLen) {
      bestLen = l;
      best = sub(b, a);
    }
  }
  return norm(best);
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return dist(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, add(a, scale(ab, t)));
}

export function distToPolyline(p: Vec2, line: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const d = distToSegment(p, line[i]!, line[i + 1]!);
    if (d < best) best = d;
  }
  return best;
}

/** Regular polygon approximation of a circle. */
export function circlePoly(c: Vec2, r: number, steps = 48): Polygon {
  const out: Polygon = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.push(v(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r));
  }
  return out;
}

export function rectPoly(x: number, y: number, w: number, h: number): Polygon {
  return [v(x, y), v(x + w, y), v(x + w, y + h), v(x, y + h)];
}
