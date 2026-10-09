import type * as THREE from 'three';
import type { AppState } from '../models/appState';
import type { Ground } from '../models/ground';

/**
 * One renderable world: a scene graph plus the ground the camera and fireworks sit on.
 * Scenes are built on demand and then cached, so they are never torn down.
 */
export interface Scene {
  /** The scene graph to draw. */
  readonly three: THREE.Scene;
  /** Heights and bounds for the camera and for picking launch positions. */
  readonly ground: Ground;

  /**
   * Applies the store changes a scene cares about. Scenes are told which keys changed so they can
   * skip expensive rebuilds; a scene swap replays every key.
   */
  react(state: Readonly<AppState>, changed: ReadonlyArray<keyof AppState>): void;

  /** Per-frame work, immediately before the scene is drawn. */
  update(camera: THREE.Camera, dt: number): void;
}
