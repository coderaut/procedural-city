import { area, centroid, distToPolyline, inset } from './geom';
import type { Polygon } from './geom';
import { makeLayout } from './layout';
import { buildingsFor } from './lots';
import { Rng } from './rng';
import type { Block, City, CityParams, CityStats, Zone } from './types';
import { makeBridges, makeRiver, riverBand } from './water';
import { pickZone } from './zoning';

/**
 * The whole pipeline: layout cells -> water -> zoning -> blocks -> lots -> buildings.
 * Pure and deterministic; the renderer only reads what comes back.
 */
export function generateCity(params: CityParams): City {
  const rng = new Rng(params.seed);
  const { cells, land, center } = makeLayout(params, rng);

  const river = params.river ? makeRiver(params.size, rng) : null;
  const riverPoly = river ? riverBand(river, params.riverWidth) : null;
  const bridges = river
    ? makeBridges(river, params.riverWidth, params.streetWidth * 1.6, rng.int(2, 4), rng)
    : [];

  const bank = params.riverWidth / 2 + params.streetWidth * 0.75;
  const blocks: Block[] = [];

  for (const cell of cells) {
    if (cell.length < 3 || area(cell) < 120) continue;
    const at = centroid(cell);
    if (river && distToPolyline(at, river) < bank) continue;

    const poly = inset(cell, params.streetWidth / 2);
    if (poly.length < 3 || area(poly) < 60) continue;

    const zone: Zone = isCenterCell(cell, params) ? 'plaza' : pickZone(at, center, params, rng);
    blocks.push({ poly, zone, buildings: buildingsFor(poly, zone, params, rng) });
  }

  return { params, size: params.size, land, blocks, river, riverPoly, bridges, stats: summarise(blocks) };
}

/** The radial layout's innermost disc becomes a plaza rather than a tower block. */
function isCenterCell(cell: Polygon, params: CityParams): boolean {
  return params.layout === 'radial' && cell.length > 12 && area(cell) < Math.pow(params.blockSize, 2) * 1.2;
}

function summarise(blocks: Block[]): CityStats {
  let built = 0;
  let parks = 0;
  let buildings = 0;
  let people = 0;
  let footprint = 0;

  for (const block of blocks) {
    footprint += area(block.poly);
    if (block.zone === 'park' || block.zone === 'plaza') parks++;
    else built++;
    for (const b of block.buildings) {
      buildings++;
      const floorArea = area(b.poly) * b.floors;
      if (b.zone === 'residential') people += floorArea / 42;
      else if (b.zone === 'downtown') people += (floorArea * 0.3) / 48;
      else if (b.zone === 'commercial') people += (floorArea * 0.15) / 48;
    }
  }

  return {
    areaKm2: footprint / 1_000_000,
    blocks: built + parks,
    buildings,
    parks,
    population: Math.round(people),
  };
}
