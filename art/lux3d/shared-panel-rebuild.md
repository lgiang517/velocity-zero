# Shared-panel vehicle generator

The approved Aholo GT canopy, four axle XZ locations, four window assemblies and physical VZ-0606 plate geometry are retained from `art/lux3d/aholo-gt-package.glb`. This 267 KB package is a stable input, extracted from baseline `f36cc7ea33220924f411738476ee6b6f8e00019d2a0d767c0308db7d1c5747da`. The package also keeps the original mirror and wheel-liner references, but the current generator rebuilds these parts instead of importing them. It contains no defective lower body skin and does not contain production wheel meshes: the game continues to build its detailed wheels around versioned axle empties (front 275/35R21, rear 315/30R21, wheel center Y = tire radius + 4 mm).

Run Blender 5.2 with `--background --python-exit-code 1 --python tools/prepare-lux-car.py`. The default output is the ignored `output/vehicle-rebuild/candidate` directory. Override using `-- --out-dir <path>`. The generator never replaces `public/models` or the published blend/build record.

`tools/rebuild-lux-panels.py` creates controlled rear deck, canopy sills, door/fender panels, closed 8 mm hood, 14 mm cowl, bumper apertures, finite-thickness tail lens, hollow exhaust tubes, open-backed mirror assemblies, fitted wheel-house liners and inner walls, and detail meshes. The rear-window curve is shared analytically; the actual triangulated export is checked independently at its boundary. Exterior hood/cowl/window curves and driver-visible structural roles are exported in `Vehicle_assembly.extras.vehicleAssembly`, in vehicle-local game XYZ, metres.

Validation commands:

- `node tools/validate-lux-car.mjs <candidate.glb>` checks general asset bounds, axle nodes, glass and plate conventions.
- `node tools/validate-vehicle-rebuild.mjs <candidate.glb> --out <report.json>` checks measured shoulder defects, rear-window seam, hood orientation/thickness, shared assembly boundaries, versioned exact axle fitment, closed tail-lamp shell and actual exhaust sight depth.

Geometry checks are necessary, not visual approval. Inspect gray, normal, strip-reflection and production paint with the original driver eye and all exterior views before promoting the candidate. Keep the dated baseline and screenshots outside the generator input path.


The final rear uses `tools/vehicle_surfaces.py` as a shared C1 position/normal surface. Rear deck, side and bumper share the same deformation, with targeted extra tessellation only around high curvature. `tools/vehicle_mirrors.py` constructs window-mounted wing shells and the fitted trim/lens assembly.

- `node tools/validate-real-surfacing.mjs <candidate.glb> --out <report.json>` independently samples exported triangles at all five final rear joins and the tail housing. Position, tangent and shading-normal limits are separate. Metadata must lie on the actual mesh.
- `node tools/validate-wheel-mirror.mjs <candidate.glb> <report.json>` checks real wheel fitment, full steering clearance, caliper clearance and 18 original-eye mirror rays.

The v2 surfacing asset budget is 160,000 triangles and 5 MiB; legacy assets retain 100,000 triangles. The modern GT GLB has 157,952 triangles / 70 primitives / 4,847,856 bytes. The 21-inch bead seat and visible rim flange are distinct measurements. Geometry and a local desktop performance measurement justify the explicit budget increase; this does not certify physical phones.


Modern GT styling (2026-09-14) preserves the front cabin and rear-window interface while reshaping the rear deck, haunches, waist and bumper. `tools/modern_gt_canopy.py` applies one C1 field to the retained rear roof/glass/seals with transformed normals and zero added geometry. `stylingVersion: 2` identifies the flatter boot and wider wheel haunch. The physical rear plate package is placed from the measured bumper pocket, not a fixed depth guess. See `docs/modern-gt-styling.md` for current styling and validation evidence.
