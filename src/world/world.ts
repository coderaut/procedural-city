import { analyse, neutralDemand } from './advisor';
import type { Report } from './advisor';
import { base64ToHeight, base64ToUint8, heightToBase64, uint8ToBase64 } from './codec';
import { Grid } from './grid';
import type { Rect } from './grid';
import { History } from './edit';
import type { Patch } from './edit';
import { applyPatch } from './edit';
import { v } from './geom';
import { growCity } from './growth';
import type { Building } from './growth';
import type { RoadClass } from './kinds';
import { RoadNetwork } from './roads';
import type { RoadSegment } from './roads';

export const DEFAULT_SIZE = 512;
export const DEFAULT_CELL_SIZE = 8;

export interface WorldOptions {
  /** Cells per side. */
  size?: number;
  /** Metres per cell. */
  cellSize?: number;
  seed?: number;
  name?: string;
}

export interface WorldFile {
  version: 1;
  name: string;
  seed: number;
  size: number;
  cellSize: number;
  layers: {
    height: string;
    water: string;
    forest: string;
    resource: string;
    zone: string;
  };
  roads: { id: number; cls: RoadClass; points: [number, number][] }[];
}

/**
 * Everything that makes up one map: the cell layers, the road network, the
 * buildings that grew out of them, and the planner's report.
 *
 * `recompute()` is the whole simulation. It runs growth twice — once at neutral
 * demand to find out what the city can support, then again under the demand that
 * implies — so buildings reflect what the city actually needs. Both passes are
 * deterministic, so recomputing after an edit leaves untouched areas identical.
 */
export class World {
  readonly grid: Grid;
  readonly roads = new RoadNetwork();
  readonly history = new History();

  name: string;
  seed: number;
  buildings: Building[] = [];
  report: Report;

  constructor(options: WorldOptions = {}) {
    this.grid = new Grid(options.size ?? DEFAULT_SIZE, options.cellSize ?? DEFAULT_CELL_SIZE);
    this.seed = options.seed ?? 1;
    this.name = options.name ?? 'Untitled';
    this.report = analyse(this.grid, this.roads, [], {
      zonedCells: 0,
      strandedCells: 0,
      unusableCells: 0,
      cellsByZone: new Map(),
    });
  }

  get metres(): number {
    return this.grid.metres;
  }

  recompute(): void {
    const probe = growCity(this.grid, this.roads, neutralDemand(), this.seed);
    const probeReport = analyse(this.grid, this.roads, probe.buildings, probe.stats);

    const final = growCity(this.grid, this.roads, probeReport.demand, this.seed);
    this.buildings = final.buildings;
    this.report = analyse(this.grid, this.roads, final.buildings, final.stats);

    // Report the pressure that built this city, not the pressure its existence
    // creates. Recomputing demand from the finished city would show the opposite
    // of what is on the map -- "no housing demand" beside freshly built housing.
    this.report.demand = probeReport.demand;
  }

  /** Records a road change so it can be undone alongside cell edits. */
  pushRoadChange(before: RoadSegment[], label: string): void {
    this.history.push({
      kind: 'roads',
      before,
      after: this.roads.snapshot(),
      rect: this.grid.fullRect(),
      label,
    });
  }

  undo(): Rect | null {
    return this.step(this.history.undo(), 'undo');
  }

  redo(): Rect | null {
    return this.step(this.history.redo(), 'redo');
  }

  private step(patch: Patch | null, direction: 'undo' | 'redo'): Rect | null {
    if (!patch) return null;
    if (patch.kind === 'roads') {
      this.roads.restore(direction === 'undo' ? patch.before : patch.after);
    } else {
      applyPatch(this.grid, patch, direction);
    }
    this.recompute();
    return patch.rect;
  }

  toJSON(): WorldFile {
    return {
      version: 1,
      name: this.name,
      seed: this.seed,
      size: this.grid.size,
      cellSize: this.grid.cellSize,
      layers: {
        height: heightToBase64(this.grid.height),
        water: uint8ToBase64(this.grid.water),
        forest: uint8ToBase64(this.grid.forest),
        resource: uint8ToBase64(this.grid.resource),
        zone: uint8ToBase64(this.grid.zone),
      },
      roads: this.roads.segments.map((s) => ({
        id: s.id,
        cls: s.cls,
        points: s.points.map((p) => [round(p.x), round(p.y)] as [number, number]),
      })),
    };
  }

  static fromJSON(data: WorldFile): World {
    const world = new World({
      size: data.size,
      cellSize: data.cellSize,
      seed: data.seed,
      name: data.name,
    });
    const cells = world.grid.cells;
    world.grid.height.set(base64ToHeight(data.layers.height, cells));
    world.grid.water.set(base64ToUint8(data.layers.water, cells));
    world.grid.forest.set(base64ToUint8(data.layers.forest, cells));
    world.grid.resource.set(base64ToUint8(data.layers.resource, cells));
    world.grid.zone.set(base64ToUint8(data.layers.zone, cells));
    world.roads.restore(
      data.roads.map((s) => ({
        id: s.id,
        cls: s.cls,
        points: s.points.map(([x, y]) => v(x, y)),
      })),
    );
    world.recompute();
    return world;
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
