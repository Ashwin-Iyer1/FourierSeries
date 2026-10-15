/** Real-input DFT, with C[k] = (1/N) sum x[j] exp(-i 2 pi k j/N). */
export const TAU = 2 * Math.PI;
export const SAMPLE_COUNT = 256;

export function validateSamples(values) {
  if (!Array.isArray(values) && !ArrayBuffer.isView(values)) throw new TypeError("Provide a list of samples.");
  if (values.length < 4 || values.length > 1024 || values.length % 2) throw new RangeError("Use an even number of samples between 4 and 1024.");
  const samples = Array.from(values);
  if (samples.some(value => typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 100))
    throw new RangeError("Samples must be finite numbers between -100 and 100.");
  return samples;
}

export function analyze(values) {
  const samples = validateSamples(values), n = samples.length;
  const bins = [];
  for (let k = 0; k <= n / 2; k++) {
    let re = 0, im = 0;
    for (let j = 0; j < n; j++) {
      const angle = TAU * k * j / n;
      re += samples[j] * Math.cos(angle) / n;
      im -= samples[j] * Math.sin(angle) / n;
    }
    // Real DC/Nyquist bins have no independent sine component.
    if (k === 0 || k === n / 2) im = 0;
    const multiplicity = k === 0 || k === n / 2 ? 1 : 2;
    const magnitude = Math.hypot(re, im);
    bins.push({ k, re, im, amplitude: multiplicity * magnitude, phase: magnitude < 1e-12 ? null : Math.atan2(im, re), energy: multiplicity * magnitude ** 2, multiplicity });
  }
  const energy = samples.reduce((total, value) => total + value ** 2, 0) / n;
  return { n, samples, bins, energy, mean: bins[0].re };
}

export function weightsFor(model, { cutoff = model.n / 2, mode = "partial", muted = [] } = {}) {
  if (!Number.isInteger(cutoff) || cutoff < 0 || cutoff > model.n / 2) throw new RangeError("Harmonic cutoff is out of range.");
  if (!["partial", "fejer"].includes(mode)) throw new RangeError("Unknown reconstruction method.");
  const omitted = new Set(muted);
  return model.bins.map(bin => bin.k > cutoff || omitted.has(bin.k) ? 0 : mode === "fejer" && bin.k > 0 ? 1 - bin.k / (cutoff + 1) : 1);
}

export function evaluate(model, t, weights) {
  return model.bins.reduce((total, bin) => {
    const angle = TAU * bin.k * t;
    return total + weights[bin.k] * bin.multiplicity * (bin.re * Math.cos(angle) - bin.im * Math.sin(angle));
  }, 0);
}

export function reconstruct(model, options = {}) {
  const weights = weightsFor(model, options);
  const values = model.samples.map((_, j) => evaluate(model, j / model.n, weights));
  const mse = model.samples.reduce((total, value, j) => total + (value - values[j]) ** 2, 0) / model.n;
  const spectralMse = model.bins.reduce((total, bin) => total + (1 - weights[bin.k]) ** 2 * bin.energy, 0);
  const outputEnergy = model.bins.reduce((total, bin) => total + weights[bin.k] ** 2 * bin.energy, 0);
  const spectralEnergy = model.bins.reduce((total, bin) => total + bin.energy, 0);
  return { weights, values, rmse: Math.sqrt(mse), mse, spectralMse, outputEnergy, energyRatio: model.energy > 1e-24 ? outputEnergy / model.energy : null, parsevalError: Math.abs(model.energy - spectralEnergy), mseIdentityError: Math.abs(mse - spectralMse) };
}

export const PRESETS = {
  square: { title: "Square wave", subtitle: "A discontinuity, built from smooth waves.", note: "A sharp edge needs high frequencies. Increasing the cutoff narrows the ringing near each jump. The overshoot does not vanish in the continuous Fourier-series limit: this is the Gibbs phenomenon. At all 128 bins, this discrete transform matches the 256 sample points exactly; behavior between samples is a different question.", sample: t => t < 0.5 ? 1 : -1 },
  triangle: { title: "Triangle wave", subtitle: "Smooth enough to converge quickly.", note: "This continuous periodic triangle has corners but no jumps. Its harmonics decay faster than the square wave's. Compare the reconstruction error at the same cutoff.", sample: t => 1 - 4 * Math.abs(t - 0.5) },
  sawtooth: { title: "Sawtooth wave", subtitle: "A ramp with one periodic jump.", note: "One period is sampled on [0, 1), so the endpoint is not duplicated. The periodic extension jumps from the top of the ramp back to the bottom; that edge produces ringing.", sample: t => 2 * t - 1 },
  pulse: { title: "Pulse train", subtitle: "A narrow pulse has a broad spectrum.", note: "A 20% duty-cycle pulse carries a nonzero mean (DC). Its narrow shape spreads energy across many frequencies. Removing DC shifts the entire reconstructed signal.", sample: t => t < 0.2 ? 1 : 0 },
  mixture: { title: "Three-tone signal", subtitle: "Find the frequencies hiding in plain sight.", note: "This signal is 0.2 + 0.7 cos(2π·3t + 0.4) + 0.35 sin(2π·7t) + 0.2 cos(2π·15t − 0.8). Inspect bins 3, 7 and 15, then mute a component to isolate its contribution.", sample: t => 0.2 + 0.7 * Math.cos(TAU * 3 * t + 0.4) + 0.35 * Math.sin(TAU * 7 * t) + 0.2 * Math.cos(TAU * 15 * t - 0.8) },
  alias: { title: "Aliased sine", subtitle: "200 cycles sampled as 56.", note: "With 256 samples per period, Nyquist is 128 cycles per period. A 200-cycle sine has exactly the same samples as a negative 56-cycle sine. The DFT cannot tell which continuous source generated these samples. Set the cutoff to 56 or higher to reconstruct them.", sample: t => Math.sin(TAU * 200 * t) },
};

export function presetSamples(key, n = SAMPLE_COUNT) {
  if (!PRESETS[key]) throw new RangeError("Unknown waveform.");
  return Array.from({ length: n }, (_, j) => PRESETS[key].sample(j / n));
}

/** Periodic linear interpolation; user control points are equally spaced. */
export function resamplePeriodic(points, n = SAMPLE_COUNT) {
  if (!Array.isArray(points) || points.length < 4 || points.length > 1024 || points.some(x => !Number.isFinite(x) || Math.abs(x) > 100))
    throw new RangeError("Enter 4–1024 finite values between -100 and 100.");
  return Array.from({ length: n }, (_, j) => {
    const position = j * points.length / n, left = Math.floor(position), fraction = position - left;
    return points[left] * (1 - fraction) + points[(left + 1) % points.length] * fraction;
  });
}

export function parseControlPoints(text) {
  const tokens = text.trim().split(/[\s,;]+/);
  if (tokens.some(token => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(token)))
    throw new Error("Use numeric values separated by commas, spaces, or newlines.");
  return resamplePeriodic(tokens.map(Number));
}
