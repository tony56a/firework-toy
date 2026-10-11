import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ModelKind } from '../models/modelKinds';

export type { ModelKind } from '../models/modelKinds';

/**
 * Low-poly geometry for the little models on show, shared by the forest that scatters them across
 * the terrain and the model table that displays them. One definition, so a tree looks the same
 * wherever it appears.
 */

const stretched = (g: THREE.BufferGeometry, x: number, y: number, z: number, sy = 1): THREE.BufferGeometry => {
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return g;
};
const merged = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry =>
  mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
const trunk = (radius: number, height: number) =>
  stretched(new THREE.CylinderGeometry(radius * 0.7, radius, height, 6), 0, height / 2, 0);

/**
 * An acacia's wood and canopy, which is what makes it read as a savanna tree rather than any tree:
 * the canopy is a wide, flat slab on top of a bare trunk, with the branches forking out beneath it
 * and stopping well short of the leaves. The whole tree is drawn from the origin up, so scaling it
 * gives a taller tree of exactly the same shape.
 */
function acaciaWood(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.09, 0.16, 0.62, 6).translate(0, 0.31, 0);
  // Branches lean out and stop short, which is what leaves the gap of bare wood under the canopy.
  const branch = (angle: number, height: number, tilt: number) =>
    new THREE.CylinderGeometry(0.04, 0.075, height, 5)
      .rotateZ(tilt)
      .translate(Math.sin(tilt) * height * 0.5, height * 0.62, 0)
      .rotateY(angle);
  const branches = [branch(0, 0.34, 0.5), branch(2.1, 0.3, 0.62), branch(4.2, 0.32, 0.44), branch(5.5, 0.28, 0.55)];
  return merged([trunk, ...branches]);
}

/** The canopy as a flattened dome. Broader than it is deep: that flat top is the silhouette. */
function acaciaCanopy(): THREE.BufferGeometry {
  const slab = new THREE.IcosahedronGeometry(1, 1).scale(1.15, 0.34, 1.15).translate(0, 0.78, 0);
  const clump = new THREE.IcosahedronGeometry(0.6, 1).scale(1, 0.42, 1).translate(0.62, 0.74, 0.18);
  return merged([slab.toNonIndexed(), clump.toNonIndexed()]);
}

const GEOMETRY: Record<ModelKind, { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry }> = {
  pine: {
    trunk: trunk(0.25, 1.8),
    leaves: merged([
      stretched(new THREE.ConeGeometry(1.7, 2.4, 7), 0, 2.4, 0),
      stretched(new THREE.ConeGeometry(1.3, 2.2, 7), 0, 3.6, 0),
      stretched(new THREE.ConeGeometry(0.85, 2.0, 7), 0, 4.8, 0),
    ]),
  },
  acacia: {
    trunk: acaciaWood(),
    leaves: acaciaCanopy(),
  },
  oak: {
    trunk: trunk(0.32, 2.4),
    leaves: merged([
      stretched(new THREE.IcosahedronGeometry(1.9, 1), 0, 3.6, 0, 0.85),
      stretched(new THREE.IcosahedronGeometry(1.3, 1), 1.1, 3.0, 0.4),
      stretched(new THREE.IcosahedronGeometry(1.2, 1), -0.9, 3.2, -0.6),
    ]),
  },
};

/** One shared instance of each geometry; they are never mutated after construction. */
export function modelGeometry(kind: ModelKind): { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  return GEOMETRY[kind];
}

export const TRUNK_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1, flatShading: true });
export const LEAF_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });

export function modelLeafColor(kind: ModelKind, [a, b]: [number, number], out: THREE.Color): THREE.Color {
  if (kind === 'pine') return out.setHSL(0.36 + a * 0.04, 0.45, 0.2 + b * 0.08);
  // Dry, olive and low-saturation, where the broadleaf is warmer and brighter.
  return kind === 'acacia'
    ? out.setHSL(0.22 + a * 0.06, 0.34 + b * 0.12, 0.26 + a * 0.07)
    : out.setHSL(0.17 + a * 0.2, 0.5, 0.3 + b * 0.1);
}