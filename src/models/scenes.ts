/**
 * Ids and labels for the renderable scenes. Kept free of three.js so the UI can offer the picker
 * without depending on the renderer.
 */
export const SCENES = {
  forest: { label: 'Forest' },
  sky: { label: 'Empty sky' },
} as const satisfies Record<string, { label: string }>;

export type SceneId = keyof typeof SCENES;
export const SCENE_IDS = Object.keys(SCENES) as SceneId[];