# Landscape realism

Latest mountain and roadside rock revision: [2026-09-19 validation](mountain-rock-realism.md). The dated record below describes the previous release.

Local update, 2026-09-15. Source changes: environment-assets.js, terrain.js, scenery.js, atmosphere.js.

- Repeat the Poly Haven Leafy Grass scan at its measured 2 metre coverage. Share the 1K color and 512px OpenGL normal map across terrain tiles. Retain mipmapping and 4x anisotropy. Blend green/dry patches with soil and steep rock; preserve road/verge/shoreline heights.
- Shorten existing six-blade grass clumps and narrow leaves. Preserve instance counts, near-pool cap, LOD/fade range and draw calls.
- Bake nonperiodic mountain shoulders and erosion into the existing 68,040-triangle distant grids. No extra ridge shadow passes or distant texture reads.
- Bake repeatable cloud density into a 256x256 RGBA texture once during world construction (256 KiB base level plus mips). Use three filtered sky texture reads instead of eight procedural noise octaves. Shared weather/time/sun uniforms still control night, rain, cloud drift and sun direction. No volumetric marching or additional passes.

## Validation

193 existing Node regression tests pass, including unchanged ground heights, shared tile normals, far-terrain shader budgets and vegetation pool limits. `npm run build` passes with the existing chunk-size advisory.

Browser evidence: output/playwright/landscape-realism/index.html. Matching day cameras retain identical renderer call/triangle counts. Actual game, Chrome 844x390 mobile layout: coast and forest both 60 FPS before/after; calls 1017/977 and triangles 3266384/3557848 unchanged. Additional 5-second moving samples (clear balanced, sunset balanced, night low), after 2.3-second warmup: 60 FPS each, p95 16.8 ms, zero frames above 50 ms, no collected JavaScript/console errors. These are desktop browser measurements, not physical mobile-device certification or a full-route endurance test.

Asset origin and reproducible preparation: landscape-texture-credits.md and tools/prepare-landscape-textures.py. Included in the mobile/scenery release prepared on 2026-09-15.
