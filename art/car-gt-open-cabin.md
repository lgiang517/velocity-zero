# Long-hood GT geometry and open cabin

Latest model build: Blender 5.2.1 LTS, 2026-09-13. Rebuild with `blender --background --python-exit-code 1 --python tools/build-cars.py`. Editable model: `art/solstice-gt.blend`; runtime export: `public/models/solstice-gt.glb`.

## Structural changes

The original continuous Paint canopy and its four overlaid glass surfaces were replaced with a real roof, formed A/C pillars, narrow roof rails, window sill connections and four separate window objects. New shared material `Window glass` is exclusive to those windows; `Glass` remains on mirrors and optical parts. Independent panes permit runtime transparency sorting. Window surrounds have 14 mm formed thickness and dark gaskets.

The body has a genuine passenger well spanning approximately x +/-0.70 m and z -1.18 to +0.78 m. Its closed lower pan is at y=0.245 m, below the seat cushion and imported seat base. Exposed upper inner walls use Graphite; original outer painted door frames remain. Roof maximum is 1.32365 m; the driver's eye remains at (+0.35,1.03,-0.40).

C1 longitudinal roof interpolation removes the former section kinks. A smooth double-curvature hood crown, fuller rear shoulder and recessed middle door surface give the original body a longer-hood GT reading without relocating the axles, lamps, grille openings or plates.

Front/rear wheel internals and fixed calipers move inward by 0.16/0.12 m while their four exported pivots remain exactly unchanged. The corresponding black arch lips sit at x +/-0.934/0.978 m. Tire outer edges measure +/-0.94370 front and +/-0.98370 rear, aligned to the actual fenders. Runtime replacement wheel assemblies must use the matching offsets.

A continuous curved dark tail panel now contains the uniform-height lower lamp segments and surface-projected vent vanes; the former detached rear grille boxes were removed. A formed dark diffuser surround contains the two actual exhaust apertures. The outer metal tips are slimmer and recessed, and their bores use dark material to avoid white-looking inner cylinders.

## Final budget and checks

- GLB: 1,861,716 bytes; 67,650 triangles, within the requested 85,000 limit.
- 25 render primitives, including four separate windows; 11 materials, with only Window glass added.
- Four wheel pivot translation/rotation/scale contracts unchanged. Maximum width remains within the original envelope.
- `tools/validate-car-detail.mjs` uses the actual Three.js GLTFLoader to check validity, finite attributes, material scalar ranges, budget, plate vertex colours, and preserved optical/vent/exhaust visibility.
- 36 local window rays find no Paint directly behind the panes; forward/left/right driver-eye rays cross real windows before any painted obstruction.
- Twelve floor probes all hit y=0.245 m. Eight upper-cabin-wall probes hit Graphite. Original lamp cavity and exhaust-depth probes continue to pass.
- Exact results are saved in `art/car-detail-validation.json`. CPU studio previews were inspected during modeling; final runtime material, interior, weather and mobile appearance belongs to the main integration check.

## Reference provenance

Geometry is procedural Blender modeling informed by the user's supplied orange luxury GT reference image, not an imported generated vehicle mesh. The reference was supplied as `codex-clipboard-b05fcf33-eb82-4d46-b8b5-6ab74c67114f.png`.

The main task also requested Aholo Lux3D four-view task 3430881 and provided its completed view URLs for provenance. This modeling pass used the original user image directly; it did not download or claim to import these generated views:

- https://qhmtl-cos.kujiale.com/materialtexture/e1b/594/0c4dbcc4f34ffc01425f5d49a27a9afeb311fe44.png
- https://qhmtl-cos.kujiale.com/materialtexture/04f/544/581a4674029af31896d1849b3065ceb46d1110e5.png
- https://qhmtl-cos.kujiale.com/materialtexture/99e/b0d/a87ca3d8d25ffe6f28a22030313dd4d954103137.png
- https://qhmtl-cos.kujiale.com/materialtexture/e1b/e35/6aebfd9c9cf759573afb8c34ece5672e0a10000e.png
