import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeFrequency,
  noteLabel,
  pitchClassName,
  getTransposition,
  transpositionLabel,
  transpositionKey,
  tempoName,
  tempoBpm,
  clampBpm,
  midiToFreq,
} from '../js/notes.js';

test('A4 i strojenie A4', () => {
  assert.equal(analyzeFrequency(440).midi, 69);
  assert.ok(Math.abs(analyzeFrequency(440).cents) < 1e-9);
  const r = analyzeFrequency(442, 442);
  assert.equal(r.midi, 69);
  assert.ok(Math.abs(r.cents) < 1e-9);
  assert.ok(Math.abs(midiToFreq(72, 442) - 525.6) < 0.1);
});

test('odchyłka i Hz od nominału', () => {
  const r = analyzeFrequency(445, 440);
  assert.equal(r.midi, 69);
  assert.ok(Math.abs(r.cents - 19.56) < 0.05);
  assert.ok(Math.abs(r.diffHz - 5) < 1e-9);
});

test('nazewnictwo', () => {
  assert.equal(noteLabel(60), 'C4');
  // domyślnie notacja polska ze znakami „auto”
  assert.deepEqual([1, 3, 6, 8, 10, 11].map((pc) => pitchClassName(pc)), ['C♯', 'E♭', 'F♯', 'G♯', 'B', 'H']);
  assert.equal(pitchClassName(10, { naming: 'en' }), 'B♭');
  assert.equal(noteLabel(63, { naming: 'en', accidental: 'flat' }), 'E♭4');
  assert.equal(noteLabel(63, { naming: 'en', accidental: 'sharp' }), 'D♯4');
  assert.equal(pitchClassName(10, { naming: 'de', accidental: 'flat' }), 'B');
  assert.equal(pitchClassName(11, { naming: 'de' }), 'H');
  assert.equal(pitchClassName(3, { naming: 'de', accidental: 'flat' }), 'Es');
  assert.equal(pitchClassName(7, { naming: 'solfege' }), 'Sol');
});

test('saksofon altowy: koncertowe Es = zapisane C', () => {
  const eb = getTransposition('Eb');
  assert.equal(pitchClassName(3 + eb.semis), 'C');
  assert.equal(transpositionLabel(eb, { naming: 'en' }), 'E♭ (C » A)');
  assert.equal(transpositionKey(eb), 'Es');
  assert.equal(transpositionKey(eb, { naming: 'en' }), 'E♭');
  const bb = getTransposition('Bb');
  assert.equal(pitchClassName(10 + bb.semis), 'C');
  assert.equal(transpositionKey(bb), 'B');
  assert.equal(transpositionKey(bb, { naming: 'de', accidental: 'flat' }), 'B');
  assert.equal(transpositionKey(getTransposition('Bb8'), { naming: 'en' }), 'B♭ 8va');
  assert.equal(transpositionKey(getTransposition('Bb8')), 'B 8va');
  assert.equal(transpositionKey(getTransposition('EbHi'), { naming: 'de', accidental: 'flat' }), 'Es wysoki');
  assert.equal(transpositionKey(getTransposition('A')), 'A');
  const f = getTransposition('F');
  assert.equal(pitchClassName(5 + f.semis), 'C');
});

test('nazwy temp', () => {
  assert.equal(tempoName(84), 'Andante');
  assert.equal(tempoName(120), 'Allegretto');
  assert.equal(tempoName(60), 'Larghetto');
  assert.equal(tempoName(30), 'Grave');
  assert.equal(tempoName(240), 'Prestissimo');
  assert.equal(tempoName(10), 'Grave');
  assert.equal(tempoBpm('Andante'), 92);
  assert.equal(tempoBpm('Allegro'), 150);
  assert.equal(clampBpm(300), 240);
  assert.equal(clampBpm(12), 30);
});
