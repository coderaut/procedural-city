import type { Grid } from './grid';
import type { Building, GrowthStats } from './growth';
import { RESOURCE, WATER, ZONE, ZONE_NAMES, ZONE_RULES } from './kinds';
import type { ZoneKind } from './kinds';
import type { RoadNetwork } from './roads';

export type AdviceLevel = 'alert' | 'warn' | 'info' | 'good';

export interface Advisory {
  level: AdviceLevel;
  title: string;
  detail: string;
}

export interface Report {
  /** People housed by the residential buildings that exist. */
  population: number;
  /** Jobs provided by everything else. */
  jobs: number;
  /** Residents of working age looking for work. */
  workforce: number;
  unemployed: number;
  unfilledJobs: number;
  /** Growth pressure per zone, fed back into the next growth pass. */
  demand: Record<ZoneKind, number>;
  jobsByZone: Map<ZoneKind, number>;
  /** Hectares designated, per zone. */
  landByZone: Map<ZoneKind, number>;
  buildings: number;
  roadKm: number;
  strandedHa: number;
  unusableHa: number;
  floodRisk: number;
  parkHa: number;
  forestHa: number;
  waterHa: number;
  advisories: Advisory[];
}

/** Share of residents who work. */
const WORKER_SHARE = 0.52;

/** Jobs each resident eventually wants nearby, per zone. */
const JOBS_PER_RESIDENT: Partial<Record<ZoneKind, number>> = {
  [ZONE.commercial]: 0.13,
  [ZONE.office]: 0.16,
  [ZONE.industrial]: 0.11,
  [ZONE.civic]: 0.03,
  [ZONE.agriculture]: 0.02,
};

export function neutralDemand(): Record<ZoneKind, number> {
  return {
    [ZONE.none]: 0,
    [ZONE.residential]: 0.6,
    [ZONE.commercial]: 0.6,
    [ZONE.office]: 0.6,
    [ZONE.industrial]: 0.6,
    [ZONE.park]: 0,
    [ZONE.civic]: 0.6,
    [ZONE.agriculture]: 0.6,
  };
}

/**
 * Reads the city as it currently stands and works out both what it needs next
 * (the demand fed back into growth) and what to tell the planner about it.
 */
export function analyse(
  grid: Grid,
  roads: RoadNetwork,
  buildings: Building[],
  stats: GrowthStats,
): Report {
  const hectaresPerCell = (grid.cellSize * grid.cellSize) / 10_000;

  let population = 0;
  let floodRisk = 0;
  const jobsByZone = new Map<ZoneKind, number>();

  for (const b of buildings) {
    if (b.zone === ZONE.residential) {
      population += b.capacity;
    } else {
      jobsByZone.set(b.zone, (jobsByZone.get(b.zone) ?? 0) + b.capacity);
    }
    if (isFloodProne(grid, b)) floodRisk++;
  }

  const jobs = [...jobsByZone.values()].reduce((a, b) => a + b, 0);
  const workforce = population * WORKER_SHARE;
  const unemployed = Math.max(0, workforce - jobs);
  const unfilledJobs = Math.max(0, jobs - workforce);

  const landByZone = new Map<ZoneKind, number>();
  for (const [zone, cells] of stats.cellsByZone) landByZone.set(zone, cells * hectaresPerCell);

  let forestCells = 0;
  let waterCells = 0;
  for (let i = 0; i < grid.cells; i++) {
    if (grid.forest[i]! > 40) forestCells++;
    if (grid.water[i] !== WATER.none) waterCells++;
  }

  const demand = computeDemand(population, jobsByZone, jobs, workforce);

  const report: Report = {
    population: Math.round(population),
    jobs: Math.round(jobs),
    workforce: Math.round(workforce),
    unemployed: Math.round(unemployed),
    unfilledJobs: Math.round(unfilledJobs),
    demand,
    jobsByZone,
    landByZone,
    buildings: buildings.length,
    roadKm: roads.length / 1000,
    strandedHa: stats.strandedCells * hectaresPerCell,
    unusableHa: stats.unusableCells * hectaresPerCell,
    floodRisk,
    parkHa: landByZone.get(ZONE.park) ?? 0,
    forestHa: forestCells * hectaresPerCell,
    waterHa: waterCells * hectaresPerCell,
    advisories: [],
  };

  report.advisories = advise(grid, roads, buildings, stats, report);
  return report;
}

function computeDemand(
  population: number,
  jobsByZone: Map<ZoneKind, number>,
  jobs: number,
  workforce: number,
): Record<ZoneKind, number> {
  const demand = neutralDemand();

  // Housing is pulled up by jobs that nobody can fill yet.
  const targetHomes = jobs / WORKER_SHARE;
  demand[ZONE.residential] = pressure(targetHomes, population, 0.6);

  for (const zone of [ZONE.commercial, ZONE.office, ZONE.industrial, ZONE.civic, ZONE.agriculture] as const) {
    const target = population * (JOBS_PER_RESIDENT[zone] ?? 0);
    demand[zone] = pressure(target, jobsByZone.get(zone) ?? 0, 0.5);
  }

  // A city with surplus workers wants somewhere to put them.
  if (workforce > jobs * 1.1 && jobs > 0) {
    for (const zone of [ZONE.commercial, ZONE.office, ZONE.industrial] as const) {
      demand[zone] = Math.min(1.5, demand[zone] + 0.25);
    }
  }

  return demand;
}

/** Maps a shortfall against a target onto growth pressure. */
function pressure(target: number, actual: number, cold: number): number {
  if (target <= 0) return cold;
  if (actual <= 0) return 1.25;
  const ratio = (target - actual) / target;
  return clamp(0.45 + ratio * 1.1, 0.25, 1.5);
}

function advise(
  grid: Grid,
  roads: RoadNetwork,
  buildings: Building[],
  stats: GrowthStats,
  report: Report,
): Advisory[] {
  const out: Advisory[] = [];
  const zonedAnything = stats.zonedCells > 0 || stats.cellsByZone.size > 0;

  if (roads.segments.length === 0 && zonedAnything) {
    out.push({
      level: 'alert',
      title: 'No roads',
      detail: 'Nothing can be built without road frontage. Draw a street into your zoned land.',
    });
  } else if (!zonedAnything) {
    out.push({
      level: 'info',
      title: 'Nothing zoned yet',
      detail: 'Shape the land, then paint a residential area and run a street through it.',
    });
  }

  if (stats.zonedCells > 0) {
    const strandedShare = stats.strandedCells / stats.zonedCells;
    if (strandedShare > 0.12) {
      out.push({
        level: strandedShare > 0.4 ? 'warn' : 'info',
        title: `${report.strandedHa.toFixed(1)} ha stranded`,
        detail: `${Math.round(strandedShare * 100)}% of buildable zoned land is out of reach of a road. Extend streets into it.`,
      });
    }
    if (stats.unusableCells / stats.zonedCells > 0.1) {
      out.push({
        level: 'info',
        title: `${report.unusableHa.toFixed(1)} ha unusable`,
        detail: 'Zoned over water or ground too steep for its land use. Flatten it or rezone.',
      });
    }
  }

  if (report.unemployed > Math.max(40, report.population * 0.08)) {
    out.push({
      level: 'warn',
      title: `${report.unemployed.toLocaleString()} without work`,
      detail: 'Zone offices, shops or industry — or the housing you have will stay half empty.',
    });
  }

  if (report.unfilledJobs > Math.max(40, report.jobs * 0.12)) {
    out.push({
      level: 'warn',
      title: `${report.unfilledJobs.toLocaleString()} jobs unfilled`,
      detail: 'Not enough homes for the workforce these jobs need. Zone more residential.',
    });
  }

  const shops = report.jobsByZone.get(ZONE.commercial) ?? 0;
  if (report.population > 600 && shops < report.population * 0.08) {
    out.push({
      level: 'warn',
      title: 'Short of shops',
      detail: `${Math.round(report.population * 0.13 - shops).toLocaleString()} retail jobs short of what this population supports.`,
    });
  }

  const residentialHa = report.landByZone.get(ZONE.residential) ?? 0;
  if (residentialHa > 20 && report.parkHa < residentialHa * 0.06) {
    out.push({
      level: 'info',
      title: 'No green space',
      detail: 'Housing with no parks nearby. Paint park zones between the blocks.',
    });
  }

  if (report.floodRisk > 0) {
    out.push({
      level: report.floodRisk > buildings.length * 0.1 ? 'warn' : 'info',
      title: `${report.floodRisk} buildings in the flood zone`,
      detail: 'Built within 2 m of sea level next to water. Raise the ground or move the zone back.',
    });
  }

  const industrialJobs = report.jobsByZone.get(ZONE.industrial) ?? 0;
  if (industrialJobs > 0) {
    const onOre = buildings.filter((b) => b.zone === ZONE.industrial && b.onResource).length;
    const industrialCount = buildings.filter((b) => b.zone === ZONE.industrial).length;
    if (industrialCount > 4 && onOre === 0 && hasResource(grid, RESOURCE.ore)) {
      out.push({
        level: 'info',
        title: 'Industry off the ore',
        detail: 'There are ore deposits on this map. Industry sitting on them produces 40% more.',
      });
    }
  }

  if (out.length === 0) {
    out.push({
      level: 'good',
      title: 'Balanced for now',
      detail: 'Homes, jobs and access are in step. Keep extending roads to open new land.',
    });
  }

  return out;
}

function isFloodProne(grid: Grid, building: Building): boolean {
  let x = 0;
  let y = 0;
  for (const p of building.poly) {
    x += p.x;
    y += p.y;
  }
  const cx = Math.floor(x / building.poly.length / grid.cellSize);
  const cy = Math.floor(y / building.poly.length / grid.cellSize);
  if (!grid.inBounds(cx, cy)) return false;
  if (grid.heightAt(cx, cy) > 2) return false;

  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (grid.waterAt(cx + dx, cy + dy) !== WATER.none) return true;
    }
  }
  return false;
}

function hasResource(grid: Grid, kind: number): boolean {
  for (let i = 0; i < grid.cells; i++) {
    if (grid.resource[i] === kind) return true;
  }
  return false;
}

/** Zone rows for the demand bars, in panel order. */
export const DEMAND_ZONES: ZoneKind[] = [
  ZONE.residential,
  ZONE.commercial,
  ZONE.office,
  ZONE.industrial,
  ZONE.civic,
  ZONE.agriculture,
];

export function zoneLabel(zone: ZoneKind): string {
  return ZONE_NAMES[zone];
}

export function zoneProvides(zone: ZoneKind): 'homes' | 'jobs' | 'none' {
  return ZONE_RULES[zone]?.provides ?? 'none';
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}
