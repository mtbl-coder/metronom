import {
  NAMINGS,
  TRANSPOSITIONS,
  getTransposition,
  analyzeFrequency,
  noteName,
  noteLabel,
  midiToFreq,
  transpositionLabel,
  transpositionKey,
  tempoName,
} from './notes.js';
import { Tuner, ToneGenerator } from './tuner.js';
import { Metronome, SOUNDS, ACCENT } from './metronome.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- ustawienia
const DEFAULTS = {
  tab: 'tuner',
  naming: 'en',
  accidental: 'flat',
  transposition: 'C',
  a4: 440,
  tolerance: 5,
  sensitivity: 50,
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

const STORE_KEY = 'stroik-metronom.v1';
let S = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  S = { ...DEFAULTS, ...saved };
} catch {
  /* brak dostępu do pamięci – używamy domyślnych */
}
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

// ---------------------------------------------------------------- audio
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

// ---------------------------------------------------------------- zakładki
function showTab(tab) {
  S.tab = tab;
  save();
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === tab));
  if (tab === 'tuner') resizeHistory();
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ================================================================ STROIK
const GAUGE = { cx: 160, cy: 172, r: 140, maxAngle: 62 };
const svgNS = 'http://www.w3.org/2000/svg';
const angleFor = (c) => (Math.max(-50, Math.min(50, c)) / 50) * GAUGE.maxAngle;
function polar(r, deg) {
  const a = (deg * Math.PI) / 180;
  return [GAUGE.cx + r * Math.sin(a), GAUGE.cy - r * Math.cos(a)];
}

function buildGauge() {
  const ticks = $('gaugeTicks');
  const zone = $('gaugeZone');
  ticks.textContent = '';
  zone.textContent = '';
  const tol = S.tolerance;

  const [x1, y1] = polar(GAUGE.r + 4, -angleFor(tol));
  const [x2, y2] = polar(GAUGE.r + 4, angleFor(tol));
  const wedge = document.createElementNS(svgNS, 'path');
  wedge.setAttribute('d', `M${GAUGE.cx} ${GAUGE.cy} L${x1} ${y1} A${GAUGE.r + 4} ${GAUGE.r + 4} 0 0 1 ${x2} ${y2} Z`);
  wedge.setAttribute('class', 'zone-fill');
  zone.appendChild(wedge);

  for (let c = -50; c <= 50; c += 1) {
    const major = c % 10 === 0;
    const mid = c % 5 === 0;
    if (!major && !mid && c % 2 !== 0) continue;
    const a = angleFor(c);
    const len = major ? 22 : mid ? 14 : 9;
    const [ax, ay] = polar(GAUGE.r, a);
    const [bx, by] = polar(GAUGE.r - len, a);
    const l = document.createElementNS(svgNS, 'line');
    l.setAttribute('x1', ax);
    l.setAttribute('y1', ay);
    l.setAttribute('x2', bx);
    l.setAttribute('y2', by);
    l.setAttribute('stroke-width', major ? 3 : 1.4);
    l.setAttribute('class', 'tick' + (Math.abs(c) <= tol ? ' zone' : ''));
    ticks.appendChild(l);
    if (major) {
      const [tx, ty] = polar(GAUGE.r + 13, a);
      const t = document.createElementNS(svgNS, 'text');
      t.setAttribute('x', tx);
      t.setAttribute('y', ty + 4);
      t.setAttribute('transform', `rotate(${a} ${tx} ${ty})`);
      t.setAttribute('class', 'lbl' + (Math.abs(c) <= tol ? ' zone' : ''));
      t.textContent = c;
      ticks.appendChild(t);
    }
  }
}

const noteHTML = (midi, withOctave = true) => {
  const n = noteName(midi, nameOpts());
  return withOctave ? `${n.name}<sub>${n.octave}</sub>` : n.name;
};

const tunerState = { midi: null, cents: 0, lastSeen: 0, history: [] };
const HISTORY_LEN = 160;

function fmtCents(c) {
  const v = Math.round(c);
  return (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v) + '¢';
}
function fmtHz(f) {
  return f.toFixed(f < 100 ? 2 : 1);
}

function renderTunerLabels() {
  const t = getTransposition(S.transposition);
  $('a4Label').textContent = `A4 = ${+S.a4.toFixed(1)} Hz`;
  $('a4Label').classList.toggle('warn', S.a4 !== 440);
  $('transpLabel').textContent = t.semis ? transpositionLabel(t, nameOpts()) : '';
  $('instLabel').textContent = `${transpositionKey(t, nameOpts())} instr.`;
  $('notePanel').classList.toggle('single', t.semis === 0);
  if (tunerState.midi !== null) renderNote(tunerState.midi);
  renderFork();
}

function renderNote(midi) {
  const t = getTransposition(S.transposition);
  $('concertNote').innerHTML = noteHTML(midi);
  $('instNote').innerHTML = noteHTML(midi + t.semis);
  const target = midiToFreq(midi, S.a4);
  $('targetLabel').textContent = `${noteLabel(midi, nameOpts())}: ${fmtHz(target)} Hz`;
  $('lowName').textContent = noteLabel(midi - 1, nameOpts());
  $('highName').textContent = noteLabel(midi + 1, nameOpts());
}

function onTunerResult(r) {
  const now = performance.now();
  const panel = $('notePanel');
  const wrap = $('gauge').parentElement;

  if (r.freq > 0) {
    const a = analyzeFrequency(r.freq, S.a4);
    if (a.midi !== tunerState.midi) {
      tunerState.midi = a.midi;
      tunerState.cents = a.cents;
      renderNote(a.midi);
    } else {
      tunerState.cents += (a.cents - tunerState.cents) * 0.45; // wygładzanie wskazówki
    }
    tunerState.lastSeen = now;
    const c = tunerState.cents;
    const abs = Math.abs(c);
    const ok = abs <= S.tolerance;

    $('needle').style.transform = `rotate(${angleFor(c)}deg)`;
    $('needle').classList.remove('idle');
    $('centsBox').textContent = fmtCents(c);
    $('freqNow').textContent = `${fmtHz(r.freq)} Hz`;
    const diff = r.freq - midiToFreq(a.midi, S.a4);
    $('freqDiff').textContent = `${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(2)} Hz do nominału`;
    panel.classList.toggle('ok', ok);
    panel.classList.toggle('near', !ok && abs <= S.tolerance * 3);
    wrap.classList.toggle('in-tune', ok);
    $('statusText').textContent = '';
    pushHistory(c);
  } else {
    pushHistory(null);
    $('statusText').textContent = r.rms >= tuner.minRms && !r.pending ? 'SZUM' : '';
    if (now - tunerState.lastSeen > 1200) {
      $('needle').classList.add('idle');
      panel.classList.remove('ok', 'near');
      wrap.classList.remove('in-tune');
      $('centsBox').textContent = '—';
      $('freqNow').textContent = '— Hz';
      $('freqDiff').textContent = '';
    }
  }
  drawHistory();
}

function pushHistory(c) {
  const h = tunerState.history;
  h.push(c);
  if (h.length > HISTORY_LEN) h.shift();
}

const hist = $('history');
const hctx = hist.getContext('2d');
function resizeHistory() {
  const dpr = window.devicePixelRatio || 1;
  const w = hist.clientWidth;
  const h = hist.clientHeight;
  if (!w || !h) return;
  hist.width = Math.round(w * dpr);
  hist.height = Math.round(h * dpr);
  hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawHistory();
}
window.addEventListener('resize', resizeHistory);

function drawHistory() {
  const w = hist.clientWidth;
  const h = hist.clientHeight;
  if (!w || !h) return;
  const padL = 28;
  const y = (c) => h / 2 - (Math.max(-50, Math.min(50, c)) / 50) * (h / 2 - 6);
  hctx.clearRect(0, 0, w, h);

  // pas tolerancji
  hctx.fillStyle = 'rgba(110,150,220,0.25)';
  hctx.fillRect(padL, y(S.tolerance), w - padL, y(-S.tolerance) - y(S.tolerance));

  // siatka
  hctx.strokeStyle = 'rgba(110,150,220,0.25)';
  hctx.lineWidth = 1;
  hctx.font = '10px system-ui, sans-serif';
  hctx.textAlign = 'right';
  hctx.textBaseline = 'middle';
  for (let c = -40; c <= 40; c += 10) {
    hctx.beginPath();
    hctx.moveTo(padL, y(c));
    hctx.lineTo(w, y(c));
    hctx.stroke();
    hctx.fillStyle = Math.abs(c) <= S.tolerance ? '#8ee000' : '#6f9fe0';
    hctx.fillText(String(c), padL - 4, y(c));
  }
  const step = (w - padL) / HISTORY_LEN;
  for (let x = w; x > padL; x -= step * 10) {
    hctx.beginPath();
    hctx.moveTo(x, 0);
    hctx.lineTo(x, h);
    hctx.stroke();
  }

  // przebieg
  const data = tunerState.history;
  const off = HISTORY_LEN - data.length;
  hctx.lineWidth = 2.5;
  hctx.lineJoin = 'round';
  let prev = null;
  data.forEach((c, i) => {
    const x = padL + (off + i) * step;
    if (c === null) {
      prev = null;
      return;
    }
    if (prev) {
      hctx.strokeStyle = Math.abs(c) <= S.tolerance ? '#8ee000' : Math.abs(c) <= S.tolerance * 3 ? '#ffd23f' : '#ff5a5a';
      hctx.beginPath();
      hctx.moveTo(prev[0], prev[1]);
      hctx.lineTo(x, y(c));
      hctx.stroke();
    }
    prev = [x, y(c)];
  });
}

tuner.onResult = onTunerResult;
tuner.sensitivity = S.sensitivity / 100;
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
      e && e.name === 'NotAllowedError' ? 'Brak zgody na mikrofon – dotknij, aby spróbować' : 'Nie udało się włączyć mikrofonu';
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

// ---------------------------------------------------------------- kamerton
function renderFork() {
  const t = getTransposition(S.transposition);
  const f = midiToFreq(S.forkMidi, S.a4);
  $('forkNote').innerHTML = t.semis
    ? `${noteHTML(S.forkMidi)} <span class="arrow">»</span> ${noteHTML(S.forkMidi + t.semis)}`
    : noteHTML(S.forkMidi);
  $('forkInfo').textContent = `${fmtHz(f)} Hz`;
  if (tone.playing) tone.play(f);
}
$('forkBtn').addEventListener('click', () => {
  const panel = $('forkPanel');
  panel.hidden = !panel.hidden;
  $('forkBtn').classList.toggle('on', !panel.hidden);
  if (panel.hidden) {
    tone.stop();
    $('forkPlay').classList.remove('on');
    $('forkPlay').textContent = 'Graj';
  } else {
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
$('forkPlay').addEventListener('click', () => {
  if (tone.playing) tone.stop();
  else tone.play(midiToFreq(S.forkMidi, S.a4));
  $('forkPlay').classList.toggle('on', tone.playing);
  $('forkPlay').textContent = tone.playing ? 'Stop' : 'Graj';
});

// ---------------------------------------------------------------- okno ustawień
const dlg = $('tunerSettings');
function fillSettings() {
  const nr = $('namingRadios');
  nr.textContent = '';
  for (const [key, def] of Object.entries(NAMINGS)) {
    const l = document.createElement('label');
    l.className = 'radio';
    l.innerHTML = `<input type="radio" name="naming" value="${key}"><span>${def.label}</span>`;
    l.querySelector('input').checked = S.naming === key;
    nr.appendChild(l);
  }
  dlg.querySelectorAll('input[name=accidental]').forEach((i) => (i.checked = i.value === S.accidental));
  const sel = $('transpSel');
  sel.textContent = '';
  for (const t of TRANSPOSITIONS) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = `Transpozycja: ${transpositionLabel(t, nameOpts())}`;
    sel.appendChild(o);
  }
  sel.value = S.transposition;
  $('transpDesc').textContent = getTransposition(S.transposition).desc;
  $('a4Input').value = S.a4;
  $('tolSlider').value = S.tolerance;
  $('tolVal').textContent = S.tolerance;
  $('sensSlider').value = S.sensitivity;
}
function openSettings() {
  fillSettings();
  dlg.showModal();
}
$('tunerSettingsBtn').addEventListener('click', openSettings);
$('a4Label').addEventListener('click', openSettings);
dlg.addEventListener('click', (e) => {
  if (e.target === dlg) dlg.close(); // klik w tło zamyka
});

dlg.addEventListener('change', (e) => {
  const el = e.target;
  if (el.name === 'naming') S.naming = el.value;
  else if (el.name === 'accidental') S.accidental = el.value;
  else if (el.id === 'transpSel') S.transposition = el.value;
  else if (el.id === 'a4Input') setA4(parseFloat(el.value));
  else return;
  save();
  if (el.name === 'naming' || el.name === 'accidental') {
    const v = $('transpSel').value;
    fillSettings();
    $('transpSel').value = v;
  }
  $('transpDesc').textContent = getTransposition(S.transposition).desc;
  renderTunerLabels();
});

function setA4(v) {
  if (!Number.isFinite(v)) v = 440;
  S.a4 = Math.round(Math.max(400, Math.min(480, v)) * 2) / 2;
  $('a4Input').value = S.a4;
  save();
  renderTunerLabels();
}
$('a4Down').addEventListener('click', () => setA4(Math.ceil(S.a4) - 1));
$('a4Up').addEventListener('click', () => setA4(Math.floor(S.a4) + 1));
$('a4Reset').addEventListener('click', () => setA4(440));
$('tolSlider').addEventListener('input', (e) => {
  S.tolerance = +e.target.value;
  $('tolVal').textContent = S.tolerance;
  save();
  buildGauge();
  drawHistory();
});
$('sensSlider').addEventListener('input', (e) => {
  S.sensitivity = +e.target.value;
  tuner.sensitivity = S.sensitivity / 100;
  save();
});

// ================================================================ METRONOM
metro.bpm = S.bpm;
metro.beatsPerBar = S.beats;
metro.accents = S.accents.slice(0, S.beats);
metro.setBeats(S.beats);
metro.subdivision = S.subdivision;
metro.sound = S.sound;
metro.volume = S.volume / 100;
metro.trainer = { ...S.trainer };
metro.timer = { ...S.timer };

function setBpm(v, fromEngine = false) {
  v = Math.round(Math.max(20, Math.min(300, v || 0)));
  S.bpm = v;
  if (!fromEngine) metro.bpm = v;
  if (document.activeElement !== $('bpmValue')) $('bpmValue').value = v;
  $('bpmSlider').value = v;
  $('tempoName').textContent = tempoName(v);
  $('miniBpmVal').textContent = v;
  save();
}
metro.onBpmChange = (v) => setBpm(v, true);

// przytrzymanie +/- przyspiesza zmianę
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
}
holdRepeat($('bpmDown'), () => setBpm(S.bpm - 1));
holdRepeat($('bpmUp'), () => setBpm(S.bpm + 1));
$('bpmSlider').addEventListener('input', (e) => setBpm(+e.target.value));
$('bpmValue').addEventListener('change', (e) => {
  setBpm(+e.target.value);
  e.target.value = S.bpm;
});
$('bpmValue').addEventListener('keydown', (e) => e.key === 'Enter' && e.target.blur());

let taps = [];
$('tapBtn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
  taps.push(now);
  if (taps.length > 6) taps.shift();
  if (taps.length >= 2) {
    const intervals = taps.slice(1).map((t, i) => t - taps[i]);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    setBpm(60000 / avg);
  }
});

function renderBeats() {
  $('beatsVal').textContent = metro.beatsPerBar;
  const box = $('beatDots');
  box.textContent = '';
  metro.accents.forEach((lvl, i) => {
    const b = document.createElement('button');
    b.className = `dot l${lvl}`;
    b.setAttribute('aria-label', `Uderzenie ${i + 1}`);
    b.addEventListener('click', () => {
      const order = [ACCENT.ACCENT, ACCENT.BEAT, ACCENT.MUTE];
      metro.accents[i] = order[(order.indexOf(metro.accents[i]) + 1) % order.length];
      S.accents = metro.accents.slice();
      save();
      renderBeats();
    });
    box.appendChild(b);
  });
}
function setBeats(n) {
  metro.setBeats(n);
  S.beats = metro.beatsPerBar;
  S.accents = metro.accents.slice();
  save();
  renderBeats();
}
$('beatsDown').addEventListener('click', () => setBeats(metro.beatsPerBar - 1));
$('beatsUp').addEventListener('click', () => setBeats(metro.beatsPerBar + 1));

function renderSubdiv() {
  $('subdivSeg')
    .querySelectorAll('button')
    .forEach((b) => {
      b.classList.toggle('active', b.dataset.sub === S.subdivision);
      b.setAttribute('aria-checked', b.dataset.sub === S.subdivision);
    });
}
$('subdivSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  S.subdivision = metro.subdivision = b.dataset.sub;
  save();
  renderSubdiv();
});

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

// start / stop
let elapsedTimer = null;
function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function renderPlayState() {
  const on = metro.playing;
  $('playArea').classList.toggle('is-playing', on);
  $('miniPlay').classList.toggle('is-playing', on);
  clearInterval(elapsedTimer);
  if (on) {
    elapsedTimer = setInterval(() => {
      $('elapsed').textContent = fmtTime(metro.elapsed());
      $('barCount').textContent = `takt ${metro.bar + 1}`;
    }, 200);
  } else {
    $('bigBeat').textContent = '';
    document.querySelectorAll('.dot.now').forEach((d) => d.classList.remove('now'));
  }
  updateWakeLock();
}
function toggleMetro() {
  metro.toggle();
  renderPlayState();
}
metro.onStop = renderPlayState;
$('playArea').addEventListener('click', toggleMetro);
$('miniPlay').addEventListener('click', toggleMetro);
$('miniBpm').addEventListener('click', () => showTab('metro'));

let flashTimer = null;
metro.onTick = (beat, slot, level) => {
  if (slot !== 0) return;
  const dots = $('beatDots').children;
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('now', i === beat);
  $('bigBeat').textContent = beat + 1;
  if (level === ACCENT.MUTE) return;
  if (S.flash) {
    const pa = $('playArea');
    pa.classList.remove('flash', 'flash-acc');
    pa.classList.add(level === ACCENT.ACCENT ? 'flash-acc' : 'flash');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => pa.classList.remove('flash', 'flash-acc'), 90);
  }
  if (S.vibrate && navigator.vibrate) navigator.vibrate(level === ACCENT.ACCENT ? 60 : 25);
};

// przełączniki
function bindToggle(id, key, after) {
  const b = $(id);
  const render = () => b.setAttribute('aria-pressed', !!S[key]);
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

function bindPanelToggle(id, key, panelId, engineKey) {
  const b = $(id);
  const render = () => {
    b.setAttribute('aria-pressed', S[key].enabled);
    $(panelId).hidden = !S[key].enabled;
  };
  render();
  b.addEventListener('click', () => {
    S[key] = { ...S[key], enabled: !S[key].enabled };
    metro[engineKey] = { ...S[key] };
    render();
    save();
  });
}
bindPanelToggle('tglTrainer', 'trainer', 'trainerPanel', 'trainer');
bindPanelToggle('tglTimer', 'timer', 'timerPanel', 'timer');

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
bindNumber('trTarget', 'trainer', 'target', 20, 300);
bindNumber('tmMinutes', 'timer', 'minutes', 1, 180);

// klawiatura (np. na tablecie): spacja = start/stop
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && S.tab === 'metro' && !e.target.matches('input, select')) {
    e.preventDefault();
    toggleMetro();
  }
});

// ================================================================ start
buildGauge();
renderTunerLabels();
setBpm(S.bpm);
renderBeats();
renderSubdiv();
renderPlayState();
showTab(S.tab);
requestAnimationFrame(resizeHistory);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
