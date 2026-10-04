export const CAMERA_MODES = {
  orbit: { label: 'Orbit', fov: 55 },
  ground: { label: 'Sitting in field', fov: 70 },
  plane: { label: 'Plane flyover', fov: 65 },
  overhead: { label: 'Overhead', fov: 55 },
  ridge: { label: 'Ridge view', fov: 55 },
} as const satisfies Record<string, { label: string; fov: number }>;

export type CameraMode = keyof typeof CAMERA_MODES;
export const CAMERA_MODE_IDS = Object.keys(CAMERA_MODES) as CameraMode[];
