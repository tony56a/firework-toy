import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fitMesh, type MeshFitOptions } from '../models/meshFit';

/**
 * Loading meshes from a glTF file.
 *
 * This is the one place in the project that reads anything from disk. Every other mesh in every
 * scene is generated in code, so there is no precedent to follow and this deliberately keeps itself
 * to the same shape: it measures the file, derives everything it needs from that measurement, and
 * hands the scene meshes already fitted to the size this world draws. Nothing about what comes back
 * depends on how the file happened to be authored.
 */

/** One fitted mesh: geometry ready to instance, and the materials it should be drawn with. */
export interface LoadedMesh {
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
}

/** How loaded materials are adjusted to suit this world. */
export interface MaterialPolicy {
  /**
   * Average normals across shared vertices, turning faceted geometry into the smooth blob it was
   * modelled to avoid. True for the low-poly assets here, and the reason they read as low-poly at all.
   */
  flatShading?: boolean;
  /**
   * Floor for roughness on standard materials. A library material is authored for a brightly lit
   * studio; this world is lit by a night sky, and a shiny asset disappears against it.
   */
  roughnessFloor?: number;
}

export interface LoadOptions {
  /** Size, axis and facing the meshes come back fitted to. See {@link MeshFitOptions}. */
  fit: MeshFitOptions;
  /** Adjustments to the materials in the file. Both default to on, as suits the assets here. */
  materials?: MaterialPolicy;
}

const scratchBox = new THREE.Box3();

/** One group's meshes, merged into one geometry with their materials kept in step. */
function mergeGroup(meshes: readonly THREE.Mesh[], policy: MaterialPolicy): LoadedMesh | null {
  const materials: THREE.Material[] = [];
  const parts = meshes.map((mesh) => {
    const geometry = mesh.geometry.clone();
    // The world matrix is baked in, because the merged result has one transform and the parts had
    // four. Skipping this is what draws an asset as several pieces floating apart.
    geometry.applyMatrix4(mesh.matrixWorld);
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // One part per material rather than per mesh, so a mesh split across several materials keeps its
    // own groups while the merged geometry still addresses one shared material list.
    for (const material of source) {
      let slot = materials.indexOf(material);
      if (slot === -1) {
        // Cloned so that shading and roughness changes apply to this mesh alone, and do not leak
        // into every other mesh sharing the material in the file.
        const clone = material.clone() as THREE.MeshStandardMaterial;
        if (policy.flatShading !== false) clone.flatShading = true;
        if (policy.roughnessFloor !== undefined && clone.isMeshStandardMaterial) {
          clone.roughness = Math.max(policy.roughnessFloor, clone.roughness ?? policy.roughnessFloor);
        }
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
 * Groups the meshes in a loaded scene into individual objects.
 *
 * The rule is structural: a node that directly owns meshes is one object. That is the shape a
 * multi-object pack is built in — this file's fish are three parent nodes, each with an eyes mesh and
 * three body meshes under it — and it distinguishes an object from its parts, which is the thing that
 * actually has to be got right. A file whose meshes are loose siblings with no grouping parent comes
 * back as one object per mesh; that is the limitation, and merging afterwards is the fix if a future
 * asset needs it.
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
 * Loads every object out of a glTF file, each fitted to `options.fit`.
 *
 * One entry per object in the file rather than one for the whole file, so a pack of several comes
 * back as several and a scene drawing a school of them can be a mix of them.
 *
 * Rejects if the file cannot be read. Callers that can do without it should catch, since the usual
 * arrangement is an asset that improves a scene but is not required for it to run.
 */
export async function loadGltf(url: string, options: LoadOptions): Promise<LoadedMesh[]> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const found: LoadedMesh[] = [];
  for (const group of groupMeshes(gltf.scene)) {
    // Fitted from the group's own extent in world space, measured once and applied to every part of
    // it, so an object split across four meshes is scaled as one and not as four unrelated shapes.
    // Read from world matrices rather than from the raw glTF accessors, which are per mesh in the
    // mesh's own local frame and do not add up to one object.
    scratchBox.makeEmpty();
    gltf.scene.updateMatrixWorld(true);
    for (const mesh of group) scratchBox.expandByObject(mesh);
    if (scratchBox.isEmpty()) continue;
    const size = scratchBox.getSize(new THREE.Vector3());
    const centre = scratchBox.getCenter(new THREE.Vector3());
    const fit = fitMesh(
      { x: size.x, y: size.y, z: size.z },
      { x: centre.x, y: centre.y, z: centre.z },
      options.fit,
    );
    if (!fit) continue;
    const merged = mergeGroup(group, options.materials ?? {});
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