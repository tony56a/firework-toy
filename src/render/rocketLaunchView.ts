import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLUME_FLICKER, PLUME_LENGTH, ROCKET_HEIGHT, ROCKET_RADIUS } from '../config';
import { launchFinished, launchState, type LaunchState } from '../models/launch';
import { ROCKET_SPOT } from '../models/site';

const merged = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry =>
  mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;

const ROCKET_WHITE = 0xe8e8e4;
const ROCKET_BAND = 0xc23b2c;
const FLAME_OUTER = 0xffb347;
const FLAME_INNER = 0xfff3c4;

/** Nose points up, base at the origin, so the mesh can simply be lifted by its altitude. */
export function rocketGeometry(): THREE.BufferGeometry {
  const bodyLength = ROCKET_HEIGHT * 0.62;
  const noseLength = ROCKET_HEIGHT * 0.22;
  const finLength = ROCKET_HEIGHT * 0.16;
  return merged([
    new THREE.CylinderGeometry(ROCKET_RADIUS, ROCKET_RADIUS, bodyLength, 16)
      .translate(0, bodyLength / 2, 0),
    new THREE.ConeGeometry(ROCKET_RADIUS, noseLength, 16)
      .translate(0, bodyLength + noseLength / 2, 0),
    ...[0, 1, 2].map((i) => {
      const fin = new THREE.BoxGeometry(0.25, finLength, ROCKET_RADIUS * 1.5);
      fin.translate(ROCKET_RADIUS * 0.9, finLength / 2, 0);
      return fin.rotateY((i * Math.PI * 2) / 3);
    }),
  ]);
}

/**
 * The rocket and its engine plume, driven by the pure launch sequence. The rocket is lifted by its
 * altitude and hidden once it bursts; the plume is three stacked cones that flicker, which is
 * cheaper than particles and reads the same at this size.
 */
export class RocketLaunchView {
  private readonly group = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly band: THREE.Mesh;
  private readonly flames: THREE.Mesh[] = [];
  private elapsed = 0;
  private launched = false;
  private time = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.body = new THREE.Mesh(
      rocketGeometry(),
      new THREE.MeshStandardMaterial({ color: ROCKET_WHITE, roughness: 0.45, metalness: 0.05 }),
    );
    this.body.castShadow = true;
    this.group.add(this.body);

    this.band = new THREE.Mesh(
      new THREE.CylinderGeometry(ROCKET_RADIUS * 1.02, ROCKET_RADIUS * 1.02, ROCKET_HEIGHT * 0.1, 16)
        .translate(0, ROCKET_HEIGHT * 0.62 * 0.55, 0),
      new THREE.MeshStandardMaterial({ color: ROCKET_BAND, roughness: 0.5 }),
    );
    this.band.castShadow = true;
    this.group.add(this.band);

    // Three nested cones, widest and dimmest outside, pointing down from the engine.
    const layers: ReadonlyArray<[number, number, number]> = [
      [PLUME_LENGTH, 1.5, FLAME_OUTER],
      [PLUME_LENGTH * 0.72, 1.0, FLAME_INNER],
      [PLUME_LENGTH * 0.45, 0.55, 0xffffff],
    ];
    for (const [length, width, color] of layers) {
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(width, length, 10).rotateX(Math.PI).translate(0, -length / 2, 0),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
      );
      flame.visible = false;
      this.flames.push(flame);
      this.group.add(flame);
    }

    this.group.position.set(ROCKET_SPOT.x, 0.35, ROCKET_SPOT.z);
    this.scene.add(this.group);
  }

  /** Starts the sequence. Does nothing if a launch is already running. */
  launch(): void {
    if (this.launched) return;
    this.launched = true;
    this.elapsed = 0;
  }

  get isLaunching(): boolean {
    return this.launched;
  }

  /**
   * Advances the sequence and returns the current state, so the scene can fire the burst through
   * the fireworks simulation at the right moment.
   */
  update(dt: number): LaunchState {
    this.time += dt;
    const state = launchState(this.launched ? this.elapsed : -1);
    if (this.launched) {
      this.elapsed += dt;
      // launchFinished owns the reset timing, so this cannot drift from the model.
      if (launchFinished(this.elapsed)) this.launched = false;
    }
    this.apply(state);
    return state;
  }

  private apply(state: LaunchState): void {
    this.group.visible = state.visible || state.throttle > 0;
    this.group.position.y = 0.35 + state.altitude;
    // Flicker each layer at a different rate so the plume shimmers rather than pulsing as one.
    this.flames.forEach((flame, i) => {
      flame.visible = state.throttle > 0;
      const flicker = 0.82 + Math.sin(this.time * PLUME_FLICKER + i * 2.1) * 0.12
        + Math.sin(this.time * PLUME_FLICKER * 1.7 + i) * 0.06;
      flame.scale.set(
        (0.7 + state.throttle * 0.5) * flicker,
        state.throttle * flicker,
        (0.7 + state.throttle * 0.5) * flicker,
      );
      (flame.material as THREE.MeshBasicMaterial).opacity = 0.5 + state.throttle * 0.4;
    });
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[];
      for (const one of Array.isArray(material) ? material : [material]) one.dispose();
    });
  }
}
