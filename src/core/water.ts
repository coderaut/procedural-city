import { add, dist, norm, perp, scale, sub, v } from './geom';
import type { Polygon, Vec2 } from './geom';
import type { Rng } from './rng';

/** A river crossing the map, built by midpoint displacement between two edges. */
export function makeRiver(size: number, rng: Rng): Vec2[] {
  const vertical = rng.chance(0.5);
  const a = vertical ? v(rng.range(0.2, 0.8) * size, -size * 0.06) : v(-size * 0.06, rng.range(0.2, 0.8) * size);
  const b = vertical ? v(rng.range(0.2, 0.8) * size, size * 1.06) : v(size * 1.06, rng.range(0.2, 0.8) * size);

  let line: Vec2[] = [a, b];
  for (let pass = 0; pass < 5; pass++) {
    const next: Vec2[] = [line[0]!];
    const amount = (size * 0.16) / Math.pow(2, pass);
    for (let i = 0; i < line.length - 1; i++) {
      const p = line[i]!;
      const q = line[i + 1]!;
      const mid = scale(add(p, q), 0.5);
      const n = norm(perp(sub(q, p)));
      next.push(add(mid, scale(n, (rng.next() * 2 - 1) * amount)));
      next.push(q);
    }
    line = next;
  }
  return line;
}

/** Thickens a polyline into a band polygon of the given width. */
export function riverBand(line: Vec2[], width: number): Polygon {
  const half = width / 2;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < line.length; i++) {
    const prev = line[Math.max(0, i - 1)]!;
    const next = line[Math.min(line.length - 1, i + 1)]!;
    const n = norm(perp(sub(next, prev)));
    const wobble = half * (0.85 + 0.3 * Math.sin(i * 1.7));
    left.push(add(line[i]!, scale(n, wobble)));
    right.push(sub(line[i]!, scale(n, wobble)));
  }
  return [...left, ...right.reverse()];
}

/** Road decks spanning the river, placed at a few points along its length. */
export function makeBridges(line: Vec2[], width: number, deck: number, count: number, rng: Rng): Polygon[] {
  const out: Polygon[] = [];
  const usable = line.slice(2, line.length - 2);
  if (usable.length < 3) return out;
  const taken: number[] = [];
  for (let attempt = 0; attempt < count * 6 && taken.length < count; attempt++) {
    const i = rng.int(1, usable.length - 2);
    if (taken.some((t) => Math.abs(t - i) < usable.length / (count + 1))) continue;
    taken.push(i);
    const p = usable[i]!;
    const dir = norm(sub(usable[i + 1]!, usable[i - 1]!));
    const across = perp(dir);
    const halfSpan = width * 0.9;
    const halfDeck = deck / 2;
    out.push([
      add(add(p, scale(across, halfSpan)), scale(dir, halfDeck)),
      add(add(p, scale(across, -halfSpan)), scale(dir, halfDeck)),
      add(add(p, scale(across, -halfSpan)), scale(dir, -halfDeck)),
      add(add(p, scale(across, halfSpan)), scale(dir, -halfDeck)),
    ]);
  }
  return out;
}

export function riverLength(line: Vec2[]): number {
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) total += dist(line[i]!, line[i + 1]!);
  return total;
}
