"""Prepare three small CC0 building texture sets from Poly Haven's public API.

Run: python tools/prepare-roadside-textures.py
Requires Pillow. Sources are verified against the API's original MD5 before
JPEG compression; normals keep all RGB channels with no chroma subsampling.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib
from io import BytesIO
import json
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public' / 'textures' / 'roadside'
ASSETS = {'plaster': 'white_plaster_02', 'roof': 'roof_slates_02', 'wood': 'wood_planks_grey'}
CHANNELS = {'diffuse': 'Diffuse', 'normal': 'nor_gl', 'rough': 'Rough'}


def fetch(url):
    if urlparse(url).hostname not in {'api.polyhaven.com', 'dl.polyhaven.org'}:
        raise ValueError(f'Unexpected source host: {url}')
    request = Request(url, headers={'User-Agent': 'VelocityZero/1.0 (CC0 asset preparation)'})
    with urlopen(request, timeout=90) as response:
        return response.read()


def prepare(item):
    prefix, asset_id = item
    files = json.loads(fetch(f'https://api.polyhaven.com/files/{asset_id}'))
    for suffix, channel in CHANNELS.items():
        source = files[channel]['1k']['jpg']
        data = fetch(source['url'])
        assert hashlib.md5(data).hexdigest() == source['md5'], f'Checksum mismatch: {asset_id}/{channel}'
        img = Image.open(BytesIO(data)).convert('RGB')
        img = img.resize((1024, 1024), Image.Resampling.LANCZOS)
        if suffix == 'rough':
            img = img.convert('L')
        target = OUTPUT / f'{prefix}-{suffix}.jpg'
        img.save(target, quality=86 if suffix == 'normal' else 83,
                 subsampling=0, optimize=True)
        print(f'{target.name}: {target.stat().st_size:,} bytes', flush=True)


if __name__ == '__main__':
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(prepare, ASSETS.items()))
    total = sum((OUTPUT / f'{prefix}-{suffix}.jpg').stat().st_size
                for prefix in ASSETS for suffix in CHANNELS)
    assert total <= 3_000_000, f'Texture budget exceeded: {total:,} bytes'
    print(f'Total: {total:,} bytes; all original source checksums verified.')
