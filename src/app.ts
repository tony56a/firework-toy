import { clamp } from './core/random';
import { Store } from './core/store';
import { ClapInput } from './input/audio/clapInput';
import { PointerInput } from './input/pointerInput';
import { DEFAULT_STATE, type AppState } from './models/appState';
import { PALETTES } from './models/fireworkPalettes';
import { FireworkSim } from './models/fireworks';
import { Terrain } from './models/terrain';
import { TIME_PRESETS } from './models/timeOfDay';
import { scatterTrees } from './models/trees';
import { Atmosphere } from './render/atmosphere';
import { CameraRig } from './render/camera/rig';
import { FireworksView } from './render/fireworksView';
import { RocketView } from './render/rocketView';
import { SceneRenderer } from './render/sceneRenderer';
import { TerrainView } from './render/terrainView';
import { TreeView } from './render/treeView';
import { ControlPanel } from './ui/controlPanel';

/**
 * Composition root. Wires inputs to state, state to models, and models to renderers.
 * Data flows one way: input/UI -> store -> models -> views.
 */
export class App {
  private readonly store = new Store<AppState>({ ...DEFAULT_STATE });
  private readonly view: SceneRenderer;
  private readonly atmosphere: Atmosphere;
  private readonly rig = new CameraRig();
  private readonly terrainView: TerrainView;
  private readonly treeView: TreeView;
  private readonly sim = new FireworkSim();
  private readonly fireworksView: FireworksView;
  private readonly rocketView: RocketView;
  private readonly pointer: PointerInput;
  private readonly clap = new ClapInput();
  private readonly panel: ControlPanel;
  private terrain: Terrain;
  private lastFrame = 0;
  private autoTimer = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.view = new SceneRenderer(canvas);
    this.atmosphere = new Atmosphere(this.view.scene);
    this.terrainView = new TerrainView(this.view.scene);
    this.treeView = new TreeView(this.view.scene);
    this.fireworksView = new FireworksView(this.view.scene, this.sim);
    this.rocketView = new RocketView(this.view.scene, this.sim);
    this.pointer = new PointerInput(canvas);
    this.panel = new ControlPanel(uiRoot, this.store);
    this.terrain = new Terrain(this.store.get().seed);

    this.pointer.on('drag', ({ dx, dy }) => this.rig.drag(dx, dy));
    this.pointer.on('zoom', ({ factor }) => this.rig.zoom(factor));
    this.pointer.on('interact', () => this.rig.interrupt());

    this.clap.on('clap', () => this.launch(1));
    this.clap.on('status', (text) => this.panel.setMicStatus(text));
    this.clap.on('level', ({ rms, hit }) => this.panel.setMeter(rms, hit));

    this.panel.on('launch', () => this.launch(5));
    this.panel.on('randomize', () => this.store.set({ seed: Math.random().toString(36).slice(2, 8) }));
    this.panel.on('calibrate', () => this.clap.calibrate(performance.now()));
    this.panel.on('loadClassifier', ({ url }) => void this.clap.loadClassifier(url));

    this.store.subscribe((state, changed) => this.react(state, changed));
    this.react(this.store.get(), Object.keys(DEFAULT_STATE) as Array<keyof AppState>);
  }

  start(): void {
    window.addEventListener('resize', this.onResize);
    this.onResize();
    requestAnimationFrame(this.frame);
  }

  private react(state: Readonly<AppState>, changed: ReadonlyArray<keyof AppState>): void {
    const has = (key: keyof AppState) => changed.includes(key);
    if (has('seed')) {
      this.terrain = new Terrain(state.seed);
      this.terrainView.set(this.terrain);
      this.rebuildTrees(state);
    } else if (has('treeCount')) {
      this.rebuildTrees(state);
    }
    if (has('cameraMode')) this.rig.setMode(state.cameraMode);
    if (has('timeOfDay')) this.atmosphere.apply(TIME_PRESETS[state.timeOfDay]);
    if (has('ambientMotion')) this.rig.setAmbient(state.ambientMotion);
    if (has('clapSensitivity')) this.clap.setSensitivity(state.clapSensitivity);
    if (has('detectorMode')) this.clap.setMode(state.detectorMode);
    if (has('micEnabled')) {
      void this.clap.setEnabled(state.micEnabled).then((actual) => this.store.set({ micEnabled: actual }));
    }
    if (has('autoLaunch') && state.autoLaunch) {
      // Fire immediately so the toggle feels responsive, then keep a steady cadence in frame().
      this.autoTimer = 0;
      this.launch(5);
    }
    if (has('autoLaunch') && !state.autoLaunch) this.autoTimer = 0;
  }

  private rebuildTrees(state: Readonly<AppState>): void {
    const trees = scatterTrees(this.terrain, state.seed, state.treeCount);
    this.treeView.set(trees);
    const pines = trees.filter((t) => t.kind === 'pine').length;
    this.panel.setTreeStats(`${trees.length} trees (${pines} pine, ${trees.length - pines} oak)`);
  }

  /** Fires from a fixed horizontal distance in front of the camera, at ground level. */
  private launch(shells: number): void {
    const s = this.store.get();
    const forward = this.rig.groundForward();
    const camera = this.rig.camera.position;
    const limit = this.terrain.size / 2 - 2;
    const x = clamp(camera.x + forward.x * s.fireworkDistance, -limit, limit);
    const z = clamp(camera.z + forward.z * s.fireworkDistance, -limit, limit);
    this.sim.launchVolley({
      origin: { x, y: this.terrain.heightAt(x, z) + 0.3, z },
      forward, horizontalRange: s.horizontalRange, heightRange: s.heightRange, shells,
      palette: PALETTES[s.fireworkPalette],
    });
  }

  private onResize = (): void => this.rig.setAspect(this.view.resize());

  private frame = (now: number): void => {
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const s = this.store.get();
    if (s.autoLaunch) {
      this.autoTimer += dt;
      if (this.autoTimer >= Math.max(0.1, s.autoLaunchInterval)) {
        this.autoTimer = 0;
        this.launch(5);
      }
    }
    this.rig.update(dt, this.terrain);
    this.atmosphere.follow(this.rig.camera);
    this.sim.step(dt);
    this.rocketView.sync();
    this.fireworksView.sync();
    this.clap.tick(now);
    this.view.render(this.rig.camera);
    requestAnimationFrame(this.frame);
  };
}
