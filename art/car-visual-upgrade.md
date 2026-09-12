# Car visual upgrade

The existing original low GT silhouette, axle locations, materials used by game code, and front/back orientation are retained.

## Visible changes
- Real open tire and rim sections replace closed cylinders that obscured the brakes. The tire keeps its original 0.375 m radius.
- Sidewall beads, two circumferential tread grooves, five recessed lug bolts and twelve disc perforations per wheel.
- Fixed red brake calipers remain on the body rather than spinning with the wheel mesh.
- Ray-projected door and hood shutlines; fine window seals. The seam batch does not cast tiny, unstable shadows onto the paint.
- Recessed rear vents, closely spaced front intake vanes and five rear diffuser strakes. The original tail-light surround was narrowed.
- Original metal V shield badges on the hood and rear panel. Every badge is subdivided and projected onto the finished body; triangle winding explicitly faces outward for `FrontSide` rendering.
- Front and rear fictional `VZ-0606` plates with pale reflective stock, graphite lettering, a narrow navy band and metal fixings. A shallow pocket in the nose exposes the front plate without extending the vehicle envelope. Plate stock and the blue band share one vertex-coloured `Plate` material.
- Clearcoat roughness 0.16 for paint; low-metalness glass with 0.12 roughness, IOR 1.5 and a restrained coating. No transmission render targets or new texture downloads.

## Asset budget
| | Original | Detail upgrade | Final with badges and plates |
|---|---:|---:|---:|
| Triangles | 37,352 | 47,832 | 49,718 |
| Render primitives | 18 | 20 | 21 |
| GLB bytes | 1,029,656 | 1,349,520 | 1,428,600 |
| Blender source bytes | 445,555 | 560,902 | 599,260 |

Small bevels and wheel ornaments use reduced segmentation. Static parts are merged by material. The new materials are `Caliper`, `Intake mesh`, and `Plate`. The branding pass adds 1,886 triangles over the detail upgrade: 1,756 for the badges, plates and fixings, plus 130 for the real front pocket.

## Verification
Built and exported with Blender 5.2.1 LTS in background mode using `tools/build-cars.py`. Optional `-- --preview` renders a studio view to the operating-system temporary directory after saving and exporting, so the camera, lights and ground never enter the game asset.

The real Three.js GLTFLoader successfully parsed the resulting GLB. All vertex positions are finite, all original material names exist, and the four `Wheel_*` pivot translations and rotations exactly match the original asset. Final bounds are x +/-1.136 m, y 0.010 to 1.280 m, z -2.34800005 to 2.31123090 m. Before the branding pass, the positive z bound was 2.31543970 m; the front pocket reduces it by 4.21 mm, while the other bounds remain unchanged. The original x extent was +/-1.1385 m; no axis enlarged. Runtime `src/car.js` syntax check passed.

Studio render reviewed, followed by a game screenshot review. A first thin-seam iteration produced dotted surface artifacts; the final seam geometry uses positive surface clearance and a non-shadow-casting detail batch. Scene lighting, final in-game frame rate and environmental appearance remain the responsibility of the integrated game verification.


## Branding verification
The final `.blend` and `.glb` were rebuilt with the real Blender 5.2.1 CLI. The exported GLB contains the four original `Wheel_*` pivot positions: x +/-0.965 m, y 0.385 m, front z 1.380 m and rear z -1.340 m. The plate primitive carries `COLOR_0`, so both stock and navy colour are embedded without another texture or material.

Front and rear close-up renders are recorded in `output/playwright/brand-front.png` and `output/playwright/brand-rear.png`. The first preview exposed an occluded front plate and badge faces intersecting a curved panel; the final model uses a real shallow recess and subdivided surface projection to resolve both. The final rear plate is also visible in the real-game `output/playwright/scenery-continuous-review.jpg` capture. No branding changes were made to `src/car.js`.
