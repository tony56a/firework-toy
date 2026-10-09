import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONCRETE_JOINT_WIDTH, CONCRETE_PANEL, CONCRETE_SIZE, CONCRETE_SPECKLE_SCALE, CONCRETE_SPECKLE_STRENGTH,
  CONCRETE_THICKNESS,
} from '../src/config';
import { ConcreteMaterial, concreteSlabGeometry } from '../src/render/concreteMaterial';
import { RIM_DROP } from '../src/render/concreteView';
import { injectedSources } from './helpers/concreteShaderSource';
import { CONCRETE_GROUND } from '../src/models/concrete';

/**
 * The concrete surface is a fragment shader now, so most of what the old model tests checked cannot
 * be checked here: GLSL does not run under node. What can be tested is the geometry the shader
 * draws on, the uniforms it is driven by, and that the slab is still flat for the camera.
 */

test('the slab is a single flat quad, since the shader does the detail', () => {
  const geometry = concreteSlabGeometry();
  const position = geometry.attributes.position;
  assert.equal(position.count, 4, 'a 1x1 segment plane should have four corners');
  for (let i = 0; i < position.count; i++) {
    // Float noise from the rotateX, so compare with a tolerance rather than exactly.
    assert.ok(Math.abs(position.getY(i)) < 1e-9, `corner ${i} is not flat`);
  }
  const xs = Array.from({ length: position.count }, (_, i) => position.getX(i));
  const zs = Array.from({ length: position.count }, (_, i) => position.getZ(i));
  assert.equal(Math.max(...xs) - Math.min(...xs), CONCRETE_SIZE, 'the slab should span its size');
  assert.equal(Math.max(...zs) - Math.min(...zs), CONCRETE_SIZE);
});

test('the ground is level everywhere and spans the world', () => {
  for (const [x, z] of [[0, 0], [30, -12], [-64, 64]]) {
    assert.equal(CONCRETE_GROUND.heightAt(x, z), 0);
  }
  assert.equal(CONCRETE_GROUND.size, CONCRETE_SIZE);
});

test('the material is handed the panel grid the shader needs', () => {
  const material = new ConcreteMaterial('meadow');
  assert.equal(material.uniforms.uSize.value, CONCRETE_SIZE);
  assert.equal(material.uniforms.uPanel.value, CONCRETE_PANEL);
  assert.equal(material.uniforms.uJointWidth.value, CONCRETE_JOINT_WIDTH);
  assert.ok(CONCRETE_SIZE % CONCRETE_PANEL === 0, 'panels should tile the slab exactly');
});

test('a new seed changes the uniform, the same seed does not', () => {
  const material = new ConcreteMaterial('meadow');
  const first = material.uniforms.uSeed.value;
  material.setSeed('harbour');
  const other = material.uniforms.uSeed.value;
  material.setSeed('meadow');
  assert.equal(material.uniforms.uSeed.value, first, 'the same seed should give the same pour');
  assert.notEqual(other, first, 'a new seed should pour a visibly different slab');
});

test('the seed phase stays small, so it cannot blow up the shader hash', () => {
  for (const seed of ['meadow', 'harbour', '', 'a-very-long-seed-name-indeed', 'ünïcødé']) {
    const material = new ConcreteMaterial(seed);
    const value = material.uniforms.uSeed.value;
    assert.ok(Number.isFinite(value) && value >= 0 && value < 100, `${seed} gave ${value}`);
  }
});

test('the material bolts onto Lambert rather than replacing it, keeping light and shadow', () => {
  const material = new ConcreteMaterial('meadow');
  assert.equal(typeof material.onBeforeCompile, 'function');
  // A ShaderMaterial would have needed its own lighting and shadow handling written by hand.
  assert.ok(!(material as unknown as { isShaderMaterial?: boolean }).isShaderMaterial);
});

test('the rim sits clear of the slab, so the two cannot z-fight', () => {
  const rimTop = -CONCRETE_THICKNESS / 2 - RIM_DROP + CONCRETE_THICKNESS / 2;
  assert.ok(rimTop < 0, 'the rim top face must sit below the slab surface');
  // Coplanar faces z-fight, and which one wins depends on the viewing angle, so the joints showed
  // up in some camera modes and not others. Any gap at all fixes it.
  assert.ok(RIM_DROP > 0, 'a zero drop puts the rim top face exactly on the slab');
});

test('joints widen to at least a pixel, so they survive a grazing angle', () => {
  const { fragment } = injectedSources();
  assert.ok(fragment.includes('fwidth'), 'joint width should follow screen-space derivatives');
  // Without this the joint is uJointWidth wide in world units, which at a shallow angle is far
  // thinner than a pixel and falls between samples, leaving the slab looking like one flat sheet.
  assert.ok(/smoothstep\(\s*0\.0,\s*max\(\s*uJointWidth/.test(fragment), 'joint width should never be below one pixel');
});

test('the speckle fades out before it gets finer than a pixel', () => {
  const { fragment } = injectedSources();
  // The reason the speckle was dropped the first time: baked per vertex it aliased into crawling
  // noise. Per pixel it is fine close up, but at a distance each grain is sub-pixel and shimmers,
  // so it has to be faded rather than merely scaled down.
  assert.ok(fragment.includes('grainFade'), 'the grain should be faded by distance');
  assert.ok(/smoothstep\([^)]*grainPixel/.test(fragment), 'the fade should follow screen-space derivatives');
  assert.ok(fragment.includes('uSpeckle'), 'the grain strength should be a uniform');
});

test('the speckle is strong enough to actually be seen', () => {
  // Measured against a rendered frame: at 0.16 the strongest pixel changed by 2/255, which is
  // invisible. Anything under this reads as a flat slab no matter how the maths is written.
  assert.ok(CONCRETE_SPECKLE_STRENGTH >= 0.4, `strength ${CONCRETE_SPECKLE_STRENGTH} is imperceptible`);
  assert.ok(CONCRETE_SPECKLE_STRENGTH <= 1.2, `strength ${CONCRETE_SPECKLE_STRENGTH} reads as static`);
});

test('the speckle scale is fine enough to look like aggregate, not blotches', () => {
  assert.ok(CONCRETE_SPECKLE_SCALE > 1, 'at a lower scale this would be a second layer of tone');
  assert.ok(Number.isFinite(CONCRETE_SPECKLE_SCALE) && CONCRETE_SPECKLE_SCALE > 0);
});
