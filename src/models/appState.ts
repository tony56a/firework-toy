import { COUNTDOWN_DEFAULT, LAUNCH_BURST_DEFAULT, TRAIN_SPEED_DEFAULT } from '../config';
import type { CameraMode } from './cameraModes';
import type { LanguageId } from './concrete/countdownPhrases';
import type { PaletteId } from './fireworkPalettes';
import type { SceneId } from './scenes';
import type { TimeOfDay } from './timeOfDay';

export type DetectorMode = 'level' | 'spectral' | 'classifier';

/** Everything the user can change. The UI writes it, the app reacts to it. */
export interface AppState {
  seed: string;
  sceneId: SceneId;
  treeCount: number;
  cameraMode: CameraMode;
  timeOfDay: TimeOfDay;
  ambientMotion: boolean;
  menuVisible: boolean;
  fireworkDistance: number;
  fireworkPalette: PaletteId;
  horizontalRange: number;
  heightRange: number;
  autoLaunch: boolean;
  autoLaunchInterval: number;
  trainSpeed: number;
  countDownLanguage: LanguageId;
  countDownFrom: number;
  burstHeight: number;
  showRockets: boolean;
  micEnabled: boolean;
  clapSensitivity: number;
  detectorMode: DetectorMode;
}

export const DEFAULT_STATE: AppState = {
  seed: 'meadow',
  sceneId: 'forest',
  treeCount: 250,
  cameraMode: 'orbit',
  timeOfDay: 'night',
  ambientMotion: false,
  menuVisible: true,
  fireworkDistance: 70,
  fireworkPalette: 'rainbow',
  horizontalRange: 20,
  heightRange: 75,
  autoLaunch: false,
  autoLaunchInterval: 1.5,
  trainSpeed: TRAIN_SPEED_DEFAULT,
  countDownLanguage: 'en',
  countDownFrom: COUNTDOWN_DEFAULT,
  burstHeight: LAUNCH_BURST_DEFAULT,
  showRockets: true,
  micEnabled: false,
  clapSensitivity: 7,
  detectorMode: 'spectral',
};
