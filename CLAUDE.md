# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

A browser app that procedurally generates minimalist 2D top-down city maps from user
inputs. Vite + TypeScript + Canvas 2D. **No runtime dependencies** — everything ships as
hand-written TypeScript. Keep it that way unless there's a reason that can't be worked
around; a geometry or noise library would replace the interesting part of this project.

## Commands

```bash
npm run dev            # dev server with HMR
npm run typecheck      # tsc --noEmit (strict; run this before claiming done)
npm run build          # typecheck + production bundle
npm run preview:image  # regenerate docs/preview.png
```

There is no test runner yet. Verify generator changes by running the generator headlessly
and looking at the output — see **Verifying a change** below.

## Architecture

Two halves, and the boundary matters:

- `src/core/` — the generator. Pure, deterministic, **no DOM access**. Takes `CityParams`,
  returns a `City`. Same params + same seed must always produce the identical city.
- `src/render/` — drawing. Reads a `City`, never mutates it. Owns camera, palettes, canvas.
- `src/ui/` + `src/main.ts` — the control panel and the wiring between the two.

The pipeline lives in `core/generate.ts` and runs in this order:
layout cells → river → zoning → blocks (inset by street width) → lots → buildings.
Each stage is its own module; add a new stage as a module rather than growing `generate.ts`.

### Invariants to preserve

- **Every polygon stays convex.** `geom.ts` (clip / split / inset) is exact and fast only
  for convex input, and `subdivide.ts` relies on it. If you need concave shapes (a
  coastline, a cul-de-sac), either clip against convex pieces or bring in real polygon
  offsetting — don't silently feed concave polygons through `inset`.
- **All randomness goes through `Rng`** seeded from `params.seed`. No `Math.random()` in
  `core/` — it breaks seed reproducibility, which is the whole point of the app. (The one
  exception is `randomSeed()`, which mints a *new* seed for the UI.)
- **`inset()` can return `[]`** when a polygon is too small to shrink. Every caller must
  check `poly.length < 3` before using the result.
- **`subdivide()` is recursive with a depth cap** (`MAX_DEPTH`) and an area floor. Keep both
  — a runaway subdivision locks the main thread.
- Streets are not geometry. They're the *gap* left after insetting a layout cell by
  `streetWidth / 2`, with the street colour painted underneath as `city.land`. Adding real
  road centrelines means adding a road graph, not inflating the block polygons.
- The renderer caches `Path2D` layers keyed on city identity (`this.layers.city !== city`),
  so **`generateCity` must return a new object** on every regeneration. Never mutate a
  `City` in place; the map will not redraw.

## Code style

- TypeScript strict, including `noUnusedLocals`, `exactOptionalPropertyTypes` and
  `verbatimModuleSyntax` — type-only imports need `import type`.
- Indexed access is checked, hence the `!` on `poly[i]!` in hot geometry loops. That's
  deliberate; don't restructure those loops to avoid it.
- Units are metres throughout `core/`. `camera.zoom` is CSS pixels per metre.
- Comment the *why* (a chosen weight, a visual trade-off), not the *what*. Match the
  existing density — most functions have a one-line header at most.
- New user inputs: add the field to `CityParams` and `DEFAULT_PARAMS` in `core/types.ts`,
  then one entry in `FIELDS` in `ui/controls.ts`. The panel builds itself from that list.

## Verifying a change

Canvas output can't be checked by typechecking, and generator bugs usually look fine in
numbers and wrong in pixels. Two cheap checks:

1. **Numbers**: bundle `core/` with esbuild and run it in Node across layouts, seeds and
   extremes (`size` 800 with `blockSize` 400, `size` 6000 with `blockSize` 60), asserting
   non-zero blocks/buildings and finite coordinates.
2. **Pixels**: `npm run preview:image` renders three cities to a PNG with no browser —
   look at it. It reuses the real generator and palette, so a broken generator shows up.

Budget: a 6 km city with ~10k buildings should generate in under ~100 ms. If a change
pushes generation past a few hundred ms, the slider drag will feel bad.

## Gotchas

- Light theme draws dark buildings on pale streets; the night theme inverts that
  (light buildings, dark ground). A change that only looks right in one theme isn't done.
- `Building.shade` is **absolute** height (log-scaled storeys), not height-relative-to-zone.
  Making it zone-relative flattens the downtown into the suburbs — it was a real bug once.
- `renderer.ts` and `scripts/preview.mjs` each encode the draw order. Change both together.
