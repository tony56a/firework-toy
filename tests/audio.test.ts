import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClapDetector } from '../src/input/audio/clapDetector';
import {
  analysisBins, classifierThreshold, dbToPower, extractFeatures, judgeSpectral, levelThresholds, measureLevel,
} from '../src/input/audio/features';
import type { ClipClassifier } from '../src/input/audio/types';
import { parseClapClassIds } from '../src/input/audio/yamnet';
import { FFT_SIZE, makeFrame, SAMPLE_RATE } from './helpers';

const STEP = 16;

/** Feed silent frames so the detector learns its noise floor. Returns the next timestamp. */
function warmUp(d: ClapDetector, frames = 45): number {
  let now = 0;
  for (let i = 0; i < frames; i++, now += STEP) d.update(makeFrame('silence', i + 1), now);
  return now;
}

function collect(d: ClapDetector) {
  const claps: string[] = [];
  const statuses: string[] = [];
  d.on('clap', ({ mode }) => claps.push(mode));
  d.on('status', (s) => statuses.push(s));
  return { claps, statuses };
}

test('level metrics: a sharp burst has a high crest factor, steady noise does not', () => {
  const burst = measureLevel(makeFrame('clap').highpassed);
  assert.ok(burst.crest > 3 && burst.rms > 0.03);
  const steady = new Float32Array(1024).map((_, i) => Math.sin(i * 0.3) * 0.2);
  assert.ok(measureLevel(steady).crest < 1.6);
});

test('higher sensitivity lowers the thresholds', () => {
  const low = levelThresholds(2);
  const high = levelThresholds(9);
  assert.ok(high.ratio < low.ratio && high.floor < low.floor);
  assert.ok(classifierThreshold(9) < classifierThreshold(2));
});

test('spectral judgement: broadband passes; low thump and pure tone are rejected with reasons', () => {
  const bins = analysisBins(SAMPLE_RATE, FFT_SIZE, FFT_SIZE / 2);
  const noise = new Float32Array(FFT_SIZE / 2).fill(1e-12);
  const power = new Float32Array(FFT_SIZE / 2);
  const judge = (shape: 'clap' | 'lowThump' | 'tone') => {
    dbToPower(makeFrame(shape).spectrumDb, power);
    return judgeSpectral(extractFeatures(power, noise, bins), 7);
  };
  assert.equal(judge('clap'), null);
  assert.equal(judge('lowThump'), 'mostly low frequency');
  assert.equal(judge('tone'), 'tonal');
});

test('learned noise removes steady broadband noise from the excess', () => {
  const bins = analysisBins(SAMPLE_RATE, FFT_SIZE, FFT_SIZE / 2);
  const power = new Float32Array(FFT_SIZE / 2);
  dbToPower(makeFrame('clap').spectrumDb, power);
  const learned = extractFeatures(power, power, bins); // noise profile equals the signal
  assert.ok(learned.excessFrac < 0.01);
});

test('level mode fires on a clap after warm-up and respects the cooldown', () => {
  const d = new ClapDetector();
  d.mode = 'level';
  const { claps } = collect(d);
  let now = warmUp(d);
  d.update(makeFrame('clap'), now); now += STEP;
  assert.equal(claps.length, 1);
  d.update(makeFrame('silence'), now); now += STEP;
  d.update(makeFrame('clap'), now); now += STEP; // 32 ms later: inside the cooldown
  assert.equal(claps.length, 1);
  now += 600;
  d.update(makeFrame('silence'), now); now += STEP;
  d.update(makeFrame('clap'), now);
  assert.equal(claps.length, 2);
});

test('spectral mode fires on broadband claps and ignores low thumps and tones', () => {
  const d = new ClapDetector();
  const { claps, statuses } = collect(d);
  let now = warmUp(d);
  for (const shape of ['lowThump', 'tone'] as const) {
    d.update(makeFrame(shape), now); now += 600;
    d.update(makeFrame('silence'), now); now += STEP;
  }
  assert.equal(claps.length, 0);
  assert.deepEqual(statuses.filter((s) => s.startsWith('Ignored')), ['Ignored (mostly low frequency)', 'Ignored (tonal)']);
  d.update(makeFrame('clap'), now);
  assert.deepEqual(claps, ['spectral']);
});

test('nothing fires during calibration, and the detector reports completion', () => {
  const d = new ClapDetector();
  const { claps, statuses } = collect(d);
  let now = warmUp(d);
  d.calibrate(now);
  d.update(makeFrame('clap'), now); now += STEP;
  assert.equal(claps.length, 0);
  now += 2100;
  d.update(makeFrame('silence'), now);
  assert.ok(statuses.includes('Calibrated to this room'));
});

test('classifier mode without a loaded model falls back to spectral', () => {
  const d = new ClapDetector();
  d.mode = 'classifier';
  const { claps } = collect(d);
  const now = warmUp(d);
  d.update(makeFrame('clap'), now);
  assert.deepEqual(claps, ['spectral']);
});

async function classifierRun(score: number) {
  const d = new ClapDetector();
  d.mode = 'classifier';
  const fake: ClipClassifier = { classify: async () => score };
  d.setClassifier(fake);
  const { claps, statuses } = collect(d);
  let now = warmUp(d);
  d.update(makeFrame('clap'), now); // onset: nothing fires yet
  assert.equal(claps.length, 0);
  for (let i = 0; i < 40; i++) { now += STEP; d.update(makeFrame('silence'), now); }
  await new Promise((resolve) => setImmediate(resolve));
  return { claps, statuses };
}

test('classifier mode fires only when the model confirms', async () => {
  const yes = await classifierRun(0.9);
  assert.deepEqual(yes.claps, ['classifier']);
  const no = await classifierRun(0.02);
  assert.equal(no.claps.length, 0);
  assert.ok(no.statuses.some((s) => s.startsWith('Rejected by classifier')));
});

test('resetting the detector discards an in-flight classifier result', async () => {
  const d = new ClapDetector();
  d.mode = 'classifier';
  let release: (v: number) => void = () => undefined;
  d.setClassifier({ classify: () => new Promise<number>((r) => { release = r; }) });
  const { claps } = collect(d);
  let now = warmUp(d);
  d.update(makeFrame('clap'), now);
  for (let i = 0; i < 40; i++) { now += STEP; d.update(makeFrame('silence'), now); }
  d.reset();
  release(0.99);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(claps.length, 0);
});

test('class map parsing finds Clapping and Applause, including quoted names', () => {
  const csv = ['index,mid,display_name', '0,/m/09x0r,Speech', '56,/m/0l15bq,"Clapping"', '58,/m/028ght,Applause', '59,/m/x,"Cheering, crowd"'].join('\n');
  assert.deepEqual(parseClapClassIds(csv), [56, 58]);
});
