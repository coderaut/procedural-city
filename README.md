# City Planner

A city planning sandbox that starts with nothing. You sculpt the land, paint the
water and the woods, designate districts with a brush or a pen tool, and draw the
roads yourself. The city builds itself into whatever you have zoned — and tells you
what it is short of.

![a planned coastal city, zoned and built](docs/preview.png)

Nothing is generated for you. There is no seed to roll, no layout to pick. A new map
is flat, empty ground.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build          # typecheck + production bundle
npm run typecheck
npm run preview:image  # render docs/preview.png without a browser
```

## How you use it

**1. Shape the world.** Raise and lower ground, smooth it, flatten it. Paint sea,
lakes and rivers; elevation shades by height with contour lines, and the sea darkens
with depth. Plant forest, and drop ore, fertile soil, stone and oil.

**2. Designate districts.** Pick residential, commercial, office, industrial, park,
civic or farmland and paint it on — freehand with the **Brush**, or click out a shape
with the **Pen** and press Enter to fill it. Regions can be any shape at all.

**3. Draw the roads.** Streets, avenues and highways, dragged on by hand. Hold Shift
for a straight run. Ends snap to nearby roads so junctions connect.

**4. Watch it fill in, and read what it needs.** Lots lay themselves out along every
road frontage inside your zones, sized and stacked by the demand the city is under.
The panel on the right reports population, jobs, demand per zone, and a list of what
to fix — stranded land with no road into it, workers with no jobs, jobs with no
housing, districts with no parks, buildings in the flood zone.

Everything recomputes the moment you let go of the mouse. There is no clock to wait on.

### Controls

| | |
| --- | --- |
| Paint / draw | Left drag |
| Pan | Middle drag, right drag, or Space + drag |
| Zoom | Scroll wheel |
| Fit map | `F` |
| Brush / Pen mode | `B` / `P` |
| Brush size | `[` and `]` |
| Fill pen region | `Enter`, or double-click |
| Cancel | `Esc` |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` |

Maps save to a JSON file and reload from one. Work in progress is kept in the browser
between sessions.

## Why roads matter

Buildings only appear where a road can reach them. Lots are laid along each frontage
to a depth set by the zone — 34 m for housing, 70 m for industry — so zoning a huge
block and running one street past it gets you a built edge and a hollow middle. The
panel measures that properly, as distance from the nearest usable street rather than
bare ground, and tells you how many hectares are stranded.

Highways carry traffic but take no frontage: feed them with streets. Avenues grow
taller buildings than streets do.

Terrain constrains it too. Each zone has a maximum slope it will build on, so a
zoned hillside stays empty until you smooth it. Industry sitting on an ore deposit
produces 40% more, farmland on fertile soil likewise.

## Architecture

```
src/
  world/      the model. Pure, deterministic, no DOM.
    grid.ts       cell layers: height, water, forest, resource, zone (+ derived road, reach, occupancy)
    kinds.ts      the vocabularies and the per-zone rules (lot size, setback, storeys, slope limits)
    brush.ts      brush and polygon stamping, with per-tool value rules
    edit.ts       sparse undoable edits, and the history stack
    roads.ts      road graph: simplify, snap, rasterise, frontage sampling
    reach.ts      chamfer distance transform from roads — how "stranded" is measured
    growth.ts     lays lots along frontages and places buildings
    advisor.ts    demand model and the advice list
    world.ts      recompute pipeline, save/load
    demo.ts       the Example map, built only through the tools' own operations
    geom.ts rng.ts codec.ts
  render/
    layers.ts     pure RGBA painters for terrain and zones (no DOM — runs headless too)
    scene.ts      composites bitmaps + roads + buildings under the camera
    camera.ts palette.ts
  input/
    tools.ts      the tool catalogue
    editor.ts     pointer input to world edits
  ui/           toolbar, report panel, stylesheet
  main.ts       wiring
```

`World.recompute()` is the whole simulation, and it runs twice: once at neutral
demand to learn what the city can support, then again under the demand that implies.
Both passes are deterministic — each lot seeds its own RNG from its road id and
position — so editing one corner of the map never reshuffles the rest.

On a 4 km map with ~1,300 buildings, a recompute takes about 45 ms and a brush stroke
repaints its own rectangle in well under a millisecond.

## Roadmap

- Water that flows: rivers that follow the terrain downhill instead of being painted
- Utilities — power and water networks as another thing the advisor can miss
- Traffic on the road graph, and congestion as a growth constraint
- Named districts, street names, and labels on the map
- Bridges and tunnels as explicit structures
- Rail, ports and airports
- Bigger worlds through chunked recompute
