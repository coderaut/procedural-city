import { v } from '../core/geom';
import type { Vec2 } from '../core/geom';

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 4;

/** Pan/zoom over world metres. `zoom` is CSS pixels per metre. */
export class Camera {
  /** World point shown at the centre of the viewport. */
  center: Vec2 = v(0, 0);
  zoom = 0.25;

  fit(size: number, viewW: number, viewH: number, pad = 0.92): void {
    this.center = v(size / 2, size / 2);
    this.zoom = clampZoom((Math.min(viewW, viewH) / size) * pad);
  }

  screenToWorld(px: number, py: number, viewW: number, viewH: number): Vec2 {
    return v(
      (px - viewW / 2) / this.zoom + this.center.x,
      (py - viewH / 2) / this.zoom + this.center.y,
    );
  }

  panByPixels(dx: number, dy: number): void {
    this.center = v(this.center.x - dx / this.zoom, this.center.y - dy / this.zoom);
  }

  /** Zooms by `factor`, keeping the world point under the cursor fixed. */
  zoomAt(px: number, py: number, factor: number, viewW: number, viewH: number): void {
    const before = this.screenToWorld(px, py, viewW, viewH);
    this.zoom = clampZoom(this.zoom * factor);
    const after = this.screenToWorld(px, py, viewW, viewH);
    this.center = v(this.center.x + (before.x - after.x), this.center.y + (before.y - after.y));
  }

  /** Maps world metres to device pixels for the given canvas. */
  apply(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, dpr: number): void {
    const s = this.zoom * dpr;
    ctx.setTransform(s, 0, 0, s, (viewW / 2) * dpr - this.center.x * s, (viewH / 2) * dpr - this.center.y * s);
  }
}

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}
