import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FireworkSim } from '../models/fireworks';

/** A rocket is a speck next to a burst; sizes are in world units. */
const MAX_ROCKETS = 64;
const BODY_RADIUS = 1.1;
const BODY_LENGTH = 7.2;
const NOSE_LENGTH = 2.8;
const PLUME_LENGTH = 9;

const merged = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry =>
  mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;

/** Nose points along +y, base at the origin, so the mesh can be aimed straight down a velocity vector. */
const BODY = merged([
  new THREE.CylinderGeometry(BODY_RADIUS, BODY_RADIUS, BODY_LENGTH, 8).translate(0, BODY_LENGTH / 2, 0),
  new THREE.ConeGeometry(BODY_RADIUS, NOSE_LENGTH, 8).translate(0, BODY_LENGTH + NOSE_LENGTH / 2, 0),
  ...[0, 1, 2].map((i) => {
    const fin = new THREE.BoxGeometry(BODY_RADIUS * 1.6, NOSE_LENGTH, 0.03);
    fin.translate(BODY_RADIUS * 0.9, NOSE_LENGTH / 2, 0);
    return fin.rotateY((i * Math.PI * 2) / 3);
  }),
]);

/** Exhaust cone: wide at the motor, tapering away from the rocket. */
const PLUME = new THREE.CylinderGeometry(BODY_RADIUS * 1.4, 0.02, PLUME_LENGTH, 8, 1, true)
  .translate(0, -PLUME_LENGTH / 2, 0);

const BODY_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.5, metalness: 0.1 });
const PLUME_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
  depthWrite: false, side: THREE.DoubleSide, fog: false,
});

/**
 * Draws the rockets currently in flight as one instanced body mesh plus an additive exhaust plume,
 * aimed along each rocket's velocity and tinted with its burst color. Rockets are transient, so the
 * instance count tracks the simulation instead of allocating per launch.
 */
export class RocketView {
  private readonly bodies: THREE.InstancedMesh;
  private readonly plumes: THREE.InstancedMesh;
  private readonly object = new THREE.Object3D();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly direction = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor(private readonly scene: THREE.Scene, private readonly sim: FireworkSim) {
    this.bodies = new THREE.InstancedMesh(BODY, BODY_MATERIAL, MAX_ROCKETS);
    this.plumes = new THREE.InstancedMesh(PLUME, PLUME_MATERIAL, MAX_ROCKETS);
    for (const mesh of [this.bodies, this.plumes]) {
      mesh.count = 0;
      mesh.frustumCulled = false; // instance matrices change every frame
      this.scene.add(mesh);
    }
  }

  sync(): void {
    const rockets = this.sim.rocketStates;
    const count = Math.min(rockets.length, MAX_ROCKETS);
    for (let i = 0; i < count; i++) {
      const r = rockets[i];
      this.direction.set(r.vx, r.vy, r.vz);
      const speed = this.direction.length();
      this.object.position.set(r.x, r.y, r.z);
      // A rocket at apex has no velocity to aim along; keep it pointing straight up.
      if (speed > 1e-4) this.object.quaternion.setFromUnitVectors(this.up, this.direction.divideScalar(speed));
      else this.object.quaternion.identity();
      // Faster rockets leave a longer flame, and fade the whole body out as it slows.
      const speedFactor = Math.min(1, speed / 30);
      this.object.scale.set(1, 0.7 + 0.3 * speedFactor, 1);
      this.object.updateMatrix();
      this.bodies.setMatrixAt(i, this.object.matrix);
      this.bodies.setColorAt(i, this.color.setRGB(r.primary[0], r.primary[1], r.primary[2]));
      this.object.scale.set(1, speedFactor, 1);
      this.object.position.set(
        r.x - (r.vx / Math.max(speed, 1e-4)) * BODY_LENGTH,
        r.y - (r.vy / Math.max(speed, 1e-4)) * BODY_LENGTH,
        r.z - (r.vz / Math.max(speed, 1e-4)) * BODY_LENGTH,
      );
      this.object.updateMatrix();
      this.plumes.setMatrixAt(i, this.object.matrix);
      this.plumes.setColorAt(i, this.color.setRGB(r.primary[0], r.primary[1], r.primary[2]));
    }
    for (const mesh of [this.bodies, this.plumes]) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of [this.bodies, this.plumes]) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
  }
}