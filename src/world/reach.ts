import type { Grid } from './grid';
import { ROAD_FRONTAGE } from './kinds';
import type { RoadClass } from './kinds';

/** Chamfer weights: 3 orthogonal, 4 diagonal, approximating Euclidean within ~5%. */
const ORTHO = 3;
const DIAG = 4;
const FAR = 60_000;

/**
 * Distance from every cell to the nearest road that buildings can front onto,
 * in cells, written into `grid.reach` (255 means "further than that").
 *
 * This is how "stranded" land is measured. Counting cells with no building on
 * them would be wrong — setbacks, verges and the gaps between lots are unbuilt
 * by design — whereas distance to a usable road is the thing the planner can
 * actually fix by drawing a street.
 *
 * Two chamfer passes over the grid, so it costs one forward and one backward
 * sweep regardless of how much road there is.
 */
export function computeReach(grid: Grid): void {
  const size = grid.size;
  const cells = grid.cells;
  const dt = new Uint32Array(cells);

  for (let i = 0; i < cells; i++) {
    dt[i] = ROAD_FRONTAGE[grid.road[i] as RoadClass] ? 0 : FAR;
  }

  // Forward: top-left to bottom-right.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      let best = dt[i]!;
      if (best === 0) continue;
      if (y > 0) {
        best = Math.min(best, dt[i - size]! + ORTHO);
        if (x > 0) best = Math.min(best, dt[i - size - 1]! + DIAG);
        if (x < size - 1) best = Math.min(best, dt[i - size + 1]! + DIAG);
      }
      if (x > 0) best = Math.min(best, dt[i - 1]! + ORTHO);
      dt[i] = best;
    }
  }

  // Backward: bottom-right to top-left.
  for (let y = size - 1; y >= 0; y--) {
    for (let x = size - 1; x >= 0; x--) {
      const i = y * size + x;
      let best = dt[i]!;
      if (best === 0) {
        grid.reach[i] = 0;
        continue;
      }
      if (y < size - 1) {
        best = Math.min(best, dt[i + size]! + ORTHO);
        if (x > 0) best = Math.min(best, dt[i + size - 1]! + DIAG);
        if (x < size - 1) best = Math.min(best, dt[i + size + 1]! + DIAG);
      }
      if (x < size - 1) best = Math.min(best, dt[i + 1]! + ORTHO);
      dt[i] = best;
      grid.reach[i] = Math.min(255, Math.round(best / ORTHO));
    }
  }
}
