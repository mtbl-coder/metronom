// Nazewnictwo dźwięków, transpozycje i przeliczenia częstotliwości.

// auto = najczęściej używane znaki (C♯, E♭, F♯, G♯, B♭) – domyślne w stroikach.
export const NAMINGS = {
  pl: {
    label: 'Polska (H)',
    auto: ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B', 'H'],
    sharp: ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'H'],
    flat: ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B', 'H'],
  },
  en: {
    label: 'Międzyn. (B)',
    auto: ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'],
    sharp: ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'],
    flat: ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'],
  },
  de: {
    label: 'Cis, Es',
    auto: ['C', 'Cis', 'D', 'Es', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'B', 'H'],
    sharp: ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'Ais', 'H'],
    flat: ['C', 'Des', 'D', 'Es', 'E', 'F', 'Ges', 'G', 'As', 'A', 'B', 'H'],
  },
  solfege: {
    label: 'Do Re Mi',
    auto: ['Do', 'Do♯', 'Re', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'Si♭', 'Si'],
    sharp: ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'],
    flat: ['Do', 'Re♭', 'Re', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'],
  },
};

export const ACCIDENTALS = { auto: 'Auto', sharp: '♯', flat: '♭' };

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

export function pitchClassName(pc, { naming = 'pl', accidental = 'auto' } = {}) {
  const table = NAMINGS[naming] || NAMINGS.pl;
  return (table[accidental] || table.auto)[((pc % 12) + 12) % 12];
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
  // W notacji polskiej stroje nazywa się „B”, „Es”, „As” (jak w nutach orkiestrowych).
  const keyOpts = opts.naming === 'pl' || opts.naming === undefined ? { naming: 'de', accidental: 'flat' } : { ...opts, accidental: 'flat' };
  const name = pitchClassName(-t.semis, keyOpts);
  return t.tag ? `${name} ${t.tag}` : name;
}

// Opis transpozycji w stylu „E♭ (C » A)”.
export function transpositionLabel(t, opts = {}) {
  return `${transpositionKey(t, opts)} (${pitchClassName(0, opts)} » ${pitchClassName(t.semis, opts)})`;
}

// Włoskie nazwy tempa z zakresami BPM – wspólne dla metronomu i mini-metronomu.
export const BPM_MIN = 30;
export const BPM_MAX = 240;
export const TEMPOS = [
  { name: 'Grave', min: 30, max: 39 },
  { name: 'Largo', min: 40, max: 59 },
  { name: 'Larghetto', min: 60, max: 65 },
  { name: 'Adagio', min: 66, max: 75 },
  { name: 'Andante', min: 76, max: 107 },
  { name: 'Moderato', min: 108, max: 119 },
  { name: 'Allegretto', min: 120, max: 131 },
  { name: 'Allegro', min: 132, max: 167 },
  { name: 'Vivace', min: 168, max: 175 },
  { name: 'Presto', min: 176, max: 199 },
  { name: 'Prestissimo', min: 200, max: 240 },
];

export function clampBpm(bpm) {
  return Math.round(Math.max(BPM_MIN, Math.min(BPM_MAX, Number(bpm) || BPM_MIN)));
}

export function tempoName(bpm) {
  const b = clampBpm(bpm);
  return (TEMPOS.find((t) => b >= t.min && b <= t.max) || TEMPOS[TEMPOS.length - 1]).name;
}

// Wybór nazwy → środek zakresu.
export function tempoBpm(name) {
  const t = TEMPOS.find((x) => x.name === name);
  return t ? Math.round((t.min + t.max) / 2) : null;
}
