import * as THREE from 'three';
import type { AppState } from '../models/appState';
import type { CameraFraming } from '../models/cameraFraming';
import type { FireworkSim } from '../models/fireworks';
import type { SceneId } from '../models/scenes';
import type { Ground } from '../models/ground';
import { TIME_PRESETS } from '../models/timeOfDay';
import { Atmosphere } from '../render/atmosphere';
import { FireworksView } from '../render/fireworksView';
import { RocketView } from '../render/rocketView';
import type { Scene } from './scene';

/** Lets a scene report things to the UI without knowing what a control panel is. */
export interface SceneReport {
  /** Fills in the muted readout under the scene's controls, with a count of what it drew. */
  setStats(scene: SceneId, text: string): void;
}

/**
 * What every scene shares: a scene graph, the sky, and the firework layer. Fireworks come from one
 * simulation shared by every scene, so shells in flight survive a scene swap.
 */
export abstract class SceneBase implements Scene {
  abstract readonly ground: Ground;
  abstract readonly framing: CameraFraming;
  abstract react(state: Readonly<AppState>, changed: ReadonlyArray<keyof AppState>): void;
  readonly three = new THREE.Scene();
  private readonly atmosphere: Atmosphere;
  private readonly fireworks: FireworksView;
  private readonly rockets: RocketView;

  constructor(protected readonly sim: FireworkSim, protected readonly report: SceneReport) {
    this.atmosphere = new Atmosphere(this.three);
    this.fireworks = new FireworksView(this.three, sim);
    this.rockets = new RocketView(this.three, sim);
  }

  /** State every scene reacts to, whatever else it draws. */
  protected commonReact(state: Readonly<AppState>, changed: ReadonlyArray<keyof AppState>): void {
    if (changed.includes('timeOfDay')) this.atmosphere.apply(TIME_PRESETS[state.timeOfDay]);
    if (changed.includes('showRockets')) this.rockets.setVisible(state.showRockets);
  }

  update(camera: THREE.Camera, _dt: number): void {
    this.atmosphere.follow(camera);
    this.rockets.sync();
    this.fireworks.sync();
  }
}
