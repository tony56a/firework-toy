import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLUME_FLICKER, PLUME_LENGTH, ROCKET_HEIGHT, ROCKET_RADIUS } from '../config';
import { launchFinished, launchState, type LaunchState } from '../models/concrete/launch';
import { ROCKET_SPOT } from '../models/concrete/site';

const merged = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry =>
  mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;

const ROCKET_WHITE = 0xe8e8e4;
const ROCKET_BAND = 0x2f3134;
const ROCKET_ACCENT = 0x1b3a6b;
const FLAME_OUTER = 0xffb347;
const FLAME_INNER = 0xfff3c4;

/**
 * An Atlas V 551, scaled down to ROCKET_HEIGHT. Lengths are fractions of the overall height so the
 * proportions survive a retune of that, and are taken from the real vehicle: a 32.5 m Common Core
 * Booster, an interstage, and the 5.4 m RUAG fairing that swallows the Centaur and the payload.
 */
const CORE_LENGTH = ROCKET_HEIGHT * 0.557;
const INTERSTAGE = ROCKET_HEIGHT * 0.027;
/** The fairing is wider than the booster beneath it, which is most of what makes a 551 a 551. */
const FAIRING_RADIUS = ROCKET_RADIUS * 1.42;
const FAIRING_LENGTH = ROCKET_HEIGHT * 0.416;
const SRB_RADIUS = ROCKET_RADIUS * 0.42;
const SRB_LENGTH = ROCKET_HEIGHT * 0.292;
/** Stand-off from the core axis, so the boosters sit alongside it rather than through it. */
const SRB_AXIS = ROCKET_RADIUS * 1.46;
const NOZZLE_RADIUS = ROCKET_RADIUS * 0.5;
const NOZZLE_HEIGHT = ROCKET_HEIGHT * 0.041;

/**
 * Five boosters in a fan with the gap facing away from the standing viewer. Every Atlas V SRB layout
 * is asymmetric, since five will not divide evenly round the core, but the article does not give the
 * azimuths, so the angles here are chosen to read well rather than measured.
 */
const SRB_AZIMUTHS = [60, 120, 180, 240, 300].map((deg) => (deg * Math.PI) / 180);

/**
 * The RUAG fairing is an ogive, blunter than a cone and rounded at the tip. Falling off a cosine
 * softened by a power keeps the full width low down and rounds the nose, which a plain cone would
 * leave as a spike.
 */
function fairing(radius: number, height: number): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    profile.push(new THREE.Vector2(radius * Math.cos((t * Math.PI) / 2) ** 0.8, height * t));
  }
  return new THREE.LatheGeometry(profile, 16);
}

/** One booster: a casing with a conical nose, standing on its own offset from the core axis. */
function booster(azimuth: number): THREE.BufferGeometry {
  const nose = SRB_LENGTH * 0.14;
  const casing = new THREE.CylinderGeometry(SRB_RADIUS, SRB_RADIUS, SRB_LENGTH, 10).translate(0, SRB_LENGTH / 2, 0);
  const tip = new THREE.ConeGeometry(SRB_RADIUS, nose, 10).translate(0, SRB_LENGTH + nose / 2, 0);
  return merged([casing, tip]).translate(Math.sin(azimuth) * SRB_AXIS, 0, Math.cos(azimuth) * SRB_AXIS);
}

/**
 * Nose points up, base at the origin, so the mesh can simply be lifted by its altitude. Everything
 * is one geometry in the rocket's white, so the whole vehicle moves as a single object.
 */
export function rocketGeometry(): THREE.BufferGeometry {
  const nozzle = new THREE.CylinderGeometry(
    NOZZLE_RADIUS * 0.75, NOZZLE_RADIUS, NOZZLE_HEIGHT, 12,
  ).translate(0, NOZZLE_HEIGHT / 2, 0);
  return merged([
    new THREE.CylinderGeometry(ROCKET_RADIUS, ROCKET_RADIUS, CORE_LENGTH, 16).translate(0, CORE_LENGTH / 2, 0),
    // The interstage is a separate mesh in the darker band colour, so the fairing starts at its top.
    fairing(FAIRING_RADIUS, FAIRING_LENGTH).translate(0, CORE_LENGTH + INTERSTAGE, 0),
    nozzle,
    ...SRB_AZIMUTHS.map(booster),
  ]);
}

/** The dark band where the booster ends and the fairing begins. */
function interstageGeometry(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(ROCKET_RADIUS * 1.01, ROCKET_RADIUS * 1.01, INTERSTAGE, 16)
    .translate(0, CORE_LENGTH + INTERSTAGE / 2, 0);
}

/** A thin blue ring at the base of the fairing, standing in for the vehicle's painted markings. */
function accentGeometry(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(FAIRING_RADIUS * 1.004, FAIRING_RADIUS * 1.004, ROCKET_HEIGHT * 0.018, 16)
    .translate(0, CORE_LENGTH + INTERSTAGE + ROCKET_HEIGHT * 0.022, 0);
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
  private readonly accent: THREE.Mesh;
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
      interstageGeometry(),
      new THREE.MeshStandardMaterial({ color: ROCKET_BAND, roughness: 0.5 }),
    );
    this.band.castShadow = true;
    this.group.add(this.band);

    this.accent = new THREE.Mesh(
      accentGeometry(),
      new THREE.MeshStandardMaterial({ color: ROCKET_ACCENT, roughness: 0.5 }),
    );
    this.group.add(this.accent);

    // Three nested cones, widest and dimmest outside, pointing down from the engine. Widths are
    // fractions of the core radius: the RD-180 exit is about half the booster's diameter, so the
    // plume is narrow, and scaling it to the old absolute numbers would have made it twice as wide
    // as the rocket it came out of.
    const layers: ReadonlyArray<[number, number, number]> = [
      [PLUME_LENGTH, ROCKET_RADIUS * 1.06, FLAME_OUTER],
      [PLUME_LENGTH * 0.72, ROCKET_RADIUS * 0.72, FLAME_INNER],
      [PLUME_LENGTH * 0.45, ROCKET_RADIUS * 0.39, 0xffffff],
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
  update(dt: number, burstHeight: number): LaunchState {
    this.time += dt;
    const state = launchState(this.launched ? this.elapsed : -1, burstHeight);
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
