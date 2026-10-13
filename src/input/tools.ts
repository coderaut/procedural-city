import { OPS } from '../world/brush';
import type { OpName } from '../world/brush';
import type { LayerName } from '../world/grid';
import { RESOURCE, ROAD, WATER, ZONE } from '../world/kinds';
import type { RoadClass } from '../world/kinds';
import { PALETTE, rgbCss, zoneCss } from '../render/palette';

export type ToolGroup = 'terrain' | 'water' | 'nature' | 'zone' | 'road' | 'inspect';

export interface Tool {
  id: string;
  label: string;
  group: ToolGroup;
  /** How the pointer drives it. */
  kind: 'paint' | 'road' | 'road-erase' | 'inspect';
  layer?: LayerName;
  op?: OpName;
  /** The kind written by setWater / setResource / setZone. */
  value?: number;
  roadClass?: RoadClass;
  /** Colour chip in the toolbar. */
  swatch?: string;
  hint: string;
  /** Paint tools can also be used as a polygon pen. */
  shapeable?: boolean;
}

export const TOOLS: Tool[] = [
  {
    id: 'raise',
    label: 'Raise',
    group: 'terrain',
    kind: 'paint',
    layer: 'height',
    op: 'raise',
    hint: 'Push the ground up. Hold and drag to build hills and mountains.',
  },
  {
    id: 'lower',
    label: 'Lower',
    group: 'terrain',
    kind: 'paint',
    layer: 'height',
    op: 'lower',
    hint: 'Dig the ground down. Below sea level it becomes a basin you can flood.',
  },
  {
    id: 'smooth',
    label: 'Smooth',
    group: 'terrain',
    kind: 'paint',
    layer: 'height',
    op: 'smooth',
    hint: 'Average out the relief — softens cliffs into buildable slopes.',
  },
  {
    id: 'flatten',
    label: 'Flatten',
    group: 'terrain',
    kind: 'paint',
    layer: 'height',
    op: 'flatten',
    hint: 'Level everything to the height where the stroke began.',
  },

  {
    id: 'sea',
    label: 'Sea',
    group: 'water',
    kind: 'paint',
    layer: 'water',
    op: 'setWater',
    value: WATER.sea,
    swatch: rgbCss(PALETTE.seaDeep),
    shapeable: true,
    hint: 'Flood with sea water. Shades by depth, so lower the ground first for deep water.',
  },
  {
    id: 'lake',
    label: 'Lake',
    group: 'water',
    kind: 'paint',
    layer: 'water',
    op: 'setWater',
    value: WATER.lake,
    swatch: rgbCss(PALETTE.lake),
    shapeable: true,
    hint: 'Still inland water.',
  },
  {
    id: 'river',
    label: 'River',
    group: 'water',
    kind: 'paint',
    layer: 'water',
    op: 'setWater',
    value: WATER.river,
    swatch: rgbCss(PALETTE.river),
    shapeable: true,
    hint: 'Running water. Drag with a small brush to trace a course.',
  },
  {
    id: 'dry',
    label: 'Drain',
    group: 'water',
    kind: 'paint',
    layer: 'water',
    op: 'setWater',
    value: WATER.none,
    shapeable: true,
    hint: 'Remove water and return the cells to dry land.',
  },

  {
    id: 'forest',
    label: 'Forest',
    group: 'nature',
    kind: 'paint',
    layer: 'forest',
    op: 'addForest',
    swatch: rgbCss(PALETTE.forest),
    hint: 'Plant tree cover. Density builds up as you paint over it.',
  },
  {
    id: 'clear-forest',
    label: 'Fell',
    group: 'nature',
    kind: 'paint',
    layer: 'forest',
    op: 'removeForest',
    hint: 'Clear trees.',
  },
  {
    id: 'ore',
    label: 'Ore',
    group: 'nature',
    kind: 'paint',
    layer: 'resource',
    op: 'setResource',
    value: RESOURCE.ore,
    swatch: rgbCss(PALETTE.resource[RESOURCE.ore]),
    shapeable: true,
    hint: 'Metal deposit. Industry built on it produces 40% more.',
  },
  {
    id: 'fertile',
    label: 'Fertile',
    group: 'nature',
    kind: 'paint',
    layer: 'resource',
    op: 'setResource',
    value: RESOURCE.fertile,
    swatch: rgbCss(PALETTE.resource[RESOURCE.fertile]),
    shapeable: true,
    hint: 'Good soil. Farms on it yield more.',
  },
  {
    id: 'stone',
    label: 'Stone',
    group: 'nature',
    kind: 'paint',
    layer: 'resource',
    op: 'setResource',
    value: RESOURCE.stone,
    swatch: rgbCss(PALETTE.resource[RESOURCE.stone]),
    shapeable: true,
    hint: 'Quarry stone.',
  },
  {
    id: 'oil',
    label: 'Oil',
    group: 'nature',
    kind: 'paint',
    layer: 'resource',
    op: 'setResource',
    value: RESOURCE.oil,
    swatch: rgbCss(PALETTE.resource[RESOURCE.oil]),
    shapeable: true,
    hint: 'Oil field.',
  },
  {
    id: 'clear-resource',
    label: 'Clear',
    group: 'nature',
    kind: 'paint',
    layer: 'resource',
    op: 'setResource',
    value: RESOURCE.none,
    shapeable: true,
    hint: 'Remove a deposit.',
  },

  ...(
    [
      [ZONE.residential, 'Residential', 'Homes. Fronts onto streets, up to 6 storeys under pressure.'],
      [ZONE.commercial, 'Commercial', 'Shops and services. Wants to be near the people it serves.'],
      [ZONE.office, 'Office', 'Desk jobs. Goes tall where demand is high.'],
      [ZONE.industrial, 'Industrial', 'Deep lots, gentle ground. Sits well on ore.'],
      [ZONE.park, 'Park', 'Open space. Nothing is built here; it counts as amenity.'],
      [ZONE.civic, 'Civic', 'Schools, clinics, halls — set back from the road.'],
      [ZONE.agriculture, 'Farmland', 'Very large lots. Yields more on fertile soil.'],
    ] as const
  ).map(([zone, label, hint]) => ({
    id: `zone-${zone}`,
    label,
    group: 'zone' as const,
    kind: 'paint' as const,
    layer: 'zone' as const,
    op: 'setZone' as const,
    value: zone,
    swatch: zoneCss(zone),
    shapeable: true,
    hint,
  })),
  {
    id: 'zone-erase',
    label: 'Unzone',
    group: 'zone',
    kind: 'paint',
    layer: 'zone',
    op: 'setZone',
    value: ZONE.none,
    shapeable: true,
    hint: 'Remove the designation. Anything built there disappears on recompute.',
  },

  {
    id: 'road-street',
    label: 'Street',
    group: 'road',
    kind: 'road',
    roadClass: ROAD.street,
    hint: 'Drag to draw. 10 m wide; buildings front onto it.',
  },
  {
    id: 'road-avenue',
    label: 'Avenue',
    group: 'road',
    kind: 'road',
    roadClass: ROAD.avenue,
    hint: '20 m wide. Frontage here grows taller than on a street.',
  },
  {
    id: 'road-highway',
    label: 'Highway',
    group: 'road',
    kind: 'road',
    roadClass: ROAD.highway,
    hint: '32 m through route. Nothing fronts onto it — feed it with streets.',
  },
  {
    id: 'road-erase',
    label: 'Remove',
    group: 'road',
    kind: 'road-erase',
    hint: 'Click or drag over roads to delete them.',
  },

  {
    id: 'inspect',
    label: 'Inspect',
    group: 'inspect',
    kind: 'inspect',
    hint: 'Click a cell to read its elevation, slope, zone and what sits on it.',
  },
];

export const TOOL_BY_ID = new Map(TOOLS.map((tool) => [tool.id, tool]));

export const GROUP_LABELS: Record<ToolGroup, string> = {
  terrain: 'Landform',
  water: 'Water',
  nature: 'Nature & resources',
  zone: 'Zoning',
  road: 'Roads',
  inspect: 'Inspect',
};

export function opFor(tool: Tool) {
  return tool.op ? OPS[tool.op] : null;
}
