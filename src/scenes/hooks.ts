import type { LanguageId } from '../models/concrete/countdownPhrases';

/**
 * The hooks a scene can call back into the app for. Scenes do not reach for browser APIs or the
 * camera rig themselves; they ask for what they need and the app decides whether to provide it.
 * Bundled rather than passed as loose callbacks so a scene's dependencies stay readable at the
 * constructor.
 */
export interface SceneHooks {
  /** Speaks a phrase aloud, where speech is available. */
  speak(text: string, language: LanguageId): void;
  /**
   * Asks the camera to follow a point, or to stop following by passing null. Only meaningful for
   * scenes with something that launches; every other scene ignores it.
   */
  track(point: { x: number; y: number; z: number } | null): void;
}

/** Hooks for a scene that does nothing with them, so callers never need a guard. */
export const NO_HOOKS: SceneHooks = {
  speak: () => {},
  track: () => {},
};
