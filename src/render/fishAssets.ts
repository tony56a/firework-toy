import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FISH_LENGTH, FISH_NOSE_END } from '../config';
import { fishFit, type BoxOffset, type Extent } from '../models/sea/fishFit';

/**
 * Loading fish meshes from a glTF file.
 *
 * This is the one place in the project that reads anything from disk. Every other mesh in every
 * scene is generated in code, so there is no precedent to follow and this deliberately keeps itself
 * to the same shape: it measures the file, derives everything it needs from that measurement, and
 * hands the scene meshes already fitted to the size this world draws. Nothing about what comes back
 * depends on how the file happened to be authored.
 */

/** One fitted fish: geometry ready to instance, and the materials it should be drawn with. */
export interface FishMesh {
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
}

const scratchBox = new THREE.Box3();

/** One group's meshes, merged into one geometry with their materials kept in step. */
function mergeGroup(meshes: readonly THREE.Mesh[]): FishMesh | null {
  const materials: THREE.Material[] = [];
  const parts = meshes.map((mesh) => {
    const geometry = mesh.geometry.clone();
    // The world matrix is baked in, because the merged result has one transform and the parts had
    // four. Skipping this is what draws a fish as four pieces floating apart.
    geometry.applyMatrix4(mesh.matrixWorld);
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // One part per material rather than per mesh, so a mesh split across several materials keeps its
    // own groups while the merged geometry still addresses one shared material list.
    for (const material of source) {
      let slot = materials.indexOf(material);
      if (slot === -1) {
        // Cloned so that flat shading and the roughness floor apply to this fish alone, and do not
        // leak into every other fish sharing the material in the file.
        const clone = material.clone() as THREE.MeshStandardMaterial;
        // Flat shading is the point of a low-poly asset: averaging normals across the facets turns
        // faceted geometry back into the smooth blob it was modelled to avoid.
        clone.flatShading = true;
        // A library material is authored for a brightly lit studio. This world is lit by a night sky,
        // and a shiny painted fish disappears against it.
        if (clone.isMeshStandardMaterial) clone.roughness = Math.max(0.6, clone.roughness ?? 0.6);
        slot = materials.push(clone) - 1;
      }
      geometry.addGroup(0, geometry.getAttribute('position').count, slot);
    }
    return geometry;
  });
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), true);
  for (const part of parts) part.dispose();
  return merged ? { geometry: merged, materials } : null;
}

/**
 * Groups the meshes in a loaded scene into individual fish.
 *
 * The rule is structural: a node that directly owns meshes is one fish. That is the shape this pack
 * is built in — three parent nodes, each with an eyes mesh and three body meshes under it — and it
 * distinguishes a fish from its parts, which is the thing that actually has to be got right. A file
 * whose meshes are loose siblings with no grouping parent would come back as one fish per mesh; that
 * is the limitation, and merging afterwards is the fix if a future asset needs it.
 */
function groupMeshes(scene: THREE.Object3D): THREE.Mesh[][] {
  const groups: THREE.Mesh[][] = [];
  const visit = (node: THREE.Object3D): void => {
    const own: THREE.Mesh[] = [];
    for (const child of node.children) {
      if ((child as THREE.Mesh).isMesh) own.push(child as THREE.Mesh);
      else visit(child);
    }
    if (own.length) groups.push(own);
  };
  // Traversed from the roots rather than from `scene` itself, so a mesh parented straight to the
  // root still finds its way into a group rather than being skipped.
  for (const child of scene.children) visit(child);
  return groups;
}

/**
 * Loads every fish out of a glTF file, each fitted to `length`: nose along +x, centre on the origin.
 *
 * One entry per fish in the file rather than one for the whole file, so a pack of several fish comes
 * back as several and the school can be a mix of them.
 */
export async function loadFish(
  url: string,
  length: number = FISH_LENGTH,
  nose: typeof FISH_NOSE_END = FISH_NOSE_END,
): Promise<FishMesh[]> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const found: FishMesh[] = [];
  for (const group of groupMeshes(gltf.scene)) {
    // Fitted from the group's own extent in world space, measured once and applied to every part of
    // it, so a fish split across four meshes is scaled as one fish and not as four unrelated shapes.
    // Read from world matrices rather than from the raw glTF accessors, which are per mesh in the
    // mesh's own local frame and do not add up to a fish.
    scratchBox.makeEmpty();
    gltf.scene.updateMatrixWorld(true);
    for (const mesh of group) scratchBox.expandByObject(mesh);
    if (scratchBox.isEmpty()) continue;
    const size = scratchBox.getSize(new THREE.Vector3());
    const centre = scratchBox.getCenter(new THREE.Vector3());
    const fit = fishFit(
      { x: size.x, y: size.y, z: size.z } satisfies Extent,
      { x: centre.x, y: centre.y, z: centre.z } satisfies BoxOffset,
      length,
      nose,
    );
    if (!fit) continue;
    const merged = mergeGroup(group);
    if (!merged) continue;
    merged.geometry.scale(fit.scale, fit.scale, fit.scale);
    for (const [rx, ry, rz] of fit.turns) {
      merged.geometry.rotateX(rx);
      merged.geometry.rotateY(ry);
      merged.geometry.rotateZ(rz);
    }
    merged.geometry.translate(fit.offset[0], fit.offset[1], fit.offset[2]);
    merged.geometry.computeVertexNormals();
    merged.geometry.computeBoundingBox();
    found.push(merged);
  }
  return found;
}