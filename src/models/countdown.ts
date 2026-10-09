import { COUNTDOWN_TICK } from '../config';
import type { CountdownKey } from './countdownPhrases';

/**
 * A spoken countdown as pure maths: given how long since it began, which number should be said, if
 * any. A function of elapsed time rather than accumulated state, so a dropped frame or a long GC
 * pause cannot skip or repeat a number.
 */

export interface CountdownStep {
  /** What to say, or null when nothing should be spoken yet or any more. */
  say: CountdownKey | null;
  /** Which number is being counted, 3 down to 1. Null before the first number and after launch. */
  step: number | null;
  /** 0 to 1 progress through the whole countdown, for any UI that wants to show it. */
  progress: number;
}

const TOTAL = COUNTDOWN_TICK * 3;

/** "Launch" is said after the last number, so it gets its own short window. */
const LAUNCH_WINDOW = 0.6;

function sayAt(elapsed: number): CountdownKey | null {
  if (elapsed < 0) return null;
  if (elapsed < COUNTDOWN_TICK) return 'three';
  if (elapsed < COUNTDOWN_TICK * 2) return 'two';
  if (elapsed < COUNTDOWN_TICK * 3) return 'one';
  if (elapsed < COUNTDOWN_TICK * 3 + LAUNCH_WINDOW) return 'launch';
  return null;
}

/** Where the countdown is at `elapsed` seconds. */
export function countdownStep(elapsed: number): CountdownStep {
  const say = sayAt(elapsed);
  return {
    say,
    step: say === 'three' ? 3 : say === 'two' ? 2 : say === 'one' ? 1 : null,
    progress: Math.max(0, Math.min(1, elapsed / TOTAL)),
  };
}

/** True once the count is out and the launch should begin. */
export function countdownOver(elapsed: number): boolean {
  return elapsed >= TOTAL;
}
