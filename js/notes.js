// Nazewnictwo dźwięków, transpozycje i przeliczenia częstotliwości.

export const NAMINGS = {
  en: {
    label: 'C, D, E … B',
    sharp: ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'],
    flat: ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'],
  },
  de: {
    label: 'C, D, E … H (Cis, Es, B)',
    sharp: ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'Ais', 'H'],
    flat: ['C', 'Des', 'D', 'Es', 'E', 'F', 'Ges', 'G', 'As', 'A', 'B', 'H'],
  },
  solfege: {
    label: 'Do, Re, Mi …',
    sharp: ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'],
    flat: ['Do', 'Re♭', 'Re', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'],
  },
};

// semis = o ile półtonów zapis dla instrumentu jest wyżej od dźwięku koncertowego.
// Np. saksofon altowy (Es) brzmi sekstę wielką niżej, więc koncertowe C to zapisane A (+9).
// Nazwa stroju instrumentu wynika z semis (dźwięk koncertowy brzmiący przy zapisanym C); tag odróżnia warianty.
export const TRANSPOSITIONS = [
  { id: 'C', semis: 0, desc: 'fortepian, flet, obój, fagot, skrzypce, puzon' },
  { id: 'Bb', semis: 2, desc: 'klarnet, trąbka, saksofon sopranowy' },
  { id: 'Bb8', semis: 14, tag: '8va', desc: 'saksofon tenorowy, klarnet basowy' },
  { id: 'Eb', semis: 9, desc: 'saksofon altowy, sakshorn altowy' },
  { id: 'Eb8', semis: 21, tag: '8va', desc: 'saksofon barytonowy' },
  { id: 'EbHi', semis: -3, tag: 'wysoki', desc: 'klarnet Es, trąbka Es' },
  { id: 'F', semis: 7, desc: 'waltornia, rożek angielski' },
  { id: 'A', semis: 3, desc: 'klarnet A' },
  { id: 'G', semis: 5, desc: 'flet altowy' },
  { id: 'D', semis: -2, desc: 'trąbka D' },
  { id: 'C8up', semis: -12, tag: '−8va', desc: 'flet piccolo (zapis oktawę niżej)' },
  { id: 'C8down', semis: 12, tag: '+8va', desc: 'gitara, kontrabas (zapis oktawę wyżej)' },
];

export function getTransposition(id) {
  return TRANSPOSITIONS.find((t) => t.id === id) || TRANSPOSITIONS[0];
}

export function freqToMidi(freq, a4 = 440) {
  return 69 + 12 * Math.log2(freq / a4);
}

export function midiToFreq(midi, a4 = 440) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

// Najbliższy dźwięk i odchyłka w centach.
export function analyzeFrequency(freq, a4 = 440) {
  const exact = freqToMidi(freq, a4);
  const midi = Math.round(exact);
  const cents = (exact - midi) * 100;
  const target = midiToFreq(midi, a4);
  return { midi, cents, target, diffHz: freq - target };
}

export function pitchClassName(pc, { naming = 'en', accidental = 'flat' } = {}) {
  const table = NAMINGS[naming] || NAMINGS.en;
  return table[accidental === 'sharp' ? 'sharp' : 'flat'][((pc % 12) + 12) % 12];
}

// Notacja naukowa: MIDI 60 = C4, MIDI 69 = A4.
export function noteName(midi, opts = {}) {
  return {
    name: pitchClassName(midi, opts),
    octave: Math.floor(midi / 12) - 1,
  };
}

export function noteLabel(midi, opts = {}) {
  const n = noteName(midi, opts);
  return `${n.name}${n.octave}`;
}

// Strój instrumentu, np. „E♭”, „B♭ 8va” (lub „Es”, „B” w nazewnictwie polskim).
export function transpositionKey(t, opts = {}) {
  const name = pitchClassName(-t.semis, opts);
  return t.tag ? `${name} ${t.tag}` : name;
}

// Opis transpozycji w stylu „E♭ (C » A)”.
export function transpositionLabel(t, opts = {}) {
  return `${transpositionKey(t, opts)} (${pitchClassName(0, opts)} » ${pitchClassName(t.semis, opts)})`;
}

const TEMPO_NAMES = [
  [24, 'Larghissimo'],
  [40, 'Grave'],
  [60, 'Largo'],
  [66, 'Larghetto'],
  [76, 'Adagio'],
  [108, 'Andante'],
  [120, 'Moderato'],
  [156, 'Allegro'],
  [176, 'Vivace'],
  [200, 'Presto'],
  [Infinity, 'Prestissimo'],
];

export function tempoName(bpm) {
  for (const [max, name] of TEMPO_NAMES) if (bpm < max) return name;
  return 'Prestissimo';
}
