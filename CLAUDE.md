# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

A city planning sandbox: a blank map where the user sculpts terrain, paints land use
and draws roads, and the city grows into whatever has been zoned. Vite + TypeScript +
Canvas 2D, **no runtime dependencies**. Keep it that way — a geometry or noise library
would replace the part of this project that is actually interesting.

It is a design tool, not a game. There is no clock: every edit recomputes immediately.
Don't add a tick loop, population drift or anything else that changes the city while
the user is not touching it.

The git remote is still called `procedural-city` — the repo began as a seed-driven map
generator, which was scrapped wholesale for this. Don't look for that generator; only
`world/geom.ts` and `world/rng.ts` survive from it. The app is "City Planner".

## Commands

```bash
npm run dev            # dev server with HMR
npm run typecheck      # tsc --noEmit, strict; run before claiming done
npm run build          # typecheck + production bundle
npm run preview:image  # headless render of the example map + its report
```

No test runner yet. Verify with the headless path below.

## Architecture

Three layers, and the boundaries matter:

- `src/world/` — the model. Pure, deterministic, **no DOM**. Cell layers, roads,
  growth, advisor.
- `src/render/` — drawing. Reads the world, never mutates it. `layers.ts` is
  deliberately DOM-free (it fills a plain RGBA buffer) so it can run headless;
  `scene.ts` owns the canvases.
- `src/input/` + `src/ui/` — tools, pointer handling, panels, wiring.

`World.recompute()` is the whole simulation:

```
rasterise roads -> reach distance field -> grow lots at neutral demand
  -> analyse -> grow again under that demand -> analyse
```

### Invariants to preserve

- **Determinism.** Same layers + same roads ⇒ byte-identical city. Each lot seeds its
  own `Rng` from `mix(seed, roadId, lotIndex)` so editing one corner never reshuffles
  the rest. Never use `Math.random()` in `world/`, and don't make growth depend on
  iteration order of a Map keyed by object identity.
- **The two-pass demand loop.** Pass one runs at *neutral* demand, never at the
  previous frame's demand — otherwise the city oscillates between recomputes. The
  report shows the demand that **built** the city (`probeReport.demand`), not demand
  recomputed from the finished city; the latter reads as "no housing needed" next to
  freshly built housing.
- **Derived layers are derived.** `grid.road`, `grid.reach` and `grid.occupancy` are
  rebuilt by every `growCity` call. Never edit them from a tool, and never persist them.
- **Edits go through `Edit`.** It records each cell's prior value once, so a stroke
  lands on the undo stack as one sparse patch. A tool that writes `grid.*` directly is
  a tool whose work cannot be undone.
- **`inset()` can return `[]`** for a polygon too small to shrink. Check
  `poly.length < 3` before using the result.
- **Convex polygons only** through `geom.ts` (clip / split / inset). Lots are quads by
  construction; keep them that way or bring in real polygon offsetting.
- **Buildings are replaced, not mutated.** `scene.ts` caches `Path2D` per building
  array identity, so `growCity` must return a fresh array or the map will not redraw.

## Measuring things honestly

"Stranded land" is distance from the nearest frontage-bearing road (`reach.ts`),
**not** absence of a building. Counting unbuilt cells was the first implementation and
it reported 47% stranded for a well-served city, because setbacks, verges and the gaps
between lots are unbuilt by design. If you add another deficit measure, ask the same
question: is this something the user can fix by drawing something?

## Code style

- TypeScript strict, plus `noUnusedLocals`, `exactOptionalPropertyTypes` and
  `verbatimModuleSyntax` — type-only imports need `import type`.
- Indexed access is checked, hence `!` on `arr[i]!` in hot loops. Deliberate; don't
  restructure the loops to avoid it.
- Units: metres everywhere in `world/`, cells only inside the grid and the layer
  painters. `camera.zoom` is CSS pixels per metre.
- New tool: add an entry to `TOOLS` in `input/tools.ts`. The toolbar builds itself from
  that list. A new paint behaviour means a new op in `brush.ts`'s `OPS`.
- New zone: add it to `ZONE` and `ZONE_RULES` in `world/kinds.ts`, a colour in
  `render/palette.ts`, and (if it provides homes or jobs) a row in `JOBS_PER_RESIDENT`
  in `advisor.ts`.
- Comment the *why* — a chosen weight, a visual trade-off, a rejected approach. Match
  the existing density.

## Verifying a change

There is no browser automation here, and canvas output cannot be typechecked. Use the
headless path, which exercises the real model and the real layer painters:

```bash
npm run preview:image                                   # example map + report
node scripts/preview.mjs out.png --crop 900,1500,560    # magnified crop, metres
node scripts/preview.mjs out.png --load some-map.json   # a saved map
```

Read the printed report, not just the picture: population, jobs, stranded hectares and
the advice list are where a broken growth or demand change shows up first. Then look at
the PNG. Aliasing in that script's output is expected — it has no antialiasing, and the
browser does.

For model changes, bundle `world/` with esbuild and assert in Node: determinism across
repeated recomputes, a save/load round trip, and footprint dimensions per zone. That
round trip is how a base64 bug that silently dropped the last cell of every layer got
caught.

Budget: recompute ~45 ms on a 4 km map. Past a few hundred ms, releasing a brush stroke
feels broken.

## Gotchas

- `scene.ts` and `scripts/preview.mjs` each encode the draw order. Change both together.
- A map autosaves to `localStorage` (~2 MB for 512²). Elevation is stored as decimetre
  `Int16` to keep it under quota; don't "fix" it back to float32.
- The demo map (`world/demo.ts`) is built only through the same brush, road and zone
  operations the tools use. Keep it that way — it is the fixture that proves those
  paths work.
- Brush dabs are interpolated along the pointer path. A tool that stamps only at event
  positions leaves a dotted line when the user drags fast, which is exactly what the
  demo river did at first.
