import { MAX_TREES } from '../config';
import { Emitter } from '../core/emitter';
import type { Store } from '../core/store';
import type { AppState } from '../models/appState';
import { CAMERA_MODES, CAMERA_MODE_IDS } from '../models/cameraModes';
import { PALETTES, PALETTE_IDS, swatchColors } from '../models/fireworkPalettes';
import { TIME_IDS, TIME_PRESETS } from '../models/timeOfDay';

export interface PanelActions {
  randomize: void;
  launch: void;
  calibrate: void;
  loadClassifier: { url: string };
}

type NumericKey = { [K in keyof AppState]: AppState[K] extends number ? K : never }[keyof AppState];
type BooleanKey = { [K in keyof AppState]: AppState[K] extends boolean ? K : never }[keyof AppState];

const MINIMIZE_ICON = '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 7h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const MENU_ICON = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

/**
 * Builds the control panel DOM. It only reads and writes the store and emits one-shot actions;
 * it knows nothing about three.js, audio or the simulation.
 */
export class ControlPanel extends Emitter<PanelActions> {
  private readonly syncs: Array<(state: Readonly<AppState>) => void> = [];
  private readonly treeStats = el('div', { className: 'muted' });
  private readonly micStatus = el('div', { className: 'muted', textContent: 'Mic off' });
  private readonly meter = el('div', { className: 'meter' }, el('i'));

  constructor(root: HTMLElement, private readonly store: Store<AppState>) {
    super();
    const hide = el('button', { className: 'icon-button', title: 'Hide menu', ariaLabel: 'Hide menu', innerHTML: MINIMIZE_ICON });
    const restore = el('button', { className: 'icon-button restore', title: 'Show menu', ariaLabel: 'Show menu', innerHTML: MENU_ICON });
    hide.onclick = () => store.set({ menuVisible: false });
    restore.onclick = () => store.set({ menuVisible: true });

    const panel = el('div', { className: 'panel' },
      el('div', { className: 'titlebar' }, el('span', { textContent: 'Controls' }), hide),
      this.seedField(),
      this.slider('Trees', 'treeCount', 0, MAX_TREES, 50),
      this.cameraButtons(),
      this.select('Time of day', 'timeOfDay', TIME_IDS.map((id) => [id, TIME_PRESETS[id].label])),
      this.checkbox('Ambient movement', 'ambientMotion'),
      this.slider('Horizontal range (x)', 'horizontalRange', 0, 100, 5),
      this.slider('Height range (y)', 'heightRange', 30, 150, 5),
      this.slider('Firework distance', 'fireworkDistance', 20, 120, 5),
      this.paletteField(),
      this.button('Launch fireworks', 'launch'),
      this.checkbox('Microphone (clap to fire)', 'micEnabled'),
      this.slider('Clap sensitivity', 'clapSensitivity', 1, 10, 1),
      this.select('Detector', 'detectorMode', [['level', 'Level only'], ['spectral', 'Spectral (FFT)'], ['classifier', 'Classifier (YAMNet)']]),
      this.classifierRow(),
      this.button('Calibrate noise (2 s)', 'calibrate', true),
      this.meter,
      this.micStatus,
      this.button('Randomize', 'randomize'),
      this.treeStats,
    );
    root.append(panel, restore);

    this.syncs.push((s) => { panel.hidden = !s.menuVisible; restore.hidden = s.menuVisible; });
    store.subscribe((s) => this.syncs.forEach((f) => f(s)));
    this.syncs.forEach((f) => f(store.get()));
  }

  setTreeStats(text: string): void { this.treeStats.textContent = text; }
  setMicStatus(text: string): void { this.micStatus.textContent = text; }
  setMeter(rms: number, hit: boolean): void {
    (this.meter.firstElementChild as HTMLElement).style.width = `${Math.min(100, rms * 1500)}%`;
    this.meter.classList.toggle('hit', hit);
  }

  private seedField(): HTMLElement {
    const input = el('input', { type: 'text' });
    input.onchange = () => this.store.set({ seed: input.value.trim() || 'meadow' });
    this.syncs.push((s) => { input.value = s.seed; });
    return el('label', {}, 'Seed', input);
  }

  private slider(label: string, key: NumericKey, min: number, max: number, step: number): HTMLElement {
    const value = el('span');
    const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
    input.oninput = () => this.store.set({ [key]: Number(input.value) } as Partial<AppState>);
    this.syncs.push((s) => { input.value = String(s[key]); value.textContent = String(s[key]); });
    return el('label', {}, `${label}: `, value, input);
  }

  private checkbox(label: string, key: BooleanKey): HTMLElement {
    const input = el('input', { type: 'checkbox' });
    input.onchange = () => this.store.set({ [key]: input.checked } as Partial<AppState>);
    this.syncs.push((s) => { input.checked = s[key]; });
    return el('label', { className: 'inline' }, input, label);
  }

  private select(label: string, key: 'timeOfDay' | 'detectorMode' | 'fireworkPalette', options: ReadonlyArray<readonly [string, string]>): HTMLElement {
    const select = el('select', {}, ...options.map(([value, text]) => el('option', { value, textContent: text })));
    select.onchange = () => this.store.set({ [key]: select.value } as Partial<AppState>);
    this.syncs.push((s) => { select.value = s[key]; });
    return el('label', {}, label, select);
  }

  private paletteField(): HTMLElement {
    const select = this.select('Firework palette', 'fireworkPalette', PALETTE_IDS.map((id) => [id, PALETTES[id].label]));
    const swatches = el('div', { className: 'swatches' });
    this.syncs.push((s) => {
      swatches.replaceChildren(...swatchColors(PALETTES[s.fireworkPalette]).map(([r, g, b]) => {
        const dot = el('i');
        dot.style.background = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
        return dot;
      }));
    });
    return el('div', { className: 'row' }, select, swatches);
  }

  private cameraButtons(): HTMLElement {
    const buttons = CAMERA_MODE_IDS.map((id) => {
      const b = el('button', { textContent: CAMERA_MODES[id].label });
      b.onclick = () => this.store.set({ cameraMode: id });
      this.syncs.push((s) => b.classList.toggle('on', s.cameraMode === id));
      return b;
    });
    return el('div', { className: 'cameras' }, ...buttons);
  }

  private button(label: string, action: 'launch' | 'calibrate' | 'randomize', ghost = false): HTMLElement {
    const b = el('button', { textContent: label, className: ghost ? 'ghost' : '' });
    b.onclick = () => this.emit(action, undefined);
    return b;
  }

  private classifierRow(): HTMLElement {
    const url = el('input', { type: 'text', placeholder: 'Model URL (optional)' });
    const load = el('button', { className: 'ghost', textContent: 'Load classifier' });
    load.onclick = () => this.emit('loadClassifier', { url: url.value.trim() });
    const row = el('div', { className: 'row' }, url, load);
    this.syncs.push((s) => { row.hidden = s.detectorMode !== 'classifier'; });
    return row;
  }
}
