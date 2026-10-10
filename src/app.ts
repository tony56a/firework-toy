import { clamp } from './core/random';
import { Store } from './core/store';
import { ClapInput } from './input/audio/clapInput';
import { PointerInput } from './input/pointerInput';
import { DEFAULT_STATE, type AppState } from './models/appState';
import { PALETTES } from './models/fireworkPalettes';
import { FireworkSim } from './models/fireworks';
import type { SceneId } from './models/scenes';
import { CameraRig } from './render/camera/rig';
import { SceneRenderer } from './render/sceneRenderer';
import { ConcreteScene } from './scenes/concreteScene';
import { createScene } from './scenes/registry';
import { Speech } from './ui/speech';
import type { Scene } from './scenes/scene';
import { ControlPanel } from './ui/controlPanel';

const ALL_KEYS = Object.keys(DEFAULT_STATE) as Array<keyof AppState>;

/** A scene with a launch pad. ConcreteScene is the only one, but the app asks for the capability. */
type LaunchSite = Pick<ConcreteScene, 'launch' | 'setLanguage' | 'setCountFrom'>;

function isLaunchSite(scene: Scene): scene is Scene & LaunchSite {
  return scene instanceof ConcreteScene;
}

/**
 * Composition root. Wires inputs to state, state to models, and models to renderers.
 * Data flows one way: input/UI -> store -> models -> views.
 */
export class App {
  private readonly store = new Store<AppState>({ ...DEFAULT_STATE });
  private readonly view: SceneRenderer;
  private readonly rig = new CameraRig();
  private readonly sim = new FireworkSim();
  private readonly pointer: PointerInput;
  private readonly clap = new ClapInput();
  private readonly panel: ControlPanel;
  private readonly speech = new Speech();
  /** Scenes are built on first use and then kept, so returning to one is instant. */
  private readonly scenes = new Map<SceneId, Scene>();
  private active: Scene;
  private lastFrame = 0;
  private autoTimer = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.view = new SceneRenderer(canvas);
    this.pointer = new PointerInput(canvas);
    this.panel = new ControlPanel(uiRoot, this.store);
    this.active = this.sceneFor(DEFAULT_STATE.sceneId);
    this.rig.setFraming(this.active.framing);

    this.pointer.on('drag', ({ dx, dy }) => this.rig.drag(dx, dy));
    this.pointer.on('zoom', ({ factor }) => this.rig.zoom(factor));
    this.pointer.on('interact', () => this.rig.interrupt());

    this.clap.on('clap', () => this.launch(1));
    this.clap.on('status', (text) => this.panel.setMicStatus(text));
    this.clap.on('level', ({ rms, hit }) => this.panel.setMeter(rms, hit));

    this.panel.on('launch', () => this.launch(5));
    // Scene-specific actions are no-ops for scenes that have nothing to fire.
    this.panel.on('launchRocket', () => this.launchSite()?.launch());
    this.panel.on('randomize', () => this.store.set({ seed: Math.random().toString(36).slice(2, 8) }));
    this.panel.on('calibrate', () => this.clap.calibrate(performance.now()));
    this.panel.on('loadClassifier', ({ url }) => void this.clap.loadClassifier(url));

    this.store.subscribe((state, changed) => this.react(state, changed));
    this.react(this.store.get(), ALL_KEYS);
  }

  start(): void {
    window.addEventListener('resize', this.onResize);
    this.onResize();
    requestAnimationFrame(this.frame);
  }

  private react(state: Readonly<AppState>, changed: ReadonlyArray<keyof AppState>): void {
    const has = (key: keyof AppState) => changed.includes(key);
    if (has('sceneId')) {
      this.swapScene(state.sceneId);
      return; // the new scene replays everything below through its own react
    }
    this.active.react(state, changed);
    this.launchSite()?.setLanguage(state.countDownLanguage);
    this.launchSite()?.setCountFrom(state.countDownFrom);
    if (has('cameraMode')) this.rig.setMode(state.cameraMode);
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

  /**
   * The active scene as a launch site, or undefined when it is not one. Only the concrete scene has
   * a pad to fire from, so the app asks for the capability rather than the scene's identity.
   */
  private launchSite(): LaunchSite | undefined {
    return isLaunchSite(this.active) ? this.active : undefined;
  }

  private sceneFor(id: SceneId): Scene {
    const cached = this.scenes.get(id);
    if (cached) return cached;
    const scene = createScene(
      id,
      this.sim,
      { setStats: (scene, text) => this.panel.setStats(scene, text) },
      this.store.get().seed,
      // Only the concrete scene speaks or tracks, but every scene gets the hooks and ignores them.
      {
        speak: (text, language) => this.speech.speak(text, language),
        track: (point) => this.rig.setTracking(point),
      },
    );
    this.scenes.set(id, scene);
    return scene;
  }

  /**
   * Builds the incoming scene if needed and replays the whole state onto it, so a scene is never
   * shown with settings that were changed while another one was active.
   */
  private swapScene(id: SceneId): void {
    this.active = this.sceneFor(id);
    this.rig.setFraming(this.active.framing);
    this.active.react(this.store.get(), ALL_KEYS);
  }

  /** Fires from a fixed horizontal distance in front of the camera, at ground level. */
  private launch(shells: number): void {
    const s = this.store.get();
    const forward = this.rig.groundForward();
    const camera = this.rig.camera.position;
    const ground = this.active.ground;
    const limit = ground.size / 2 - 2;
    const x = clamp(camera.x + forward.x * s.fireworkDistance, -limit, limit);
    const z = clamp(camera.z + forward.z * s.fireworkDistance, -limit, limit);
    this.sim.launchVolley({
      origin: { x, y: ground.heightAt(x, z) + 0.3, z },
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
    this.rig.update(dt, this.active.ground);
    this.sim.step(dt);
    this.active.update(this.rig.camera, dt);
    this.clap.tick(now);
    this.view.render(this.rig.camera, this.active.three);
    requestAnimationFrame(this.frame);
  };
}
