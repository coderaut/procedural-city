import { area, inset } from './geom';
import type { Polygon } from './geom';
import type { Rng } from './rng';
import { clamp, subdivide } from './subdivide';
import type { Building, CityParams, Zone } from './types';

interface ZoneRule {
  /** Target lot area in m^2 at density 0.5. */
  lotArea: number;
  /** Distance from lot edge to building wall, in metres. */
  setback: number;
  /** Chance a lot is actually built on. */
  coverage: number;
  floors: [number, number];
  /** Height distribution exponent; >1 keeps most buildings low. */
  skew: number;
}

export const ZONE_RULES: Record<Zone, ZoneRule | null> = {
  downtown: { lotArea: 1100, setback: 1.5, coverage: 0.97, floors: [6, 42], skew: 2.4 },
  commercial: { lotArea: 620, setback: 2, coverage: 0.93, floors: [2, 12], skew: 1.8 },
  residential: { lotArea: 300, setback: 3, coverage: 0.82, floors: [1, 5], skew: 1.6 },
  industrial: { lotArea: 2400, setback: 6, coverage: 0.7, floors: [1, 3], skew: 1.2 },
  park: null,
  plaza: null,
};

/**
 * Fill darkness tracks absolute storeys, not storeys-relative-to-zone, so a tower
 * downtown reads darker than the tallest house in the suburbs. Log scale keeps the
 * low end (1-5 storeys) readable while 40-storey towers still saturate.
 */
const SHADE_CEILING = Math.log2(1 + 36);

function shadeFor(floors: number): number {
  return clamp(Math.log2(1 + floors) / SHADE_CEILING, 0, 1);
}

export function buildingsFor(block: Polygon, zone: Zone, params: CityParams, rng: Rng): Building[] {
  const rule = ZONE_RULES[zone];
  if (!rule) return [];

  const densityScale = 1.7 - params.density * 1.4; // dense city => smaller lots
  const lotArea = Math.max(90, rule.lotArea * densityScale);
  const setback = Math.max(0.8, rule.setback * (1.5 - params.density));
  const maxFloors = Math.max(rule.floors[0], Math.round(rule.floors[1] * (0.45 + params.density)));

  const out: Building[] = [];
  for (const lot of subdivide(block, lotArea, rng, params.irregularity)) {
    if (!rng.chance(rule.coverage)) continue;
    const footprint = inset(lot, setback);
    if (footprint.length < 3 || area(footprint) < 24) continue;
    const t = Math.pow(rng.bell(), rule.skew);
    const floors = Math.max(1, Math.round(rule.floors[0] + (maxFloors - rule.floors[0]) * t));
    out.push({ poly: footprint, zone, floors, shade: shadeFor(floors) });
  }
  return out;
}
