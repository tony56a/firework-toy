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

const GEOMETRY: Record<ModelKind, { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry }> = {
  pine: {
    trunk: trunk(0.25, 1.8),
    leaves: merged([
      stretched(new THREE.ConeGeometry(1.7, 2.4, 7), 0, 2.4, 0),
      stretched(new THREE.ConeGeometry(1.3, 2.2, 7), 0, 3.6, 0),
      stretched(new THREE.ConeGeometry(0.85, 2.0, 7), 0, 4.8, 0),
    ]),
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
  return kind === 'pine'
    ? out.setHSL(0.36 + a * 0.04, 0.45, 0.2 + b * 0.08)
    : out.setHSL(0.17 + a * 0.2, 0.5, 0.3 + b * 0.1);
}