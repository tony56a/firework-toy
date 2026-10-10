import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FISH_DEPTH, FISH_LENGTH, SEA_SIZE } from '../config';
import type { Fish, FishPose } from '../models/sea/fish';
import { SplashPool } from './splashPool';

const BODY_COLOR = 0x8fa8bd;
const BELLY_COLOR = 0xd8dee2;
const SPLASH_COLOR = 0xe4f4f7;

/**
 * How many splash patches can be alive at once, and how fast they fade. More patches than there are
 * fish, since one fish can land twice over the life of a patch without the earlier splash having
 * finished fading.
 */
const SPLASH_COUNT = 24;
const SPLASH_OPACITY = 0.8;
const SPLASH_SPREAD = 1.6;
/** Width of the ring of foam a fish leaves, relative to its own length. */
const SPLASH_SCALE = 0.7;

/**
 * A fish built along +x with the origin at the centre of the body, nose at +x, so a pose is a
 * position and a rotation and nothing else.
 *
 * This is the fallback: a fish drawn when no downloaded mesh is available. It exists so the sea still
 * has fish in it before the asset loads, and after it fails to, rather than the scene depending on a
 * network fetch having worked.
 */
function bodyGeometry(): THREE.BufferGeometry {
  const body = new THREE.CapsuleGeometry(FISH_DEPTH / 2, FISH_LENGTH * 0.7, 4, 8)
    .rotateZ(Math.PI / 2);
  const nose = new THREE.ConeGeometry(FISH_DEPTH / 2, FISH_LENGTH * 0.35, 8)
    .rotateZ(-Math.PI / 2)
    .translate(FISH_LENGTH * 0.5, 0, 0);
  return mergeGeometries([body.toNonIndexed(), nose.toNonIndexed()])!;
}

/** The tail fin, in a second material so the fish is not one flat silhouette. */
function finGeometry(): THREE.BufferGeometry {
  const tail = new THREE.ConeGeometry(FISH_DEPTH * 0.9, FISH_LENGTH * 0.4, 3)
    .rotateZ(Math.PI / 2)
    .rotateX(Math.PI / 2)
    .translate(-FISH_LENGTH * 0.55, 0, 0);
  const dorsal = new THREE.ConeGeometry(FISH_DEPTH * 0.5, FISH_LENGTH * 0.3, 3)
    .translate(-FISH_LENGTH * 0.05, FISH_DEPTH * 0.4, 0);
  return mergeGeometries([tail.toNonIndexed(), dorsal.toNonIndexed()])!;
}

/**
 * One kind of fish in the school, and which fish are drawn as it.
 *
 * A variant can be several instanced meshes: a fallback fish is a body and a fin with different
 * materials, and both have to be drawn. A variant from a file is a single merged mesh.
 */
interface Variant {
  meshes: THREE.InstancedMesh[];
  /** Slot each member fish occupies, so a pose reaches its own slot without searching for it. */
  slotOf: Map<number, number>;
  members: number[];
}

/**
 * A school of fish, jumping in and out of the sea.
 *
 * Only leaping fish are drawn. Rendering them below the surface as well would need the water to be
 * transparent enough to see through and the fish to be sorted against it, and it would put a solid
 * shape under a semi-transparent sheet that reads as murk. The splash where a fish comes back in is
 * the cue that tells the viewer there is something down there to jump again.
 */
export class FishView {
  private variants: Variant[] = [];
  private readonly splash: SplashPool;
  private readonly splashGeometry = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
  /** Geometry this view drew itself. Geometry from a loaded file belongs to whoever loaded it. */
  private owned: THREE.BufferGeometry[] = [];
  private readonly object = new THREE.Object3D();
  private readonly count: number;

  constructor(private readonly scene: THREE.Scene, fish: readonly Fish[]) {
    this.count = Math.max(1, fish.length);
    const body = bodyGeometry();
    const fin = finGeometry();
    this.owned = [body, fin];
    this.variants = [this.makeVariant([body, fin], [
      new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: BELLY_COLOR, roughness: 0.6 }),
    ], fish.map((_, i) => i))];
    this.splash = new SplashPool(this.scene, this.splashGeometry, SPLASH_COUNT, {
      opacity: SPLASH_OPACITY,
      spread: SPLASH_SPREAD,
    });
    for (const patch of this.splash.patches) {
      (patch.material as THREE.MeshBasicMaterial).color.setHex(SPLASH_COLOR);
    }
    this.hide();
  }

  /**
   * Replaces the fallback fish with those from a loaded file.
   *
   * The pack has three different fish in it, and sixteen of the school all drawn as one of them looks
   * like sixteen copies. So each loaded fish gets its own instanced mesh and the school is dealt round
   * them, which costs one draw call per kind rather than one per fish.
   */
  setVariants(fish: ReadonlyArray<{ geometry: THREE.BufferGeometry; materials: THREE.Material[] }>): void {
    if (fish.length === 0) return;
    this.clear();
    const members = Array.from({ length: this.count }, (_, i) => i);
    this.variants = fish.map((variant, i) =>
      this.makeVariant([variant.geometry], variant.materials,
        // Round robin, so the mix is spread through the school rather than clumped at one end.
        members.filter((m) => m % fish.length === i)),
    );
    this.hide();
  }

  /** Builds the instanced meshes for one kind of fish, sized to the fish it has to draw. */
  private makeVariant(
    geometries: readonly THREE.BufferGeometry[],
    materials: THREE.Material | THREE.Material[],
    members: number[],
  ): Variant {
    const meshes = geometries.map((geometry) => {
      const mesh = new THREE.InstancedMesh(geometry, materials, Math.max(1, members.length));
      mesh.castShadow = true;
      this.scene.add(mesh);
      return mesh;
    });
    return { meshes, members, slotOf: new Map(members.map((member, slot) => [member, slot])) };
  }

  /**
   * Draws the fish that are clear of the water. Ones still swimming are parked below the basin rather
   * than removed, because the instanced count is fixed and a slot has to keep meaning the same fish.
   */
  setPoses(poses: ReadonlyArray<FishPose>): void {
    for (const { meshes, members, slotOf } of this.variants) {
      let drawn = 0;
      poses.forEach((pose, i) => {
        const slot = slotOf.get(i);
        if (slot === undefined || !pose.airborne) return;
        this.object.position.set(pose.x, pose.y, pose.z);
        // Yaw negated for the same reason as the boat: the pose is measured in the XZ plane with 0
        // along +x, and a rotation about +y turns +x toward -z.
        this.object.rotation.set(pose.pitch, -pose.yaw, 0);
        this.object.updateMatrix();
        for (const mesh of meshes) mesh.setMatrixAt(slot, this.object.matrix);
        drawn++;
      });
      for (let slot = drawn; slot < members.length; slot++) this.park(slot, meshes);
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Lays the ring of foam where a fish has just come back down into the water. */
  splashAt(x: number, y: number, z: number): void {
    this.splash.drop(x, y + 0.05, z, 0, FISH_LENGTH * SPLASH_SCALE);
  }

  update(dt: number): void {
    this.splash.update(dt);
  }

  private park(slot: number, meshes: readonly THREE.InstancedMesh[]): void {
    this.object.position.set(0, -SEA_SIZE, 0);
    this.object.rotation.set(0, 0, 0);
    this.object.updateMatrix();
    for (const mesh of meshes) mesh.setMatrixAt(slot, this.object.matrix);
  }

  /** Puts every fish below the basin, used before the first frame of poses arrives. */
  private hide(): void {
    for (const { meshes, members } of this.variants) {
      for (let slot = 0; slot < members.length; slot++) this.park(slot, meshes);
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private clear(): void {
    for (const { meshes } of this.variants) {
      for (const mesh of meshes) {
        this.scene.remove(mesh);
        mesh.dispose();
      }
    }
    this.variants = [];
  }

  dispose(): void {
    this.clear();
    // Only the fallback geometry belongs to this view; loaded geometry is the caller's.
    for (const owned of this.owned) owned.dispose();
    this.splashGeometry.dispose();
    this.splash.dispose();
  }
}