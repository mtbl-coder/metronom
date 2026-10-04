// Odczyt mikrofonu i ciągła analiza wysokości dźwięku.
import { detectPitch } from './pitch.js';

// Tryby reakcji: odstęp analiz (ms), długość mediany, liczba odczytów przed pokazaniem dźwięku.
export const RESPONSE = {
  fast: { label: 'Szybka', interval: 15, median: 1, confirm: 1, smoothing: 0.75, transition: 0.03 },
  normal: { label: 'Normalna', interval: 20, median: 3, confirm: 2, smoothing: 0.5, transition: 0.06 },
  calm: { label: 'Spokojna', interval: 40, median: 5, confirm: 3, smoothing: 0.25, transition: 0.12 },
};

export class Tuner {
  constructor(getContext) {
    this.getContext = getContext;
    this.running = false;
    this.onResult = null; // ({freq, clarity, rms}) – freq = 0 gdy brak tonu
    this.sensitivity = 0.5; // 0..1 – wyższa = reaguje na cichsze dźwięki
    this._history = [];
    this.setResponse('normal');
  }

  setResponse(mode) {
    this.response = RESPONSE[mode] || RESPONSE.normal;
  }

  get minRms() {
    // 0 → 0.05 (głośno), 1 → 0.002 (bardzo czule)
    return 0.05 * Math.pow(0.04, this.sensitivity);
  }

  async start() {
    if (this.running) return;
    const ctx = this.getContext();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.source.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.ctx = ctx;
    this.running = true;
    this._history = [];
    this._loop();
  }

  stop() {
    this.running = false;
    clearTimeout(this._timer);
    if (this.source) this.source.disconnect();
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source = null;
  }

  _loop() {
    if (!this.running) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    const r = detectPitch(this.buf, this.ctx.sampleRate, { minRms: this.minRms });
    this._emit(this._stabilize(r));
    this._timer = setTimeout(() => this._loop(), this.response.interval);
  }

  // Mediana z ostatnich odczytów odrzuca pojedyncze skoki (np. błędy oktawy na ataku dźwięku).
  _stabilize(r) {
    const h = this._history;
    if (!r.freq) {
      h.length = 0;
      return r;
    }
    if (h.length && Math.abs(1200 * Math.log2(r.freq / h[h.length - 1])) > 80) h.length = 0;
    h.push(r.freq);
    const { median, confirm } = this.response;
    while (h.length > Math.max(median, confirm)) h.shift();
    if (h.length < confirm) return { ...r, freq: 0, pending: true };
    if (median <= 1) return r;
    const recent = h.slice(-median);
    const sorted = recent.sort((a, b) => a - b);
    return { ...r, freq: sorted[Math.floor(sorted.length / 2)] };
  }

  _emit(r) {
    if (this.onResult) this.onResult(r);
  }
}

// Generator tonu wzorcowego („kamerton”).
export class ToneGenerator {
  constructor(getContext) {
    this.getContext = getContext;
    this.playing = false;
    this.volume = 0.35;
  }

  play(freq) {
    const ctx = this.getContext();
    if (this.playing) {
      this.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.01);
      return;
    }
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.gain.gain.exponentialRampToValueAtTime(this.volume, ctx.currentTime + 0.05);
    this.gain.connect(ctx.destination);
    this.osc = ctx.createOscillator();
    // Barwa z delikatnymi alikwotami – lepiej słyszalna na głośniku telefonu niż czysty sinus.
    const real = new Float32Array([0, 1, 0.35, 0.15, 0.06]);
    const imag = new Float32Array(real.length);
    this.osc.setPeriodicWave(ctx.createPeriodicWave(real, imag));
    this.osc.frequency.value = freq;
    this.osc.connect(this.gain);
    this.osc.start();
    this.playing = true;
  }

  stop() {
    if (!this.playing) return;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(this.gain.gain.value, t);
    this.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    this.osc.stop(t + 0.08);
    this.playing = false;
  }
}
