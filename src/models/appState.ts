import type { CameraMode } from './cameraModes';
import type { PaletteId } from './fireworkPalettes';
import type { TimeOfDay } from './timeOfDay';

export type DetectorMode = 'level' | 'spectral' | 'classifier';

/** Everything the user can change. The UI writes it, the app reacts to it. */
export interface AppState {
  seed: string;
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
  showRockets: boolean;
  micEnabled: boolean;
  clapSensitivity: number;
  detectorMode: DetectorMode;
}

export const DEFAULT_STATE: AppState = {
  seed: 'meadow',
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
  showRockets: true,
  micEnabled: false,
  clapSensitivity: 7,
  detectorMode: 'spectral',
};
