import { CONCRETE_SIZE } from '../config';
import type { AppState } from '../models/appState';
import type { CameraFraming } from '../models/cameraFraming';
import { CONCRETE_GROUND } from '../models/concrete';
import type { FireworkSim } from '../models/fireworks';
import type { Ground } from '../models/ground';
import { ConcreteView } from '../render/concreteView';
import { SceneBase, type SceneReport } from './sceneBase';

/**
 * A flat slab of poured concrete and nothing else: a surface to stand on and fire from, with the
 * fireworks inherited from SceneBase. Its appeal is the emptiness, so nothing is scattered on it.
 */
export class ConcreteScene extends SceneBase {
  private readonly view: ConcreteView;

  /** The slab is the whole subject, and the viewer stands on it rather than on a table. */
  readonly framing: CameraFraming = { radius: CONCRETE_SIZE / 2, surface: 0 };

  constructor(sim: FireworkSim, report: SceneReport, seed: string) {
    super(sim, report);
    this.view = new ConcreteView(this.three, seed);
  }

  /** The slab is flat and never changes, so one shared instance describes it. */
  readonly ground: Ground = CONCRETE_GROUND;

  react(state: Readonly<AppState>, changed: ReadonlyArray<keyof AppState>): void {
    // Only a uniform changes now, so there is no geometry to rebuild.
    if (changed.includes('seed')) this.view.setSeed(state.seed);
    this.commonReact(state, changed);
  }
}
