import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COUNTDOWN_MAX, COUNTDOWN_MIN, COUNTDOWN_TICK } from '../src/config';
import { countdownLength, countdownOver, countdownStep } from '../src/models/concrete/countdown';
import {
  COUNTDOWN_PHRASES, LANGUAGE_IDS, LANGUAGE_LABELS, NUMBER_KEYS, numberKey, SPEECH_LOCALES,
  phrase, type CountdownKey, type NumberKey,
} from '../src/models/concrete/countdownPhrases';

const KEYS: CountdownKey[] = [...NUMBER_KEYS, 'launch', 'hold'];

/** Every phrase said during a full count from `from`, in order, ignoring the repeated frames. */
function spoken(from: number): (CountdownKey | null)[] {
  const heard: (CountdownKey | null)[] = [];
  for (let t = 0; t < countdownLength(from) + 1; t += 0.05) {
    const say = countdownStep(t, from).say;
    if (say && say !== heard[heard.length - 1]) heard.push(say);
  }
  return heard;
}

test('the count runs down from the given number, then says launch', () => {
  assert.deepEqual(spoken(3), ['three', 'two', 'one', 'launch']);
  assert.deepEqual(spoken(5), ['five', 'four', 'three', 'two', 'one', 'launch']);
  assert.deepEqual(spoken(10), [
    'ten', 'nine', 'eight', 'seven', 'six', 'five', 'four', 'three', 'two', 'one', 'launch',
  ]);
});

test('a count from ten says every number once, in order, with nothing skipped', () => {
  const heard = spoken(COUNTDOWN_MAX);
  assert.equal(heard.length, COUNTDOWN_MAX + 1, 'one phrase per number, plus launch');
  for (let n = COUNTDOWN_MAX; n >= 1; n--) {
    assert.ok(heard.includes(numberKey(n) as NumberKey), `never said ${n}`);
  }
  // Descending, with launch last.
  const numbers = heard.slice(0, -1) as NumberKey[];
  assert.deepEqual(numbers, [...numbers].sort((a, b) => NUMBER_KEYS.indexOf(b) - NUMBER_KEYS.indexOf(a)));
  assert.equal(heard[heard.length - 1], 'launch');
});

test('a longer count takes proportionally longer', () => {
  assert.ok(countdownLength(10) > countdownLength(3) * 2, 'ten should take much longer than three');
  assert.ok(Math.abs(countdownLength(10) - COUNTDOWN_TICK * 10) < 1e-9);
});

test('each number holds for its window and is then replaced, not repeated', () => {
  // Halfway through the first tick of a ten count, ten should still be the word spoken.
  assert.equal(countdownStep(COUNTDOWN_TICK * 0.4, 10).say, 'ten');
  assert.equal(countdownStep(COUNTDOWN_TICK * 1.4, 10).say, 'nine');
  // And a count from three never says anything above three.
  for (let t = 0; t < countdownLength(3); t += 0.05) {
    const say = countdownStep(t, 3).say;
    if (say === 'launch') continue;
    const n = NUMBER_KEYS.indexOf(say as NumberKey) + 1;
    assert.ok(n <= 3, `a count from three said ${n}`);
  }
});

test('the step number matches what is being said', () => {
  assert.equal(countdownStep(0, 10).step, 10);
  assert.equal(countdownStep(COUNTDOWN_TICK * 4.5, 10).step, 6);
  assert.equal(countdownStep(COUNTDOWN_TICK * 9, 10).step, 1);
  // The cues are not numbers, so they have no step.
  assert.equal(countdownStep(COUNTDOWN_TICK * 10, 10).step, null);
  assert.equal(countdownStep(-1, 10).step, null);
});

test('nothing is said before the count or long after it', () => {
  assert.equal(countdownStep(-0.001, 10).say, null);
  assert.equal(countdownStep(countdownLength(10) + 5, 10).say, null);
});

test('the launch happens once the count is out, and keeps having happened', () => {
  for (const from of [COUNTDOWN_MIN, 5, COUNTDOWN_MAX]) {
    assert.ok(!countdownOver(countdownLength(from) - 0.01, from), 'not before the count finishes');
    assert.ok(countdownOver(countdownLength(from), from));
    assert.ok(countdownOver(countdownLength(from) + 100, from));
  }
});

test('progress runs 0 to 1 for any count length', () => {
  for (const from of [COUNTDOWN_MIN, 5, COUNTDOWN_MAX]) {
    assert.equal(countdownStep(0, from).progress, 0);
    assert.ok(countdownStep(countdownLength(from), from).progress >= 1);
    assert.ok(countdownStep(-50, from).progress >= 0);
    assert.ok(countdownStep(9999, from).progress <= 1);
  }
});

test('a dropped frame never repeats a number, and never says one twice', () => {
  // Sampling the way a real frame loop would: mostly 60fps with long stalls. A stall long enough to
  // jump over several ticks legitimately skips those numbers, since nothing was said while they
  // passed, but whatever is said must be current, never a stale number replayed.
  const heard: (CountdownKey | null)[] = [];
  let t = 0;
  // Same dedup the scene does: speak only when the word changes from the last one spoken.
  let last: CountdownKey | null = null;
  for (const dt of [0.016, 0.016, 2.2, 0.016, 3.1, 0.016, 2.7, 0.016, 1.6, 0.016]) {
    t += dt;
    const say = countdownStep(t, 10).say;
    if (say && say !== last) {
      assert.ok(say !== heard[heard.length - 1], `said ${say} twice in a row`);
      heard.push(say);
      last = say;
    }
  }
  // Each word is the one that was current at that moment: ten, then the tick 2.2s lands in, etc.
  assert.deepEqual(heard, ['ten', 'eight', 'six', 'three', 'two']);
  // And they descend, never going back up. Indices run 0..9, so counting down means strictly
  // decreasing indices: ten is 9, eight is 7, two is 1.
  const spokenNumbers = heard.filter((h) => h !== 'launch') as NumberKey[];
  const indices = spokenNumbers.map((k) => NUMBER_KEYS.indexOf(k));
  for (let i = 1; i < indices.length; i++) {
    assert.ok(indices[i] < indices[i - 1], `the count went backwards at ${spokenNumbers[i]}`);
  }
});

test('a smooth frame hears every number', () => {
  // The opposite case: no stalls, so nothing may be missed.
  assert.deepEqual(spoken(10).length, COUNTDOWN_MAX + 1);
});

test('numberKey only answers for numbers the words cover', () => {
  for (let n = 1; n <= COUNTDOWN_MAX; n++) {
    assert.ok(numberKey(n), `${n} should have a word`);
  }
  assert.equal(numberKey(0), null);
  assert.equal(numberKey(-1), null);
  assert.equal(numberKey(COUNTDOWN_MAX + 1), null, 'there is no word past ten');
});

test('English is first and is the default', () => {
  assert.equal(LANGUAGE_IDS[0], 'en');
  assert.equal(phrase('ten', 'en'), 'ten');
  assert.equal(phrase('launch', 'en'), 'launch');
});

test('every language has a word for every number, and for the cues', () => {
  for (const id of LANGUAGE_IDS) {
    const table = COUNTDOWN_PHRASES[id];
    for (const key of KEYS) {
      const value = table[key];
      assert.ok(typeof value === 'string' && value.trim().length > 0, `${id}.${key} is empty`);
    }
  }
});

test('the number words are distinct within a language', () => {
  // A copy-paste of English would still pass the checks above, so check no language repeats a word.
  for (const id of LANGUAGE_IDS) {
    const words = NUMBER_KEYS.map((k) => phrase(k, id));
    assert.equal(new Set(words).size, NUMBER_KEYS.length, `${id} repeats a number word`);
  }
});

test('a language that changes form as the count rises is spelled out, not truncated', () => {
  // Japanese and Chinese have a different word for each number, and some languages only share forms
  // in the low numbers. Every language must still be fully countable to ten.
  for (const id of LANGUAGE_IDS) {
    for (let n = COUNTDOWN_MAX; n >= 2; n--) {
      const word = phrase(numberKey(n) as NumberKey, id);
      assert.ok(word.length > 0, `${id} is missing ${n}`);
    }
  }
});

test('every language has a label and a speech locale', () => {
  for (const id of LANGUAGE_IDS) {
    assert.ok(LANGUAGE_LABELS[id]?.length > 0, `${id} has no label`);
    assert.match(SPEECH_LOCALES[id], /^[a-z]{2}-[A-Z]{2}$/, `${id} has an unusable locale tag`);
  }
});

test('an unknown language falls back to English rather than speaking nothing', () => {
  const unknown = 'xx' as keyof typeof COUNTDOWN_PHRASES;
  assert.equal(phrase('launch', unknown), COUNTDOWN_PHRASES.en.launch);
  assert.equal(phrase('ten', unknown), COUNTDOWN_PHRASES.en.ten);
});
