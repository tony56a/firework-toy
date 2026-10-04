import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Emitter } from '../src/core/emitter';
import { createNoise, fbm } from '../src/core/noise';
import { hashSeed, mulberry32, rngFromSeed } from '../src/core/random';
import { Store } from '../src/core/store';
import { hslToRgb } from '../src/core/color';

test('same seed gives the same random sequence, different seeds differ', () => {
  const a = rngFromSeed('meadow');
  const b = rngFromSeed('meadow');
  const c = rngFromSeed('other');
  const seqA = [a(), a(), a()];
  assert.deepEqual(seqA, [b(), b(), b()]);
  assert.notDeepEqual(seqA, [c(), c(), c()]);
  assert.notEqual(hashSeed('a'), hashSeed('b'));
});

test('rng stays within [0, 1)', () => {
  const r = mulberry32(42);
  for (let i = 0; i < 10_000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
  }
});

test('noise is deterministic, bounded and continuous', () => {
  const n1 = createNoise(rngFromSeed('s'));
  const n2 = createNoise(rngFromSeed('s'));
  for (let i = 0; i < 200; i++) {
    const x = i * 0.37;
    const y = i * 0.11 - 5;
    assert.equal(n1(x, y), n2(x, y));
    const v = fbm(n1, x, y, 4);
    assert.ok(v >= 0 && v <= 1);
  }
  assert.ok(Math.abs(n1(3.5, 4.5) - n1(3.5001, 4.5)) < 0.01);
});

test('store notifies only for keys that changed', () => {
  const store = new Store({ a: 1, b: 'x' });
  const seen: string[][] = [];
  store.subscribe((_s, changed) => seen.push(changed.map(String)));
  store.set({ a: 1 });
  store.set({ a: 2, b: 'x' });
  store.set({ b: 'y' });
  assert.deepEqual(seen, [['a'], ['b']]);
  assert.deepEqual(store.get(), { a: 2, b: 'y' });
});

test('emitter delivers payloads and supports unsubscribe', () => {
  class E extends Emitter<{ ping: number }> { fire(n: number) { this.emit('ping', n); } }
  const e = new E();
  const got: number[] = [];
  const off = e.on('ping', (n) => got.push(n));
  e.fire(1);
  off();
  e.fire(2);
  assert.deepEqual(got, [1]);
});

test('hslToRgb matches known colors', () => {
  assert.deepEqual(hslToRgb(0, 1, 0.5).map((v) => Math.round(v * 255)), [255, 0, 0]);
  assert.deepEqual(hslToRgb(1 / 3, 1, 0.5).map((v) => Math.round(v * 255)), [0, 255, 0]);
  assert.deepEqual(hslToRgb(0.5, 0, 1).map((v) => Math.round(v * 255)), [255, 255, 255]);
});
