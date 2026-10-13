import type { Polygon, Vec2 } from './geom';

export type LayoutKind = 'grid' | 'radial' | 'organic';

export type Zone = 'downtown' | 'commercial' | 'residential' | 'industrial' | 'park' | 'plaza';

/** Everything the user can dial in. Same params + same seed => same city. */
export interface CityParams {
  seed: string;
  layout: LayoutKind;
  /** Map edge length, in metres. */
  size: number;
  /** Target city-block edge, in metres. */
  blockSize: number;
  /** Street corridor width, in metres. */
  streetWidth: number;
  /** 0 = sprawl, 1 = packed. Drives lot size, setbacks and storeys. */
  density: number;
  /** Share of blocks turned into green space. */
  parkRatio: number;
  /** 0 = ruler-straight, 1 = wonky. */
  irregularity: number;
  river: boolean;
  riverWidth: number;
}

export interface Building {
  poly: Polygon;
  zone: Zone;
  floors: number;
  /** 0..1 height-ish value, used for fill shading. */
  shade: number;
}

export interface Block {
  poly: Polygon;
  zone: Zone;
  buildings: Building[];
}

export interface CityStats {
  areaKm2: number;
  blocks: number;
  buildings: number;
  parks: number;
  population: number;
}

export interface City {
  params: CityParams;
  size: number;
  /** Developed land footprint; the road colour is painted through it. */
  land: Polygon;
  blocks: Block[];
  river: Vec2[] | null;
  riverPoly: Polygon | null;
  bridges: Polygon[];
  stats: CityStats;
}

export const DEFAULT_PARAMS: CityParams = {
  seed: 'ASTORIA',
  layout: 'grid',
  size: 2400,
  blockSize: 150,
  streetWidth: 16,
  density: 0.55,
  parkRatio: 0.08,
  irregularity: 0.35,
  river: true,
  riverWidth: 90,
};
