import { CONCRETE_SIZE } from '../config';
import type { AppState } from '../models/appState';
import type { CameraFraming } from '../models/cameraFraming';
import { ConcreteSlab } from '../models/concrete';
import type { FireworkSim } from '../models/fireworks';
import { ConcreteView } from '../render/concreteView';
import { SceneBase, type SceneReport } from './sceneBase';

/**
 * A flat slab of poured concrete and nothing else: a surface to stand on and fire from, with the
 * fireworks inherited from SceneBase. Its appeal is the emptiness, so nothing is scattered on it.
 */
export class ConcreteScene extends SceneBase {
  private slab: ConcreteSlab;
  private view: ConcreteView;

  /** The slab is the whole subject, and the viewer stands on it rather than on a table. */
  readonly framing: CameraFraming = { radius: CONCRETE_SIZE / 2, surface: 0 };

  constructor(sim: FireworkSim, report: SceneReport, seed: string) {
    super(sim, report);
    this.slab = new ConcreteSlab(seed);
    this.view = new ConcreteView(this.three, this.slab);
  }

  /** The slab can be rebuilt from a new seed, so expose it through a getter. */
  get ground(): ConcreteSlab {
    return this.slab;
  }

  react(state: Readonly<AppState>, changed: ReadonlyArray<keyof AppState>): void {
    if (changed.includes('seed')) {
      this.slab = new ConcreteSlab(state.seed);
      this.view.dispose();
      this.view = new ConcreteView(this.three, this.slab);
    }
    this.commonReact(state, changed);
  }
}
