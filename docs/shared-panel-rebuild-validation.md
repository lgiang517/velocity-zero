# Shared-panel vehicle repair — 2026-09-14

This repair implements the approved shared-boundary panel rebuild. The comparison baseline is production commit `979d1a58f758eb93b414ef828c8c629ee61ebe4e`, model SHA256 `f36cc7ea33220924f411738476ee6b6f8e00019d2a0d767c0308db7d1c5747da` (74,268 triangles / 45 primitives / 2,140,024 bytes).

## Changes and reproducibility

The existing Aholo GT canopy, glass, physical VZ-0606 plates and exact wheel anchors are retained in the checked-in `art/lux3d/aholo-gt-package.glb`. Blender constructs controlled rear deck, shoulder, hood, cowl, side skin, bumper openings, lamp housings and exhaust tubes. The old cumulative deformation pipeline has been removed. `tools/prepare-lux-car.py` now writes an isolated candidate by default and never overwrites the production asset.

The GLB exports vehicle-local assembly curves. Three.js reads these curves for the dash, cowl reveal, capped A-pillar feet and driver-visible structural pieces. Exterior and interior material visibility are independent. Driving-eye coordinates and wheel/steering controls remain unchanged. Orbit framing fits the vehicle envelope at close/high views and portrait aspect ratios.

## Validation scope

- `tools/validate-vehicle-rebuild.mjs` measures exported triangles independently of generator equations: rear shoulder, rear-window seam, hood normals and solid shell, assembly boundaries, four exact axle contracts, tail-lamp closure and exhaust openings.
- Regression tests inject displaced assembly seams, moved axles, changed tire dimensions and corrupt front-hood normals. The historical asset must still reproduce the diagnosed failures when its local frozen copy is available.
- Cabin coverage scans the expected opaque front-quarter region for GT, light and muscle variants using the original driver eye. Transparent glazing does not count as closure. Forward sky remains visible.
- Production visual acceptance requires actual game screenshots, not just standalone model inspection or unit-test success.

Local evidence is retained under `output/playwright/vehicle-rebuild/` and `output/vehicle-rebuild/`. These ignored artifacts are review evidence, not build dependencies. Physical mobile hardware has not been used; mobile results below refer to browser emulation.

## Final local acceptance

Final GLB SHA256: `9a7a3aff48dd824b4485f8c881f9b21863a7625447cf03ae746e54533f98114b`; cache key `9a7a3aff48dd`. 99,804 triangles / 59 primitives / 2,307,988 bytes. Nine independent geometry checks and the general GLB contract pass.

Additional defects caught during the required 360 review:

- `Wheel_arch_rolled_lip` was incorrectly accepted by the old `startsWith('Wheel_')` axle rule. Its zero lateral position created a singular extra wheel, producing NaN HDR pixels and a large black Bloom rectangle. `selectWheelAnchors` now accepts exactly four named, non-mesh axle nodes. Actual game captures across three exterior-to-driver transitions show zero NaN/Infinity in each transition's first eight HDR frames, with Bloom, shadows and reflections enabled. Player and rival each have four non-singular wheel transforms.
- Wheel lip radius was too large for the tire. It is now 0.27547 m on GT, with preserved tire envelope, a substantial sidewall and about 10.9 mm caliper/spoke clearance after GT scaling. Maximum positive/negative steering retains at least 17.78 mm radial wheel-arch clearance and 54.81 mm inner-wall clearance.
- The old mirror lens was buried in an ellipsoid shell. New open housings, continuous lenses, gaskets, arms and triangular mounts expose the complete rear-facing mirror. Eighteen original-eye rays hit the actual mirror first. Mirrors use the existing PBR environment reflection, not separate live rear-camera renders.
- The clearcoat shader differentiated a value already containing `fwidth`; the revised shader differentiates raw relief before filtering, checks normalization length and reduces the oversized surface pattern. This was a separate material issue, not the proven black-rectangle root cause.
- Vent backing plates were partly buried after the dashboard profile changed. Each complete vent now fits the exported dash surface; its bezel and louvres remain assembled.

Visual evidence: the original 22 game viewpoints (including left/right cockpit joints), 36 game orbit angles at 10-degree intervals, 12 low angles, clear/sunset/rain comparisons, flat/normal/strip/production-paint diagnostics, and 20 wheel/mirror closeups plus four maximum-steering views. Root inspected the complete orbit contact sheets and cockpit closeups. Page errors and failed asset loads: none in the final game and mobile captures.

Chrome mobile emulation: 390x844 portrait and 844x390 landscape, touch and DPR 2.625, balanced rendering. A trusted throttle touch produced 11.55 km/h; pointers cleared on release, no horizontal overflow, and camera controls worked. Music advanced from 1.76 to 8.26 seconds with running AudioContext. After ignition ended, final-output RMS was 0.00495 and peak 0.02022; only the 441,078-byte ignition clip was decoded. No physical phone or speaker test is claimed.

Same-host desktop comparison, 1440x960/high, steady 4.5-second samples:

| View | Baseline median / p95 | Repaired median / p95 | Draws before / after | Triangles before / after |
| --- | --- | --- | --- | --- |
| Exterior | 16.7 / 18.0 ms | 16.7 / 16.8 ms | 715 / 755 | 1,808,996 / 1,897,168 |
| Driver | 16.7 / 17.3 ms | 16.7 / 16.9 ms | 668 / 701 | 1,751,562 / 1,814,752 |

Both samples report 60 FPS. These short measurements do not establish performance on all hardware.

Rebuilding through the safe wrapper from tracked inputs succeeded. In a repeated build, topology, positions, normals and GLB JSON were identical; 22 UV components differed only in float rounding (maximum 5.96e-8), so byte-identical GLB hashes are not claimed.

All 152 production-asset tests pass (zero failures or skips), and the production Vite build succeeds. The existing bundle-size advisory remains. Full logs are recorded in `output/vehicle-rebuild/final-tests.log` and `final-build.log`. Deployment/resource-hash verification is recorded separately after publishing.

