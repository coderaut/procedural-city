import { fillPolygon, stampCircle } from '../world/brush';
import type { StampSettings } from '../world/brush';
import { Edit } from '../world/edit';
import { dist, v } from '../world/geom';
import type { Vec2 } from '../world/geom';
import type { Rect } from '../world/grid';
import { rectAround, unionRect } from '../world/grid';
import { ROAD_NAMES, RESOURCE_NAMES, WATER_NAMES, ZONE_NAMES } from '../world/kinds';
import type { ResourceKind, RoadClass, WaterKind, ZoneKind } from '../world/kinds';
import type { World } from '../world/world';
import { opFor, TOOL_BY_ID, TOOLS } from './tools';
import type { Tool } from './tools';

export type ShapeMode = 'brush' | 'pen';

export interface CellInfo {
  cx: number;
  cy: number;
  height: number;
  slopePercent: number;
  water: string;
  zone: string;
  resource: string;
  forest: number;
  road: string;
  building: { zone: string; floors: number; capacity: number } | null;
}

export interface EditorHooks {
  terrainDirty(rect: Rect): void;
  zonesDirty(rect: Rect): void;
  /** The world's structure changed; buildings and the report need rebuilding. */
  recompute(): void;
  inspect(info: CellInfo | null): void;
  status(message: string): void;
  draw(): void;
}

/**
 * Turns pointer input into world edits. Owns the in-progress stroke, the pen
 * polygon and the road being drawn; everything it changes goes through an `Edit`
 * so it lands on the undo stack as one step.
 */
export class Editor {
  tool: Tool = TOOLS[0]!;
  shapeMode: ShapeMode = 'brush';
  brush: StampSettings = { radius: 48, strength: 0.6, hardness: 0.45 };
  modifiers = { shift: false, alt: false };

  /** Pen vertices (world metres) while a polygon is open. */
  pen: Vec2[] = [];
  /** Freehand road being drawn. */
  road: Vec2[] = [];
  cursor: Vec2 | null = null;

  private edit: Edit | null = null;
  private strokeDirty: Rect | null = null;
  private lastPoint: Vec2 | null = null;
  private anchor = 0;
  private painting = false;
  private erasingRoads = false;
  private roadsBefore: ReturnType<World['roads']['snapshot']> | null = null;

  constructor(
    private world: World,
    private hooks: EditorHooks,
  ) {}

  setWorld(world: World): void {
    this.world = world;
    this.cancel();
  }

  setTool(id: string): void {
    const tool = TOOL_BY_ID.get(id);
    if (!tool) return;
    if (tool !== this.tool) this.cancel();
    this.tool = tool;
    if (!tool.shapeable) this.shapeMode = 'brush';
    this.hooks.status(tool.hint);
  }

  get canUsePen(): boolean {
    return this.tool.shapeable === true;
  }

  /** True while an action is mid-flight, so the canvas can show a preview. */
  get busy(): boolean {
    return this.painting || this.pen.length > 0 || this.road.length > 0;
  }

  pointerDown(at: Vec2): void {
    const tool = this.tool;

    if (tool.kind === 'inspect') {
      this.hooks.inspect(this.probe(at));
      return;
    }

    if (tool.kind === 'road') {
      this.road = [at];
      this.hooks.draw();
      return;
    }

    if (tool.kind === 'road-erase') {
      this.erasingRoads = true;
      this.roadsBefore = this.world.roads.snapshot();
      this.eraseRoadsAt(at);
      return;
    }

    if (this.shapeMode === 'pen') {
      this.addPenPoint(at);
      return;
    }

    this.beginStroke(at);
  }

  pointerMove(at: Vec2): void {
    this.cursor = at;

    if (this.road.length > 0) {
      const last = this.road[this.road.length - 1]!;
      if (this.modifiers.shift) {
        this.road = [this.road[0]!, at];
      } else if (dist(last, at) > this.world.grid.cellSize * 0.8) {
        this.road.push(at);
      }
      this.hooks.draw();
      return;
    }

    if (this.erasingRoads) {
      this.eraseRoadsAt(at);
      return;
    }

    if (this.painting) {
      this.continueStroke(at);
      return;
    }

    if (this.pen.length > 0) this.hooks.draw();
  }

  pointerUp(): void {
    if (this.road.length > 0) {
      this.commitRoad();
      return;
    }

    if (this.erasingRoads) {
      this.erasingRoads = false;
      if (this.roadsBefore) {
        this.world.pushRoadChange(this.roadsBefore, 'Remove roads');
        this.roadsBefore = null;
        this.hooks.recompute();
      }
      return;
    }

    if (this.painting) this.endStroke();
  }

  /** Esc, or switching tools: throw away anything half-finished. */
  cancel(): void {
    if (this.painting) this.endStroke();
    this.pen = [];
    this.road = [];
    this.erasingRoads = false;
    this.roadsBefore = null;
    this.hooks.draw();
  }

  /* ---- painting --------------------------------------------------------- */

  private beginStroke(at: Vec2): void {
    const tool = this.tool;
    if (!tool.layer || !tool.op) return;
    const grid = this.world.grid;

    this.edit = new Edit(grid, tool.layer);
    this.painting = true;
    this.strokeDirty = null;
    this.lastPoint = at;
    this.anchor = grid.heightAt(
      Math.floor(at.x / grid.cellSize),
      Math.floor(at.y / grid.cellSize),
    );
    this.dab(at);
  }

  private continueStroke(at: Vec2): void {
    if (!this.painting || !this.lastPoint) return;
    // Interpolate so a fast drag paints a continuous band, not a dotted line.
    const step = Math.max(this.world.grid.cellSize * 0.6, this.brush.radius * 0.3);
    const span = dist(this.lastPoint, at);
    const steps = Math.max(1, Math.ceil(span / step));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.dab(v(
        this.lastPoint.x + (at.x - this.lastPoint.x) * t,
        this.lastPoint.y + (at.y - this.lastPoint.y) * t,
      ));
    }
    this.lastPoint = at;
  }

  private dab(at: Vec2): void {
    const tool = this.tool;
    const op = opFor(tool);
    if (!this.edit || !op) return;
    const grid = this.world.grid;

    stampCircle(this.edit, grid, at.x, at.y, this.brush, op, tool.value ?? 0, this.anchor);

    const radiusCells = this.brush.radius / grid.cellSize + 2;
    const rect = rectAround(at.x / grid.cellSize, at.y / grid.cellSize, radiusCells);
    this.strokeDirty = unionRect(this.strokeDirty, rect);
    this.markDirty(rect);
    this.hooks.draw();
  }

  private endStroke(): void {
    this.painting = false;
    this.lastPoint = null;
    const edit = this.edit;
    this.edit = null;
    if (!edit) return;

    const patch = edit.commit(`${this.tool.label} (brush)`);
    if (patch) {
      this.world.history.push(patch);
      this.hooks.recompute();
    }
  }

  /* ---- pen ------------------------------------------------------------- */

  private addPenPoint(at: Vec2): void {
    // Clicking near the first vertex closes the shape.
    if (this.pen.length > 2 && dist(at, this.pen[0]!) < this.brush.radius * 0.5) {
      this.closePen();
      return;
    }
    this.pen.push(at);
    this.hooks.status(
      `${this.pen.length} point${this.pen.length === 1 ? '' : 's'} — double-click or Enter to fill, Esc to cancel`,
    );
    this.hooks.draw();
  }

  /** Fills the open polygon with the current tool. */
  closePen(): void {
    const tool = this.tool;
    const op = opFor(tool);
    if (this.pen.length < 3 || !tool.layer || !op) {
      this.pen = [];
      this.hooks.draw();
      return;
    }

    const grid = this.world.grid;
    const edit = new Edit(grid, tool.layer);
    fillPolygon(edit, grid, this.pen, this.brush, op, tool.value ?? 0, 0);

    let rect: Rect | null = null;
    for (const p of this.pen) {
      rect = unionRect(rect, rectAround(p.x / grid.cellSize, p.y / grid.cellSize, 2));
    }

    this.pen = [];
    const patch = edit.commit(`${tool.label} (region)`);
    if (patch) {
      this.world.history.push(patch);
      if (rect) this.markDirty(rect);
      this.hooks.recompute();
    }
    this.hooks.draw();
  }

  /* ---- roads ----------------------------------------------------------- */

  private commitRoad(): void {
    const points = this.road;
    this.road = [];
    const cls = this.tool.roadClass;
    if (!cls || points.length < 2) {
      this.hooks.draw();
      return;
    }

    const before = this.world.roads.snapshot();
    const added = this.world.roads.add(points, cls, this.world.grid.cellSize);
    if (!added) {
      this.hooks.status('Too short to be a road — drag further.');
      this.hooks.draw();
      return;
    }
    this.world.pushRoadChange(before, `Draw ${ROAD_NAMES[cls]}`);
    this.hooks.recompute();
  }

  private eraseRoadsAt(at: Vec2): void {
    const removed = this.world.roads.removeNear(at, this.brush.radius * 0.4);
    if (removed > 0) this.hooks.draw();
  }

  /* ---- helpers --------------------------------------------------------- */

  private markDirty(rect: Rect): void {
    if (this.tool.layer === 'zone') this.hooks.zonesDirty(rect);
    else this.hooks.terrainDirty(rect);
  }

  private probe(at: Vec2): CellInfo | null {
    const grid = this.world.grid;
    const cx = Math.floor(at.x / grid.cellSize);
    const cy = Math.floor(at.y / grid.cellSize);
    if (!grid.inBounds(cx, cy)) return null;
    const i = cy * grid.size + cx;

    let building: CellInfo['building'] = null;
    for (const b of this.world.buildings) {
      if (pointInPolygon(at, b.poly)) {
        building = {
          zone: ZONE_NAMES[b.zone],
          floors: b.floors,
          capacity: Math.round(b.capacity),
        };
        break;
      }
    }

    return {
      cx,
      cy,
      height: grid.height[i]!,
      slopePercent: grid.slopeAt(cx, cy) * 100,
      water: WATER_NAMES[grid.water[i] as WaterKind],
      zone: ZONE_NAMES[grid.zone[i] as ZoneKind],
      resource: RESOURCE_NAMES[grid.resource[i] as ResourceKind],
      forest: Math.round((grid.forest[i]! / 255) * 100),
      road: ROAD_NAMES[grid.road[i] as RoadClass],
      building,
    };
  }
}

function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
