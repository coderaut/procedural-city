import type { CityParams, LayoutKind } from '../core/types';

type NumericKey = 'size' | 'blockSize' | 'streetWidth' | 'density' | 'parkRatio' | 'irregularity' | 'riverWidth';

type Field =
  | { kind: 'text'; key: 'seed'; label: string }
  | { kind: 'select'; key: 'layout'; label: string; options: [LayoutKind, string][] }
  | {
      kind: 'range';
      key: NumericKey;
      label: string;
      min: number;
      max: number;
      step: number;
      format: (n: number) => string;
      requires?: 'river';
    }
  | { kind: 'toggle'; key: 'river'; label: string };

const pct = (n: number): string => `${Math.round(n * 100)}%`;
const metres = (n: number): string => `${Math.round(n)} m`;

export const FIELDS: readonly Field[] = [
  { kind: 'text', key: 'seed', label: 'Seed' },
  {
    kind: 'select',
    key: 'layout',
    label: 'Street plan',
    options: [
      ['grid', 'Grid'],
      ['radial', 'Radial'],
      ['organic', 'Organic'],
    ],
  },
  { kind: 'range', key: 'size', label: 'Extent', min: 800, max: 6000, step: 100, format: (n) => `${(n / 1000).toFixed(1)} km` },
  { kind: 'range', key: 'blockSize', label: 'Block size', min: 60, max: 400, step: 5, format: metres },
  { kind: 'range', key: 'streetWidth', label: 'Street width', min: 6, max: 44, step: 1, format: metres },
  { kind: 'range', key: 'density', label: 'Density', min: 0, max: 1, step: 0.01, format: pct },
  { kind: 'range', key: 'parkRatio', label: 'Green space', min: 0, max: 0.4, step: 0.01, format: pct },
  { kind: 'range', key: 'irregularity', label: 'Irregularity', min: 0, max: 1, step: 0.01, format: pct },
  { kind: 'toggle', key: 'river', label: 'River' },
  { kind: 'range', key: 'riverWidth', label: 'River width', min: 20, max: 300, step: 5, format: metres, requires: 'river' },
];

export interface ControlPanel {
  /** Pushes current params back into the inputs (after a randomize, say). */
  sync(params: CityParams): void;
}

export function buildControls(
  root: HTMLElement,
  params: CityParams,
  onChange: (patch: Partial<CityParams>) => void,
): ControlPanel {
  root.replaceChildren();
  const updaters: ((p: CityParams) => void)[] = [];

  for (const field of FIELDS) {
    const wrap = document.createElement('div');
    wrap.className = field.kind === 'toggle' ? 'field switch-field' : 'field';

    if (field.kind === 'toggle') {
      const label = document.createElement('label');
      label.className = 'switch field-label';
      const span = document.createElement('span');
      span.textContent = field.label;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = params[field.key];
      input.addEventListener('change', () => onChange({ [field.key]: input.checked } as Partial<CityParams>));
      label.append(span, input);
      wrap.append(label);
      updaters.push((p) => {
        input.checked = p[field.key];
      });
    } else {
      const label = document.createElement('div');
      label.className = 'field-label';
      const name = document.createElement('span');
      name.textContent = field.label;
      const value = document.createElement('span');
      value.className = 'field-value';
      label.append(name, value);
      wrap.append(label);

      if (field.kind === 'text') {
        const input = document.createElement('input');
        input.type = 'text';
        input.spellcheck = false;
        input.value = params[field.key];
        input.addEventListener('input', () => onChange({ [field.key]: input.value } as Partial<CityParams>));
        wrap.append(input);
        updaters.push((p) => {
          if (document.activeElement !== input) input.value = p[field.key];
        });
      } else if (field.kind === 'select') {
        const select = document.createElement('select');
        for (const [val, text] of field.options) {
          const option = document.createElement('option');
          option.value = val;
          option.textContent = text;
          select.append(option);
        }
        select.value = params[field.key];
        select.addEventListener('change', () =>
          onChange({ [field.key]: select.value as LayoutKind } as Partial<CityParams>),
        );
        wrap.append(select);
        updaters.push((p) => {
          select.value = p[field.key];
        });
      } else {
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(field.min);
        input.max = String(field.max);
        input.step = String(field.step);
        input.value = String(params[field.key]);
        value.textContent = field.format(params[field.key]);
        input.addEventListener('input', () => {
          const n = Number(input.value);
          value.textContent = field.format(n);
          onChange({ [field.key]: n } as Partial<CityParams>);
        });
        wrap.append(input);
        updaters.push((p) => {
          input.value = String(p[field.key]);
          value.textContent = field.format(p[field.key]);
          if (field.requires) wrap.hidden = !p[field.requires];
        });
      }
    }

    root.append(wrap);
  }

  const panel: ControlPanel = {
    sync(p) {
      for (const update of updaters) update(p);
    },
  };
  panel.sync(params);
  return panel;
}
