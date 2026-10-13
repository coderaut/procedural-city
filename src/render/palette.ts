import type { Zone } from '../core/types';

export interface Palette {
  label: string;
  /** Undeveloped ground outside the city footprint. */
  paper: string;
  /** Street surface — shows through the gaps between blocks. */
  street: string;
  block: string;
  park: string;
  plaza: string;
  water: string;
  buildingLow: string;
  buildingHigh: string;
  industrial: string;
  outline: string;
  ink: string;
}

export type ThemeName = 'light' | 'dark';

export const PALETTES: Record<ThemeName, Palette> = {
  light: {
    label: 'Paper',
    paper: '#e6e3da',
    street: '#f5f3ed',
    block: '#e0dcd2',
    park: '#cbd9bd',
    plaza: '#ebe5d6',
    water: '#b9d1dc',
    buildingLow: '#bdb7aa',
    buildingHigh: '#45413a',
    industrial: '#a8a59a',
    outline: 'rgba(44, 41, 36, 0.28)',
    ink: '#3a3731',
  },
  dark: {
    label: 'Night',
    paper: '#0e1012',
    street: '#1c2127',
    block: '#14171b',
    park: '#1b2a20',
    plaza: '#242830',
    water: '#102430',
    buildingLow: '#343b44',
    buildingHigh: '#d3dae2',
    industrial: '#2b3137',
    outline: 'rgba(255, 255, 255, 0.07)',
    ink: '#c7cfd8',
  },
};

export function blockColor(palette: Palette, zone: Zone): string {
  if (zone === 'park') return palette.park;
  if (zone === 'plaza') return palette.plaza;
  return palette.block;
}

export function buildingColor(palette: Palette, zone: Zone, shade: number): string {
  if (zone === 'industrial') return mix(palette.industrial, palette.buildingHigh, shade * 0.3);
  return mix(palette.buildingLow, palette.buildingHigh, 0.12 + shade * 0.88);
}

export function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * k);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * k);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * k);
  return `rgb(${r}, ${g}, ${bl})`;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}
