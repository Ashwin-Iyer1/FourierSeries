# Fourier Lab

A browser-local signal analysis workspace: choose or draw a periodic waveform,
compute its discrete Fourier transform, and reconstruct it harmonic by harmonic.

## Run the lab

No build step, dependencies, API key, or backend is needed. Serve only `web/`:

```sh
python -m http.server 4180 --bind 127.0.0.1 --directory web
# Open http://127.0.0.1:4180
node --test tests/*.test.mjs
```

The public application is the complete `web/` directory and can be hosted at any
static subpath. All processing happens in memory. It has no external scripts,
fonts, analytics, upload endpoint, or automatic storage.

## Explore

- Six signals: square, triangle, sawtooth, pulse, three-tone mixture, and an aliasing example.
- Draw a signal with mouse/touch, or enter equally spaced values with the keyboard.
  Drawing is limited to ±1.5 and starts from the current signal clipped to that range.
  Text input accepts 4–1024 finite values within ±100, periodically interpolated to 256 samples.
- Set the harmonic cutoff from DC only through the Nyquist bin. Compare a partial
  sum with Fejér averaging, which reduces ringing by tapering harmonic amplitudes.
- Inspect amplitude, phase, input energy share, and reconstruction weight for any
  frequency. Mute individual components and restore them without changing the source.
- Compare the original samples with a continuously evaluated reconstruction; inspect
  sample RMSE, output/input energy, DC, and numerical Parseval residual.
- Animate a phasor chain or scrub the period. Its horizontal projection plus DC
  equals the reconstructed signal. Animation starts only when requested.
- Export all 256 sample rows, all 129 one-sided coefficient rows, or a standalone SVG.

The UI supports narrow screens, keyboard controls and text-based signal editing.
Canvas charts have accessible descriptions; numeric frequency inspection, metrics
and CSV exports provide alternatives to interpreting chart pixels.

## Numerical contract

For N=256 real samples on [0,1), `C[k] = sum(x[j] exp(-i 2πkj/N))/N`.
The one-sided spectrum contains bins 0–128. Ordinary positive-frequency bins use
amplitude `2|C[k]|`, phase `atan2(Im C[k], Re C[k])`, and energy `2|C[k]|²`.
DC and Nyquist are counted once. Phase is undefined for amplitudes below 1e-12.
Energy is mean square, not a physical energy in joules.

A partial sum uses unit weights through cutoff K. Fejér averaging uses
`w[k] = 1 - k/(K+1)` through K, with DC weight 1; muted or excluded bins have weight 0.
RMSE is measured at the original samples. Its square agrees with the spectral
residual `sum(multiplicity[k] * |C[k]|² * (1-w[k])²)` up to floating-point error.
Reconstructed energy uses squared weights. A zero input has no defined energy ratio.

The DFT describes samples, not an unknown continuous source. At full cutoff it
interpolates those sample points; intersample ringing may remain. Frequencies are
cycles per period. The aliased example deliberately samples a 200-cycle sine as a
negative 56-cycle sine; no reconstruction can infer which source was intended.

`web/math.mjs` is independent of the UI. Tests check DC and Nyquist normalization,
analytic sinusoid amplitudes/phases, random-signal round trips, Parseval, residual
energy, muting, Fejér equivalence to averaged partial sums, shifts, aliasing, and
invalid input. Run on Node 22 or later.

## Original project

The original `index.html`, `test.py`, `csvtopoints.py`, and `logo.csv` are retained
as the earlier Flask/SciPy epicycle experiment. They are not dependencies of the
new lab. The original frontend expects `localhost:5001`; its optional CSV route
is commented out in the backend. The standalone lab uses an explicit normalized
DFT convention rather than relying on that historical API's coefficient naming.

Author: Ashwin Iyer. Repository: https://github.com/Ashwin-Iyer1/FourierSeries
