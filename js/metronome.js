// Metronom oparty o zegar Web Audio (planowanie z wyprzedzeniem – stabilny rytm niezależnie od UI).

export const SUBDIVISIONS = {
  1: { label: 'ćwierćnuty', pattern: [1] },
  2: { label: 'ósemki', pattern: [1, 1] },
  3: { label: 'triole', pattern: [1, 1, 1] },
  4: { label: 'szesnastki', pattern: [1, 1, 1, 1] },
  swing: { label: 'swing', pattern: [1, 0, 1] },
  5: { label: 'kwintole', pattern: [1, 1, 1, 1, 1] },
};

export const SOUNDS = {
  click: 'Klik',
  wood: 'Drewno',
  beep: 'Beep',
  drum: 'Perkusja',
  cowbell: 'Krowi dzwonek',
  tone: 'Ton',
};

// Poziom akcentu dla uderzenia: 2 = akcent, 1 = zwykłe, 0 = wyciszone
export const ACCENT = { MUTE: 0, BEAT: 1, ACCENT: 2 };

export class Metronome {
  constructor(getContext) {
    this.getContext = getContext;
    this.bpm = 84;
    this.beatsPerBar = 4;
    this.subdivision = '1';
    this.accents = [2, 1, 1, 1];
    this.sound = 'click';
    this.volume = 0.8;
    this.subVolume = 0.5;
    this.trainer = { enabled: false, step: 2, everyBars: 4, target: 140 };
    this.timer = { enabled: false, minutes: 5 };
    this.playing = false;
    this.onTick = null; // (beat, sub, accentLevel) – wywoływane w momencie dźwięku
    this.onBpmChange = null;
    this.onStop = null;
    this._timerId = null;
    this._noise = null;
  }

  setBeats(n) {
    n = Math.max(1, Math.min(16, n));
    const acc = this.accents.slice(0, n);
    while (acc.length < n) acc.push(ACCENT.BEAT);
    this.beatsPerBar = n;
    this.accents = acc;
  }

  start() {
    if (this.playing) return;
    const ctx = this._ensureOut();
    this.playing = true;
    this.beat = 0;
    this.slot = 0;
    this.bar = 0;
    this.startTime = ctx.currentTime + 0.08;
    this.nextTime = this.startTime;
    this._schedule();
    this._timerId = setInterval(() => this._schedule(), 25);
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this._timerId);
    this._timerId = null;
    if (this.onStop) this.onStop();
  }

  toggle() {
    this.playing ? this.stop() : this.start();
  }

  // Pojedyncze uderzenie do odsłuchu brzmienia (gdy metronom stoi).
  preview(kind = 'accent') {
    this._ensureOut();
    this._play(this.ctx.currentTime + 0.02, kind, 1);
  }

  _ensureOut() {
    const ctx = this.getContext();
    this.ctx = ctx;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.connect(ctx.destination);
    }
    this.out.gain.value = this.volume;
    return ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.out) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  elapsed() {
    return this.playing ? Math.max(0, this.ctx.currentTime - this.startTime) : 0;
  }

  _pattern() {
    return (SUBDIVISIONS[this.subdivision] || SUBDIVISIONS[1]).pattern;
  }

  _schedule() {
    const ctx = this.ctx;
    const ahead = ctx.currentTime + 0.12;
    while (this.playing && this.nextTime < ahead) {
      const pattern = this._pattern();
      if (this.slot >= pattern.length) this.slot = 0;
      const t = this.nextTime;
      const level = this.slot === 0 ? this.accents[this.beat] ?? ACCENT.BEAT : pattern[this.slot] ? 'sub' : null;

      if (level === 'sub') this._play(t, 'sub', this.subVolume);
      else if (level === ACCENT.ACCENT) this._play(t, 'accent', 1);
      else if (level === ACCENT.BEAT) this._play(t, 'beat', 0.85);

      if (this.onTick && level !== null) {
        const beat = this.beat;
        const slot = this.slot;
        const delay = Math.max(0, (t - ctx.currentTime) * 1000);
        setTimeout(() => this.playing && this.onTick(beat, slot, level), delay);
      }

      // przejście do następnego slotu
      this.nextTime += 60 / this.bpm / pattern.length;
      this.slot++;
      if (this.slot >= pattern.length) {
        this.slot = 0;
        this.beat++;
        if (this.beat >= this.beatsPerBar) {
          this.beat = 0;
          this.bar++;
          this._onBar();
        }
      }

      if (this.timer.enabled && this.nextTime - this.startTime >= this.timer.minutes * 60) {
        const delay = Math.max(0, (this.nextTime - ctx.currentTime) * 1000);
        clearInterval(this._timerId);
        this._timerId = null;
        setTimeout(() => this.stop(), delay);
        break;
      }
    }
  }

  _onBar() {
    const tr = this.trainer;
    if (!tr.enabled || this.bar % Math.max(1, tr.everyBars) !== 0) return;
    const dir = tr.target >= this.bpm ? 1 : -1;
    const next = this.bpm + dir * Math.abs(tr.step);
    const clamped = dir > 0 ? Math.min(next, tr.target) : Math.max(next, tr.target);
    if (clamped !== this.bpm) {
      this.bpm = clamped;
      if (this.onBpmChange) this.onBpmChange(this.bpm);
    }
  }

  _noiseBuffer() {
    if (!this._noise) {
      const ctx = this.ctx;
      const b = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this._noise = b;
    }
    return this._noise;
  }

  _env(t, peak, decay, attack = 0.001) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.out);
    return g;
  }

  _osc(t, type, freq, peak, decay, dest) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = dest || this._env(t, peak, decay);
    o.connect(g);
    o.start(t);
    o.stop(t + decay + 0.05);
    return o;
  }

  _noiseHit(t, filterType, freq, q, peak, decay) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f);
    f.connect(this._env(t, peak, decay));
    src.start(t);
    src.stop(t + decay + 0.05);
  }

  // kind: 'accent' | 'beat' | 'sub'
  _play(t, kind, gain) {
    const s = this.sound;
    const pick = (a, b, c) => (kind === 'accent' ? a : kind === 'beat' ? b : c);
    switch (s) {
      case 'wood': {
        const f = pick(1250, 880, 660);
        this._osc(t, 'sine', f, gain, 0.05);
        this._osc(t, 'triangle', f * 2.4, gain * 0.25, 0.02);
        this._noiseHit(t, 'bandpass', f * 1.5, 6, gain * 0.5, 0.015);
        break;
      }
      case 'beep':
        this._osc(t, 'square', pick(1320, 880, 660), gain * 0.35, pick(0.09, 0.07, 0.05));
        break;
      case 'drum':
        if (kind === 'accent') {
          const ctx = this.ctx;
          const o = ctx.createOscillator();
          o.frequency.setValueAtTime(150, t);
          o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
          o.connect(this._env(t, gain * 1.2, 0.25));
          o.start(t);
          o.stop(t + 0.3);
          this._noiseHit(t, 'highpass', 6000, 0.7, gain * 0.25, 0.04);
        } else if (kind === 'beat') {
          this._noiseHit(t, 'bandpass', 1800, 0.8, gain * 0.9, 0.12);
          this._osc(t, 'triangle', 190, gain * 0.5, 0.08);
        } else {
          this._noiseHit(t, 'highpass', 7000, 0.7, gain * 0.5, 0.035);
        }
        break;
      case 'cowbell': {
        const ctx = this.ctx;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = pick(2640, 1700, 1300);
        bp.Q.value = 3;
        const env = this._env(t, gain * 0.6, pick(0.35, 0.25, 0.12));
        bp.connect(env);
        const base = pick(800, 560, 420);
        this._osc(t, 'square', base, 0, 0.4, bp);
        this._osc(t, 'square', base * 1.48, 0, 0.4, bp);
        break;
      }
      case 'tone':
        // krótki ton z opadającym glissandem – dobrze słyszalny przy grze
        {
          const ctx = this.ctx;
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          const f = pick(988, 740, 554);
          o.frequency.setValueAtTime(f * 1.15, t);
          o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 2500;
          o.connect(lp);
          lp.connect(this._env(t, gain * 0.35, 0.12, 0.005));
          o.start(t);
          o.stop(t + 0.2);
        }
        break;
      default:
        this._osc(t, 'sine', pick(1600, 1050, 750), gain, pick(0.06, 0.045, 0.03));
        this._osc(t, 'square', pick(3200, 2100, 1500), gain * 0.08, 0.01);
    }
  }
}
