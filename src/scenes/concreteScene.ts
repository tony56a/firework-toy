import {
  CONCRETE_SIZE, COUNTDOWN_DEFAULT, COUNTDOWN_MAX, COUNTDOWN_MIN, LAUNCH_BURST_DEFAULT,
  LAUNCH_BURST_MAX, LAUNCH_BURST_MIN, SITE_VIEWER_Z,
} from '../config';
import type * as THREE from 'three';
import type { AppState } from '../models/appState';
import type { CameraFraming } from '../models/cameraFraming';
import { CONCRETE_GROUND } from '../models/concrete/slab';
import { PALETTES } from '../models/fireworkPalettes';
import { countdownOver, countdownStep } from '../models/concrete/countdown';
import { phrase, type LanguageId } from '../models/concrete/countdownPhrases';
import { shouldTrack } from '../models/concrete/launch';
import { ROCKET_SPOT } from '../models/concrete/site';
import type { FireworkSim } from '../models/fireworks';
import type { Ground } from '../models/ground';
import { ConcreteView } from '../render/concreteView';
import { RocketLaunchView } from '../render/rocketLaunchView';
import { SiteView } from '../render/siteView';
import type { SceneHooks } from './hooks';
import { NO_HOOKS } from './hooks';
import { SceneBase, type SceneReport } from './sceneBase';

/**
 * A flat slab of poured concrete with a launch site standing on it: apron, rocket, service tower
 * and the ground buildings around them. The fireworks layer is inherited from SceneBase, so a
 * shell burst over the pad reads against the horizon.
 */
export class ConcreteScene extends SceneBase {
  private readonly view: ConcreteView;
  private readonly rocket: RocketLaunchView;
  private site: SiteView;
  /** Seconds since the countdown began, or -1 when nothing is counting. */
  private counting = -1;
  private language: LanguageId = 'en';
  /** The number the count starts from, as chosen in the UI. */
  private countFrom = COUNTDOWN_DEFAULT;
  /** The last word spoken, so a step is not repeated on the frame after it changes. */
  private lastSaid: string | null = null;
  /** The count this launch is running, fixed at the moment it started. */
  private activeCount = COUNTDOWN_DEFAULT;
  /** The burst height chosen in the UI, and the one this launch is actually running at. */
  private burstHeight = LAUNCH_BURST_DEFAULT;
  private activeHeight = LAUNCH_BURST_DEFAULT;
  /** Injected rather than constructed here, so the app can own the speech voice and the camera. */
  private readonly speak: SceneHooks['speak'];
  private readonly track: SceneHooks['track'];

  /**
   * The slab is the whole subject, and the viewer stands on it rather than on a table. They stand
   * back from the pad, since the rocket occupies the origin and a viewer there would be inside it.
   */
  readonly framing: CameraFraming = {
    radius: CONCRETE_SIZE / 2,
    surface: 0,
    eye: { x: 0, z: SITE_VIEWER_Z },
  };

  constructor(sim: FireworkSim, report: SceneReport, seed: string, hooks: SceneHooks = NO_HOOKS) {
    super(sim, report);
    this.speak = hooks.speak;
    this.track = hooks.track;
    this.view = new ConcreteView(this.three, seed);
    this.site = new SiteView(this.three, seed);
    this.rocket = new RocketLaunchView(this.three);
  }

  /** Sets the language the countdown is spoken in. */
  setLanguage(language: LanguageId): void {
    this.language = language;
  }

  /** Sets how high the rocket climbs before it bursts, clamped to a sane range. */
  setBurstHeight(height: number): void {
    this.burstHeight = Math.max(LAUNCH_BURST_MIN, Math.min(LAUNCH_BURST_MAX, Math.round(height)));
  }

  /** Sets the number the count starts from, clamped to the range the words cover. */
  setCountFrom(n: number): void {
    this.countFrom = Math.max(COUNTDOWN_MIN, Math.min(COUNTDOWN_MAX, Math.round(n)));
  }

  /** The slab is flat and never changes, so one shared instance describes it. */
  readonly ground: Ground = CONCRETE_GROUND;

  react(state: Readonly<AppState>, changed: ReadonlyArray<keyof AppState>): void {
    // Only a uniform changes on the slab; the buildings do depend on the seed, so they are rebuilt.
    if (changed.includes('seed')) {
      this.view.setSeed(state.seed);
      this.site.dispose();
      this.site = new SiteView(this.three, state.seed);
    }
    this.commonReact(state, changed);
  }

  /**
   * Starts a countdown, and the launch when it finishes. Ignored while the pad is busy, so repeated
   * clicks cannot queue up launches.
   */
  launch(): void {
    if (this.counting >= 0 || this.rocket.isLaunching) return;
    this.counting = 0;
    this.lastSaid = null;
    // Read both settings when the launch starts, so changing them mid-count cannot alter a
    // sequence already under way: the rocket would otherwise jump to a new altitude mid-climb.
    this.activeCount = this.countFrom;
    this.activeHeight = this.burstHeight;
  }

  /** The countdown tells the viewer the rocket is imminent, so it holds on the pad. */
  get isCounting(): boolean {
    return this.counting >= 0;
  }

  update(camera: THREE.Camera, dt: number): void {
    if (this.counting >= 0) {
      this.counting += dt;
      const step = countdownStep(this.counting, this.activeCount);
      if (step.say && step.say !== this.lastSaid) {
        this.lastSaid = step.say;
        this.speak(phrase(step.say, this.language), this.language);
      }
      if (countdownOver(this.counting, this.activeCount)) {
        this.counting = -1;
        this.rocket.launch();
      }
    }
    const state = this.rocket.update(dt, this.activeHeight);
    // burstAt, not launchVolley: the rocket has already flown to its apex, so this wants a burst
    // where it is rather than another shell fired from that height.
    if (state.burst) {
      this.sim.burstAt(ROCKET_SPOT.x, this.activeHeight, ROCKET_SPOT.z, PALETTES.warm, 'peony');
    }
    // Hand the camera the rocket while it is flying, and take it back once the sequence is over, so
    // the viewer gets their own view back rather than being left looking at empty sky.
    this.track(
      shouldTrack(state.phase)
        ? { x: ROCKET_SPOT.x, y: 0.35 + state.altitude, z: ROCKET_SPOT.z }
        : null,
    );
    super.update(camera, dt);
  }
}
