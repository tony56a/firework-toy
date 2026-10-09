import * as THREE from 'three';
import { CONCRETE_JOINT_WIDTH, CONCRETE_PANEL, CONCRETE_SIZE } from '../config';

/** Poured concrete, from cool shadowed grey to sun-bleached pale, in linear space. */
const PALE = new THREE.Color(0xa8a49c);
const MID = new THREE.Color(0x8b8781);
const DARK = new THREE.Color(0x63605c);
const JOINT = new THREE.Color(0x4a4844);

/** Tile the surface; the shader needs no geometry detail, so the slab can be almost coarse. */
const SLAB_SEGMENTS = 1;

/** Everything the fragment stage needs from us, declared ahead of main(). */
const DECLARATIONS_GLSL = /* glsl */ `
  varying vec2 vSlab;
  uniform float uSize;
  uniform float uPanel;
  uniform float uJointWidth;
  uniform float uSeed;
  uniform vec3 uPale;
  uniform vec3 uMid;
  uniform vec3 uDark;
  uniform vec3 uJoint;
`;

/**
 * Value noise and fbm, matching src/core/noise closely enough that the surface still looks like the
 * one it replaces. Kept short because it runs for every pixel of the slab.
 */
const NOISE_GLSL = /* glsl */ `
  float concreteHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float concreteNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = concreteHash(i);
    float b = concreteHash(i + vec2(1.0, 0.0));
    float c = concreteHash(i + vec2(0.0, 1.0));
    float d = concreteHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float concreteFbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    float total = 0.0;
    for (int i = 0; i < 3; i++) {
      sum += concreteNoise(p) * amp;
      total += amp;
      amp *= 0.5;
      p *= 2.0;
    }
    return sum / total;
  }
`;

export interface ConcreteUniforms {
  [name: string]: THREE.IUniform;
  uSize: THREE.IUniform<number>;
  uPanel: THREE.IUniform<number>;
  uJointWidth: THREE.IUniform<number>;
  uSeed: THREE.IUniform<number>;
  uPale: THREE.IUniform<THREE.Color>;
  uMid: THREE.IUniform<THREE.Color>;
  uDark: THREE.IUniform<THREE.Color>;
  uJoint: THREE.IUniform<THREE.Color>;
}

/**
 * A flat slab of concrete whose colour is computed per pixel rather than baked per vertex.
 *
 * This is `MeshLambertMaterial` with a fragment stage bolted on, not a `ShaderMaterial`, so the
 * slab keeps three.js lighting, shadows and fog for free. Rewriting those by hand would be a lot of
 * code to end up with something subtly worse.
 *
 * The vertex stage only forwards world XZ; every pixel decides its own tone, stain and joint.
 */
export class ConcreteMaterial extends THREE.MeshLambertMaterial {
  readonly uniforms: ConcreteUniforms;

  constructor(seed: string) {
    super();
    this.uniforms = {
      uSize: { value: CONCRETE_SIZE },
      uPanel: { value: CONCRETE_PANEL },
      uJointWidth: { value: CONCRETE_JOINT_WIDTH },
      uSeed: { value: seedPhase(seed) },
      uPale: { value: PALE.clone().convertSRGBToLinear() },
      uMid: { value: MID.clone().convertSRGBToLinear() },
      uDark: { value: DARK.clone().convertSRGBToLinear() },
      uJoint: { value: JOINT.clone().convertSRGBToLinear() },
    };
    this.onBeforeCompile = (shader) => this.inject(shader);
  }

  /** Re-seeds the pour, so a new seed gives a visibly different slab without a rebuild. */
  setSeed(seed: string): void {
    this.uniforms.uSeed.value = seedPhase(seed);
  }

  private inject(shader: THREE.WebGLProgramParametersWithUniforms): void {
    Object.assign(shader.uniforms, this.uniforms);

    shader.vertexShader = `varying vec2 vSlab;\n${shader.vertexShader}`
      // The slab never moves or rotates, so object space XZ is world XZ.
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSlab = position.xz;');

    // Prepended rather than anchored on 'void main() {', which appears more than once in some
    // stages. Declarations have to precede main() or the shader will not compile.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECLARATIONS_GLSL}${NOISE_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `  {
          // Not named 'half', which GLSL ES reserves for future use.
          float halfSize = uSize * 0.5;

          // Which cast panel this pixel belongs to, and how much that pour differs from its
          // neighbours. Quantizing the noise to the panel is what stops the slab looking moulded.
          vec2 cell = floor((vSlab + halfSize) / uPanel);
          float pour = concreteHash(cell + uSeed);
          float tone = clamp(0.55 + (pour - 0.5) * 0.16
            + (concreteFbm(vSlab * 0.035) - 0.5) * 0.3, 0.0, 1.0);

          float stain = clamp((concreteFbm(vSlab * 0.02 + vec2(11.0, -7.0)) - 0.42) * 1.9, 0.0, 1.0);

          // Distance to the nearest expansion joint, counting the slab border as one.
          // The distance is widened to at least one pixel's worth of world space, so a joint never
          // falls between samples and disappears: at a grazing angle a hairline joint would
          // otherwise alias away entirely and the slab would look like an unbroken sheet.
          vec2 t = mod(vSlab + halfSize, uPanel);
          vec2 toLine = min(t, uPanel - t);
          vec2 toBorder = halfSize - abs(vSlab);
          float d = max(0.0, min(min(toLine.x, toLine.y), min(toBorder.x, toBorder.y)));
          float pixel = max(fwidth(d), 1e-4);
          float joint = 1.0 - smoothstep(0.0, max(uJointWidth, pixel), d);

          vec3 concrete = mix(uMid, uPale, tone);
          concrete = mix(concrete, uDark, stain * 0.7);
          concrete = mix(concrete, uJoint, joint * 0.85);
          diffuseColor.rgb *= concrete;
        }
        #include <color_fragment>`,
      );
  }
}

/** A stable, small float per seed, so a new seed pours a visibly different slab. */
function seedPhase(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return ((h >>> 0) % 10000) / 100;
}

/** The flat slab itself. All of its detail is in the material, so it needs almost no geometry. */
export function concreteSlabGeometry(size: number = CONCRETE_SIZE): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(size, size, SLAB_SEGMENTS, SLAB_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}
