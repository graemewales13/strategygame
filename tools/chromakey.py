#!/usr/bin/env python3
"""Turn an art drop painted on a flat #FF00FF ground into game-ready sprites: magenta keyed to transparency (soft edge),
trimmed to the subject with a small margin, and optionally scaled down so the longest side fits.
    python3 tools/chromakey.py [--margin 4] [--max 420] files...
Then run tools/defringe.py on the same files for any pink fringe left on edges. Files that already have transparent corners
are skipped (safe to re-run)."""
import sys
import numpy as np
from PIL import Image

def key(path, margin=4, longest=0):
    im = Image.open(path).convert('RGBA'); a = np.asarray(im).astype(float)
    if a[0, 0, 3] == 0 and a[-1, -1, 3] == 0: return None   # already keyed
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # how far a pixel is from the key: magenta has red and blue high and green low
    mag = np.minimum(r, b) - g                                 # 255 on pure key, <=0 on anything without a magenta cast
    alpha = np.clip(1 - (mag - 60) / (200 - 60), 0, 1)         # soft ramp between "slight cast" and "the key"
    # despill the partly keyed edge: take the magenta excess back out of red and blue
    spill = np.clip(mag, 0, None) * (alpha < 1) * (alpha > 0)
    a[..., 0] = np.clip(r - spill, 0, 255); a[..., 2] = np.clip(b - spill, 0, 255)
    a[..., 3] = a[..., 3] * alpha
    out = Image.fromarray(a.round().astype(np.uint8))
    bb = out.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bb: return None
    x0, y0, x1, y1 = bb
    out = out.crop((max(0, x0 - margin), max(0, y0 - margin), min(out.width, x1 + margin), min(out.height, y1 + margin)))
    if longest and max(out.size) > longest:
        k = longest / max(out.size); out = out.resize((max(1, round(out.width * k)), max(1, round(out.height * k))), Image.LANCZOS)
    out.save(path, optimize=True)
    return out.size

if __name__ == '__main__':
    args, margin, longest, files = sys.argv[1:], 4, 0, []
    i = 0
    while i < len(args):
        if args[i] == '--margin': margin = int(args[i + 1]); i += 2
        elif args[i] == '--max': longest = int(args[i + 1]); i += 2
        else: files.append(args[i]); i += 1
    for f in files:
        s = key(f, margin, longest)
        print(f'{f}: ' + (f'{s[0]}x{s[1]}' if s else 'skipped'))
