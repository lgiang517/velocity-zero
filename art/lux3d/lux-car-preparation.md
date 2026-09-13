# Continuous Lux3D GT asset

The playable body derives from Aholo Lux3D G1 task **3431485**, using the clean single-car reference `art/references/lux-gt-plated-reference.png`. The untouched result is `art/lux3d/car-plated-source.glb`. Four-view task 3431294 contained two incomplete vehicles and is rejected. The procedural GT remains unchanged as fallback and donates only physical VZ-0606 license plates.

Run Blender 5.2.1 LTS with `--background --python-exit-code 1 --python tools/prepare-lux-car.py`. Output is atomically replaced at `public/models/solstice-lux-gt.glb`, and editable scene saved at `art/lux3d/solstice-lux-gt.blend`. `lux-car-build.json` is derived from the actual exported GLB and records byte count, triangle budget, materials and wheel nodes. `tools/preview-lux-car.py` renders front/rear/side offline inspection images.

## Root cause and replacement

Earlier centroid-based face deletion and color-island classification were rejected by actual game inspection: source triangles crossed opening boundaries, making broken windows, wheel arches and fragmented hood/lamps. CPU center rays alone did not detect those peripheral defects. That algorithm is removed.

The final process welds the actual source main connected shell, removes disconnected generation debris, fairs source positions with bounded displacement, separates wheel cylinders by exact Boolean intersection, and reconstructs the body solid at 12 mm voxel resolution to remove self-intersecting/overlapping AI skins. The body is reduced to a 65k pre-opening budget. Exact Boolean wheel, lamp and passenger-well cuts create real intersection vertices. The old upper cabin is removed in one continuous beltline operation and replaced as a complete structure. No triangle-centroid masking remains. The vehicle is still the generated Lux shape, not a procedural replacement.

Four continuous 24×16 curved window grids replace baked fragmented glass. Exact continuous lamp cavities contain dark lining and thin emissive strips; quadratic depth fitting preserves lamp endpoints while suppressing source dents. A continuous inset grille replaces baked orange intake fragments. The defective generated upper cabin is entirely removed above its beltline and manually rebuilt in Blender. Front glass, roof and rear glass share Hermite height/width curves and endpoint tangents. Side glass, A/C pillars and frames use Coons surfaces sharing those exact boundaries. A continuous lower shoulder transition closes the connection to the retained Lux lower body. This upper cabin is hand-rebuilt, not raw Lux geometry. Four full black semicylindrical wheel-house liners cover bright inner cut surfaces. A continuous low rear deck replaces remaining generated upper-trunk debris. Both mirrors are manually restored as short dark supports, smooth painted shells and driver-facing reflective Glass lenses; these pieces were removed with the original defective canopy. `Driver_hood` uses an exact contiguous spatial intersection rather than surface-normal filtering; a final low-frequency bonnet fit is applied identically to external body and extracted hood after Boolean operations, keeping its center about .87–.91 m below the fixed 1.03 m driver eye.

## Runtime contract

+Z forward, +Y up; source −X front converted by rigid rotation, uniform scale .96875. Four top-level Empty anchors `Wheel_FL/FR/RL/RR`: front (±.871875,.397018,1.388219), radius .390406; rear (±.871875,.390237,−1.338812), radius .387694; full tire width .2325. Source wheel children retain original PBR textures and are replaced by dynamic runtime wheels.

Paint has uniform PBR base color and no baked albedo. Four windows use `Window glass`; emissive materials are `Headlight` and `Tail`. Other names include `Graphite`, `Cabin lining`, `Alloy`, `Plate`, `Wheel surface`. Driver_hood contains Paint plus Cabin lining at partition caps: only Paint should be repainted in cockpit; dark caps keep their own material. `Brake_high`, `Exhaust_L/R` are effect anchors.

Both ends have actual plate stock, blue `COLOR_0` band, VZ-0606 glyph geometry and screws. Front/rear plate centers use z≈2.322/−2.334.

## Verification

Blender export runs with Python error exit enabled. `mesh.validate()` repairs duplicate Boolean polygons before export. The independent `tests/lux-car-asset.test.js` verifies GLB accessors/indices/finite values, textures, materials, plate vertex tint, top-level wheel metadata, cabin rays, and inset area coverage across hood and all four windows. Offline front/rear/side images must also be viewed; CPU tests are supplementary and do not replace game visual acceptance. Exact current budget is in `lux-car-build.json`.
