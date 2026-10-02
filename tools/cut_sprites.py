"""Key the magenta background of every single-sprite JPG in assets/art-drop/{factions,shared}/... to alpha, trim,
shrink and write PNGs to assets/factions/<f>/buildings/<k>.png and assets/shared/<dir>/<k>.png.
Usage: python3 tools/cut_sprites.py [max_px]"""
import sys, glob, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets')
DROP = os.path.join(ROOT, 'art-drop')
MAXPX = int(sys.argv[1]) if len(sys.argv) > 1 else 420

def key(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g                        # how magenta: high in the backdrop, low in the subject
    cand = (m > 75) & (r > 140) & (b > 100)
    lab, n = ndi.label(cand)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    # pockets the backdrop shows through (between legs, inside fences): any sizeable region of pure magenta
    strict = (m > 95) & (r > 170) & (b > 150)
    sl, sn = ndi.label(strict)
    sizes = ndi.sum(strict, sl, range(1, sn + 1))
    big = np.isin(sl, [i + 1 for i, z in enumerate(sizes) if z >= 25])
    bg = bg | ndi.binary_dilation(big, iterations=1)
    # soft edge: pixels next to the backdrop fade by how magenta they still are
    near = ndi.binary_dilation(bg, iterations=4) & ~bg
    alpha = np.ones_like(m)
    alpha[bg] = 0
    alpha[near] = np.clip((95 - m[near]) / 70, 0, 1)
    stray = (m > 62) & (r > 150) & (b > 120)          # leftover magenta specks (feet, fence rails)
    alpha = np.where(stray, np.minimum(alpha, np.clip((105 - m) / 40, 0, 1)), alpha)
    # despill the pink that bled into the rim
    rim = near & (alpha > 0)
    cap = g + 28
    r2 = np.where(rim, np.minimum(r, cap), r); b2 = np.where(rim, np.minimum(b, cap), b)
    out = np.dstack([r2, g, b2, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    bbox = img.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    img = img.crop(bbox)
    if max(img.size) > MAXPX: img.thumbnail((MAXPX, MAXPX), Image.LANCZOS)
    return img

n = 0
for f in sorted(glob.glob(os.path.join(DROP, '**', '*.jpg'), recursive=True)):
    rel = os.path.relpath(f, DROP).replace('\\', '/')
    parts = rel.split('/')
    if parts[0] == 'factions' and parts[2] == 'buildings':
        dest = os.path.join(ROOT, 'factions', parts[1], 'buildings', os.path.splitext(parts[3])[0] + '.png')
    elif parts[0] == 'shared' and parts[1] in ('units', 'villages', 'nodes') and len(parts) == 3 and not parts[2].startswith(('six', 'nodes-sheet')):
        dest = os.path.join(ROOT, 'shared', parts[1], os.path.splitext(parts[2])[0] + '.png')
    elif parts[0] == 'villages' and len(parts) == 4 and parts[1] == 'peoples':
        dest = os.path.join(ROOT, 'shared', 'villages', 'peoples', parts[2], os.path.splitext(parts[3])[0] + '.png')
    elif parts[0] == 'villages' and len(parts) == 3:
        dest = os.path.join(ROOT, 'shared', 'villages', parts[1], os.path.splitext(parts[2])[0] + '.png')
    else:
        continue
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    key(f).save(dest, optimize=True); n += 1
print('wrote', n, 'sprites')
