# Shared-panel vehicle generator

The approved Aholo GT canopy, four axle empties, four window assemblies and physical VZ-0606 plate geometry are retained from `art/lux3d/aholo-gt-package.glb`. This 267 KB package is a stable input, extracted from baseline `f36cc7ea33220924f411738476ee6b6f8e00019d2a0d767c0308db7d1c5747da`. The package also keeps the original mirror and wheel-liner references, but the current generator rebuilds these parts instead of importing them. It contains no defective lower body skin and does not contain production wheel meshes: the game continues to build its detailed wheels around the original axle empties.

Run Blender 5.2 with `--background --python-exit-code 1 --python tools/prepare-lux-car.py`. The default output is the ignored `output/vehicle-rebuild/candidate` directory. Override using `-- --out-dir <path>`. The generator never replaces `public/models` or the published blend/build record.

`tools/rebuild-lux-panels.py` creates controlled rear deck, canopy sills, door/fender panels, closed 8 mm hood, 14 mm cowl, bumper apertures, finite-thickness tail lens, hollow exhaust tubes, open-backed mirror assemblies, fitted wheel-house liners and inner walls, and detail meshes. The rear-window curve is shared analytically; the actual triangulated export is checked independently at its boundary. Exterior hood/cowl/window curves and driver-visible structural roles are exported in `Vehicle_assembly.extras.vehicleAssembly`, in vehicle-local game XYZ, metres.

Validation commands:

- `node tools/validate-lux-car.mjs <candidate.glb>` checks general asset bounds, axle nodes, glass and plate conventions.
- `node tools/validate-vehicle-rebuild.mjs <candidate.glb> --out <report.json>` checks measured shoulder defects, rear-window seam, hood orientation/thickness, shared assembly boundaries, exact axle preservation, closed tail-lamp shell and actual exhaust sight depth.

Geometry checks are necessary, not visual approval. Inspect gray, normal, strip-reflection and production paint with the original driver eye and all exterior views before promoting the candidate. Keep the dated baseline and screenshots outside the generator input path.
