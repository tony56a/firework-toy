import { CONCRETE_SIZE, COUNTDOWN_DEFAULT, COUNTDOWN_MAX, COUNTDOWN_MIN, SITE_VIEWER_Z } from '../config';
import type * as THREE from 'three';
import type { AppState } from '../models/appState';
import type { CameraFraming } from '../models/cameraFraming';
import { CONCRETE_GROUND } from '../models/concrete';
import { PALETTES } from '../models/fireworkPalettes';
import { countdownOver, countdownStep } from '../models/countdown';
import { phrase, type LanguageId } from '../models/countdownPhrases';
import { BURST_POINT } from '../models/launch';
import { ROCKET_SPOT } from '../models/site';
import type { FireworkSim } from '../models/fireworks';
import type { Ground } from '../models/ground';
import { ConcreteView } from '../render/concreteView';
import { RocketLaunchView } from '../render/rocketLaunchView';
import { SiteView } from '../render/siteView';
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
  /** Injected rather than constructed here, so the app can share one speech voice across scenes. */
  private readonly speak: (text: string, language: LanguageId) => void;

  /**
   * The slab is the whole subject, and the viewer stands on it rather than on a table. They stand
   * back from the pad, since the rocket occupies the origin and a viewer there would be inside it.
   */
  readonly framing: CameraFraming = {
    radius: CONCRETE_SIZE / 2,
    surface: 0,
    eye: { x: 0, z: SITE_VIEWER_Z },
  };

  constructor(
    sim: FireworkSim,
    report: SceneReport,
    seed: string,
    speak: (text: string, language: LanguageId) => void = () => {},
  ) {
    super(sim, report);
    this.speak = speak;
    this.view = new ConcreteView(this.three, seed);
    this.site = new SiteView(this.three, seed);
    this.rocket = new RocketLaunchView(this.three);
  }

  /** Sets the language the countdown is spoken in. */
  setLanguage(language: LanguageId): void {
    this.language = language;
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
    // Read the count when the launch starts, so changing it mid-count cannot shorten the sequence.
    this.activeCount = this.countFrom;
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
    const state = this.rocket.update(dt);
    // burstAt, not launchVolley: the rocket has already flown to its apex, so this wants a burst
    // where it is rather than another shell fired from that height.
    if (state.burst) {
      this.sim.burstAt(ROCKET_SPOT.x, BURST_POINT.y, ROCKET_SPOT.z, PALETTES.warm, 'peony');
    }
    super.update(camera, dt);
  }
}
