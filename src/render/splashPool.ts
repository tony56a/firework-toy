import * as THREE from 'three';

/**
 * A ring of patches laid on the water and left to fade. Shared by the boat's wake and by the splash
 * where a jumping fish comes back in, because both are the same thing: a fixed pool of quads, laid
 * at intervals, each fading and spreading on its own clock.
 *
 * The pool is round robin and fixed size, so what trails behind a thing is bounded by how fast the
 * patches fade rather than by how long the thing has been moving. A boat that sailed for an hour
 * draws no more wake than one that has just started.
 */
export interface SplashOptions {
  /** Opacity a fresh patch starts at, which is also roughly how fast it fades. */
  opacity: number;
  /** How fast a patch spreads as it goes, per second. */
  spread: number;
}

export class SplashPool {
  /** Exposed so a caller can tint every patch at once; the pool makes one material per patch. */
  readonly patches: THREE.Mesh[] = [];
  private next = 0;

  constructor(
    private readonly scene: THREE.Scene,
    geometry: THREE.BufferGeometry,
    count: number,
    private readonly options: SplashOptions,
  ) {
    for (let i = 0; i < count; i++) {
      // One material each, since they fade independently and were laid at different times. The
      // geometry is shared, which is the part that would actually cost anything.
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }));
      mesh.visible = false;
      this.scene.add(mesh);
      this.patches.push(mesh);
    }
  }

  /** Lays a patch. The oldest one in the pool is the one reused. */
  drop(x: number, y: number, z: number, yaw: number, scale: number): void {
    const mesh = this.patches[this.next];
    this.next = (this.next + 1) % this.patches.length;
    mesh.visible = true;
    mesh.position.set(x, y, z);
    mesh.rotation.set(0, -yaw, 0);
    mesh.scale.setScalar(scale);
    (mesh.material as THREE.MeshBasicMaterial).opacity = this.options.opacity;
  }

  /** Fades every laid patch, spreading as it goes, and retires the ones that have gone. */
  update(dt: number): void {
    for (const mesh of this.patches) {
      if (!mesh.visible) continue;
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity -= this.options.opacity * dt;
      mesh.scale.multiplyScalar(1 + this.options.spread * dt);
      if (material.opacity <= 0) mesh.visible = false;
    }
  }

  dispose(): void {
    this.scene.remove(...this.patches);
    for (const mesh of this.patches) (mesh.material as THREE.Material).dispose();
  }
}