import {
  NAMINGS,
  ACCIDENTALS,
  TRANSPOSITIONS,
  TEMPOS,
  getTransposition,
  analyzeFrequency,
  noteName,
  noteLabel,
  midiToFreq,
  transpositionKey,
  tempoName,
  tempoBpm,
  clampBpm,
  BPM_MIN,
  BPM_MAX,
} from './notes.js';
import { Tuner, ToneGenerator, RESPONSE } from './tuner.js';
import { Metronome, SOUNDS, ACCENT } from './metronome.js';

const $ = (id) => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';

// ================================================================ ustawienia
const SETTINGS_VERSION = 2;
const DEFAULTS = {
  v: SETTINGS_VERSION,
  tab: 'tuner',
  naming: 'pl',
  accidental: 'auto',
  transposition: 'C',
  a4: 440,
  tolerance: 5,
  sensitivity: 50,
  response: 'normal',
  showHz: false,
  forkMidi: 69,
  bpm: 84,
  beats: 4,
  accents: [2, 1, 1, 1],
  subdivision: '1',
  sound: 'click',
  volume: 80,
  flash: true,
  vibrate: false,
  keepAwake: true,
  trainer: { enabled: false, step: 2, everyBars: 4, target: 140 },
  timer: { enabled: false, minutes: 5 },
};
const A4_MIN = 415;
const A4_MAX = 466;
const TOL_MAX = 15;
// główne stroje w segmencie; pozostałe w liście „wszystkie stroje”
const MAIN_TRANSPOSITIONS = ['C', 'Bb', 'Eb', 'F'];

const STORE_KEY = 'stroik-metronom.v1';
let S = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  S = { ...DEFAULTS, ...saved };
  if (!saved.v) {
    // wersja 1 miała domyślnie notację międzynarodową – przejście na polską (projekt)
    S.naming = DEFAULTS.naming;
    S.accidental = DEFAULTS.accidental;
    S.v = SETTINGS_VERSION;
  }
} catch {
  /* brak dostępu do pamięci – używamy domyślnych */
}
if (!NAMINGS[S.naming]) S.naming = DEFAULTS.naming;
if (!ACCIDENTALS[S.accidental]) S.accidental = DEFAULTS.accidental;
S.a4 = Math.max(A4_MIN, Math.min(A4_MAX, Number(S.a4) || 440));
S.tolerance = Math.max(1, Math.min(TOL_MAX, S.tolerance));
S.bpm = clampBpm(S.bpm);

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(S));
    } catch {
      /* ignoruj */
    }
  }, 200);
}

const nameOpts = () => ({ naming: S.naming, accidental: S.accidental });

// ================================================================ audio
let audioCtx = null;
function getContext() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC({ latencyHint: 'interactive' });
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

const tuner = new Tuner(getContext);
const tone = new ToneGenerator(getContext);
const metro = new Metronome(getContext);

// ---------------------------------------------------------------- blokada wygaszania ekranu
let wakeLock = null;
async function updateWakeLock() {
  const want = S.keepAwake && (metro.playing || tuner.running) && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null;
  }
}

// ---------------------------------------------------------------- pomocnicze UI
function setPressed(container, predicate) {
  container.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(predicate(b))));
}

function makeSegment(container, items, onPick) {
  container.textContent = '';
  for (const { value, label, aria } of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.value = value;
    b.textContent = label;
    if (aria) b.setAttribute('aria-label', aria);
    b.addEventListener('click', () => onPick(value));
    container.appendChild(b);
  }
}

function fillTempoSelect(sel) {
  sel.textContent = '';
  for (const t of TEMPOS) {
    const o = document.createElement('option');
    o.value = t.name;
    o.textContent = `${t.name}  ·  ${t.min}–${t.max}`;
    sel.appendChild(o);
  }
}

// ---------------------------------------------------------------- zakładki
function showTab(tab) {
  S.tab = tab;
  save();
  document.querySelectorAll('.tab').forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === tab));
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ================================================================ STROIK
// −50…+50 centów → −75°…+75° (1 cent = 1,5°)
const GAUGE = { cx: 160, cy: 172, r: 150, degPerCent: 1.5, tickOuter: 142 };
const angleFor = (c) => Math.max(-50, Math.min(50, c)) * GAUGE.degPerCent;
function polar(r, deg) {
  const a = (deg * Math.PI) / 180;
  return [GAUGE.cx + r * Math.sin(a), GAUGE.cy - r * Math.cos(a)];
}
const f1 = (n) => n.toFixed(1);

function buildGauge() {
  const g = $('gaugeTicks');
  g.textContent = '';
  for (let c = -50; c <= 50; c++) {
    const kind = c === 0 ? 'zero' : c % 10 === 0 ? 'major' : c % 5 === 0 ? 'mid' : 'minor';
    const inner = { zero: 118, major: 120, mid: 127, minor: 134 }[kind];
    const [x1, y1] = polar(inner, angleFor(c));
    const [x2, y2] = polar(GAUGE.tickOuter, angleFor(c));
    const l = document.createElementNS(svgNS, 'line');
    l.setAttribute('x1', f1(x1));
    l.setAttribute('y1', f1(y1));
    l.setAttribute('x2', f1(x2));
    l.setAttribute('y2', f1(y2));
    l.setAttribute('class', `tk ${kind}`);
    g.appendChild(l);
    if (c % 10 === 0) {
      const [tx, ty] = polar(106, angleFor(c));
      const t = document.createElementNS(svgNS, 'text');
      t.setAttribute('x', f1(tx));
      t.setAttribute('y', f1(ty + 3.5));
      t.setAttribute('class', 'tk-lbl');
      t.textContent = c > 0 ? `+${c}` : c < 0 ? `−${-c}` : '0';
      g.appendChild(t);
    }
  }
  renderTolerance();
}

function renderTolerance() {
  const [x1, y1] = polar(GAUGE.r, -angleFor(S.tolerance));
  const [x2, y2] = polar(GAUGE.r, angleFor(S.tolerance));
  $('tolArc').setAttribute('d', `M ${f1(x1)} ${f1(y1)} A ${GAUGE.r} ${GAUGE.r} 0 0 1 ${f1(x2)} ${f1(y2)}`);
  const h = S.tolerance * HIST_SCALE;
  $('histTol').setAttribute('y', f1(32 - h));
  $('histTol').setAttribute('height', f1(2 * h));
}

const tunerState = { midi: null, cents: 0, lastSeen: 0, history: [], live: false };
const HISTORY_LEN = 110; // ~5 s przy ~45 ms na punkt
const HIST_SCALE = 0.56; // centy → jednostki wykresu (±50¢ = ±28)

function fmtCents(c, space = '') {
  const v = Math.round(c);
  return `${v >= 0 ? '+' : '−'}${Math.abs(v)}${space}¢`;
}
function fmtHz(f) {
  return f.toFixed(f < 100 ? 2 : 1);
}

function setNote(nameEl, octEl, midi) {
  const n = noteName(midi, nameOpts());
  if (nameEl.textContent === n.name && octEl.textContent === String(n.octave)) return;
  nameEl.textContent = n.name;
  octEl.textContent = n.octave;
  fitNote(nameEl.parentElement);
}

// Rozmiar czcionki jest stały (etykiety się nie przesuwają). Tylko gdy nazwa (np. „Sol♯”) nie mieści się
// w kolumnie, cały wiersz jest wizualnie zwężany od dołu – bez zmiany wysokości układu.
function fitNote(row) {
  row.style.transform = '';
  const avail = row.parentElement.clientWidth;
  const need = row.scrollWidth;
  if (avail > 0 && need > avail) row.style.transform = `scale(${(avail / need).toFixed(3)})`;
}
window.addEventListener('resize', () => document.querySelectorAll('.band-note').forEach(fitNote));

function renderTunerLabels() {
  const t = getTransposition(S.transposition);
  const key = transpositionKey(t, nameOpts());
  $('tunerSub').textContent = `A4 = ${+S.a4.toFixed(1)} Hz · strój ${key}`;
  $('instrLabel').textContent = key;
  $('noteBand').classList.toggle('single', t.semis === 0);
  if (tunerState.midi !== null) {
    $('concertNote').textContent = '';
    $('writtenNote').textContent = '';
    renderNote(tunerState.midi);
  }
  renderFork();
}

function renderNote(midi) {
  const t = getTransposition(S.transposition);
  setNote($('concertNote'), $('concertOct'), midi);
  setNote($('writtenNote'), $('writtenOct'), midi + t.semis);
}

function onTunerResult(r) {
  const now = performance.now();
  const card = $('gauge').parentElement;
  const band = $('noteBand');

  if (r.freq > 0) {
    const a = analyzeFrequency(r.freq, S.a4);
    if (a.midi !== tunerState.midi) {
      tunerState.midi = a.midi;
      tunerState.cents = a.cents;
      renderNote(a.midi);
    } else {
      tunerState.cents += (a.cents - tunerState.cents) * tuner.response.smoothing; // wygładzanie wskazówki
    }
    tunerState.lastSeen = now;
    tunerState.live = true;
    const c = tunerState.cents;
    const inTune = Math.abs(c) <= S.tolerance;

    card.dataset.state = inTune ? 'in' : c < 0 ? 'flat' : 'sharp';
    $('needle').style.transform = `rotate(${angleFor(c).toFixed(1)}deg)`;
    $('centsText').textContent = fmtCents(c);
    $('gauge').setAttribute('aria-label', `Odchyłka ${fmtCents(c)}`);
    band.classList.toggle('in-tune', inTune);
    band.classList.remove('idle');
    if (S.showHz) {
      const diff = r.freq - midiToFreq(a.midi, S.a4);
      $('hzText').innerHTML = `${fmtHz(r.freq)} Hz<br>${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(2)} Hz`;
    }
    pushHistory(c);
  } else {
    pushHistory(null);
    if (now - tunerState.lastSeen > 1200 && tunerState.live) {
      tunerState.live = false;
      delete card.dataset.state;
      $('needle').style.transform = 'rotate(0deg)';
      $('centsText').textContent = '—';
      $('hzText').textContent = '';
      band.classList.remove('in-tune');
      band.classList.add('idle');
    }
  }
  renderPill();
  drawHistory();
}

// Wykres ma stałą skalę czasu (~45 ms na punkt) niezależnie od tempa analiz.
let lastHistoryAt = 0;
function pushHistory(c) {
  const now = performance.now();
  const h = tunerState.history;
  if (now - lastHistoryAt < 40 && h.length) {
    if (c !== null) h[h.length - 1] = c;
    return;
  }
  lastHistoryAt = now;
  h.push(c);
  if (h.length > HISTORY_LEN) h.shift();
}

function drawHistory() {
  const h = tunerState.history;
  const off = HISTORY_LEN - h.length;
  const step = 340 / (HISTORY_LEN - 1);
  let d = '';
  let pen = false;
  h.forEach((c, i) => {
    if (c === null) {
      pen = false;
      return;
    }
    const x = f1((off + i) * step);
    const y = f1(32 - Math.max(-50, Math.min(50, c)) * HIST_SCALE);
    d += `${pen ? 'L' : 'M'}${x} ${y} `;
    pen = true;
  });
  $('histLine').setAttribute('d', d.trim());
}

tuner.onResult = onTunerResult;
tuner.sensitivity = S.sensitivity / 100;
function applyResponse() {
  tuner.setResponse(S.response);
  // czas animacji zależy od trybu reakcji (szybka wskazówka = krótsza animacja)
  $('needle').style.transition = `transform ${Math.round(tuner.response.transition * 1000)}ms ease-out, opacity .3s`;
}
applyResponse();

let tunerWanted = false;
async function startTuner() {
  tunerWanted = true;
  try {
    await tuner.start();
    $('micStart').hidden = true;
  } catch (e) {
    tunerWanted = false;
    $('micStart').hidden = false;
    $('micStart').querySelector('span').textContent =
      e && e.name === 'NotAllowedError' ? 'Brak zgody – spróbuj ponownie' : 'Mikrofon niedostępny';
  }
  updateWakeLock();
}
$('micStart').addEventListener('click', startTuner);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (tuner.running) tuner.stop();
  } else if (tunerWanted && !tuner.running) {
    startTuner();
  }
  updateWakeLock();
});

// ---------------------------------------------------------------- ton wzorcowy (kamerton)
function renderFork() {
  const t = getTransposition(S.transposition);
  const f = midiToFreq(S.forkMidi, S.a4);
  const part = (m) => {
    const n = noteName(m, nameOpts());
    return `${n.name}<sub>${n.octave}</sub>`;
  };
  $('forkNote').innerHTML = t.semis ? `${part(S.forkMidi)}<span class="chev">»</span>${part(S.forkMidi + t.semis)}` : part(S.forkMidi);
  $('forkInfo').textContent = `${fmtHz(f)} Hz`;
  if (tone.playing) tone.play(f);
}
function setForkPlaying(on) {
  if (on) tone.play(midiToFreq(S.forkMidi, S.a4));
  else tone.stop();
  $('forkPlay').setAttribute('aria-pressed', String(tone.playing));
  $('forkPlay').setAttribute('aria-label', tone.playing ? 'Zatrzymaj ton wzorcowy' : 'Graj ton wzorcowy');
}
$('forkBtn').addEventListener('click', () => {
  const panel = $('forkPanel');
  panel.hidden = !panel.hidden;
  $('forkBtn').setAttribute('aria-pressed', String(!panel.hidden));
  if (panel.hidden) setForkPlaying(false);
  else {
    if (tunerState.midi !== null) S.forkMidi = tunerState.midi;
    renderFork();
  }
});
$('forkDown').addEventListener('click', () => {
  S.forkMidi = Math.max(24, S.forkMidi - 1);
  save();
  renderFork();
});
$('forkUp').addEventListener('click', () => {
  S.forkMidi = Math.min(108, S.forkMidi + 1);
  save();
  renderFork();
});
$('forkPlay').addEventListener('click', () => setForkPlaying(!tone.playing));

// ---------------------------------------------------------------- arkusz ustawień
const sheet = $('sheetBackdrop');
let sheetReturnFocus = null;
function openSettings() {
  renderSettings();
  sheetReturnFocus = document.activeElement;
  sheet.hidden = false;
  $('sheetDone').focus();
}
function closeSettings() {
  sheet.hidden = true;
  if (sheetReturnFocus) sheetReturnFocus.focus();
}
$('tunerSettingsBtn').addEventListener('click', openSettings);
$('sheetDone').addEventListener('click', closeSettings);
$('sheetDismiss').addEventListener('click', closeSettings);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !sheet.hidden) closeSettings();
});

function settingsChanged() {
  save();
  renderSettings();
  renderTunerLabels();
}

makeSegment(
  $('transSeg'),
  MAIN_TRANSPOSITIONS.map((id) => ({ value: id, label: id })),
  (id) => {
    S.transposition = id;
    settingsChanged();
  },
);
makeSegment(
  $('namingSeg'),
  Object.entries(NAMINGS).map(([k, d]) => ({ value: k, label: d.label })),
  (k) => {
    S.naming = k;
    settingsChanged();
  },
);
makeSegment(
  $('accSeg'),
  Object.entries(ACCIDENTALS).map(([k, label]) => ({ value: k, label, aria: { auto: 'Znaki automatycznie', sharp: 'Krzyżyki', flat: 'Bemole' }[k] })),
  (k) => {
    S.accidental = k;
    settingsChanged();
  },
);
makeSegment(
  $('respSeg'),
  Object.entries(RESPONSE).map(([k, d]) => ({ value: k, label: d.label })),
  (k) => {
    S.response = k;
    applyResponse();
    settingsChanged();
  },
);
$('transSel').addEventListener('change', (e) => {
  S.transposition = e.target.value;
  settingsChanged();
});

function renderSettings() {
  const opts = nameOpts();
  $('a4Value').textContent = `A4 = ${+S.a4.toFixed(1)} Hz`;
  $('transSeg').querySelectorAll('button').forEach((b) => (b.textContent = transpositionKey(getTransposition(b.dataset.value), opts)));
  setPressed($('transSeg'), (b) => b.dataset.value === S.transposition);
  const sel = $('transSel');
  sel.textContent = '';
  for (const t of TRANSPOSITIONS) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = `${transpositionKey(t, opts)} – ${t.desc}`;
    sel.appendChild(o);
  }
  sel.value = S.transposition;
  setPressed($('namingSeg'), (b) => b.dataset.value === S.naming);
  setPressed($('accSeg'), (b) => b.dataset.value === S.accidental);
  setPressed($('respSeg'), (b) => b.dataset.value === S.response);
  $('tolSlider').value = S.tolerance;
  $('tolVal').textContent = `±${S.tolerance} ¢`;
  $('sensSlider').value = S.sensitivity;
  $('showHz').checked = S.showHz;
}

function setA4(v) {
  S.a4 = Math.max(A4_MIN, Math.min(A4_MAX, v));
  settingsChanged();
}
$('a4Down').addEventListener('click', () => setA4(Math.ceil(S.a4) - 1));
$('a4Up').addEventListener('click', () => setA4(Math.floor(S.a4) + 1));
$('a4Reset').addEventListener('click', () => setA4(440));
$('tolSlider').addEventListener('input', (e) => {
  S.tolerance = +e.target.value;
  $('tolVal').textContent = `±${S.tolerance} ¢`;
  save();
  renderTolerance();
});
$('sensSlider').addEventListener('input', (e) => {
  S.sensitivity = +e.target.value;
  tuner.sensitivity = S.sensitivity / 100;
  save();
});
$('showHz').addEventListener('change', (e) => {
  S.showHz = e.target.checked;
  if (!S.showHz) $('hzText').textContent = '';
  save();
});

// ================================================================ METRONOM
metro.bpm = S.bpm;
metro.accents = S.accents.slice(0, S.beats);
metro.setBeats(S.beats);
metro.subdivision = S.subdivision;
metro.sound = S.sound;
metro.volume = S.volume / 100;
metro.trainer = { ...S.trainer, target: clampBpm(S.trainer.target) };
metro.timer = { ...S.timer };

fillTempoSelect($('tempoSel'));
fillTempoSelect($('miniTempoSel'));

function setBpm(v, fromEngine = false) {
  v = clampBpm(v);
  S.bpm = v;
  if (!fromEngine) metro.bpm = v;
  if (document.activeElement !== $('bpmValue')) $('bpmValue').value = v;
  $('bpmSlider').value = v;
  const name = tempoName(v);
  $('tempoSel').value = name;
  $('miniTempoSel').value = name;
  $('miniBpm').textContent = v;
  $('miniTempoName').textContent = name;
  save();
}
metro.onBpmChange = (v) => setBpm(v, true);

// przytrzymanie przycisku powtarza zmianę
function holdRepeat(btn, fn) {
  let t1 = null;
  let t2 = null;
  const stop = () => {
    clearTimeout(t1);
    clearInterval(t2);
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    fn();
    t1 = setTimeout(() => (t2 = setInterval(fn, 70)), 450);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
  btn.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fn()));
}
holdRepeat($('bpmDown'), () => setBpm(S.bpm - 1));
holdRepeat($('bpmUp'), () => setBpm(S.bpm + 1));
$('bpmDown5').addEventListener('click', () => setBpm(S.bpm - 5));
$('bpmUp5').addEventListener('click', () => setBpm(S.bpm + 5));
$('miniDown').addEventListener('click', () => setBpm(S.bpm - 5));
$('miniUp').addEventListener('click', () => setBpm(S.bpm + 5));
$('bpmSlider').addEventListener('input', (e) => setBpm(+e.target.value));
$('bpmValue').addEventListener('change', (e) => {
  setBpm(+e.target.value);
  e.target.value = S.bpm;
});
$('bpmValue').addEventListener('keydown', (e) => e.key === 'Enter' && e.target.blur());
for (const id of ['tempoSel', 'miniTempoSel']) {
  $(id).addEventListener('change', (e) => setBpm(tempoBpm(e.target.value)));
}

// tap tempo: średnia z ostatnich ≤5 uderzeń w oknie 2,5 s
let taps = [];
$('tapBtn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const now = performance.now();
  taps = taps.filter((t) => now - t < 2500).concat(now).slice(-5);
  if (taps.length >= 2) setBpm(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
});

// ---------------------------------------------------------------- akcenty i metrum
const ACCENT_NAME = { 0: 'wyciszone', 1: 'zwykłe', 2: 'akcent' };
let currentBeat = -1;
function renderBeats() {
  const box = $('beatTiles');
  box.textContent = '';
  metro.accents.forEach((lvl, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tile a${lvl}` + (i === currentBeat ? ' now' : '');
    b.setAttribute('aria-label', `Uderzenie ${i + 1}: ${ACCENT_NAME[lvl]}`);
    b.innerHTML = `<span class="bar"></span><span class="tile-num">${i + 1}</span>`;
    b.addEventListener('click', () => {
      metro.accents[i] = (metro.accents[i] + 2) % 3; // akcent → zwykłe → wyciszone
      S.accents = metro.accents.slice();
      save();
      renderBeats();
    });
    box.appendChild(b);
  });
  renderMiniBeats();
  renderSig();
}

function renderMiniBeats() {
  const box = $('miniBeats');
  if (box.children.length !== metro.beatsPerBar) {
    box.textContent = '';
    for (let i = 0; i < metro.beatsPerBar; i++) box.appendChild(document.createElement('span'));
  }
  [...box.children].forEach((s, i) => {
    s.className = metro.playing && i === currentBeat ? (i === 0 ? 'on first' : 'on') : '';
  });
}

const PRESET_BEATS = [2, 3, 4, 5, 6];
function setBeats(n) {
  const acc = [];
  for (let k = 0; k < n; k++) acc.push(metro.accents[k] !== undefined ? metro.accents[k] : ACCENT.BEAT);
  acc[0] = ACCENT.ACCENT;
  metro.setBeats(n);
  metro.accents = acc;
  currentBeat = -1;
  S.beats = n;
  S.accents = acc.slice();
  save();
  renderBeats();
}
$('sigSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setBeats(+b.dataset.beats)));
const other = $('beatsOther');
for (let n = 1; n <= 16; n++) {
  const o = document.createElement('option');
  o.value = n;
  o.textContent = `${n} ${n === 1 ? 'uderzenie' : n < 5 ? 'uderzenia' : 'uderzeń'}`;
  other.appendChild(o);
}
other.addEventListener('change', () => setBeats(+other.value));

function renderSig() {
  const n = metro.beatsPerBar;
  const preset = PRESET_BEATS.includes(n);
  setPressed($('sigSeg'), (b) => +b.dataset.beats === n);
  other.parentElement.classList.toggle('active', !preset);
  $('beatsOtherLabel').textContent = preset ? 'inne' : `${n}/4`;
  other.value = n;
}

function renderSubdiv() {
  setPressed($('subSeg'), (b) => b.dataset.sub === S.subdivision);
}
$('subSeg').querySelectorAll('button').forEach((b) =>
  b.addEventListener('click', () => {
    S.subdivision = metro.subdivision = b.dataset.sub;
    save();
    renderSubdiv();
  }),
);

// ---------------------------------------------------------------- brzmienie
const soundSel = $('soundSel');
for (const [k, label] of Object.entries(SOUNDS)) {
  const o = document.createElement('option');
  o.value = k;
  o.textContent = label;
  soundSel.appendChild(o);
}
soundSel.value = S.sound;
soundSel.addEventListener('change', () => {
  S.sound = metro.sound = soundSel.value;
  save();
  if (!metro.playing) metro.preview();
});
$('volSlider').value = S.volume;
$('volSlider').addEventListener('input', (e) => {
  S.volume = +e.target.value;
  metro.setVolume(S.volume / 100);
  save();
});

// ---------------------------------------------------------------- start / stop
let elapsedTimer = null;
function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function renderElapsed() {
  $('elapsedInfo').textContent = `${fmtTime(metro.elapsed())} · takt ${metro.playing ? metro.bar + 1 : 1}`;
}
let pendSide = 1;
function swingPendulum(on) {
  const arm = $('pendulum');
  if (on) {
    pendSide = -pendSide;
    arm.style.transitionDuration = `${Math.round(60000 / metro.bpm)}ms`;
    arm.style.transform = `rotate(${28 * pendSide}deg)`;
  } else {
    arm.style.transitionDuration = '300ms';
    arm.style.transform = 'rotate(0deg)';
  }
}
function renderPlayState() {
  const on = metro.playing;
  for (const id of ['playBtn', 'miniPlay']) {
    $(id).classList.toggle('is-playing', on);
    $(id).setAttribute('aria-label', on ? 'Zatrzymaj metronom' : 'Uruchom metronom');
  }
  $('playText').textContent = on ? 'Stop' : 'Start';
  clearInterval(elapsedTimer);
  if (on) elapsedTimer = setInterval(renderElapsed, 200);
  else {
    currentBeat = -1;
    swingPendulum(false);
    renderBeats();
  }
  renderElapsed();
  updateWakeLock();
}
function toggleMetro() {
  metro.toggle();
  renderPlayState();
}
metro.onStop = renderPlayState;
$('playBtn').addEventListener('click', toggleMetro);
$('miniPlay').addEventListener('click', toggleMetro);

let flashTimer = null;
metro.onTick = (beat, slot, level) => {
  if (slot !== 0) return;
  currentBeat = beat;
  [...$('beatTiles').children].forEach((t, i) => t.classList.toggle('now', i === beat));
  renderMiniBeats();
  swingPendulum(true);
  if (level === ACCENT.MUTE) return;
  if (S.flash) {
    const card = $('tempoCard');
    card.classList.remove('flash', 'flash-acc');
    card.classList.add(level === ACCENT.ACCENT ? 'flash-acc' : 'flash');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => card.classList.remove('flash', 'flash-acc'), 90);
  }
  if (S.vibrate && navigator.vibrate) navigator.vibrate(level === ACCENT.ACCENT ? 60 : 25);
};

// ---------------------------------------------------------------- opcje
function bindToggle(id, key, after) {
  const b = $(id);
  const render = () => b.setAttribute('aria-pressed', String(!!S[key]));
  render();
  b.addEventListener('click', () => {
    S[key] = !S[key];
    render();
    save();
    if (after) after();
  });
}
bindToggle('tglFlash', 'flash');
bindToggle('tglVibe', 'vibrate', () => S.vibrate && navigator.vibrate && navigator.vibrate(30));
bindToggle('tglAwake', 'keepAwake', updateWakeLock);

function bindPanelToggle(id, key, panelId) {
  const b = $(id);
  const render = () => {
    b.setAttribute('aria-pressed', String(S[key].enabled));
    $(panelId).hidden = !S[key].enabled;
  };
  render();
  b.addEventListener('click', () => {
    S[key] = { ...S[key], enabled: !S[key].enabled };
    metro[key] = { ...S[key] };
    render();
    save();
  });
}
bindPanelToggle('tglTrainer', 'trainer', 'trainerPanel');
bindPanelToggle('tglTimer', 'timer', 'timerPanel');

function bindNumber(id, obj, field, min, max) {
  const el = $(id);
  el.value = S[obj][field];
  el.addEventListener('change', () => {
    const v = Math.max(min, Math.min(max, Math.round(+el.value || min)));
    el.value = v;
    S[obj] = { ...S[obj], [field]: v };
    metro[obj] = { ...S[obj] };
    save();
  });
}
bindNumber('trEvery', 'trainer', 'everyBars', 1, 64);
bindNumber('trStep', 'trainer', 'step', 1, 50);
bindNumber('trTarget', 'trainer', 'target', BPM_MIN, BPM_MAX);
bindNumber('tmMinutes', 'timer', 'minutes', 1, 180);

// pigułka w nagłówku metronomu: bieżący dźwięk ze stroika
function renderPill() {
  $('tunerPillText').textContent =
    tunerState.live && tunerState.midi !== null ? `${noteLabel(tunerState.midi, nameOpts())} · ${fmtCents(tunerState.cents, ' ')}` : 'Stroik';
}
$('tunerPill').addEventListener('click', () => showTab('tuner'));

// klawiatura (np. tablet): spacja = start/stop metronomu
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && S.tab === 'metro' && sheet.hidden && !e.target.matches('input, select, button')) {
    e.preventDefault();
    toggleMetro();
  }
});

// ================================================================ start
buildGauge();
renderTunerLabels();
renderSettings();
setBpm(S.bpm);
renderBeats();
renderSubdiv();
renderPlayState();
drawHistory();
$('noteBand').classList.add('idle');
showTab(S.tab);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
