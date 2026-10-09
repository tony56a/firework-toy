import { CONCRETE_SIZE } from '../config';
import type { AppState } from '../models/appState';
import type { CameraFraming } from '../models/cameraFraming';
import { CONCRETE_GROUND } from '../models/concrete';
import type { FireworkSim } from '../models/fireworks';
import type { Ground } from '../models/ground';
import { ConcreteView } from '../render/concreteView';
import { SiteView } from '../render/siteView';
import { SceneBase, type SceneReport } from './sceneBase';

/**
 * A flat slab of poured concrete with a launch site standing on it: apron, rocket, service tower
 * and the ground buildings around them. The fireworks layer is inherited from SceneBase, so a
 * shell burst over the pad reads against the horizon.
 */
export class ConcreteScene extends SceneBase {
  private readonly view: ConcreteView;
  private site: SiteView;

  /** The slab is the whole subject, and the viewer stands on it rather than on a table. */
  readonly framing: CameraFraming = { radius: CONCRETE_SIZE / 2, surface: 0 };

  constructor(sim: FireworkSim, report: SceneReport, seed: string) {
    super(sim, report);
    this.view = new ConcreteView(this.three, seed);
    this.site = new SiteView(this.three, seed);
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
}
