# Rear shell repair — 2026-09-13

The cloud chase-camera screenshot showed an apparently open cabin and a dented, melted-looking rear bumper. Inspection of the actual GLB disproved an initial roof-winding hypothesis: all 768 roof triangles face upward, and the window/frame surfaces point outward. The apparent convertible was caused by a large rear glass opening, extremely narrow painted pillars, and weak visual glass cues. The Three.js glass adjustment is maintained separately in the runtime source.

## Model changes

- Retain the existing opaque roof, wheel pivots, bonnet and Lux-generated front/middle body.
- Reduce rear glazing width to two thirds of its parameterized surface, widen the rear sail panels and lower sill, and add a parcel shelf behind the front seats.
- Add a fitted rubber rear-window perimeter and seven fine demister traces. All traces share one mesh and material.
- Remove only the generated rear section behind game-space z = -1.81 m. Keep the original 218-vertex exterior cut boundary, cap a 24-vertex internal source loop, and loft a smooth bumper with 16 sections.
- Close the full rear deck and fascia with smooth surfaces. This is necessary because the generated section includes inward-folded pockets; bridging its contour alone leaves visible cavities.
- Replace the source-following, jagged tail strips with a clean continuous light bar, and add a graphite lower diffuser, five fins, a plate support and hollow metal exhaust tips.
- Merge rear graphite detailing into one mesh and both metal exhaust tips into one mesh. The original physical VZ-0606 front and rear plates remain.

## Asset and checks

- Source: Aholo Lux3D G1 task 3431485, `car-plated-source.glb`, unchanged.
- Builder: `tools/prepare-lux-car.py`, Blender 5.2.1 LTS.
- Runtime GLB: 3,100,944 bytes; 87,460 triangles; 51 primitives; 12 materials; four glass nodes; two embedded 2048 × 2048 textures.
- SHA-256: `b2a0050952713a7c6d01a65a909404cefff90b523a1cd4b35d3b0bad0865e34d`.
- Wheel center/radius/width values match the previous published asset exactly.
- Plate center z values remain +2.322450 and -2.334450 m.
- Geometry/index/texture/plate contracts, cabin clearances, fitted hood coverage and FrontSide roof coverage pass.
- New FrontSide sampling checks independently cover the boot lid from above and the rear fascia from behind; neither is a double-sided ray test.
- Blender front/rear/side inspection renders are written to `output/car-detail/lux-continuous-{front,rear,side}.jpg`. Runtime acceptance remains the main agent's responsibility.

The repair addresses the missing-glass impression and damaged rear shell. The retained generated front and side surfaces still have some uneven contours; this is not a CAD-quality reconstruction of the photographic reference.
