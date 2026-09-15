# Vegetation texture sources and preparation

Prepared on 2026-09-15 from Poly Haven's official asset API and download host.
All source texture assets are **CC0 1.0**. The asset license permits reuse,
adaptation, redistribution, and commercial use:
[Poly Haven license](https://polyhaven.com/license),
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

| Source asset | Contributors | Source channels used |
| --- | --- | --- |
| [Pine Tree 01](https://polyhaven.com/a/pine_tree_01) | Rob Tuytel: photography; Rico Cilliers: modeling | `twig_diff`, `twig_alpha`, `twig_nor_gl`, `bark_diff`, `bark_nor_gl` |
| [Island Tree 01](https://polyhaven.com/a/island_tree_01) | Rob Tuytel: scanning/processing; Rico Cilliers: cleanup/processing | `leaves_diff`, `leaves_alpha`, `leaves_nor_gl` |

The source files are selected from the **actual returned 1K download records**
at [Pine Tree 01 files](https://api.polyhaven.com/files/pine_tree_01) and
[Island Tree 01 files](https://api.polyhaven.com/files/island_tree_01).
No model geometry is included. The large complete tree models are not downloaded.
All original downloads pass their API-provided MD5 checks before conversion.

## Runtime files

| File | Resolution | Bytes | Usage |
| --- | --- | ---: | --- |
| `pine-twig.webp` | 512 × 256 | 101100 | RGBA pine branch, sRGB color and linear opacity |
| `pine-twig-normal.jpg` | 512 × 256 | 53905 | Corresponding linear OpenGL normal |
| `pine-bark-diffuse.jpg` | 1024 × 1024 | 241837 | sRGB repeating bark |
| `pine-bark-normal.jpg` | 1024 × 1024 | 427291 | Linear OpenGL bark normal |
| `broadleaf.webp` | 1024 × 512 | 101960 | RGBA eight-leaf branch cluster, sRGB color and linear opacity |
| `broadleaf-normal.jpg` | 1024 × 512 | 28053 | Corresponding linear OpenGL normal |
| **Total** | | **954146** | About 0.91 MiB |

Files live in `public/textures/vegetation/`. Foliage uses non-premultiplied RGBA,
lossless WebP with `exact=True`. Alpha silhouettes remain separate from color.
The RGB color is extended 24 texels beyond foliage edges; fully transparent areas
farther away use the average foliage RGB. This avoids black texels being mixed
into visible edges under bilinear/mipmap filtering. Use alpha testing and
double-sided cards; do not display a full opaque quad. Foliage cards use clamped
0–1 UVs, not repeating atlas UVs.

## Layout and scale

Both prepared foliage images are **root at the left, tip at the right**. UV
coordinates below assume the image is upright when used with a normal Three.js
TextureLoader texture on PlaneGeometry (`flipY` default). Image pixel Y increases
downward, whereas listed UV V increases upward.

- Pine: original 1024-pixel atlas rectangle `(8, 28, 235, 460)` contains the
  upright pine twig. Neighboring corner islands are removed, then only the
  connected specimen alpha island is retained. The specimen is rotated clockwise
  90 degrees. The visible root is around `(u=0.02, v=0.42)`; the foliage tip is
  near `(u=0.95, v=0.5)`. The aspect ratio is 2:1; a card around 0.45–0.65 m long
  and half as wide is a reasonable scene scale. This is an artistic runtime
  scale, not a measured twig size from the API.
- Broadleaf: a clean actual leaf is cropped from Island Tree 01's atlas rectangle
  `(155, 10, 350, 430)`, with disconnected scan fragments removed. Eight copies
  form a small alternating leaf spray around a slender tapering drawn stem. The
  visible root is around `(u=0.035, v=0.46)`, and the tip points right. Intended
  card coverage is approximately **0.8 m × 0.4 m**; each leaf is about 12–15 cm
  long. The transparent gaps between leaves are deliberate. This is a composed
  branch cluster using photographed leaves, not a photograph of one intact spray.

Use the entire **prepared** image for each card. The original source images are
multi-island atlases including cones, trunk pieces, or scan remnants and must not
be used wholesale as foliage cards.

Normal images receive the same crop, scale, rotation, and placement as their
color/opacity partners. Tangent-space R/G normal vectors are also rotated when
leaves are rotated. Normals remain OpenGL +Y; do not invert the green channel.
JPEG normal maps use quality 87 without chroma subsampling. No color tint is
baked into the foliage or bark; runtime materials can vary tint slightly.

Reproduction: `python tools/prepare-vegetation-textures.py` (Pillow and NumPy).
The script resolves URLs from the API, verifies source checksums, crops and
composes foliage, extends transparent RGB, compresses maps, and checks the final
asset payload stays under 3 MB.
