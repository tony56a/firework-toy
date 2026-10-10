import { LAUNCH_BURST_DEFAULT, LAUNCH_CLIMB, LAUNCH_HOLD, LAUNCH_RESET } from '../../config';
import { clamp } from '../../core/random';

/**
 * The launch sequence as pure maths: given how long it has been since the button was pressed, where
 * the rocket is and what it is doing. No renderer and no three.js, so the whole sequence can be
 * tested on its own rather than by watching a browser.
 *
 * The sequence is a function of elapsed time rather than accumulated state, which keeps it robust
 * to a dropped frame and makes it trivial to seek: at t = 2s the rocket is in the same place
 * whether it arrived there in 60 steps or 6.
 *
 * The burst height is a parameter rather than a constant, so the same code covers any height the
 * viewer picks.
 *
 * There is deliberately no "burst happened" flag here. This is a snapshot of a moment, and an
 * instant is not a property of a snapshot: an earlier version fired the burst from a fixed one
 * sixtieth-of-a-second window, which silently fired nothing at 50fps and twice at 120fps. Whoever
 * fires the burst should detect the transition into the burst phase instead, which cannot be
 * missed however long the frame took.
 */

export type LaunchPhase = 'idle' | 'hold' | 'climb' | 'burst';

export interface LaunchState {
  phase: LaunchPhase;
  /** Height of the rocket's base above the pad, in world units. */
  altitude: number;
  /** 0 to 1, how far through the climb the rocket is. Drives the plume. */
  throttle: number;
  /** Whether the rocket should be drawn at all. False once it has left. */
  visible: boolean;
}

const IDLE: LaunchState = { phase: 'idle', altitude: 0, throttle: 0, visible: true };

/** Easing that leaves the pad slowly and gains speed, which is how a rocket actually lifts off. */
function climbHeight(t: number, burstHeight: number): number {
  // t is 0..1 through the climb. Squaring gives the slow start without needing a real integrator.
  return burstHeight * t * t;
}

/**
 * Where the rocket is `elapsed` seconds into a launch bursting at `burstHeight`. An `elapsed` of 0
 * or less means nothing has started, and the rocket sits on the pad.
 */
export function launchState(
  elapsed: number,
  burstHeight: number = LAUNCH_BURST_DEFAULT,
): LaunchState {
  if (!(elapsed > 0)) return IDLE;

  if (elapsed < LAUNCH_HOLD) {
    // Clamps are holding it: it stays put, and the engine is lit but producing no thrust.
    return { phase: 'hold', altitude: 0, throttle: 0.25, visible: true };
  }

  const sinceClimb = elapsed - LAUNCH_HOLD;

  if (sinceClimb < LAUNCH_CLIMB) {
    const t = sinceClimb / LAUNCH_CLIMB;
    return {
      phase: 'climb',
      altitude: climbHeight(t, burstHeight),
      throttle: clamp(0.4 + t * 0.6, 0, 1),
      visible: true,
    };
  }

  return {
    phase: 'burst',
    altitude: burstHeight,
    throttle: 0,
    visible: false,
  };
}

/** Total length of the sequence, after which the rocket is back on the pad. */
export const LAUNCH_DURATION = LAUNCH_HOLD + LAUNCH_CLIMB + LAUNCH_RESET;

/** True once the sequence has run its course and the pad is ready again. */
export function launchFinished(elapsed: number): boolean {
  return elapsed >= LAUNCH_DURATION;
}

/**
 * The phases where the camera should follow the rocket. The hold is included so the view is
 * already in place before it moves, rather than cutting to it at the moment of liftoff.
 */
export function shouldTrack(phase: LaunchPhase): boolean {
  return phase === 'hold' || phase === 'climb' || phase === 'burst';
}
