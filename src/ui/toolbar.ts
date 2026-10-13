import type { Editor } from '../input/editor';
import { GROUP_LABELS, TOOLS } from '../input/tools';
import type { ToolGroup } from '../input/tools';

export interface Toolbar {
  sync(): void;
}

const GROUP_ORDER: ToolGroup[] = ['terrain', 'water', 'nature', 'zone', 'road', 'inspect'];

/**
 * Tool picker plus brush settings. Writes straight to the editor and calls back
 * so the canvas can redraw its cursor at the new size.
 */
export function buildToolbar(root: HTMLElement, editor: Editor, onChange: () => void): Toolbar {
  root.replaceChildren();
  const toolButtons = new Map<string, HTMLButtonElement>();

  for (const group of GROUP_ORDER) {
    const tools = TOOLS.filter((tool) => tool.group === group);
    if (tools.length === 0) continue;

    const section = document.createElement('div');
    section.className = 'tool-group';
    const heading = document.createElement('h2');
    heading.textContent = GROUP_LABELS[group];
    const list = document.createElement('div');
    list.className = 'tool-list';
    if (group === 'inspect') list.style.gridTemplateColumns = '1fr';

    for (const tool of tools) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tool';
      button.title = tool.hint;
      button.setAttribute('aria-pressed', String(editor.tool.id === tool.id));

      if (tool.swatch) {
        const chip = document.createElement('i');
        chip.style.color = tool.swatch;
        button.append(chip);
      }
      const label = document.createElement('span');
      label.textContent = tool.label;
      button.append(label);

      button.addEventListener('click', () => {
        editor.setTool(tool.id);
        sync();
        onChange();
      });

      toolButtons.set(tool.id, button);
      list.append(button);
    }

    section.append(heading, list);
    root.append(section);
  }

  /* ---- brush settings --------------------------------------------------- */

  const brush = document.createElement('div');
  brush.className = 'brush';

  const modeHeading = document.createElement('h2');
  modeHeading.textContent = 'Shape';
  const modes = document.createElement('div');
  modes.className = 'mode-switch';

  const brushMode = modeButton('Brush', 'Paint freehand with a round brush');
  const penMode = modeButton('Pen', 'Click points to outline a region, then Enter to fill');
  brushMode.addEventListener('click', () => {
    editor.shapeMode = 'brush';
    editor.cancel();
    sync();
  });
  penMode.addEventListener('click', () => {
    if (!editor.canUsePen) return;
    editor.shapeMode = 'pen';
    sync();
  });
  modes.append(brushMode, penMode);

  const radius = slider('Brush size', 8, 600, 2, editor.brush.radius, (value) => {
    editor.brush.radius = value;
    onChange();
  }, (value) => `${Math.round(value)} m`);

  const strength = slider('Strength', 0.05, 1, 0.05, editor.brush.strength, (value) => {
    editor.brush.strength = value;
  }, (value) => `${Math.round(value * 100)}%`);

  const hardness = slider('Edge', 0, 1, 0.05, editor.brush.hardness, (value) => {
    editor.brush.hardness = value;
  }, (value) => (value > 0.8 ? 'hard' : value < 0.25 ? 'soft' : `${Math.round(value * 100)}%`));

  brush.append(modeHeading, modes, radius.el, strength.el, hardness.el);
  root.append(brush);

  function modeButton(label: string, hint: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tool';
    button.title = hint;
    button.textContent = label;
    return button;
  }

  function sync(): void {
    for (const [id, button] of toolButtons) {
      button.setAttribute('aria-pressed', String(editor.tool.id === id));
    }
    brushMode.setAttribute('aria-pressed', String(editor.shapeMode === 'brush'));
    penMode.setAttribute('aria-pressed', String(editor.shapeMode === 'pen'));
    penMode.disabled = !editor.canUsePen;
    radius.set(editor.brush.radius);
    strength.set(editor.brush.strength);
    hardness.set(editor.brush.hardness);
  }

  sync();
  return { sync };
}

interface Slider {
  el: HTMLElement;
  set(value: number): void;
}

function slider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  onInput: (value: number) => void,
  format: (value: number) => string,
): Slider {
  const wrap = document.createElement('div');
  wrap.className = 'field';

  const labelRow = document.createElement('div');
  labelRow.className = 'field-label';
  const name = document.createElement('span');
  name.textContent = label;
  const readout = document.createElement('span');
  readout.textContent = format(value);
  labelRow.append(name, readout);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener('input', () => {
    const next = Number(input.value);
    readout.textContent = format(next);
    onInput(next);
  });

  wrap.append(labelRow, input);
  return {
    el: wrap,
    set(next) {
      input.value = String(next);
      readout.textContent = format(next);
    },
  };
}
