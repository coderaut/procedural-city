import { circlePoly, rectPoly, v } from './geom';
import type { Polygon, Vec2 } from './geom';
import type { Rng } from './rng';
import { subdivide } from './subdivide';
import type { CityParams } from './types';

export interface Layout {
  /** Raw cells covering the land; streets are the gaps left after insetting. */
  cells: Polygon[];
  /** Outline of built-up land, painted in the street colour. */
  land: Polygon;
  center: Vec2;
}

export function makeLayout(params: CityParams, rng: Rng): Layout {
  switch (params.layout) {
    case 'radial':
      return radialLayout(params, rng);
    case 'organic':
      return organicLayout(params, rng);
    case 'grid':
    default:
      return gridLayout(params, rng);
  }
}

/** Manhattan-ish: two sets of jittered parallel streets. */
function gridLayout(params: CityParams, rng: Rng): Layout {
  const { size, blockSize, irregularity } = params;
  const xs = axisStops(size, blockSize, irregularity, rng);
  const ys = axisStops(size, blockSize, irregularity, rng);
  const cells: Polygon[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const x0 = xs[i]!;
      const x1 = xs[i + 1]!;
      const y0 = ys[j]!;
      const y1 = ys[j + 1]!;
      cells.push(rectPoly(x0, y0, x1 - x0, y1 - y0));
    }
  }
  return { cells, land: rectPoly(0, 0, size, size), center: v(size / 2, size / 2) };
}

function axisStops(size: number, step: number, irregularity: number, rng: Rng): number[] {
  const stops = [0];
  let at = 0;
  while (at < size) {
    at += step * rng.jitter(0.45 * irregularity);
    if (size - at < step * 0.5) break;
    stops.push(at);
  }
  stops.push(size);
  return stops;
}

/** Rings and spokes around a central plaza; spoke count doubles outward. */
function radialLayout(params: CityParams, rng: Rng): Layout {
  const { size, blockSize, irregularity } = params;
  const radius = size / 2;
  const center = v(radius, radius);
  const offset = rng.next() * Math.PI * 2;

  const radii = [blockSize * 0.55];
  while (radii[radii.length - 1]! < radius) {
    const next = radii[radii.length - 1]! + blockSize * rng.jitter(0.3 * irregularity);
    radii.push(Math.min(next, radius));
    if (radii[radii.length - 1]! >= radius) break;
  }

  const cells: Polygon[] = [circlePoly(center, radii[0]!, 24)];
  for (let k = 0; k < radii.length - 1; k++) {
    const r0 = radii[k]!;
    const r1 = radii[k + 1]!;
    const mid = (r0 + r1) / 2;
    let spokes = 8;
    while ((Math.PI * 2 * mid) / spokes > blockSize * 1.4) spokes *= 2;
    for (let j = 0; j < spokes; j++) {
      const a0 = offset + (j / spokes) * Math.PI * 2;
      const a1 = offset + ((j + 1) / spokes) * Math.PI * 2;
      cells.push([
        polar(center, r0, a0),
        polar(center, r1, a0),
        polar(center, r1, a1),
        polar(center, r0, a1),
      ]);
    }
  }

  return { cells, land: circlePoly(center, radius, 96), center };
}

/** Old-town feel: recursive irregular partition of the whole plot. */
function organicLayout(params: CityParams, rng: Rng): Layout {
  const { size, blockSize, irregularity } = params;
  const plot = rectPoly(0, 0, size, size);
  const cells = subdivide(plot, blockSize * blockSize, rng, 0.3 + 0.7 * irregularity);
  return { cells, land: plot, center: v(size / 2, size / 2) };
}

function polar(center: Vec2, r: number, a: number): Vec2 {
  return v(center.x + Math.cos(a) * r, center.y + Math.sin(a) * r);
}
