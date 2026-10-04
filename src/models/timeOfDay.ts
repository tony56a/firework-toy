export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

export interface AtmospherePreset {
  label: string;
  /** Vertical gradient stops from zenith (0) to horizon (1), CSS colors. */
  sky: ReadonlyArray<readonly [number, string]>;
  fog: number;
  sunColor: number;
  /** Intensities are in "classic" units; the renderer scales them for physically based lighting. */
  sunIntensity: number;
  sunPosition: readonly [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  stars: boolean;
}

export const TIME_PRESETS: Record<TimeOfDay, AtmospherePreset> = {
  dawn: {
    label: 'Dawn',
    sky: [[0, '#4a5f9c'], [0.55, '#e9a58c'], [1, '#ffd9a8']],
    fog: 0xf0c4a0, sunColor: 0xffb27a, sunIntensity: 0.7, sunPosition: [-70, 30, 50],
    hemiSky: 0xffd6c0, hemiGround: 0x54483a, hemiIntensity: 0.55, stars: false,
  },
  day: {
    label: 'Day',
    sky: [[0, '#4f8fd0'], [0.6, '#a9d0ea'], [1, '#dcecf3']],
    fog: 0xbfd9ea, sunColor: 0xfff1d6, sunIntensity: 0.95, sunPosition: [60, 90, 40],
    hemiSky: 0xdcefff, hemiGround: 0x54683f, hemiIntensity: 0.75, stars: false,
  },
  dusk: {
    label: 'Dusk',
    sky: [[0, '#2b2860'], [0.55, '#c2557a'], [1, '#f6a45f']],
    fog: 0xc98070, sunColor: 0xff8a50, sunIntensity: 0.6, sunPosition: [60, 25, -50],
    hemiSky: 0xc9a0c0, hemiGround: 0x3a3040, hemiIntensity: 0.45, stars: false,
  },
  night: {
    label: 'Night',
    sky: [[0, '#04060e'], [0.6, '#101a33'], [1, '#26365c']],
    fog: 0x18223c, sunColor: 0x9fb4ff, sunIntensity: 0.35, sunPosition: [-40, 80, 30],
    hemiSky: 0x2a3a66, hemiGround: 0x121a12, hemiIntensity: 0.4, stars: true,
  },
};

export const TIME_IDS = Object.keys(TIME_PRESETS) as TimeOfDay[];
