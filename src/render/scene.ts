import type { Polygon } from '../world/geom';
import type { Rect } from '../world/grid';
import { unionRect } from '../world/grid';
import { ROAD_WIDTH } from '../world/kinds';
import type { World } from '../world/world';
import type { Camera } from './camera';
import { DEFAULT_TERRAIN_OPTIONS, DEFAULT_ZONE_OPTIONS, paintTerrain, paintZones } from './layers';
import type { TerrainOptions, ZoneOptions } from './layers';
import { buildingCss, PALETTE } from './palette';

export interface ViewOptions {
  terrain: TerrainOptions;
  zones: ZoneOptions;
  showTerrain: boolean;
  showZones: boolean;
  showRoads: boolean;
  showBuildings: boolean;
  showGrid: boolean;
}

export function defaultView(): ViewOptions {
  return {
    terrain: { ...DEFAULT_TERRAIN_OPTIONS },
    zones: { ...DEFAULT_ZONE_OPTIONS },
    showTerrain: true,
    showZones: true,
    showRoads: true,
    showBuildings: true,
    showGrid: false,
  };
}

const SHADE_BUCKETS = 12;

/**
 * Composites the map: two cell-resolution bitmaps (terrain, zones) blitted under
 * the camera transform, then roads and buildings as vector paths on top.
 *
 * The bitmaps are only repainted over the rectangle an edit dirtied, and building
 * paths are cached until the building list is replaced, so dragging a brush over a
 * large map stays responsive.
 */
export class Scene {
  private terrainCanvas: HTMLCanvasElement;
  private terrainCtx: CanvasRenderingContext2D;
  private terrainData: ImageData;

  private zoneCanvas: HTMLCanvasElement;
  private zoneCtx: CanvasRenderingContext2D;
  private zoneData: ImageData;

  private terrainDirty: Rect | null = null;
  private zonesDirty: Rect | null = null;

  private buildingPaths: Map<number, Path2D> | null = null;
  private buildingSource: unknown = null;

  private size: number;

  constructor(private world: World) {
    this.size = world.grid.size;
    const terrain = makeLayerCanvas(this.size);
    this.terrainCanvas = terrain.canvas;
    this.terrainCtx = terrain.ctx;
    this.terrainData = terrain.ctx.createImageData(this.size, this.size);

    const zones = makeLayerCanvas(this.size);
    this.zoneCanvas = zones.canvas;
    this.zoneCtx = zones.ctx;
    this.zoneData = zones.ctx.createImageData(this.size, this.size);

    this.invalidateAll();
  }

  /** Swaps in a different world (new map, or a loaded file). */
  setWorld(world: World): void {
    this.world = world;
    if (world.grid.size !== this.size) {
      this.size = world.grid.size;
      const terrain = makeLayerCanvas(this.size);
      this.terrainCanvas = terrain.canvas;
      this.terrainCtx = terrain.ctx;
      this.terrainData = terrain.ctx.createImageData(this.size, this.size);
      const zones = makeLayerCanvas(this.size);
      this.zoneCanvas = zones.canvas;
      this.zoneCtx = zones.ctx;
      this.zoneData = zones.ctx.createImageData(this.size, this.size);
    }
    this.buildingSource = null;
    this.invalidateAll();
  }

  invalidateAll(): void {
    const full = this.world.grid.fullRect();
    this.terrainDirty = full;
    this.zonesDirty = { ...full };
  }

  invalidateTerrain(rect: Rect): void {
    this.terrainDirty = unionRect(this.terrainDirty, rect);
  }

  invalidateZones(rect: Rect): void {
    this.zonesDirty = unionRect(this.zonesDirty, rect);
  }

  /** Repaints whichever bitmap regions are stale. */
  private flush(view: ViewOptions): void {
    if (this.terrainDirty) {
      const area = this.world.grid.clipRect(this.terrainDirty);
      if (area) {
        paintTerrain(this.world.grid, this.terrainData.data, view.terrain, area);
        this.terrainCtx.putImageData(
          this.terrainData,
          0,
          0,
          area.x0,
          area.y0,
          area.x1 - area.x0 + 1,
          area.y1 - area.y0 + 1,
        );
      }
      this.terrainDirty = null;
    }

    if (this.zonesDirty) {
      const area = this.world.grid.clipRect(this.zonesDirty);
      if (area) {
        paintZones(this.world.grid, this.zoneData.data, view.zones, area);
        this.zoneCtx.putImageData(
          this.zoneData,
          0,
          0,
          area.x0,
          area.y0,
          area.x1 - area.x0 + 1,
          area.y1 - area.y0 + 1,
        );
      }
      this.zonesDirty = null;
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    view: ViewOptions,
    viewW: number,
    viewH: number,
    dpr: number,
    overlay?: (ctx: CanvasRenderingContext2D) => void,
  ): void {
    this.flush(view);
    const grid = this.world.grid;
    const metres = grid.metres;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10120f';
    ctx.fillRect(0, 0, viewW * dpr, viewH * dpr);

    camera.apply(ctx, viewW, viewH, dpr);

    const pixelsPerCell = camera.zoom * grid.cellSize * dpr;
    ctx.imageSmoothingEnabled = pixelsPerCell < 2.5;

    if (view.showTerrain) {
      ctx.drawImage(this.terrainCanvas, 0, 0, metres, metres);
    } else {
      ctx.fillStyle = '#c7ccb8';
      ctx.fillRect(0, 0, metres, metres);
    }

    if (view.showZones) {
      ctx.drawImage(this.zoneCanvas, 0, 0, metres, metres);
    }

    ctx.imageSmoothingEnabled = true;

    if (view.showGrid && camera.zoom * grid.cellSize > 4) {
      this.drawCellGrid(ctx, camera);
    }

    if (view.showRoads) this.drawRoads(ctx, camera);
    if (view.showBuildings) this.drawBuildings(ctx, camera);

    // World border, so the edge of the map is unambiguous.
    ctx.strokeStyle = 'rgba(20, 22, 18, 0.5)';
    ctx.lineWidth = 2 / camera.zoom;
    ctx.strokeRect(0, 0, metres, metres);

    if (overlay) overlay(ctx);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawCellGrid(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const grid = this.world.grid;
    const step = grid.cellSize * (camera.zoom * grid.cellSize > 14 ? 1 : 8);
    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1 / camera.zoom;
    ctx.beginPath();
    for (let m = 0; m <= grid.metres; m += step) {
      ctx.moveTo(m, 0);
      ctx.lineTo(m, grid.metres);
      ctx.moveTo(0, m);
      ctx.lineTo(grid.metres, m);
    }
    ctx.stroke();
  }

  private drawRoads(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const roads = this.world.roads;
    if (roads.segments.length === 0) return;

    // Casing first so junctions read as one continuous surface.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = PALETTE.roadCasing;
    for (const segment of roads.segments) {
      ctx.lineWidth = ROAD_WIDTH[segment.cls] + Math.max(1.5, 2 / camera.zoom);
      strokePath(ctx, segment.points);
    }
    for (const segment of roads.segments) {
      ctx.strokeStyle = PALETTE.roadFill[segment.cls];
      ctx.lineWidth = ROAD_WIDTH[segment.cls];
      strokePath(ctx, segment.points);
    }

    // Centre line on the bigger roads, once it would be visible.
    if (camera.zoom > 0.35) {
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = 'rgba(120, 116, 104, 0.6)';
      for (const segment of roads.segments) {
        if (ROAD_WIDTH[segment.cls] < 18) continue;
        ctx.lineWidth = 0.5;
        strokePath(ctx, segment.points);
      }
      ctx.setLineDash([]);
    }
  }

  private drawBuildings(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const buildings = this.world.buildings;
    if (buildings.length === 0) return;

    if (this.buildingSource !== buildings || !this.buildingPaths) {
      const paths = new Map<number, Path2D>();
      for (const b of buildings) {
        const bucket = Math.round(b.shade * SHADE_BUCKETS);
        let path = paths.get(bucket);
        if (!path) {
          path = new Path2D();
          paths.set(bucket, path);
        }
        trace(path, b.poly);
      }
      this.buildingPaths = paths;
      this.buildingSource = buildings;
    }

    for (const [bucket, path] of this.buildingPaths) {
      ctx.fillStyle = buildingCss(bucket / SHADE_BUCKETS);
      ctx.fill(path);
    }

    if (camera.zoom > 0.5) {
      ctx.strokeStyle = PALETTE.buildingOutline;
      ctx.lineWidth = 1 / camera.zoom;
      for (const path of this.buildingPaths.values()) ctx.stroke(path);
    }
  }
}

function makeLayerCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  return { canvas, ctx };
}

function strokePath(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[]): void {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
  ctx.stroke();
}

function trace(path: Path2D, poly: Polygon): void {
  if (poly.length < 3) return;
  path.moveTo(poly[0]!.x, poly[0]!.y);
  for (let i = 1; i < poly.length; i++) path.lineTo(poly[i]!.x, poly[i]!.y);
  path.closePath();
}

/** Preview outline for a road being drawn, used by the overlay. */
export function previewRoad(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], cls: number): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = ROAD_WIDTH[cls as keyof typeof ROAD_WIDTH] ?? 10;
  strokePath(ctx, points);
  ctx.restore();
}

