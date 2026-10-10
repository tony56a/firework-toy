import type { FireworkSim } from '../models/fireworks';
import type { SceneId } from '../models/scenes';
import { ConcreteScene } from './concreteScene';
import { ForestScene } from './forestScene';
import { SeaScene } from './seaScene';
import type { Scene } from './scene';
import type { SceneReport } from './sceneBase';
import { SkyScene } from './skyScene';

import { NO_HOOKS, type SceneHooks } from './hooks';

/**
 * Builds a scene from scratch. Callers cache the result; scenes are never torn down.
 *
 * Hooks are handed to every scene even though only the launch site uses them, so no scene has to
 * reach for a browser API or the camera rig itself.
 */
export function createScene(
  id: SceneId,
  sim: FireworkSim,
  report: SceneReport,
  seed: string,
  hooks: SceneHooks = NO_HOOKS,
): Scene {
  switch (id) {
    case 'forest':
      return new ForestScene(sim, report, seed);
    case 'sky':
      return new SkyScene(sim, report);
    case 'concrete':
      return new ConcreteScene(sim, report, seed, hooks);
    case 'sea':
      return new SeaScene(sim, report, seed);
  }
}
