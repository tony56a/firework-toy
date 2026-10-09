import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COUNTDOWN_TICK } from '../src/config';
import { countdownOver, countdownStep } from '../src/models/countdown';
import {
  COUNTDOWN_PHRASES, LANGUAGE_IDS, LANGUAGE_LABELS, SPEECH_LOCALES, phrase, type CountdownKey,
} from '../src/models/countdownPhrases';

const KEYS: CountdownKey[] = ['three', 'two', 'one', 'launch', 'hold'];

test('the count runs three, two, one, launch, in that order', () => {
  const said: (CountdownKey | null)[] = [];
  for (let t = 0; t < COUNTDOWN_TICK * 3 + 1; t += 0.05) said.push(countdownStep(t).say);
  const unique = said.filter((s, i) => s !== said[i - 1] && s !== null);
  assert.deepEqual(unique, ['three', 'two', 'one', 'launch']);
});

test('each number is said once, for as long as its window lasts', () => {
  for (const [key, at] of [['three', 0.1], ['two', COUNTDOWN_TICK + 0.1], ['one', COUNTDOWN_TICK * 2 + 0.1]] as const) {
    assert.equal(countdownStep(at).say, key);
    // Still the same word a moment later, so the caller does not repeat it every frame.
    assert.equal(countdownStep(at + COUNTDOWN_TICK * 0.4).say, key);
  }
});

test('the step number counts down and is absent outside the count', () => {
  assert.equal(countdownStep(0).step, 3);
  assert.equal(countdownStep(COUNTDOWN_TICK).step, 2);
  assert.equal(countdownStep(COUNTDOWN_TICK * 2).step, 1);
  // "Launch" is not a number, and nothing is said before the count or after it.
  assert.equal(countdownStep(COUNTDOWN_TICK * 3).step, null);
  assert.equal(countdownStep(-1).step, null);
  assert.equal(countdownStep(COUNTDOWN_TICK * 4).step, null);
});

test('nothing is said before the countdown or long after it', () => {
  assert.equal(countdownStep(-0.001).say, null);
  assert.equal(countdownStep(COUNTDOWN_TICK * 3 + 5).say, null);
});

test('the launch happens once the count is out', () => {
  assert.ok(!countdownOver(COUNTDOWN_TICK * 3 - 0.01), 'not before the count finishes');
  assert.ok(countdownOver(COUNTDOWN_TICK * 3));
  assert.ok(countdownOver(COUNTDOWN_TICK * 3 + 10));
  // And the caller can rely on it staying true.
  assert.ok(countdownOver(COUNTDOWN_TICK * 3 + 100));
});

test('progress runs 0 to 1 and never leaves that range', () => {
  assert.equal(countdownStep(0).progress, 0);
  assert.ok(countdownStep(COUNTDOWN_TICK * 3).progress >= 1);
  assert.ok(countdownStep(-50).progress >= 0, 'progress should not go negative');
  assert.ok(countdownStep(9999).progress <= 1, 'progress should not exceed 1');
});

test('a dropped frame cannot repeat or skip a number', () => {
  // Sampling the way a real frame loop would: mostly 60fps, with a couple of long stalls that each
  // jump over most of a tick. Nothing may be said twice, and nothing may be skipped.
  const heard: (CountdownKey | null)[] = [];
  let t = 0;
  const steps = [0.016, 0.016, 1.2, 0.016, 1.3, 0.016, 1.4];
  for (const dt of steps) {
    t += dt;
    const say = countdownStep(t).say;
    if (say && say !== heard[heard.length - 1]) heard.push(say);
  }
  assert.deepEqual(heard, ['three', 'two', 'one']);
});

test('English is first and is the default', () => {
  assert.equal(LANGUAGE_IDS[0], 'en');
  assert.equal(phrase('three', 'en'), 'three');
  assert.equal(phrase('launch', 'en'), 'launch');
});

test('every language has a phrase for every key, and no empty strings', () => {
  for (const id of LANGUAGE_IDS) {
    const table = COUNTDOWN_PHRASES[id];
    for (const key of KEYS) {
      const value = table[key];
      assert.ok(typeof value === 'string' && value.trim().length > 0, `${id}.${key} is empty`);
    }
  }
});

test('every language has a label and a speech locale', () => {
  for (const id of LANGUAGE_IDS) {
    assert.ok(LANGUAGE_LABELS[id]?.length > 0, `${id} has no label`);
    // The speech API needs a BCP 47 tag; ours are two-letter plus a region.
    assert.match(SPEECH_LOCALES[id], /^[a-z]{2}-[A-Z]{2}$/, `${id} has an unusable locale tag`);
  }
});

test('the numbers actually differ between languages, or it is not translating', () => {
  // A copy-paste of the English table would pass every other test, so check the values are distinct.
  const threes = LANGUAGE_IDS.map((id) => phrase('three', id));
  assert.ok(new Set(threes).size > LANGUAGE_IDS.length / 2, 'most languages share one word for three');
  assert.ok(phrase('three', 'ja') !== phrase('three', 'en'));
});

test('an unknown language falls back to English rather than speaking nothing', () => {
  const unknown = 'xx' as keyof typeof COUNTDOWN_PHRASES;
  assert.equal(phrase('launch', unknown), COUNTDOWN_PHRASES.en.launch);
});
