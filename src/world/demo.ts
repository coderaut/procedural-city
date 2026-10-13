import { OPS, stampCircle, fillPolygon } from './brush';
import type { StampOp, StampSettings } from './brush';
import { Edit } from './edit';
import { v } from './geom';
import type { Polygon, Vec2 } from './geom';
import type { LayerName } from './grid';
import { RESOURCE, ROAD, WATER, ZONE } from './kinds';
import { Rng } from './rng';
import { World } from './world';

/**
 * Builds a worked example: a coastal plain with a river, a wooded ridge, ore in
 * the hills, a road network and zoned districts. Used by the Example button, and
 * by scripts/preview.mjs as a fixture for rendering the map without a browser.
 *
 * It only calls the same brush, road and zone operations the tools use, so if the
 * example looks right, the editing paths underneath it work.
 */
export function buildDemoWorld(): World {
  const world = new World({ seed: 20_251_013, name: 'Kestrel Bay' });
  const grid = world.grid;
  const rng = new Rng('kestrel');
  const metres = grid.metres;

  // Gently rolling base land.
  grid.height.fill(5);
  for (let i = 0; i < 70; i++) {
    const x = rng.range(0, metres);
    const y = rng.range(0, metres);
    paint(world, 'height', OPS.raise, x, y, rng.range(200, 560), rng.range(0.2, 0.7));
  }

  // A ridge along the north-east, high enough to push the city away from it.
  const ridge = ridgeLine(metres, rng);
  for (const p of ridge) {
    for (let pass = 0; pass < 7; pass++) {
      paint(world, 'height', OPS.raise, p.x, p.y, rng.range(260, 420), 1);
    }
  }
  for (const p of ridge) {
    paint(world, 'height', OPS.smooth, p.x, p.y, 520, 0.8);
  }

  // Sea along the south edge, with a wavy shoreline and depth offshore.
  const shore = (x: number): number => metres * 0.82 + Math.sin(x / 420) * metres * 0.045;
  for (let cy = 0; cy < grid.size; cy++) {
    for (let cx = 0; cx < grid.size; cx++) {
      const x = cx * grid.cellSize;
      const y = cy * grid.cellSize;
      const line = shore(x);
      if (y <= line) continue;
      const i = cy * grid.size + cx;
      grid.water[i] = WATER.sea;
      grid.height[i] = -Math.min(34, (y - line) / 14);
    }
  }

  // River from the ridge down to the sea. Dabs are interpolated along the course,
  // otherwise a brush narrower than the vertex spacing leaves a dotted line.
  const river = riverCourse(metres, rng);
  for (let i = 0; i < river.length - 1; i++) {
    const a = river[i]!;
    const b = river[i + 1]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 18));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      paint(world, 'water', OPS.setWater, x, y, 38, 1, WATER.river);
      paint(world, 'height', OPS.lower, x, y, 80, 0.12);
    }
  }

  // Woodland on the slopes, and a patch inland.
  for (const p of ridge) {
    paint(world, 'forest', OPS.addForest, p.x + rng.range(-260, 260), p.y + rng.range(120, 460), 300, 1);
  }
  for (let i = 0; i < 16; i++) {
    paint(world, 'forest', OPS.addForest, rng.range(0, metres * 0.4), rng.range(0, metres * 0.45), rng.range(140, 300), 0.9);
  }

  // Deposits: ore in the hills, fertile ground on the river plain.
  paint(world, 'resource', OPS.setResource, metres * 0.78, metres * 0.3, 300, 1, RESOURCE.ore);
  paint(world, 'resource', OPS.setResource, metres * 0.68, metres * 0.17, 230, 1, RESOURCE.ore);
  paint(world, 'resource', OPS.setResource, metres * 0.2, metres * 0.62, 340, 1, RESOURCE.fertile);
  paint(world, 'resource', OPS.setResource, metres * 0.86, metres * 0.52, 210, 1, RESOURCE.stone);

  // Roads: a coastal highway, two avenues, and a street grid between them.
  const k = metres / 4096;
  world.roads.add(
    [v(0, 2550 * k), v(1250 * k, 2500 * k), v(2500 * k, 2600 * k), v(metres, 2520 * k)],
    ROAD.highway,
    grid.cellSize,
  );
  world.roads.add([v(1180 * k, 1180 * k), v(1180 * k, 3150 * k)], ROAD.avenue, grid.cellSize);
  world.roads.add([v(600 * k, 1900 * k), v(3200 * k, 1900 * k)], ROAD.avenue, grid.cellSize);

  for (let x = 700; x <= 2900; x += 96) {
    world.roads.add([v(x * k, 1300 * k), v(x * k, 2450 * k)], ROAD.street, grid.cellSize);
  }
  for (let y = 1300; y <= 2450; y += 84) {
    world.roads.add([v(700 * k, y * k), v(2900 * k, y * k)], ROAD.street, grid.cellSize);
  }
  // Industrial access road out towards the ore.
  world.roads.add([v(2900 * k, 2100 * k), v(3350 * k, 1500 * k), v(3350 * k, 1050 * k)], ROAD.street, grid.cellSize);
  for (let y = 1100; y <= 1500; y += 92) {
    world.roads.add([v(3050 * k, y * k), v(3600 * k, y * k)], ROAD.street, grid.cellSize);
  }

  // Districts.
  zone(world, ZONE.residential, rect(640 * k, 1260 * k, 2960 * k, 1860 * k));
  zone(world, ZONE.residential, rect(640 * k, 1960 * k, 1120 * k, 2480 * k));
  zone(world, ZONE.commercial, rect(1120 * k, 1840 * k, 2960 * k, 1980 * k));
  zone(world, ZONE.commercial, rect(1100 * k, 1200 * k, 1270 * k, 1900 * k));
  zone(world, ZONE.office, rect(1270 * k, 1980 * k, 1900 * k, 2300 * k));
  zone(world, ZONE.civic, rect(1900 * k, 2000 * k, 2300 * k, 2200 * k));
  zone(world, ZONE.park, rect(2300 * k, 1980 * k, 2700 * k, 2300 * k));
  zone(world, ZONE.park, rect(820 * k, 1500 * k, 960 * k, 1800 * k));
  zone(world, ZONE.industrial, rect(2980 * k, 1000 * k, 3700 * k, 1600 * k));
  zone(world, ZONE.agriculture, rect(300 * k, 2650 * k, 1400 * k, 3200 * k));

  world.recompute();
  return world;
}

/** A curved spine for the ridge, from the north edge towards the east. */
function ridgeLine(metres: number, rng: Rng): Vec2[] {
  const out: Vec2[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push(
      v(
        metres * (0.58 + 0.36 * t) + rng.range(-60, 60),
        metres * (0.06 + 0.42 * Math.sin(t * 1.5)) + rng.range(-60, 60),
      ),
    );
  }
  return out;
}

/** Midpoint-displaced course from the hills to the sea. */
function riverCourse(metres: number, rng: Rng): Vec2[] {
  let line: Vec2[] = [v(metres * 0.62, metres * 0.08), v(metres * 0.3, metres * 0.86)];
  for (let pass = 0; pass < 5; pass++) {
    const next: Vec2[] = [line[0]!];
    const amount = (metres * 0.1) / Math.pow(2, pass);
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      next.push(v((a.x + b.x) / 2 + rng.range(-amount, amount), (a.y + b.y) / 2 + rng.range(-amount, amount)));
      next.push(b);
    }
    line = next;
  }
  return line;
}

const SETTINGS: StampSettings = { radius: 100, strength: 1, hardness: 0.4 };

function paint(
  world: World,
  layer: LayerName,
  op: StampOp,
  x: number,
  y: number,
  radius: number,
  strength: number,
  value = 0,
): void {
  const edit = new Edit(world.grid, layer);
  stampCircle(edit, world.grid, x, y, { ...SETTINGS, radius, strength }, op, value, 0);
}

function zone(world: World, kind: number, poly: Polygon): void {
  const edit = new Edit(world.grid, 'zone');
  fillPolygon(edit, world.grid, poly, SETTINGS, OPS.setZone, kind, 0);
}

function rect(x0: number, y0: number, x1: number, y1: number): Polygon {
  return [v(x0, y0), v(x1, y0), v(x1, y1), v(x0, y1)];
}
