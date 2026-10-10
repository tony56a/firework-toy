import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOAT_BEAM, BOAT_LENGTH } from '../config';
import type { BoatPose } from '../models/sea/boat';
import { SplashPool } from './splashPool';

const HULL_COLOR = 0xe8e2d6;
const CABIN_COLOR = 0x9c3b2e;
const TRIM_COLOR = 0x2f4858;
const MAST_COLOR = 0xd9d2c4;
const FOAM_COLOR = 0xdff2f6;

/** How deep the hull sits below the waterline, so the deck rides above it. */
const FREEBOARD = 0.55;

/** Wake patches alive at once, how fast they fade, and how fast they spread as they go. */
const WAKE_COUNT = 14;
const WAKE_FADE = 0.5;
const WAKE_SPREAD = 0.4;
const WAKE_START_SCALE = 0.8;

/**
 * The hull is built along +x with the origin at the waterline amidships, so a pose is just a
 * position and a rotation. The bow is a wedge and the stern a transom, which is enough shape to
 * read as a boat from any of the camera's fixed views.
 */
function hullGeometry(): THREE.BufferGeometry {
  const bow = new THREE.CylinderGeometry(0, BOAT_BEAM / 2, BOAT_LENGTH * 0.3, 3, 1)
    .rotateZ(-Math.PI / 2)
    .rotateX(Math.PI / 2)
    .translate(BOAT_LENGTH * 0.35, -FREEBOARD * 0.4, 0);
  const body = new THREE.BoxGeometry(BOAT_LENGTH * 0.7, FREEBOARD * 1.6, BOAT_BEAM)
    .translate(-BOAT_LENGTH * 0.15, -FREEBOARD * 0.4, 0);
  return mergeGeometries([bow.toNonIndexed(), body.toNonIndexed()])!;
}

/** Cabin and mast. Merged, but kept in two groups so they can be tinted apart. */
function fittingGeometry(): THREE.BufferGeometry {
  const cabin = new THREE.BoxGeometry(BOAT_LENGTH * 0.26, 1.3, BOAT_BEAM * 0.7)
    .translate(-BOAT_LENGTH * 0.16, FREEBOARD * 0.9, 0);
  const mast = new THREE.CylinderGeometry(0.11, 0.14, BOAT_LENGTH * 0.75, 8)
    .translate(BOAT_LENGTH * 0.12, FREEBOARD * 0.4 + BOAT_LENGTH * 0.375, 0);
  return mergeGeometries([cabin.toNonIndexed(), mast.toNonIndexed()], true)!;
}

/** Gunwale rail and boom, which sit along the hull and pick up its roll. */
function trimGeometry(): THREE.BufferGeometry {
  const rail = new THREE.BoxGeometry(BOAT_LENGTH * 0.92, 0.16, BOAT_BEAM * 1.06)
    .translate(-BOAT_LENGTH * 0.02, FREEBOARD * 0.45, 0);
  const boom = new THREE.CylinderGeometry(0.08, 0.08, BOAT_LENGTH * 0.42, 6)
    .rotateZ(Math.PI / 2)
    .translate(BOAT_LENGTH * 0.12, FREEBOARD * 0.4 + BOAT_LENGTH * 0.32, 0);
  return mergeGeometries([rail.toNonIndexed(), boom.toNonIndexed()], true)!;
}

/**
 * A small sailing boat on the sea, plus the wake it drags behind it.
 *
 * The boat holds no navigation state of its own: the scene hands it a pose each frame. What the view
 * does own is the wake, because laying foam is a rendering decision — how far back to drop a patch,
 * how fast it fades — and none of that belongs in the model.
 */
export class BoatView {
  private readonly group = new THREE.Group();
  private readonly wake: SplashPool;
  private readonly wakeGeometry = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2);
  /** Every geometry the boat owns, freed together. */
  private readonly geometries = [hullGeometry(), fittingGeometry(), trimGeometry(), this.wakeGeometry];

  constructor(private readonly scene: THREE.Scene) {
    const hull = new THREE.Mesh(this.geometries[0], new THREE.MeshStandardMaterial({ color: HULL_COLOR, roughness: 0.6 }));
    const fittings = new THREE.Mesh(this.geometries[1], [
      new THREE.MeshStandardMaterial({ color: CABIN_COLOR, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: MAST_COLOR, roughness: 0.5 }),
    ]);
    const trim = new THREE.Mesh(this.geometries[2], [
      new THREE.MeshStandardMaterial({ color: TRIM_COLOR, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: TRIM_COLOR, roughness: 0.5 }),
    ]);
    for (const mesh of [hull, fittings, trim]) {
      mesh.castShadow = true;
      this.group.add(mesh);
    }
    this.scene.add(this.group);

    // Tinted once here rather than per patch: the pool makes one material each, and they all want
    // the same foam colour.
    this.wake = new SplashPool(this.scene, this.wakeGeometry, WAKE_COUNT, {
      opacity: WAKE_FADE,
      spread: WAKE_SPREAD,
    });
    for (const patch of this.wake.patches) {
      (patch.material as THREE.MeshBasicMaterial).color.setHex(FOAM_COLOR);
    }
  }

  setPose(pose: BoatPose): void {
    this.group.position.set(pose.x, pose.y, pose.z);
    // Yaw is negated because the pose is measured in the XZ plane with 0 along +x, while a rotation
    // about +y turns +x toward -z. Pitch and roll are already in the mesh's own frame.
    this.group.rotation.set(pose.pitch, -pose.yaw, pose.roll);
  }

  /**
   * Lays a patch of foam in the boat's wake. The scene calls this on a timer rather than every
   * frame, so the trail is a line of patches with water showing between them, which is what a wake
   * looks like from above rather than a solid smear.
   */
  dropWake(x: number, y: number, z: number, yaw: number): void {
    // Laid behind the boat, so the foam marks where it has been rather than where it is.
    this.wake.drop(
      x - Math.cos(yaw) * BOAT_LENGTH * 0.4,
      y + 0.04,
      z - Math.sin(yaw) * BOAT_LENGTH * 0.4,
      yaw,
      WAKE_START_SCALE,
    );
  }

  /** Fades every laid patch, spreading as it goes, and retires the ones that have gone. */
  fadeWake(dt: number): void {
    this.wake.update(dt);
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const mesh of this.group.children as THREE.Mesh[]) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
    }
    for (const geometry of this.geometries) geometry.dispose();
    this.wake.dispose();
  }
}