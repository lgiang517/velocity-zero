# Mountain and rock realism — 2026-09-19

## Causes and changes

The common roadside boulders were 135 instances of one 80-triangle non-indexed icosahedron. Recomputing normals after deformation made each triangle a hard facet; there was no scanned surface. The existing large Lux3D rock landmark is a separate eight-location system, retained unchanged.

- New shared 320-triangle weathered mesh has oblique broken faces, a buried base, and creased/smoothed normals. Existing instance positions and spatial draw batches remain. Full-scene source geometry increases by 32,400 triangles.
- Reuse existing aerial_rocks_04 albedo and OpenGL normal scans. World-metre triplanar projection includes instance scale; neutralized mineral color avoids painting green aerial vegetation on individual rocks. Six texture reads maximum, with explicit normal gradients before distance branches; no new source textures or render passes.
- Near terrain changes 32.26 m/repeat rock mapping to a visually calibrated 6 m/repeat, improves shallow-slope rock/soil transitions and slope-correct normal detail. Typical grass/rock/transition paths use 5/7/8 samples versus the old fixed 7; old noise-derived bump and misplaced roughness sampling are removed.
- Far mountains retain 68,040 triangles and 21 tiles. Height erosion and mineral vertex color are baked at construction. Static RGB attribute adds 429,660 bytes; exact seam positions/normals/colors are shared. Three existing-albedo reads replace two procedural noise evaluations; no far normal/roughness reads, additional shadow pass or new texture allocation.
- Ground height function, near terrain mesh, road/verge positions, and coastal height texture are preserved. Prior car-paint and handling changes remain untouched.

## Validation

- 228 / 228 full tests pass. Production build passes with the existing >500 kB bundle advisory.
- Same-camera six-view before/after capture in `output/playwright/mountain-rock-realism/index.html`; all six retain the same draw call counts, no JS/WebGL errors.
- Baseline terrain/scenery modules are isolated from the unchanged pre-task HEAD in the local audit folder; no production file rollback was used. Both versions use identical stored camera positions and lighting.
- Browser mobile emulation, 844×390, balanced, DB12, 2.5 s warmup +5 s touch throttle: before/after average approximately 60 FPS on coast, hills and mountain bend. P95 16.8→17.2 /16.8→17.1 /16.9→17.0 ms; zero frames over50 ms. This is a host GPU result, not a physical phone guarantee. Some unsteered acceleration segments contact barriers; counts match before/after and these samples only assess render performance.
- Rain/high and night/low live game smoke tests have no runtime errors. Existing mobile reflection, tree LOD and quality budgets remain.

No external asset download or cloud deployment was performed. The shared scan license/source records remain in `art/environment-assets.json`.
