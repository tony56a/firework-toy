import * as THREE from 'three';
import { CONCRETE_SIZE, CONCRETE_THICKNESS } from '../config';
import { ConcreteMaterial, concreteSlabGeometry } from './concreteMaterial';

const RIM_COLOR = 0x63605c;

/**
 * The slab meshes for the concrete scene. The geometry is a single quad and all the surface detail
 * comes from `ConcreteMaterial`, so this only has to keep the meshes alive and pass on a new seed.
 */
export class ConcreteView {
  private readonly surface: THREE.Mesh;
  private readonly rim: THREE.Mesh;

  constructor(private readonly scene: THREE.Scene, seed: string) {
    this.surface = new THREE.Mesh(concreteSlabGeometry(), new ConcreteMaterial(seed));
    this.surface.receiveShadow = true;
    this.surface.name = 'concrete-slab';
    this.scene.add(this.surface);

    // A rim below the slab, so the pad reads as a solid pour with thickness rather than a decal.
    this.rim = new THREE.Mesh(
      new THREE.BoxGeometry(CONCRETE_SIZE, CONCRETE_THICKNESS, CONCRETE_SIZE),
      new THREE.MeshLambertMaterial({ color: RIM_COLOR }),
    );
    this.rim.position.y = -CONCRETE_THICKNESS / 2;
    this.rim.receiveShadow = true;
    this.rim.name = 'concrete-rim';
    this.scene.add(this.rim);
  }

  /** Re-seeds the shader so the next pour differs, without rebuilding any geometry. */
  setSeed(seed: string): void {
    const material = this.surface.material as ConcreteMaterial;
    material.setSeed(seed);
  }

  dispose(): void {
    for (const mesh of [this.surface, this.rim]) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
