# Tunnel pavement and coastal ocean

## Repair

- Removed the 6 m horizontal walkway boxes. Each side is now a closed swept solid with <=1.5 m station spacing, inner offset 10.3 m, outer offset 12.05 m, 0.26 m top and -0.3 m base; 4 m end ramps meet the shoulder. Geometry follows road elevation and curvature, with small wall overlap sealing grass gaps. Expansion joints are shader details.
- `src/ocean.js` replaces the two-triangle water surface with a camera-centred adaptive grid (51,200 triangles). World-space swell phase stays fixed when the grid recentres; finer wind ripples use an irregular noise height field and screen-footprint filtering.
- The visible terrain's existing samples provide a 211×276 packed RGBA height texture (232,944 bytes). No extra terrain sampling or physics changes. It drives depth colour, near-shore attenuation and foam, and avoids float-texture filtering requirements on mobile.
- Water shares time, sun direction, daylight, rain and night uniforms. Sky/cloud approximation, Fresnel and sun glints replace the old broad striping. This is procedural real-time water, not a fluid simulation or planar reflection of nearby buildings.

## Validation

- `npm test`: 190 passed, including 3 new tunnel geometry tests and 3 ocean texture/geometry/lifecycle tests.
- `npm run build`: passed; existing large-chunk advisory remains.
- Playwright: matched before/after views; tunnel both sides and portals; near shore under clear/sunset/rain/night; animation clock advances; no new page or shader errors on fresh loads.
- Actual game, 844×390 touch-emulated desktop browser, balanced preset: tunnel and coastal samples both reported 60 FPS. This is not a physical phone performance measurement.
- Evidence / live viewer: `output/playwright/tunnel-ocean/index.html`, `viewer.html`. Files under output are local review artifacts, excluded from releases.
- Included in the mobile/scenery release prepared on 2026-09-15.
