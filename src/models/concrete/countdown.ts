import { COUNTDOWN_TICK } from '../../config';
import { NUMBER_KEYS, numberKey, type CountdownKey, type NumberKey } from './countdownPhrases';

/**
 * A spoken countdown as pure maths: given how long since it began, which number should be said, if
 * any. A function of elapsed time rather than accumulated state, so a dropped frame or a long GC
 * pause cannot skip or repeat a number.
 *
 * The count starts at whatever `from` is given, so counting from ten and counting from three are
 * the same code with a different argument rather than two branches.
 */

export interface CountdownStep {
  /** What to say, or null when nothing should be spoken yet or any more. */
  say: CountdownKey | null;
  /** Which number is being counted. Null before the first number and after "launch". */
  step: number | null;
  /** 0 to 1 progress through the whole countdown, for any UI that wants to show it. */
  progress: number;
}

/** "Launch" is said after the last number, so it gets its own short window. */
const LAUNCH_WINDOW = 0.6;

/** Total length of a countdown that starts at `from`, in seconds. */
export function countdownLength(from: number): number {
  return COUNTDOWN_TICK * from;
}

function sayAt(elapsed: number, from: number): CountdownKey | null {
  if (elapsed < 0) return null;
  // Each number holds for one tick, counting down from `from` to one.
  const index = Math.floor(elapsed / COUNTDOWN_TICK);
  if (index < from) return numberKey(from - index);
  if (elapsed < COUNTDOWN_TICK * from + LAUNCH_WINDOW) return 'launch';
  return null;
}

/** The number a key represents, or null for the cues, which are not numbers. */
function stepOf(say: CountdownKey | null): number | null {
  const index = NUMBER_KEYS.indexOf(say as NumberKey);
  return index === -1 ? null : index + 1;
}

/** Where the countdown is at `elapsed` seconds into a count that started at `from`. */
export function countdownStep(elapsed: number, from: number): CountdownStep {
  const say = sayAt(elapsed, from);
  return {
    say,
    // "launch" and "hold" are cues rather than numbers, so they have no step.
    step: stepOf(say),
    progress: Math.max(0, Math.min(1, elapsed / countdownLength(from))),
  };
}

/** True once the count is out and the launch should begin. */
export function countdownOver(elapsed: number, from: number): boolean {
  return elapsed >= countdownLength(from);
}

/** Exported for the scene, which needs the cue keys without importing the phrase table. */
export type { NumberKey };
