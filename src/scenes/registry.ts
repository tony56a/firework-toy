import type { LanguageId } from '../models/countdownPhrases';
import type { FireworkSim } from '../models/fireworks';
import type { SceneId } from '../models/scenes';
import { ConcreteScene } from './concreteScene';
import { ForestScene } from './forestScene';
import type { Scene } from './scene';
import type { SceneReport } from './sceneBase';
import { SkyScene } from './skyScene';

/**
 * Builds a scene from scratch. Callers cache the result; scenes are never torn down.
 *
 * `speak` is handed to every scene even though only the launch site uses it, so scenes do not have
 * to reach for a browser API themselves.
 */
export function createScene(
  id: SceneId,
  sim: FireworkSim,
  report: SceneReport,
  seed: string,
  speak: (text: string, language: LanguageId) => void = () => {},
): Scene {
  switch (id) {
    case 'forest':
      return new ForestScene(sim, report, seed);
    case 'sky':
      return new SkyScene(sim, report);
    case 'concrete':
      return new ConcreteScene(sim, report, seed, speak);
  }
}
