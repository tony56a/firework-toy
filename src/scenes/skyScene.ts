import * as THREE from 'three';
import { TRACK_RADIUS } from '../config';
import type { AppState } from '../models/appState';
import type { FireworkSim } from '../models/fireworks';
import { FlatGround } from '../models/ground';
import { TABLE_MODELS, TRACK_BOUNDS } from '../models/tableModels';
import { roundedRectTrack } from '../models/track';
import { ModelTableView } from '../render/modelTableView';
import { TrainView } from '../render/trainView';
import { SceneBase, type SceneReport } from './sceneBase';

const TRACK = roundedRectTrack(TRACK_BOUNDS.width, TRACK_BOUNDS.depth, TRACK_RADIUS);

/**
 * A diorama in open sky: a table of models with a toy train running a loop around them. The
 * firework layer is inherited from SceneBase, so bursts still read against the horizon.
 */
export class SkyScene extends SceneBase {
  readonly ground = new FlatGround();
  private readonly table: ModelTableView;
  private readonly train: TrainView;

  constructor(sim: FireworkSim, report: SceneReport) {
    super(sim, report);
    this.table = new ModelTableView(this.three);
    this.table.set(TABLE_MODELS);
    // Wheels sit at local y = 0, so the group goes straight on the tabletop; the sleepers the view
    // lays just under it rest on the surface in turn.
    this.train = new TrainView(this.three, TRACK, ModelTableView.surfaceY);
  }

  react(state: Readonly<AppState>, changed: ReadonlyArray<keyof AppState>): void {
    if (changed.includes('trainSpeed')) this.train.setSpeed(state.trainSpeed);
    this.commonReact(state, changed);
  }

  update(camera: THREE.Camera, dt: number): void {
    this.train.update(dt);
    super.update(camera, dt);
  }
}