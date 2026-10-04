// Detekcja wysokości dźwięku metodą McLeoda (MPM, znormalizowana funkcja różnicowa kwadratów).
// Działa dobrze dla instrumentów dętych i głosu – odporna na silne alikwoty.

const TARGET_RATE = 20000; // przed analizą sygnał jest decymowany do ~20–24 kHz
const LOW_FREQ = 160; // poniżej – analiza w dłuższym oknie

export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

// Decymacja z prostym filtrem dolnoprzepustowym (średnia krocząca) i usunięciem składowej stałej.
function prepare(buf, sampleRate, maxLen, factor) {
  const len = Math.min(Math.floor(buf.length / factor), maxLen);
  const start = buf.length - len * factor; // najświeższe próbki
  const out = new Float32Array(len);
  let mean = 0;
  for (let i = 0; i < len; i++) {
    let s = 0;
    const o = start + i * factor;
    for (let k = 0; k < factor; k++) s += buf[o + k];
    out[i] = s / factor;
    mean += out[i];
  }
  mean /= len;
  for (let i = 0; i < len; i++) out[i] -= mean;
  return { data: out, rate: sampleRate / factor };
}

/**
 * @param {Float32Array} buf próbki w dziedzinie czasu
 * @param {number} sampleRate
 * @returns {{freq:number, clarity:number, rms:number}} freq = 0 gdy brak wyraźnego tonu
 */
export function detectPitch(buf, sampleRate, opts = {}) {
  const { minFreq = 27, maxFreq = 4500, minRms = 0.01, minClarity = 0.8, keyThreshold = 0.9 } = opts;

  const level = rms(buf);
  if (level < minRms) return { freq: 0, clarity: 0, rms: level };

  const factor = Math.max(1, Math.floor(sampleRate / TARGET_RATE));
  // Najpierw krótkie okno (~45 ms) – szybka reakcja. Długie okno (~90 ms) tylko dla niskich dźwięków,
  // których okres nie mieści się wiarygodnie w krótkim oknie.
  let r = mpm(buf, sampleRate, { minFreq, maxFreq, keyThreshold, factor, maxLen: 1024 });
  if (!r || r.freq < LOW_FREQ) {
    r = mpm(buf, sampleRate, { minFreq, maxFreq, keyThreshold, factor, maxLen: 2048 });
  }
  // Wysokie dźwięki: dokładniejszy pomiar na pełnej częstotliwości próbkowania (mały koszt, bo τ jest krótkie).
  if (r && factor > 1 && r.freq > 800) {
    const fine = mpm(buf, sampleRate, { minFreq: r.freq / 1.6, maxFreq, keyThreshold, factor: 1, maxLen: 1024 });
    if (fine && Math.abs(1200 * Math.log2(fine.freq / r.freq)) < 50) r = fine;
  }
  if (!r || r.clarity < minClarity) return { freq: 0, clarity: r ? r.clarity : 0, rms: level };
  return { freq: r.freq, clarity: r.clarity, rms: level };
}

function mpm(buf, sampleRate, { minFreq, maxFreq, keyThreshold, factor, maxLen }) {
  const { data: x, rate } = prepare(buf, sampleRate, maxLen, factor);
  const n = x.length;
  const maxTau = Math.min(Math.floor(rate / minFreq) + 2, n >> 1);
  const minTau = Math.max(1, Math.floor(rate / maxFreq));

  // NSDF: n'(τ) = 2·Σ x_j·x_{j+τ} / Σ (x_j² + x_{j+τ}²)
  const nsdf = new Float32Array(maxTau);
  let m = 0;
  for (let j = 0; j < n; j++) m += 2 * x[j] * x[j];
  for (let tau = 0; tau < maxTau; tau++) {
    if (tau > 0) m -= x[tau - 1] * x[tau - 1] + x[n - tau] * x[n - tau];
    let acf = 0;
    for (let j = 0, lim = n - tau; j < lim; j++) acf += x[j] * x[j + tau];
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
  }

  // Wyszukanie maksimów w dodatnich obszarach między przejściami przez zero.
  const peaks = [];
  let pos = 0;
  while (pos < maxTau && nsdf[pos] > 0) pos++;
  while (pos < maxTau && nsdf[pos] <= 0) pos++;
  while (pos < maxTau) {
    let best = -1;
    let bestVal = -Infinity;
    while (pos < maxTau && nsdf[pos] > 0) {
      if (nsdf[pos] > bestVal) {
        bestVal = nsdf[pos];
        best = pos;
      }
      pos++;
    }
    if (best > 0 && best < maxTau - 1 && best >= minTau) peaks.push(best);
    while (pos < maxTau && nsdf[pos] <= 0) pos++;
  }
  if (!peaks.length) return null;

  let nmax = 0;
  for (const p of peaks) nmax = Math.max(nmax, nsdf[p]);
  const limit = keyThreshold * nmax;
  const chosen = peaks.find((p) => nsdf[p] >= limit);

  // Interpolacja paraboliczna dla dokładności poniżej jednej próbki.
  const a = nsdf[chosen - 1];
  const b = nsdf[chosen];
  const c = nsdf[chosen + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (a - c) / (2 * denom) : 0;
  const tau = chosen + shift;
  const clarity = Math.min(1, b - ((a - c) * shift) / 4);
  return { freq: rate / tau, clarity };
}
