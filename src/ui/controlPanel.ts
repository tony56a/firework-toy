import { MAX_TREES } from '../config';
import { Emitter } from '../core/emitter';
import type { Store } from '../core/store';
import type { AppState } from '../models/appState';
import { CAMERA_MODES, CAMERA_MODE_IDS } from '../models/cameraModes';
import { PALETTES, PALETTE_IDS, swatchColors } from '../models/fireworkPalettes';
import { SCENES, SCENE_IDS, type SceneId } from '../models/scenes';
import { TIME_IDS, TIME_PRESETS } from '../models/timeOfDay';

export interface PanelActions {
  randomize: void;
  launch: void;
  calibrate: void;
  loadClassifier: { url: string };
}

type NumericKey = { [K in keyof AppState]: AppState[K] extends number ? K : never }[keyof AppState];
type BooleanKey = { [K in keyof AppState]: AppState[K] extends boolean ? K : never }[keyof AppState];
type SelectableKey = 'timeOfDay' | 'detectorMode' | 'fireworkPalette';

const DRAG_MARGIN = 8;

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
  private readonly sceneTabButtons = new Map<SceneId, HTMLElement>();
  private readonly groupButtons = new Map<string, HTMLElement>();
  private readonly groupPanels = new Map<string, HTMLElement>();
  private readonly treeStats = el('div', { className: 'muted' });
  private readonly micStatus = el('div', { className: 'muted', textContent: 'Mic off' });
  private readonly meter = el('div', { className: 'meter' }, el('i'));

  constructor(root: HTMLElement, private readonly store: Store<AppState>) {
    super();
    const hide = el('button', { className: 'icon-button', title: 'Hide menu', ariaLabel: 'Hide menu', innerHTML: MINIMIZE_ICON });
    const restore = el('button', { className: 'icon-button restore', title: 'Show menu', ariaLabel: 'Show menu', innerHTML: MENU_ICON });
    hide.onclick = () => store.set({ menuVisible: false });
    restore.onclick = () => store.set({ menuVisible: true });

    const titlebar = el('div', { className: 'titlebar' }, el('span', { textContent: 'Controls' }), hide);
    const groupDefs: ReadonlyArray<{ id: string; label: string; fields: ReadonlyArray<HTMLElement> }> = [
      { id: 'world', label: 'World', fields: [
        this.inScene('forest', this.seedField()),
        this.inScene('forest', this.slider('Trees', 'treeCount', 0, MAX_TREES, 50)),
        this.select('Time of day', 'timeOfDay', TIME_IDS.map((id) => [id, TIME_PRESETS[id].label])),
        this.checkbox('Ambient movement', 'ambientMotion'),
        this.inScene('forest', this.button('Randomize', 'randomize')),
        this.inScene('forest', this.treeStats),
      ] },
      { id: 'camera', label: 'Camera', fields: [
        this.cameraButtons(),
      ] },
      { id: 'fireworks', label: 'Fireworks', fields: [
        this.paletteField(),
        this.slider('Firework distance', 'fireworkDistance', 20, 120, 5),
        this.slider('Horizontal range (x)', 'horizontalRange', 0, 100, 5),
        this.slider('Height range (y)', 'heightRange', 30, 150, 5),
        this.button('Launch fireworks', 'launch'),
        this.autoLaunchButton(),
        this.slider('Auto-launch interval (s)', 'autoLaunchInterval', 0.5, 5, 0.1),
        this.checkbox('Show rockets', 'showRockets'),
      ] },
      { id: 'audio', label: 'Audio', fields: [
        this.checkbox('Microphone (clap to fire)', 'micEnabled'),
        this.slider('Clap sensitivity', 'clapSensitivity', 1, 10, 1),
        this.select('Detector', 'detectorMode', [['level', 'Level only'], ['spectral', 'Spectral (FFT)'], ['classifier', 'Classifier (YAMNet)']]),
        this.classifierRow(),
        this.button('Calibrate noise (2 s)', 'calibrate', true),
        this.meter,
        this.micStatus,
      ] },
    ];

    // Top row picks the scene; the row under it picks a group of controls within it.
    const sceneTabs = el('div', { className: 'tabs scene-tabs', role: 'tablist', ariaLabel: 'Scene' });
    const groupTabs = el('div', { className: 'tabs group-tabs', role: 'tablist', ariaLabel: 'Control group' });
    const bodies = el('div', { className: 'tab-body' });
    const panel = el('div', { className: 'panel' }, titlebar, sceneTabs, groupTabs, bodies);

    for (const id of SCENE_IDS) {
      const tab = el('button', { textContent: SCENES[id].label, role: 'tab', title: SCENES[id].label });
      tab.onclick = () => { this.store.set({ sceneId: id }); this.clampIntoView(panel); };
      this.sceneTabButtons.set(id, tab);
      sceneTabs.append(tab);
    }
    this.syncs.push((s) => {
      for (const [id, tab] of this.sceneTabButtons) {
        const on = id === s.sceneId;
        tab.classList.toggle('on', on);
        tab.setAttribute('aria-selected', String(on));
      }
    });

    for (const def of groupDefs) {
      const body = el('div', { className: 'tab-panel', role: 'tabpanel' }, ...def.fields);
      const tab = el('button', { textContent: def.label, role: 'tab', title: def.label });
      tab.onclick = () => { this.showGroup(def.id); this.clampIntoView(panel); };
      this.groupButtons.set(def.id, tab);
      this.groupPanels.set(def.id, body);
      groupTabs.append(tab);
      bodies.append(body);
    }

    root.append(panel, restore);

    this.syncs.push((s) => { panel.hidden = !s.menuVisible; restore.hidden = s.menuVisible; });
    store.subscribe((s) => this.syncs.forEach((f) => f(s)));
    this.syncs.forEach((f) => f(store.get()));

    this.showGroup(groupDefs[0].id);
    this.makeDraggable(panel, titlebar);
    window.addEventListener('resize', () => this.clampIntoView(panel));
  }

  /** Shows one control group's fields and hides the rest. */
  private showGroup(id: string): void {
    for (const [key, body] of this.groupPanels) body.hidden = key !== id;
    for (const [key, tab] of this.groupButtons) {
      const on = key === id;
      tab.classList.toggle('on', on);
      tab.setAttribute('aria-selected', String(on));
    }
  }

  /**
   * Lets the titlebar drag the panel. Pointer capture keeps the drag alive when the
   * pointer leaves the handle, and the panel is clamped so it stays on screen.
   */
  private makeDraggable(panel: HTMLElement, handle: HTMLElement): void {
    let pointerId = -1;
    let originX = 0;
    let originY = 0;
    let startLeft = 0;
    let startTop = 0;

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
      const rect = panel.getBoundingClientRect();
      pointerId = e.pointerId;
      originX = e.clientX;
      originY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('dragging');
      e.preventDefault();
    });

    handle.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      const limits = this.dragLimits(panel);
      const left = startLeft + (e.clientX - originX);
      const top = startTop + (e.clientY - originY);
      panel.style.left = `${Math.min(Math.max(left, limits.minLeft), limits.maxLeft)}px`;
      panel.style.top = `${Math.min(Math.max(top, limits.minTop), limits.maxTop)}px`;
    });

    const end = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return;
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      pointerId = -1;
      handle.classList.remove('dragging');
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  /** Re-pins the panel inside the viewport, used on resize and after tab switches. */
  private clampIntoView(panel: HTMLElement): void {
    const { left, top } = panel.getBoundingClientRect();
    const limits = this.dragLimits(panel);
    panel.style.left = `${Math.min(Math.max(left, limits.minLeft), limits.maxLeft)}px`;
    panel.style.top = `${Math.min(Math.max(top, limits.minTop), limits.maxTop)}px`;
  }

  /** Allowed drag bounds: a margin off the viewport edges, inside the safe area. */
  private dragLimits(panel: HTMLElement): { minLeft: number; minTop: number; maxLeft: number; maxTop: number } {
    const { width, height } = panel.getBoundingClientRect();
    const rootStyle = getComputedStyle(document.documentElement);
    const insetTop = parseFloat(rootStyle.paddingTop) || 0;
    const insetBottom = parseFloat(rootStyle.paddingBottom) || 0;
    const minLeft = DRAG_MARGIN;
    const minTop = insetTop + DRAG_MARGIN;
    return {
      minLeft,
      minTop,
      maxLeft: Math.max(minLeft, window.innerWidth - width - DRAG_MARGIN),
      maxTop: Math.max(minTop, window.innerHeight - height - insetBottom - DRAG_MARGIN),
    };
  }

  setTreeStats(text: string): void { this.treeStats.textContent = text; }
  setMicStatus(text: string): void { this.micStatus.textContent = text; }
  setMeter(rms: number, hit: boolean): void {
    (this.meter.firstElementChild as HTMLElement).style.width = `${Math.min(100, rms * 1500)}%`;
    this.meter.classList.toggle('hit', hit);
  }

  /** Hides a control that only means something in one scene, such as the seed in the sky. */
  private inScene(scene: SceneId, node: HTMLElement): HTMLElement {
    this.syncs.push((s) => { node.hidden = s.sceneId !== scene; });
    return node;
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

  private select(label: string, key: SelectableKey, options: ReadonlyArray<readonly [string, string]>): HTMLElement {
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

  /** Toggle button bound to `autoLaunch`. Label and active style follow the store. */
  private autoLaunchButton(): HTMLElement {
    const b = el('button', { textContent: 'Start continuous fireworks' });
    b.setAttribute('aria-pressed', 'false');
    b.onclick = () => this.store.set({ autoLaunch: !this.store.get().autoLaunch });
    this.syncs.push((s) => {
      b.textContent = s.autoLaunch ? 'Stop continuous fireworks' : 'Start continuous fireworks';
      b.classList.toggle('on', s.autoLaunch);
      b.setAttribute('aria-pressed', String(s.autoLaunch));
    });
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
