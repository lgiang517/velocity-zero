"""Prepare a small CC0 grass-ground texture pair from Poly Haven.

Requires Pillow. Resolves actual official API URLs and verifies original MD5s.
"""
import hashlib
from io import BytesIO
import json
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public' / 'textures' / 'landscape'
ASSET = 'leafy_grass'


def fetch(url):
    if urlparse(url).hostname not in {'api.polyhaven.com', 'dl.polyhaven.org'}:
        raise ValueError(f'Unexpected download host: {url}')
    request = Request(url, headers={'User-Agent': 'VelocityZero/1.0 (CC0 asset preparation)'})
    with urlopen(request, timeout=90) as response:
        return response.read()


if __name__ == '__main__':
    OUTPUT.mkdir(parents=True, exist_ok=True)
    records = json.loads(fetch(f'https://api.polyhaven.com/files/{ASSET}'))
    images = {}
    for filename, channel in [('grass-diffuse.jpg', 'Diffuse'), ('grass-normal.jpg', 'nor_gl')]:
        source = records[channel]['1k']['jpg']
        data = fetch(source['url'])
        assert hashlib.md5(data).hexdigest() == source['md5'], f'Source hash mismatch: {channel}'
        size = (1024, 1024) if channel == 'Diffuse' else (512, 512)
        images[filename] = Image.open(BytesIO(data)).convert('RGB').resize(size, Image.Resampling.LANCZOS)
    for quality in [80, 76, 72, 68]:
        for filename, img in images.items():
            img.save(OUTPUT / filename, quality=quality, subsampling=0, optimize=True)
        total = sum((OUTPUT / name).stat().st_size for name in images)
        if total < 600_000:
            break
    assert total < 600_000, f'Grass pair budget exceeded: {total:,} bytes'
    for name in images:
        print(f'{name}: {(OUTPUT / name).stat().st_size:,} bytes; {images[name].width} x {images[name].height}; JPEG quality {quality}')
    print(f'Total: {total:,} bytes; source hashes verified.')
