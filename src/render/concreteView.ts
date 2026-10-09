import * as THREE from 'three';
import { CONCRETE_SIZE, CONCRETE_THICKNESS } from '../config';
import type { ConcreteSlab } from '../models/concrete';

/** Poured concrete, from cool shadowed grey to sun-bleached pale. */
const PALE = new THREE.Color(0xa8a49c);
const MID = new THREE.Color(0x8b8781);
const DARK = new THREE.Color(0x63605c);
const JOINT = new THREE.Color(0x4a4844);

const SEGMENTS = 96;

/**
 * The slab mesh for a ConcreteSlab, built once from the model's surface weights. The renderer only
 * decides what the concrete looks like; the layout and the mix of tones live in the model.
 */
export class ConcreteView {
  private readonly meshes: THREE.Mesh[] = [];

  constructor(private readonly scene: THREE.Scene, slab: ConcreteSlab) {
    const geometry = new THREE.PlaneGeometry(slab.size, slab.size, SEGMENTS, SEGMENTS);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      position.setY(i, slab.heightAt());
      const w = slab.weightsAt(x, z);
      color.copy(MID).lerp(PALE, w.tone).lerp(DARK, w.stain * 0.7)
        .lerp(JOINT, slab.jointAt(x, z) * 0.85);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const surface = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    surface.receiveShadow = true;
    this.scene.add(surface);
    this.meshes.push(surface);

    // A rim below the slab, so the pad reads as a solid pour with thickness rather than a decal.
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(CONCRETE_SIZE, CONCRETE_THICKNESS, CONCRETE_SIZE),
      new THREE.MeshLambertMaterial({ color: DARK }),
    );
    rim.position.y = -CONCRETE_THICKNESS / 2;
    rim.receiveShadow = true;
    this.scene.add(rim);
    this.meshes.push(rim);
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.meshes.length = 0;
  }
}
