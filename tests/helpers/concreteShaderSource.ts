import { ShaderChunk, ShaderLib } from 'three';
import { ConcreteMaterial } from '../../src/render/concreteMaterial';

/** Expands #include the way three.js does, with the sources still unresolved. */
export function expand(src: string): string {
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
export function injectedSources(): { vertex: string; fragment: string } {
  const material = new ConcreteMaterial('meadow');
  const shader = {
    uniforms: {},
    vertexShader: ShaderLib.lambert.vertexShader,
    fragmentShader: ShaderLib.lambert.fragmentShader,
  };
  material.onBeforeCompile(shader as never, null as never);
  return { vertex: expand(shader.vertexShader), fragment: expand(shader.fragmentShader) };
}

