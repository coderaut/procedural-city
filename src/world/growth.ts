import { add, area as polyArea, inset, scale, v } from './geom';
import type { Polygon } from './geom';
import type { Grid } from './grid';
import { isOpenZone, RESOURCE, ROAD, ROAD_FRONTAGE, ROAD_WIDTH, WATER, ZONE, ZONE_RULES } from './kinds';
import type { ResourceKind, RoadClass, ZoneKind } from './kinds';
import { Rng } from './rng';
import type { RoadNetwork } from './roads';
import { computeReach } from './reach';

export interface Building {
  poly: Polygon;
  zone: ZoneKind;
  floors: number;
  /** 0..1 by absolute storeys, for fill shading. */
  shade: number;
  /** Homes for residential, jobs otherwise. */
  capacity: number;
  /** True where a wanted resource sits under the lot. */
  onResource: boolean;
}

export interface GrowthStats {
  /** Cells zoned for something that builds. */
  zonedCells: number;
  /** Zoned, buildable cells too far from a road to ever be developed. */
  strandedCells: number;
  /** Zoned cells that are water or too steep. */
  unusableCells: number;
  /** Cells zoned per zone kind, including open zones. */
  cellsByZone: Map<ZoneKind, number>;
}

export interface GrowthResult {
  buildings: Building[];
  stats: GrowthStats;
}

/** Verge between kerb and the front of a lot, in metres. */
const VERGE = 2.5;
/** Gap left between neighbouring lots, in metres. */
const LOT_GAP = 1.5;
/** How finely the walk along a road advances when it cannot place a lot. */
const WALK_STEP = 6;

const CLASS_BOOST: Record<RoadClass, number> = {
  [ROAD.none]: 1,
  [ROAD.street]: 1,
  [ROAD.avenue]: 1.3,
  [ROAD.highway]: 1,
};

/**
 * Fills the zoned land with buildings that front onto roads.
 *
 * Nothing is placed where a road cannot reach, which is what makes drawn roads
 * matter: zone a hillside with no street and the advisor will tell you it is
 * stranded rather than silently filling it in.
 *
 * Deterministic — each lot seeds its own RNG from the road id and its position
 * along it, so editing one corner of the map never reshuffles the rest.
 */
export function growCity(
  grid: Grid,
  roads: RoadNetwork,
  demand: Record<ZoneKind, number>,
  seed: number,
): GrowthResult {
  roads.rasterize(grid);
  computeReach(grid);
  grid.occupancy.fill(0);
  for (let i = 0; i < grid.road.length; i++) {
    if (grid.road[i] !== ROAD.none) grid.occupancy[i] = 1;
  }

  const buildings: Building[] = [];

  for (const segment of roads.segments) {
    if (!ROAD_FRONTAGE[segment.cls]) continue;
    const halfRoad = ROAD_WIDTH[segment.cls] / 2;

    for (const side of [1, -1] as const) {
      const pts = segment.points;
      let lotIndex = 0;

      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        const spanX = b.x - a.x;
        const spanY = b.y - a.y;
        const spanLen = Math.hypot(spanX, spanY);
        if (spanLen < 1e-6) continue;
        const tangent = v(spanX / spanLen, spanY / spanLen);
        const normal = scale(v(-tangent.y, tangent.x), side);

        let cursor = 0;
        while (cursor < spanLen) {
          const front = add(a, scale(tangent, cursor));
          const probe = add(front, scale(normal, halfRoad + VERGE + 6));
          const zone = grid.zoneAt(
            Math.floor(probe.x / grid.cellSize),
            Math.floor(probe.y / grid.cellSize),
          );
          const rule = ZONE_RULES[zone];

          if (!rule || isOpenZone(zone)) {
            cursor += WALK_STEP;
            continue;
          }

          const width = Math.min(rule.lotWidth, spanLen - cursor);
          if (width < rule.lotWidth * 0.6) break;

          const near = halfRoad + VERGE;
          const far = near + rule.lotDepth;
          const lot: Polygon = [
            add(add(a, scale(tangent, cursor)), scale(normal, near)),
            add(add(a, scale(tangent, cursor + width)), scale(normal, near)),
            add(add(a, scale(tangent, cursor + width)), scale(normal, far)),
            add(add(a, scale(tangent, cursor)), scale(normal, far)),
          ];

          const check = assess(grid, lot, zone, rule.maxSlope);
          if (!check.ok) {
            cursor += WALK_STEP;
            continue;
          }

          const footprint = inset(lot, rule.setback);
          if (footprint.length < 3 || polyArea(footprint) < 30) {
            cursor += WALK_STEP;
            continue;
          }

          const rng = new Rng(mix(seed, segment.id * 977 + (side === 1 ? 0 : 1), lotIndex));
          const pressure = clamp01(demand[zone] * CLASS_BOOST[segment.cls] * (0.45 + 0.75 * rng.bell()));
          const [minFloors, maxFloors] = rule.floors;
          const floors = Math.max(1, Math.round(minFloors + (maxFloors - minFloors) * pressure));
          const onResource = rule.wants !== undefined && check.resource === rule.wants;
          const grossArea = polyArea(footprint) * floors;
          const capacity = (grossArea / rule.areaPer) * (onResource ? 1.4 : 1);

          buildings.push({
            poly: footprint,
            zone,
            floors,
            shade: shadeFor(floors),
            capacity,
            onResource,
          });
          markPolygon(grid, lot);

          lotIndex++;
          cursor += width + LOT_GAP;
        }
      }
    }
  }

  return { buildings, stats: survey(grid) };
}

interface Assessment {
  ok: boolean;
  resource: ResourceKind;
}

/**
 * A lot is viable if every cell under it is dry, free, in the right zone and the
 * ground is gentle enough on average.
 *
 * This scans the whole lot rather than sampling a few points: probing only the
 * centre let lots from perpendicular streets overlap at block corners, and their
 * footprints then fused into one slab.
 */
function assess(grid: Grid, lot: Polygon, zone: ZoneKind, maxSlope: number): Assessment {
  let total = 0;
  let matching = 0;
  let slopeSum = 0;
  let blocked = false;
  const resourceTally = new Map<ResourceKind, number>();

  scanPolygon(grid, lot, (i) => {
    if (blocked) return;
    total++;
    if (grid.water[i] !== WATER.none || grid.occupancy[i] === 1) {
      blocked = true;
      return;
    }
    const cx = i % grid.size;
    const cy = (i - cx) / grid.size;
    slopeSum += grid.slopeAt(cx, cy);
    if (grid.zone[i] === zone) matching++;
    const resource = grid.resource[i] as ResourceKind;
    if (resource !== RESOURCE.none) {
      resourceTally.set(resource, (resourceTally.get(resource) ?? 0) + 1);
    }
  });

  if (blocked || total === 0) return { ok: false, resource: RESOURCE.none };
  if (matching / total < 0.7) return { ok: false, resource: RESOURCE.none };
  if (slopeSum / total > maxSlope) return { ok: false, resource: RESOURCE.none };

  // The deposit under most of the lot is the one that counts.
  let resource: ResourceKind = RESOURCE.none;
  let best = total * 0.4;
  for (const [kind, count] of resourceTally) {
    if (count > best) {
      best = count;
      resource = kind;
    }
  }
  return { ok: true, resource };
}

/** Counts how much zoned land got used, and why the rest did not. */
function survey(grid: Grid): GrowthStats {
  const cellsByZone = new Map<ZoneKind, number>();
  let zonedCells = 0;
  let strandedCells = 0;
  let unusableCells = 0;

  for (let cy = 0; cy < grid.size; cy++) {
    for (let cx = 0; cx < grid.size; cx++) {
      const i = cy * grid.size + cx;
      const zone = grid.zone[i] as ZoneKind;
      if (zone === ZONE.none) continue;
      cellsByZone.set(zone, (cellsByZone.get(zone) ?? 0) + 1);

      const rule = ZONE_RULES[zone];
      if (!rule || isOpenZone(zone)) continue;
      zonedCells++;

      if (grid.water[i] !== WATER.none || grid.slopeAt(cx, cy) > rule.maxSlope) {
        unusableCells++;
      } else if (grid.reach[i]! * grid.cellSize > rule.lotDepth + VERGE + 8) {
        // Out of reach of any road that buildings can front onto. Unbuilt land
        // inside a served lot (setbacks, verges) is not stranded -- it is garden.
        strandedCells++;
      }
    }
  }

  return { zonedCells, strandedCells, unusableCells, cellsByZone };
}

/** Marks every cell under a lot as taken, so lots cannot overlap. */
function markPolygon(grid: Grid, poly: Polygon): void {
  scanPolygon(grid, poly, (i) => {
    grid.occupancy[i] = 1;
  });
}

export function scanPolygon(grid: Grid, poly: Polygon, visit: (index: number) => void): void {
  if (poly.length < 3) return;
  const pts = poly.map((p) => [p.x / grid.cellSize - 0.5, p.y / grid.cellSize - 0.5] as const);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const y0 = Math.max(0, Math.ceil(minY));
  const y1 = Math.min(grid.size - 1, Math.floor(maxY));

  for (let cy = y0; cy <= y1; cy++) {
    const crossings: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[(i + 1) % pts.length]!;
      if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) {
        crossings.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
      }
    }
    crossings.sort((m, n) => m - n);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const xa = Math.max(0, Math.ceil(crossings[k]!));
      const xb = Math.min(grid.size - 1, Math.floor(crossings[k + 1]!));
      for (let cx = xa; cx <= xb; cx++) visit(cy * grid.size + cx);
    }
  }
}

const SHADE_CEILING = Math.log2(1 + 30);

export function shadeFor(floors: number): number {
  return clamp01(Math.log2(1 + floors) / SHADE_CEILING);
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function mix(a: number, b: number, c: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = (Math.imul(h ^ b, 0x85ebca6b) ^ (h >>> 13)) >>> 0;
  h = (Math.imul(h ^ c, 0xc2b2ae35) ^ (h >>> 16)) >>> 0;
  return h >>> 0;
}
