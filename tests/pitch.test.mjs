import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch } from '../js/pitch.js';
import { freqToMidi } from '../js/notes.js';

function synth(freq, sampleRate, { length = 4096, harmonics = [1], noise = 0, phase = 0.3 } = {}) {
  const buf = new Float32Array(length);
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < length; i++) {
    let v = 0;
    harmonics.forEach((amp, h) => {
      v += amp * Math.sin(2 * Math.PI * freq * (h + 1) * (i / sampleRate) + phase * (h + 1));
    });
    buf[i] = 0.3 * v + noise * rnd();
  }
  return buf;
}

const centsOff = (a, b) => 1200 * Math.log2(a / b);

for (const sr of [44100, 48000]) {
  for (const f of [41.2, 82.41, 146.83, 233.08, 311.13, 440, 622.25, 987.77, 1567.98, 2093, 3520]) {
    test(`sinus ${f} Hz @ ${sr}`, () => {
      const r = detectPitch(synth(f, sr), sr);
      assert.ok(r.freq > 0, 'brak detekcji');
      assert.ok(Math.abs(centsOff(r.freq, f)) < 2, `wykryto ${r.freq}`);
    });
  }
}

test('ton bogaty w alikwoty (saksofon-like) bez błędu oktawy', () => {
  const sr = 48000;
  for (const f of [138.59, 207.65, 311.13, 466.16, 698.46]) {
    const r = detectPitch(synth(f, sr, { harmonics: [0.6, 1, 0.8, 0.5, 0.4, 0.3, 0.2], noise: 0.02 }), sr);
    assert.ok(Math.abs(centsOff(r.freq, f)) < 3, `${f}: wykryto ${r.freq}`);
  }
});

test('słaby brak podstawy (missing fundamental) nadal daje właściwą wysokość', () => {
  const sr = 48000;
  const f = 220;
  const r = detectPitch(synth(f, sr, { harmonics: [0.1, 1, 0.7, 0.5] }), sr);
  assert.ok(Math.abs(centsOff(r.freq, f)) < 3, `wykryto ${r.freq}`);
});

test('cisza i szum nie dają tonu', () => {
  const sr = 48000;
  assert.equal(detectPitch(new Float32Array(4096), sr).freq, 0);
  const noise = synth(1, sr, { harmonics: [0], noise: 0.4 });
  assert.equal(detectPitch(noise, sr).freq, 0);
});

test('odchyłka w centach jest mierzona dokładnie', () => {
  const sr = 48000;
  const f = 440 * Math.pow(2, 7 / 1200); // +7 c
  const r = detectPitch(synth(f, sr), sr);
  const cents = (freqToMidi(r.freq, 440) - 69) * 100;
  assert.ok(Math.abs(cents - 7) < 1, `cents=${cents}`);
});
