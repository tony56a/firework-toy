import type { AppState } from '../models/appState';
import { FlatGround } from '../models/ground';
import { SceneBase } from './sceneBase';

/**
 * Sky and fireworks with nothing else in them. There is no terrain to scatter trees onto, so the
 * ground is a flat plane and the camera sits at a fixed height.
 */
export class SkyScene extends SceneBase {
  readonly ground = new FlatGround();

  react(state: Readonly<AppState>, changed: ReadonlyArray<keyof AppState>): void {
    this.commonReact(state, changed);
  }
}
