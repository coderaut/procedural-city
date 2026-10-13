import { dist } from './geom';
import type { Vec2 } from './geom';
import type { Rng } from './rng';
import type { CityParams, Zone } from './types';
import { clamp } from './subdivide';

/**
 * Zones fall out of distance from the centre: towers downtown, shops around them,
 * housing in the middle band, industry on the outskirts, parks sprinkled anywhere.
 */
export function pickZone(at: Vec2, center: Vec2, params: CityParams, rng: Rng): Zone {
  const d = clamp(dist(at, center) / (params.size / 2), 0, 1);

  if (rng.chance(params.parkRatio)) return 'park';

  const core = Math.pow(Math.max(0, 1 - d / 0.34), 1.6) * 8 * (0.4 + params.density);
  const shops = Math.exp(-Math.pow(d - 0.36, 2) / 0.04) * 3.4;
  const homes = 1.2 + 4 * smoothstep(0.15, 0.6, d) * (1 - 0.4 * smoothstep(0.7, 1, d));
  const works = Math.pow(Math.max(0, (d - 0.5) / 0.5), 1.4) * 3.4;

  return rng.weighted<Zone>([
    ['downtown', core],
    ['commercial', shops],
    ['residential', homes],
    ['industrial', works],
  ]);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
