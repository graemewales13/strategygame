#!/usr/bin/env python3
"""Remove magenta chroma-key residue from sprite PNGs (pink smoke wisps, magenta ground shadows, key colour showing through gaps,
pink fringes on edges). Run on new art drops:  python3 tools/defringe.py [files or folders...]  (default: every sprite under assets/).
Skips terrain tiles, menu art and UI. Safe to re-run: clean files are left untouched."""
import sys, glob, os
import numpy as np
from PIL import Image

SKIP = ('/terrain/', '/menu/', '/ui/')

def hsv(a):
    r, g, b = [a[..., i].astype(float) / 255 for i in range(3)]
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    d = mx - mn
    h = np.zeros_like(mx)
    k = d > 1e-6
    rr = k & (mx == r); gg = k & (mx == g) & ~rr; bb = k & ~rr & ~gg
    h[rr] = (((g - b)[rr] / d[rr]) % 6) * 60
    h[gg] = ((b - r)[gg] / d[gg] + 2) * 60
    h[bb] = ((r - g)[bb] / d[bb] + 4) * 60
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx

def clean(path):
    im = Image.open(path).convert('RGBA'); a = np.asarray(im).copy()
    h, s, v = hsv(a[..., :3]); al = a[..., 3]
    key = (al > 0) & (h >= 285) & (h <= 345) & (s > 0.28) & (v > 0.32)           # the key colour and its bright haze
    if key.sum() < 12: return 0
    a[key, 3] = 0
    # despill: opaque pixels within 2 px of a hole or edge that lean magenta lose the excess red/blue
    gone = a[..., 3] < 20
    near = gone.copy()
    for _ in range(2):
        n = near.copy(); n[1:] |= near[:-1]; n[:-1] |= near[1:]; n[:, 1:] |= near[:, :-1]; n[:, :-1] |= near[:, 1:]; near = n
    h2, s2, v2 = hsv(a[..., :3])
    lean = near & (a[..., 3] > 0) & (h2 >= 270) & (h2 <= 355) & (s2 > 0.12)
    rgb = a[..., :3].astype(int)
    excess = np.maximum(np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1], 0)
    for c in (0, 2): rgb[..., c] = np.where(lean, rgb[..., c] - excess, rgb[..., c])
    a[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    Image.fromarray(a).save(path, optimize=True)
    return int(key.sum())

def targets(args):
    if not args: args = ['assets']
    for p in args:
        if os.path.isdir(p): yield from sorted(glob.glob(os.path.join(p, '**', '*.png'), recursive=True))
        else: yield p

if __name__ == '__main__':
    tot = 0
    for f in targets(sys.argv[1:]):
        if any(x in f.replace('\\', '/') for x in SKIP): continue
        n = clean(f)
        if n: print(f'{n:7d} px  {f}'); tot += 1
    print(f'cleaned {tot} files')
