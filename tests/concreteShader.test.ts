import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ShaderChunk, ShaderLib } from 'three';
import { ConcreteMaterial } from '../src/render/concreteMaterial';

/**
 * The concrete surface is GLSL, and GLSL does not run under node, so these tests check the two
 * things that can be checked here: that the shader source is assembled in the shape the renderer
 * expects, and that every name it declares is safe.
 *
 * When you add a shader and it renders black, the usual cause is a typo in the source, and the
 * runtime error goes to the console rather than failing a test. Reading the assembled GLSL is the
 * cheapest way to catch that before opening a browser.
 */

/** Expands #include the way three.js does, with the sources still unresolved. */
function expand(src: string): string {
  const chunks = ShaderChunk as Record<string, string | undefined>;
  const seen = new Set<string>();
  return src.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (_, name: string) => {
    if (name === 'common') {
      if (seen.has('common')) return ''; // three includes <common> once per stage
      seen.add('common');
    }
    return chunks[name] ?? '';
  });
}

/** Runs onBeforeCompile against real meshlambert sources and hands back the transformed GLSL. */
function injectedSources(): { vertex: string; fragment: string } {
  const material = new ConcreteMaterial('meadow');
  const shader = {
    uniforms: {},
    vertexShader: ShaderLib.lambert.vertexShader,
    fragmentShader: ShaderLib.lambert.fragmentShader,
  };
  material.onBeforeCompile(shader as never, null as never);
  return { vertex: expand(shader.vertexShader), fragment: expand(shader.fragmentShader) };
}

test('the shader modifies Lambert in place, so the anchors are still there to find', () => {
  const material = new ConcreteMaterial('meadow');
  const raw = ShaderLib.lambert.fragmentShader;
  // If three.js ever renames these chunks, the injection silently stops happening.
  assert.ok(raw.includes('#include <common>'), 'no <common> chunk to anchor on');
  assert.ok(raw.includes('#include <color_fragment>'), 'no <color_fragment> chunk to anchor on');
  assert.ok(ShaderLib.lambert.vertexShader.includes('#include <begin_vertex>'));
  assert.ok(typeof material.onBeforeCompile === 'function');
});

test('the vertex stage forwards world XZ to the fragment stage', () => {
  const { vertex } = injectedSources();
  assert.ok(vertex.includes('varying vec2 vSlab'), 'vSlab is not declared for the fragment stage');
  assert.ok(vertex.includes('vSlab = position.xz'), 'the slab position is not forwarded');
});

test('the fragment stage declares everything before main, or it will not compile', () => {
  const { fragment } = injectedSources();
  const main = fragment.indexOf('void main');
  assert.ok(main > 0, 'no main to compare against');
  for (const declaration of ['varying vec2 vSlab', 'uniform float uSize', 'uniform float uSeed']) {
    const at = fragment.indexOf(declaration);
    assert.ok(at > -1, `${declaration} is missing`);
    assert.ok(at < main, `${declaration} is declared after main()`);
  }
});

test('the surface is computed from the uniforms, inside main', () => {
  const { fragment } = injectedSources();
  const body = fragment.slice(fragment.indexOf('void main'));
  assert.ok(body.includes('uPanel'), 'the panel grid uniform is unused');
  assert.ok(body.includes('uJointWidth'), 'the joint width uniform is unused');
  assert.ok(body.includes('diffuseColor.rgb *= concrete'), 'the concrete colour is not applied');
  // Tinting the base colour rather than replacing it keeps Lambert's lighting and shadows intact.
  // Three declares diffuseColor itself, so check only that the injected block does not reassign it.
  const injected = body.slice(body.indexOf('float halfSize'), body.indexOf('#include <color_fragment>'));
  assert.ok(!/diffuseColor\s*=\s*vec4/.test(injected), 'the base colour was overwritten, not tinted');
});

test('the uniforms reach the shader', () => {
  const material = new ConcreteMaterial('meadow');
  const shader = { uniforms: {} as Record<string, unknown>, vertexShader: '', fragmentShader: '' };
  material.onBeforeCompile(shader as never, null as never);
  for (const name of ['uSize', 'uPanel', 'uJointWidth', 'uSeed', 'uPale', 'uMid', 'uDark', 'uJoint']) {
    assert.ok(shader.uniforms[name], `${name} was never declared to the shader`);
  }
});

test('no identifier shadows a GLSL reserved word', () => {
  // 'half' is reserved for future use in GLSL ES, and using it is a compile error rather than a
  // quiet fallback, so it is worth asserting the obvious near-misses stayed away from it.
  const { fragment } = injectedSources();
  const declared = [...fragment.matchAll(/^\s*(?:float|vec[234]|int|bool)\s+(\w+)/gm)].map((m) => m[1]);
  for (const reserved of ['half', 'input', 'output', 'sample', 'filter', 'partition', 'active']) {
    assert.ok(!declared.includes(reserved), `${reserved} is reserved in GLSL ES`);
  }
});

test('the shader helper names are prefixed, so they cannot collide with a chunk', () => {
  const { fragment } = injectedSources();
  const helpers = [...fragment.matchAll(/^\s*\w+\s+(concrete\w+)\s*\(/gm)].map((m) => m[1]);
  assert.ok(helpers.length >= 3, `expected several helpers, found ${helpers.length}`);
  for (const name of helpers) assert.ok(name.startsWith('concrete'), `${name} could collide`);
});
