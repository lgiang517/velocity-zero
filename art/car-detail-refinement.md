# Vehicle detail refinement

Built with Blender 5.2.1 LTS through `tools/build-cars.py`; editable source is `art/solstice-gt.blend`, runtime asset is `public/models/solstice-gt.glb`.

Visible modeling changes:
- Existing headlight signatures retain their position, with real nose openings, recessed graphite carriers, machined projector bezels and four visible light cores behind them.
- Central and side front intakes now open through the previously occluding shell. Side throats taper to a graphite backing inside the nose; existing vanes sit inside the opening. Original plate and splitter positions are preserved.
- The continuous rear signature now has twelve separate lower optical segments and thin metal reflector edges.
- Handles sit in actual shallow finger recesses. Rear deck and right fuel-flap seams conform to the body surface.
- Original rolled exhaust tips now surround real bores through the shell/diffuser, turned inner sleeves and recessed dark backing.

No new materials or textures. Static objects retain the existing material batches. Existing badges, VZ-0606 plates and vertex tint, door/hood seams, silhouette and wheel pivots are preserved.

Boolean cutouts initially distorted the smooth exterior highlights. The generator now caches the uncut shell's triangle corner normals, then restores barycentrically interpolated normals only to faces fully on the original skin (within 0.02 mm, with matching orientation). Cut walls retain their separate hard-edge normals. This restores 18,171 exterior loop normals without altering paint roughness. A final material correction triangulates the shell before classifying 476 cavity triangles by source-skin distance and normal alignment, separates them without changing geometry, and merges them into the existing Graphite batch. Triangles with centers within 6 mm of the original skin and normal dot product above 0.60 always retain Paint, preventing mixed n-gons from painting black spikes across the exterior. Original exterior faces and the painted opening rim retain Paint; lamp and intake interiors no longer produce painted fold highlights.

| Asset metric | Before | Refined |
|---|---:|---:|
| Triangles | 49,718 | 56,524 |
| Additional triangles | — | 6,806 |
| Render primitives | 21 | 21 |
| Materials | 10 | 10 |
| GLB bytes | 1,428,600 | 1,604,404 |

The x/y/rear bounds remain identical; the positive z extremum moves inward by 1.29 mm when the nose openings are cut. Wheel_FL/FR/RL/RR translations, rotations and scales remain unchanged.

Run `node tools/validate-car-detail.mjs public/models/solstice-gt.glb art/car-detail-validation.json` for the actual GLTFLoader parse, finite attribute/material checks, envelope and axle contracts, plate vertex tint and geometry budget. Front rays hit all four Headlight cores, side rays hit recessed Intake mesh vanes, the throat gap hits Graphite rather than Paint, and both exhaust center rays reach z=-2.1615 m. Exact metrics and probe results are in `art/car-detail-validation.json`.

CPU studio previews were used to resolve occluded lamp carriers and projecting grille positions. Final same-angle Three.js close-ups, weather/paint synchronization, quality presets and mobile touch emulation have been reviewed. See docs/vehicle-finish-validation.md for integrated results and limits.
