import { RESOURCE, ROAD, ZONE } from '../world/kinds';
import type { ResourceKind, RoadClass, ZoneKind } from '../world/kinds';

export type RGB = readonly [number, number, number];

export interface Palette {
  /** Elevation ramp, from sea level to summit. */
  terrain: { at: number; colour: RGB }[];
  seaShallow: RGB;
  seaDeep: RGB;
  lake: RGB;
  river: RGB;
  shoreline: RGB;
  forest: RGB;
  contour: RGB;
  contourIndex: RGB;
  resource: Record<ResourceKind, RGB>;
  zone: Record<ZoneKind, RGB>;
  roadFill: Record<RoadClass, string>;
  roadCasing: string;
  buildingLow: string;
  buildingHigh: string;
  buildingOutline: string;
  parkFill: string;
  grid: string;
}

export const PALETTE: Palette = {
  terrain: [
    { at: -30, colour: [122, 134, 118] },
    { at: 0, colour: [199, 204, 184] },
    { at: 25, colour: [186, 193, 165] },
    { at: 60, colour: [176, 170, 142] },
    { at: 110, colour: [166, 150, 128] },
    { at: 180, colour: [186, 178, 168] },
    { at: 260, colour: [232, 230, 226] },
  ],
  seaShallow: [150, 184, 198],
  seaDeep: [96, 132, 152],
  lake: [138, 176, 196],
  river: [146, 186, 204],
  shoreline: [214, 216, 198],
  forest: [104, 134, 100],
  contour: [150, 150, 132],
  contourIndex: [118, 118, 102],
  resource: {
    [RESOURCE.none]: [0, 0, 0],
    [RESOURCE.ore]: [128, 106, 126],
    [RESOURCE.fertile]: [164, 178, 108],
    [RESOURCE.stone]: [150, 148, 144],
    [RESOURCE.oil]: [86, 84, 96],
  },
  zone: {
    [ZONE.none]: [0, 0, 0],
    [ZONE.residential]: [120, 176, 128],
    [ZONE.commercial]: [92, 148, 196],
    [ZONE.office]: [126, 128, 200],
    [ZONE.industrial]: [206, 168, 96],
    [ZONE.park]: [112, 176, 108],
    [ZONE.civic]: [196, 120, 160],
    [ZONE.agriculture]: [196, 190, 112],
  },
  roadFill: {
    [ROAD.none]: 'transparent',
    [ROAD.street]: '#f6f4ee',
    [ROAD.avenue]: '#f8f6f0',
    [ROAD.highway]: '#f0e6cf',
  },
  roadCasing: 'rgba(70, 68, 60, 0.55)',
  buildingLow: '#b4ab9c',
  buildingHigh: '#3c3934',
  buildingOutline: 'rgba(38, 36, 32, 0.4)',
  parkFill: 'rgba(104, 160, 98, 0.35)',
  grid: 'rgba(60, 58, 52, 0.08)',
};

/** Zone swatch for UI chips, as CSS. */
export function zoneCss(zone: ZoneKind, alpha = 1): string {
  const [r, g, b] = PALETTE.zone[zone];
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function rgbCss(colour: RGB): string {
  return `rgb(${colour[0]}, ${colour[1]}, ${colour[2]})`;
}

/** Sample the elevation ramp. */
export function terrainColour(height: number): RGB {
  const stops = PALETTE.terrain;
  if (height <= stops[0]!.at) return stops[0]!.colour;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (height <= b.at) {
      const t = (height - a.at) / (b.at - a.at);
      return [
        a.colour[0] + (b.colour[0] - a.colour[0]) * t,
        a.colour[1] + (b.colour[1] - a.colour[1]) * t,
        a.colour[2] + (b.colour[2] - a.colour[2]) * t,
      ];
    }
  }
  return stops[stops.length - 1]!.colour;
}

export function buildingCss(shade: number): string {
  const lo = hexToRgb(PALETTE.buildingLow);
  const hi = hexToRgb(PALETTE.buildingHigh);
  const t = Math.max(0, Math.min(1, 0.1 + shade * 0.9));
  return `rgb(${Math.round(lo[0] + (hi[0] - lo[0]) * t)}, ${Math.round(
    lo[1] + (hi[1] - lo[1]) * t,
  )}, ${Math.round(lo[2] + (hi[2] - lo[2]) * t)})`;
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
