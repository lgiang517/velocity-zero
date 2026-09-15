# Landscape grass texture

The ground grass texture is **Leafy Grass**, created by **Charlotte Baglioni**
and published by Poly Haven under **CC0 1.0**.

- [Official asset page](https://polyhaven.com/a/leafy_grass)
- [Official asset information](https://api.polyhaven.com/info/leafy_grass)
- [Official download records](https://api.polyhaven.com/files/leafy_grass)
- [Poly Haven asset license](https://polyhaven.com/license)
- [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

Source obtained directly from Poly Haven's official API/download host on
2026-09-15. Each original 1K JPG source is verified against the API-provided MD5.
The asset license permits adaptation and redistribution, including commercial
use. No website promotional imagery, model geometry, or unrelated assets are
included.

| Runtime file | Dimensions | Bytes | Color handling |
| --- | --- | ---: | --- |
| `public/textures/landscape/grass-diffuse.jpg` | 1024 × 1024 | 403600 | sRGB color |
| `public/textures/landscape/grass-normal.jpg` | 512 × 512 | 129290 | Linear RGB, OpenGL +Y normal |
| **Total** | | **532890** | Approximately 520 KiB |

The official `dimensions` metadata is `[2000, 2000]` millimeters: each UV repeat
covers **2 m × 2 m**. The photograph contains green grass blades, leaf litter,
small twigs, and underlying soil, which is appropriate for unmanaged roadside
grass. It should not be scaled to cover a whole hillside with a single repeat.

Adaptations are Lanczos resizing and JPEG compression at quality 80 with no
chroma subsampling. No synthetic grass, baked scene shadows, or generated
details are added. The normal map is deliberately 512 px to reduce download
and GPU texture memory while the color map retains 1024 px detail. The two
images share identical UV coverage and can use the same repeat settings.

Use repeat wrapping and mipmaps. A moderate normal strength is appropriate;
extreme strength can make shallow grass/soil read as rocks. These maps provide
surface detail, not free-standing blade silhouettes or geometry. Desktop and
mobile materials should reuse the same loaded maps instead of loading one
copy per terrain patch.

Reproduce with `python tools/prepare-landscape-textures.py` (Pillow required).
The script resolves URLs from the API, verifies hashes, converts the two maps,
and enforces a final payload below 600000 bytes.
