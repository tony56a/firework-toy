import type * as THREE from 'three';
import { BOAT_SPEED_DEFAULT, FISH_MODEL_URL, SEA_SIZE, WAVE_AMPLITUDE } from '../config';
import type { AppState } from '../models/appState';
import type { CameraFraming } from '../models/cameraFraming';
import type { FireworkSim } from '../models/fireworks';
import { basinCourse, boatPose, type BoatCourse } from '../models/sea/boat';
import { fishPose, hasLanded, school, type Fish } from '../models/sea/fish';
import { Sea } from '../models/sea/sea';
import { BoatView } from '../render/boatView';
import { loadFish, type FishMesh } from '../render/fishAssets';
import { FishView } from '../render/fishView';
import { SeaView } from '../render/seaView';
import { SceneBase, type SceneReport } from './sceneBase';

/** How far the boat must sail before the next patch of foam is laid. */
const WAKE_SPACING = 2.6;
/** Radians per second around the course. */
const TURN_RATE = 0.22;

/**
 * A walled basin of sea with a boat working a circuit of it. The walls are what make the water a
 * bounded thing: the swell eases to nothing against them, and the firework launcher clamps to the
 * basin the same way the camera frames it.
 */
export class SeaScene extends SceneBase {
  /** The basin is the subject, and a viewer stands on its wall rather than on the water. */
  readonly framing: CameraFraming = {
    radius: SEA_SIZE / 2,
    surface: WAVE_AMPLITUDE,
    eye: { x: 0, z: SEA_SIZE / 2 },
  };
  private readonly sea = new Sea();
  private readonly course: BoatCourse = basinCourse();
  private readonly view: SeaView;
  private readonly boat: BoatView;
  private fishes: readonly Fish[];
  private fish: FishView;
  private angle = 0;
  private speed = BOAT_SPEED_DEFAULT;
  /** Distance sailed since the last patch of foam, so the wake is laid by distance not by time. */
  private sinceWake = WAKE_SPACING;
  /** The instant the previous frame was drawn at, which is how a landing is recognised. */
  private lastTime = 0;
  /** The fitted downloaded fish, kept so a reseeded school can be rebuilt with them. */
  private asset: FishMesh[] = [];

  constructor(sim: FireworkSim, report: SceneReport, seed: string) {
    super(sim, report);
    this.view = new SeaView(this.three, this.sea);
    this.boat = new BoatView(this.three);
    this.fishes = school(seed);
    this.fish = new FishView(this.three, this.fishes);
    this.loadFish();
  }

  /**
   * Fetches the fish mesh and swaps it in when it arrives.
   *
   * Deliberately not awaited: the scene is built synchronously from the cache and the frame loop
   * starts immediately, so a slow or missing file costs the fish their downloaded look rather than
   * the whole scene appearing. The fallback fish drawn in code is already on screen by then.
   */
  private loadFish(): void {
    void loadFish(FISH_MODEL_URL)
      .then((fish) => {
        if (fish.length === 0) return;
        this.asset = fish;
        this.fish.setVariants(fish);
      })
      .catch(() => {
        // No file, or one that is not readable glTF. The school keeps the fish it was drawn with,
        // which is the whole reason the fallback exists.
      });
  }

  /** The sea is the ground: it sizes the basin and carries the waves the boat floats on. */
  get ground(): Sea {
    return this.sea;
  }

  react(state: Readonly<AppState>, changed: ReadonlyArray<keyof AppState>): void {
    if (changed.includes('seed')) this.reseed(state.seed);
    if (changed.includes('boatSpeed')) this.speed = state.boatSpeed;
    this.commonReact(state, changed);
  }

  /**
   * Builds a new school for a new seed. The school is generated rather than drawn from the scene's
   * seed every frame, so randomizing gives a visibly different shoal.
   */
  reseed(seed: string): void {
    this.fish.dispose();
    this.fishes = school(seed);
    this.fish = new FishView(this.three, this.fishes);
    // A school has a new size, and the instanced meshes were built for the old one. The downloaded
    // fish are kept so the new school is drawn with them rather than dropping back to the fallback.
    if (this.asset.length > 0) this.fish.setVariants(this.asset);
  }

  update(camera: THREE.Camera, dt: number): void {
    // The sea advances first: the surface, the boat and anything reading a wave height this frame
    // must all be looking at the same instant of the swell, not one frame apart.
    this.sea.advance(dt);
    // The course turns in proportion to speed, so stopping the boat also stops its heading changing
    // rather than leaving it steering on the spot.
    this.angle += TURN_RATE * this.speed * dt;
    const pose = boatPose(this.course, this.angle, this.sea);
    this.view.update();
    this.boat.setPose(pose);
    this.sinceWake += this.speed * dt;
    if (this.sinceWake >= WAKE_SPACING) {
      this.sinceWake = 0;
      this.boat.dropWake(pose.x, pose.y, pose.z, pose.yaw);
    }
    this.boat.fadeWake(dt);

    // Fish are posed from absolute time, so they are asked about the instant this frame is at rather
    // than being stepped forward by dt. The previous instant is kept so a fish coming back down can
    // be told apart from one that has been swimming all along.
    const time = this.sea.elapsed;
    const poses = this.fishes.map((f) => fishPose(f, time, this.sea));
    this.fish.setPoses(poses);
    this.fishes.forEach((f, i) => {
      if (!hasLanded(f, this.lastTime, time)) return;
      const pose = poses[i];
      this.fish.splashAt(pose.x, pose.y, pose.z);
    });
    this.lastTime = time;
    this.fish.update(dt);
    super.update(camera, dt);
  }
}