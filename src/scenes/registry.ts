import type { FireworkSim } from '../models/fireworks';
import type { SceneId } from '../models/scenes';
import { ConcreteScene } from './concreteScene';
import { ForestScene } from './forestScene';
import type { Scene } from './scene';
import type { SceneReport } from './sceneBase';
import { SkyScene } from './skyScene';

/** Builds a scene from scratch. Callers cache the result; scenes are never torn down. */
export function createScene(id: SceneId, sim: FireworkSim, report: SceneReport, seed: string): Scene {
  switch (id) {
    case 'forest':
      return new ForestScene(sim, report, seed);
    case 'sky':
      return new SkyScene(sim, report);
    case 'concrete':
      return new ConcreteScene(sim, report, seed);
  }
}
