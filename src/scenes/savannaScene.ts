import type * as THREE from 'three';
import { HERD_SPEED_DEFAULT, SAVANNA_SIZE } from '../config';
import type { AppState } from '../models/appState';
import type { CameraFraming } from '../models/cameraFraming';
import type { FireworkSim } from '../models/fireworks';
import { scatterAcacias, type Acacia } from '../models/savanna/acacias';
import { Savanna } from '../models/savanna/ground';
import { herd, grazerPose, type Grazer, type GrazerKind } from '../models/savanna/grazer';
import { AcaciaView } from '../render/acaciaView';
import { HerdView } from '../render/herdView';
import { SavannaView } from '../render/savannaView';
import { SceneBase, type SceneReport } from './sceneBase';

/**
 * A savanna: dry ground, flat-topped acacias, and a herd of grazers wandering between them.
 *
 * The herd is the subject rather than the land, so the ground is left flat and open and the trees are
 * scattered at wide spacing to leave room to graze between them. Nothing here fires: the fireworks
 * and rockets come from SceneBase, and the herd is what is worth watching instead.
 */
export class SavannaScene extends SceneBase {
  /** The whole plain is the subject, and the viewer stands on it rather than on a slab. */
  readonly framing: CameraFraming = { radius: SAVANNA_SIZE / 2, surface: 0 };
  private readonly groundView: SavannaView;
  private readonly acaciaView: AcaciaView;
  private herdView: HerdView;
  /** Rebuilt when the seed changes, so it is read back through the `ground` getter. */
  private plain: Savanna;
  private acacias: Acacia[] = [];
  private grazers: readonly Grazer[] = [];
  private speed = HERD_SPEED_DEFAULT;
  /** Seconds this scene has been running, which is the clock the herd is posed against. */
  private elapsed = 0;

  constructor(sim: FireworkSim, report: SceneReport, seed: string) {
    super(sim, report);
    this.groundView = new SavannaView(this.three);
    this.acaciaView = new AcaciaView(this.three);
    this.herdView = new HerdView(this.three);
    this.plain = new Savanna(seed);
    this.groundView.set(this.plain);
  }

  get ground(): Savanna {
    return this.plain;
  }

  react(state: Readonly<AppState>, changed: ReadonlyArray<keyof AppState>): void {
    if (changed.includes('seed')) {
      this.plain = new Savanna(state.seed);
      this.groundView.set(this.plain);
      this.rebuildAcacias(state.seed, state.acaciaCount);
      this.rebuildHerd(state.seed, state.herdSize);
    } else if (changed.includes('acaciaCount')) {
      this.rebuildAcacias(state.seed, state.acaciaCount);
    } else if (changed.includes('herdSize')) {
      this.rebuildHerd(state.seed, state.herdSize);
    }
    if (changed.includes('herdSpeed')) this.speed = state.herdSpeed;
    this.commonReact(state, changed);
    this.report.setStats('savanna', `${this.acacias.length} acacias, ${this.grazers.length} grazers`);
  }

  /**
   * Rescatters the acacias from scratch rather than adding to or removing from the existing stand, so
   * that the count slider and the seed change both produce the same stand for the same inputs. An
   * incremental scatter would drift every time the slider moved.
   */
  private rebuildAcacias(seed: string, count: number): void {
    this.acacias = scatterAcacias(this.plain, seed, count);
    this.acaciaView.set(this.acacias);
  }

  /**
   * Builds a new herd. The animals are generated rather than drawn from the scene's own objects, so
   * a different size gives a visibly different set of them standing on the same ground.
   */
  private rebuildHerd(seed: string, size: number): void {
    this.grazers = herd(seed, size, SAVANNA_SIZE);
    // The instanced meshes were built for the old herd, so they go and are made again for this one.
    this.herdView.dispose();
    this.herdView = new HerdView(this.three);
    this.herdView.set(this.grazers.map((g) => g.kind));
  }

  update(camera: THREE.Camera, dt: number): void {
    // The herd is posed from absolute time rather than stepped forward by dt, so its position never
    // drifts with frame rate and two animals asked about the same instant agree with each other.
    this.elapsed += dt;
    const kinds: readonly GrazerKind[] = this.grazers.map((g) => g.kind);
    this.herdView.pose(kinds, this.grazers.map((g) => grazerPose(g, this.elapsed, this.plain, this.speed)));
    super.update(camera, dt);
  }
}