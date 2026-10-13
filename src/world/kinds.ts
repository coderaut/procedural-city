/**
 * Cell-layer vocabularies. Kept in one dependency-free module so the world,
 * renderer and tools can all name the same things without import cycles.
 */

export const WATER = { none: 0, sea: 1, lake: 2, river: 3 } as const;
export type WaterKind = (typeof WATER)[keyof typeof WATER];

export const RESOURCE = { none: 0, ore: 1, fertile: 2, stone: 3, oil: 4 } as const;
export type ResourceKind = (typeof RESOURCE)[keyof typeof RESOURCE];

export const ZONE = {
  none: 0,
  residential: 1,
  commercial: 2,
  office: 3,
  industrial: 4,
  park: 5,
  civic: 6,
  agriculture: 7,
} as const;
export type ZoneKind = (typeof ZONE)[keyof typeof ZONE];

export const ROAD = { none: 0, street: 1, avenue: 2, highway: 3 } as const;
export type RoadClass = (typeof ROAD)[keyof typeof ROAD];

export const ZONE_NAMES: Record<ZoneKind, string> = {
  [ZONE.none]: 'Unzoned',
  [ZONE.residential]: 'Residential',
  [ZONE.commercial]: 'Commercial',
  [ZONE.office]: 'Office',
  [ZONE.industrial]: 'Industrial',
  [ZONE.park]: 'Park',
  [ZONE.civic]: 'Civic',
  [ZONE.agriculture]: 'Agriculture',
};

export const RESOURCE_NAMES: Record<ResourceKind, string> = {
  [RESOURCE.none]: 'None',
  [RESOURCE.ore]: 'Ore',
  [RESOURCE.fertile]: 'Fertile soil',
  [RESOURCE.stone]: 'Stone',
  [RESOURCE.oil]: 'Oil',
};

export const WATER_NAMES: Record<WaterKind, string> = {
  [WATER.none]: 'Dry',
  [WATER.sea]: 'Sea',
  [WATER.lake]: 'Lake',
  [WATER.river]: 'River',
};

export const ROAD_NAMES: Record<RoadClass, string> = {
  [ROAD.none]: 'None',
  [ROAD.street]: 'Street',
  [ROAD.avenue]: 'Avenue',
  [ROAD.highway]: 'Highway',
};

/** Carriageway width in metres, per class. */
export const ROAD_WIDTH: Record<RoadClass, number> = {
  [ROAD.none]: 0,
  [ROAD.street]: 10,
  [ROAD.avenue]: 20,
  [ROAD.highway]: 32,
};

/** Highways carry traffic but nothing fronts onto them. */
export const ROAD_FRONTAGE: Record<RoadClass, boolean> = {
  [ROAD.none]: false,
  [ROAD.street]: true,
  [ROAD.avenue]: true,
  [ROAD.highway]: false,
};

export interface ZoneRule {
  /** Lot frontage along the road, in metres. */
  lotWidth: number;
  /** How deep the lot runs back from the road, in metres. */
  lotDepth: number;
  /** Gap between lot edge and building wall, in metres. */
  setback: number;
  /** Storeys at neutral demand, and the ceiling demand can push them to. */
  floors: [number, number];
  /** Floor area per resident, or per job, in square metres. */
  areaPer: number;
  /** What the zone produces: homes or jobs. */
  provides: 'homes' | 'jobs' | 'none';
  /** Maximum ground slope it will build on, as a gradient (rise/run). */
  maxSlope: number;
  /** Resource that makes this zone more productive on the spot. */
  wants?: ResourceKind;
}

export const ZONE_RULES: Record<ZoneKind, ZoneRule | null> = {
  [ZONE.none]: null,
  [ZONE.residential]: {
    lotWidth: 22,
    lotDepth: 34,
    setback: 3,
    floors: [1, 6],
    areaPer: 45,
    provides: 'homes',
    maxSlope: 0.3,
  },
  [ZONE.commercial]: {
    lotWidth: 28,
    lotDepth: 40,
    setback: 2,
    floors: [1, 8],
    areaPer: 40,
    provides: 'jobs',
    maxSlope: 0.22,
  },
  [ZONE.office]: {
    lotWidth: 38,
    lotDepth: 48,
    setback: 2.5,
    floors: [3, 30],
    areaPer: 30,
    provides: 'jobs',
    maxSlope: 0.18,
  },
  [ZONE.industrial]: {
    lotWidth: 60,
    lotDepth: 70,
    setback: 6,
    floors: [1, 3],
    areaPer: 90,
    provides: 'jobs',
    maxSlope: 0.12,
    wants: RESOURCE.ore,
  },
  [ZONE.park]: null,
  [ZONE.civic]: {
    lotWidth: 46,
    lotDepth: 52,
    setback: 8,
    floors: [1, 4],
    areaPer: 60,
    provides: 'jobs',
    maxSlope: 0.2,
  },
  [ZONE.agriculture]: {
    lotWidth: 90,
    lotDepth: 110,
    setback: 14,
    floors: [1, 1],
    areaPer: 140,
    provides: 'jobs',
    maxSlope: 0.14,
    wants: RESOURCE.fertile,
  },
};

/** Zones that are land use without buildings. */
export function isOpenZone(zone: ZoneKind): boolean {
  return zone === ZONE.park;
}
