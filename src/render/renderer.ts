import type { Polygon } from '../core/geom';
import type { City, Zone } from '../core/types';
import type { Camera } from './camera';
import { blockColor, buildingColor } from './palette';
import type { Palette } from './palette';

const SHADE_BUCKETS = 10;

interface Layers {
  city: City;
  land: Path2D;
  blocks: Map<Zone, Path2D>;
  buildings: Map<string, Path2D>;
  outlines: Path2D;
  river: Path2D | null;
  bridges: Path2D | null;
}

/**
 * Keeps one set of Path2D layers per city so panning and zooming never rebuild
 * geometry — only the fills, which depend on the active palette.
 */
export class CityRenderer {
  private layers: Layers | null = null;

  draw(
    ctx: CanvasRenderingContext2D,
    city: City,
    camera: Camera,
    palette: Palette,
    viewW: number,
    viewH: number,
    dpr: number,
  ): void {
    if (!this.layers || this.layers.city !== city) this.layers = buildLayers(city);
    const layers = this.layers;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = palette.paper;
    ctx.fillRect(0, 0, viewW * dpr, viewH * dpr);

    camera.apply(ctx, viewW, viewH, dpr);

    ctx.fillStyle = palette.street;
    ctx.fill(layers.land);

    for (const [zone, path] of layers.blocks) {
      ctx.fillStyle = blockColor(palette, zone);
      ctx.fill(path);
    }

    for (const [key, path] of layers.buildings) {
      const [zone, bucket] = key.split(':') as [Zone, string];
      ctx.fillStyle = buildingColor(palette, zone, Number(bucket) / SHADE_BUCKETS);
      ctx.fill(path);
    }

    // Hairlines only once buildings are big enough to read.
    if (camera.zoom > 0.22) {
      ctx.strokeStyle = palette.outline;
      ctx.lineWidth = 1 / camera.zoom;
      ctx.stroke(layers.outlines);
    }

    if (layers.river) {
      ctx.fillStyle = palette.water;
      ctx.fill(layers.river);
    }
    if (layers.bridges) {
      ctx.fillStyle = palette.street;
      ctx.fill(layers.bridges);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  invalidate(): void {
    this.layers = null;
  }
}

function buildLayers(city: City): Layers {
  const land = new Path2D();
  trace(land, city.land);

  const blocks = new Map<Zone, Path2D>();
  const buildings = new Map<string, Path2D>();
  const outlines = new Path2D();

  for (const block of city.blocks) {
    const bp = blocks.get(block.zone) ?? new Path2D();
    trace(bp, block.poly);
    blocks.set(block.zone, bp);

    for (const b of block.buildings) {
      const bucket = Math.round(b.shade * SHADE_BUCKETS);
      const key = `${b.zone}:${bucket}`;
      const path = buildings.get(key) ?? new Path2D();
      trace(path, b.poly);
      buildings.set(key, path);
      trace(outlines, b.poly);
    }
  }

  let river: Path2D | null = null;
  if (city.riverPoly) {
    river = new Path2D();
    trace(river, city.riverPoly);
  }

  let bridges: Path2D | null = null;
  if (city.bridges.length > 0) {
    bridges = new Path2D();
    for (const deck of city.bridges) trace(bridges, deck);
  }

  return { city, land, blocks, buildings, outlines, river, bridges };
}

function trace(path: Path2D, poly: Polygon): void {
  if (poly.length < 3) return;
  path.moveTo(poly[0]!.x, poly[0]!.y);
  for (let i = 1; i < poly.length; i++) path.lineTo(poly[i]!.x, poly[i]!.y);
  path.closePath();
}

/** Renders a city to an offscreen canvas at a fixed resolution, for PNG export. */
export function renderToCanvas(city: City, palette: Palette, pixels: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = pixels;
  canvas.height = pixels;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const scale = pixels / city.size;
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, pixels, pixels);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const layers = buildLayers(city);
  ctx.fillStyle = palette.street;
  ctx.fill(layers.land);
  for (const [zone, path] of layers.blocks) {
    ctx.fillStyle = blockColor(palette, zone);
    ctx.fill(path);
  }
  for (const [key, path] of layers.buildings) {
    const [zone, bucket] = key.split(':') as [Zone, string];
    ctx.fillStyle = buildingColor(palette, zone, Number(bucket) / SHADE_BUCKETS);
    ctx.fill(path);
  }
  if (layers.river) {
    ctx.fillStyle = palette.water;
    ctx.fill(layers.river);
  }
  if (layers.bridges) {
    ctx.fillStyle = palette.street;
    ctx.fill(layers.bridges);
  }
  return canvas;
}
