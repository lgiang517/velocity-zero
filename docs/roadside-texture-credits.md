# Roadside building textures

The three PBR texture sets below were obtained directly through the Poly Haven
public API and official download host on 2026-09-14. All are by **Rob Tuytel**.
Poly Haven publishes its downloadable texture assets under **CC0 1.0**;
redistribution and commercial use are permitted. Source:
[Poly Haven asset license](https://polyhaven.com/license) and
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

| Local prefix | Asset / official source | Surface coverage per repeat |
| --- | --- | --- |
| `plaster` | [White Plaster 02](https://polyhaven.com/a/white_plaster_02) | 1.5 m × 1.5 m per API `scale` (see discrepancy below) |
| `roof` | [Roof Slates 02](https://polyhaven.com/a/roof_slates_02) | 3 m × 3 m |
| `wood` | [Wood Planks Grey](https://polyhaven.com/a/wood_planks_grey) | 1.5 m × 1.5 m |

Each prefix has three files in `public/textures/roadside/`:
`*-diffuse.jpg` (sRGB albedo), `*-normal.jpg` (linear RGB, **OpenGL +Y**), and
`*-rough.jpg` (linear grayscale roughness). All are 1024 × 1024 pixels, tileable,
and derive from the original 1K JPG maps without baked scenic lighting or text.
Roughness is not glossiness and must not be inverted.

The API metadata for White Plaster 02 is inconsistent: `scale` reads
`1.5M x 1.5M`, while `dimensions` is `[1000, 1000]` mm. The 1.5 m legacy scale is
used as a rendering guideline, not a surveyed physical guarantee. Roof Slates
02 has `scale: 3M x 3M` and `dimensions: [3000, 3000]`; Wood Planks Grey has
`dimensions: [1500, 1500.0001192092896]` mm. Metadata can be inspected at:

- [White plaster info](https://api.polyhaven.com/info/white_plaster_02)
- [Slate roof info](https://api.polyhaven.com/info/roof_slates_02)
- [Weathered wood info](https://api.polyhaven.com/info/wood_planks_grey)

`tools/prepare-roadside-textures.py` resolves the official API download URLs,
checks each original file against the API-provided MD5, then saves compact JPGs.
Adaptations: RGB/gray conversion, 1024 px sizing, and JPEG recompression at quality
83 (color/roughness) / 86 (normal). RGB maps use no chroma subsampling. No color
grading, normal channel inversion, or replacement of material content is applied.

| File | Bytes |
| --- | ---: |
| `plaster-diffuse.jpg` | 247338 |
| `plaster-normal.jpg` | 253563 |
| `plaster-rough.jpg` | 123489 |
| `roof-diffuse.jpg` | 280485 |
| `roof-normal.jpg` | 412262 |
| `roof-rough.jpg` | 163578 |
| `wood-diffuse.jpg` | 227037 |
| `wood-normal.jpg` | 179000 |
| `wood-rough.jpg` | 176889 |
| **Total** | **2063641** |

The complete nine-map payload is approximately 1.97 MiB. Normal map strength
and UV repeats should be adjusted to building dimensions at runtime; the maps
remain shared across buildings to avoid repeated downloads.
