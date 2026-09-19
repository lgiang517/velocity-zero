# Vehicle metallic finish validation — 2026-09-19

The imported paint was too diffuse: import replaced its reflection intensity with 0.85, and fallback scene lighting used 0.22 environment intensity on mobile/balanced. The 812 source also had a low specular factor (0.291).

## Change

- Paint uses metallic pigment (metalness 0.72), roughness 0.225 dry / 0.15 wet, and neutral clearcoat roughness 0.065 dry / 0.035 wet. Physical specular is 1. Base color and source textures are preserved.
- Keep paint finish environment intensity 1.1 through import.
- Without a complete local reflection, paint borrows the existing world PMREM. The static daylight map receives night/tunnel attenuation; completed local probes already include scene lighting and must not be attenuated twice.
- Existing capture resolution, frequency, one-face-per-frame scheduling, and mobile capture-free budget remain unchanged. Glass and resource ownership remain unchanged. No new texture, geometry or shader work is added.

## Evidence

`output/playwright/metallic-paint/index.html` has same-camera before/after views of all three cars, plus mobile screenshots and lighting checks. The initial local-probe night attenuation made the car too dark; the final version removes that duplicate attenuation, covered by regression tests and the final night screenshot.

- 223 / 223 full project tests pass, including earlier handling changes.
- Production build passes; existing >500 kB bundle advisory remains.
- Nine exterior before/after views, three mobile views, high/low quality, tunnel, night, and rainy cockpit checks; no browser runtime errors.
- Host browser mobile emulation: 844×390, balanced, touch throttle, 2.5 seconds warmup and 5 seconds sampling per car. Average FPS: DB12 60.1, GTC4Lusso 60.1, 812 60.1; P95: 16.8 / 17.2 / 17.7 ms; no frames over 50 ms. Not a physical-phone benchmark.
- Same-view draw calls and triangles unchanged; mobile uses zero dynamic captures. Static environment does not reflect nearby moving cars.

No cloud deployment was made in this task. Pre-existing handling modifications remain intact.
