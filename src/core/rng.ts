/** Seeded, deterministic PRNG (mulberry32) so a seed always rebuilds the same city. */
export class Rng {
  private s: number;

  constructor(seed: string | number) {
    this.s = (typeof seed === 'number' ? seed : hashString(seed)) >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))]!;
  }

  /** Symmetric multiplier around 1, e.g. jitter(0.2) -> 0.8..1.2 */
  jitter(amount: number): number {
    return 1 + (this.next() * 2 - 1) * amount;
  }

  /** Roughly normal in 0..1, for building heights that cluster. */
  bell(): number {
    return (this.next() + this.next() + this.next()) / 3;
  }

  weighted<T>(entries: readonly [T, number][]): T {
    let total = 0;
    for (const [, w] of entries) total += w;
    let r = this.next() * total;
    for (const [item, w] of entries) {
      r -= w;
      if (r <= 0) return item;
    }
    return entries[entries.length - 1]![0];
  }
}

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randomSeed(): string {
  const words = Math.random().toString(36).slice(2, 8);
  return words.toUpperCase();
}
