"""Download CC0 Poly Haven foliage/bark maps and prepare a compact web payload.

Requires Pillow and NumPy. URLs are resolved from the public asset API and
original downloads verified against API-provided MD5 hashes.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import math
from collections import deque
from io import BytesIO
import json
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public' / 'textures' / 'vegetation'
UA = 'VelocityZero/1.0 (CC0 asset preparation)'


def fetch(url):
    if urlparse(url).hostname not in {'api.polyhaven.com', 'dl.polyhaven.org'}:
        raise ValueError(f'Unexpected source: {url}')
    with urlopen(Request(url, headers={'User-Agent': UA}), timeout=90) as response:
        return response.read()


def channel(files, key, fmt='png'):
    meta = files[key]['1k'][fmt]
    data = fetch(meta['url'])
    assert hashlib.md5(data).hexdigest() == meta['md5'], f'Hash mismatch for {key}'
    return Image.open(BytesIO(data)).convert('RGB').resize((1024, 1024), Image.Resampling.LANCZOS)


def jpeg(img, name):
    path = OUTPUT / name
    img.save(path, quality=87, subsampling=0, optimize=True)
    print(f'{name}: {path.stat().st_size:,} bytes', flush=True)


def make_leaf_cluster(leaf, leaf_normal):
    """Eight scanned leaves on a small branch, 0.8m long at intended scale."""
    size = (1024, 512)
    canvas = Image.new('RGBA', size, (0, 0, 0, 0))
    normal = Image.new('RGB', size, (128, 128, 255))
    draw = ImageDraw.Draw(canvas)
    points = [(35, 278), (195, 273), (350, 261), (505, 251), (665, 250), (840, 239), (935, 230)]
    for i in range(len(points)-1):
        draw.line(points[i:i+2], fill=(86, 73, 35, 255), width=max(2, 7-i))
    # Each leaf is 0.12m long and overlaps the main stem through a short petiole.
    small = leaf.resize((82, 164), Image.Resampling.LANCZOS)
    nsmall = leaf_normal.resize((82, 164), Image.Resampling.LANCZOS)
    root = (55, 151)
    for x, y, angle in [(190,273,48),(300,265,132),(410,257,42),(505,251,126),
                         (610,250,49),(715,247,129),(817,240,45),(865,235,90)]:
        t = math.radians(angle)
        c, sn = math.cos(t), math.sin(t)
        affine = (c, sn, root[0]-c*x-sn*y, -sn, c, root[1]+sn*x-c*y)
        transformed = small.transform(size, Image.Transform.AFFINE, affine, Image.Resampling.BICUBIC)
        n = np.asarray(nsmall).astype(float)
        nx, ny = (n[:,:,0]-127.5)/127.5, (n[:,:,1]-127.5)/127.5
        n[:,:,0] = (c*nx+sn*ny)*127.5+127.5
        n[:,:,1] = (-sn*nx+c*ny)*127.5+127.5
        rotated_normal = Image.fromarray(np.clip(n,0,255).astype(np.uint8)).transform(size, Image.Transform.AFFINE, affine, Image.Resampling.BICUBIC)
        canvas.alpha_composite(transformed)
        normal.paste(rotated_normal, (0,0), transformed.getchannel('A'))
    return canvas, normal


def foliage(files, prefix, source_prefix):
    color = channel(files, source_prefix + '_diff')
    opacity = channel(files, source_prefix + '_alpha').convert('L')
    normal = channel(files, source_prefix + '_nor_gl', 'jpg')
    # These are scanned atlases, NOT ready-to-use full-frame foliage cards.
    # Extract one clean upright specimen; all coordinates refer to 1024 atlas.
    box = (8, 28, 235, 460) if prefix == 'pine-twig' else (155, 10, 350, 430)
    if prefix == 'pine-twig':
        # Unrelated neighboring atlas islands intrude at the lower corners.
        # This erases only those islands, leaving the needle branch intact.
        draw = ImageDraw.Draw(opacity)
        draw.polygon([(0, 285), (0, 500), (75, 500), (65, 410), (38, 365)], fill=0)
        draw.polygon([(192, 460), (245, 460), (245, 370), (223, 380)], fill=0)
    color = color.crop(box).resize((256, 512), Image.Resampling.LANCZOS)
    opacity = opacity.crop(box).resize((256, 512), Image.Resampling.LANCZOS)
    normal = normal.crop(box).resize((256, 512), Image.Resampling.LANCZOS)
    # Keep the branch/leaf's connected alpha island; reject neighboring atlas
    # fragments left at crop corners. Coordinates are measured on the crops.
    a = np.asarray(opacity).copy()
    seed = (150, 470) if prefix == 'pine-twig' else (170, 440)
    connected = np.zeros(a.shape, dtype=bool)
    queue = deque([seed])
    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= a.shape[1] or y >= a.shape[0] or connected[y, x] or a[y, x] < 8:
            continue
        connected[y, x] = True
        queue.extend([(x-1,y),(x+1,y),(x,y-1),(x,y+1)])
    assert connected.sum() > 5000, 'Alpha component seed missed the specimen'
    a[~connected] = 0
    opacity = Image.fromarray(a)
    color.putalpha(opacity)
    if prefix == 'pine-twig':
        color = color.transpose(Image.Transpose.ROTATE_270)
        normal = normal.transpose(Image.Transpose.ROTATE_270)
        n = np.asarray(normal).copy()
        old_red = n[:, :, 0].copy()
        n[:, :, 0] = n[:, :, 1]
        n[:, :, 1] = 255 - old_red
        normal = Image.fromarray(n)
    else:
        color, normal = make_leaf_cluster(color, normal)
    rgb = np.asarray(color.convert('RGB')).copy()
    alpha = np.asarray(color.getchannel('A'))
    # Preserve foliage edge color in all transparent texels, including mip levels.
    # The PNG alpha remains unmodified: this fills RGB only, not the silhouette.
    outside = alpha < 8
    valid = ~outside
    # Extend edge RGB by 24 texels for filtering. The remaining fully transparent
    # area uses average foliage color, not black; alpha is never changed.
    rgb[outside] = np.mean(rgb[valid], axis=0).astype(np.uint8)
    for _ in range(24):
        previous = valid.copy()
        for dy, dx in [(0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)]:
            adjacent = np.roll(previous, (dy, dx), axis=(0, 1))
            if dy > 0: adjacent[:dy, :] = False
            if dy < 0: adjacent[dy:, :] = False
            if dx > 0: adjacent[:, :dx] = False
            if dx < 0: adjacent[:, dx:] = False
            fill = adjacent & ~valid
            shifted = np.roll(rgb, (dy, dx), axis=(0, 1))
            rgb[fill] = shifted[fill]
            valid[fill] = True
    rgba = Image.fromarray(np.dstack((rgb, alpha)))
    path = OUTPUT / (prefix + '.webp')
    rgba.save(path, lossless=True, exact=True, method=6)
    print(f'{path.name}: {path.stat().st_size:,} bytes', flush=True)
    jpeg(normal, prefix + '-normal.jpg')


def prepare_pine():
    files = json.loads(fetch('https://api.polyhaven.com/files/pine_tree_01'))
    foliage(files, 'pine-twig', 'twig')
    jpeg(channel(files, 'bark_diff', 'jpg'), 'pine-bark-diffuse.jpg')
    jpeg(channel(files, 'bark_nor_gl', 'jpg'), 'pine-bark-normal.jpg')


def prepare_broadleaf():
    files = json.loads(fetch('https://api.polyhaven.com/files/island_tree_01'))
    foliage(files, 'broadleaf', 'leaves')


if __name__ == '__main__':
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda fn: fn(), [prepare_pine, prepare_broadleaf]))
    total = sum(p.stat().st_size for p in OUTPUT.iterdir() if p.suffix in {'.webp', '.jpg'})
    assert total < 3_000_000, f'Budget exceeded: {total:,}'
    print(f'Total: {total:,} bytes; source hashes verified.')
