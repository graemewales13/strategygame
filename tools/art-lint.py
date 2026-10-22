#!/usr/bin/env python3
"""Check game art before it is committed (T30). Run:  python3 tools/art-lint.py [files or folders...]   (--self-test checks the lint itself)
(default: every sprite under assets/factions, assets/shared and assets/world). Exit code 1 if any file fails.

A sprite fails when:
  - it is not RGBA (it would draw as a rectangle);
  - a corner pixel is a quarter opaque or more (a ground left behind, as in 8b7d6f1, T-049);
  - it still shows the magenta key: opaque pixels close to #FF00FF, or a rim of see-through magenta on its soft edges (T-071);
  - a figure, building or deposit has a longest side over twice the median of its kind (figures 20x too big, as in c99b90e, T-054).
Cards and portraits (assets/ui/, assets/shared/ui/portraits/) are painted on a ground and are only checked for the key colour.
Terrain, menu pictures, the art-drop inbox and the old sheets at the top of assets/ are not checked. Needs pillow and numpy."""
import sys, os, re, glob
from collections import defaultdict
import numpy as np
from PIL import Image

ROOTS = ('assets/factions', 'assets/shared', 'assets/world')
SKIP = ('/terrain/', '/menu/', '/art-drop/', '-sheet.png')   # (an `economy-sheet.png` is a painter's reference, never loaded)
OPAQUE_OK = ('assets/ui/', '/ui/portraits/')
KEY_SOLID = 40      # opaque pixels this close to #FF00FF that a file may keep (a stray speck is not visible at game size)
KEY_RIM = 150       # see-through magenta edge pixels a file may keep (T-071 found about 700 a file)
CORNER = 64         # a corner this opaque is a ground left behind (old board cuts keep a faint 10% halo, which is invisible)
SIZE_X = 2.0        # longest side allowed against the median of its kind

def kind(path):
    """Files compared for size: the same folder with the people taken out, and the same base name
    (footman, footman_spear and footman_walk3 are all footmen; ram_body and ram_wheel are not)."""
    p = path.replace('\\', '/')
    p = re.sub(r'assets/factions/[^/]+/', 'assets/factions/*/', p)
    d, f = os.path.split(p)
    base = os.path.splitext(f)[0]
    if '/units' in d: base = re.split(r'_(?:walk|work)\d|_(?:spear|sword|axe|bow|crossbow|lance|mail|plate)', base)[0]
    elif '/buildings' in d: base = 'building'
    elif '/ui/' in d: base = 'icon'
    elif '/resources' in d: base = 'deposit'
    return d + '/' + base

def check(path):
    """A list of problems with one file (empty when it is clean), and its longest side."""
    im = Image.open(path)
    bad = []
    lax = any(k in path.replace('\\', '/') for k in OPAQUE_OK)
    if im.mode != 'RGBA' and not lax: bad.append('not RGBA (%s)' % im.mode)
    a = np.asarray(im.convert('RGBA')).astype(int)
    h, w = a.shape[:2]
    al = a[..., 3]
    if not lax:
        corners = [al[0, 0], al[0, w - 1], al[h - 1, 0], al[h - 1, w - 1]]
        if max(corners) >= CORNER: bad.append('opaque corner (alpha %d)' % max(corners))
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    near = (r > 200) & (b > 200) & (g < 90)                                # the key itself, not rose or violet cloth
    solid = int((near & (al > 200)).sum())
    lean = (np.minimum(r, b) - g > 110) & (abs(r - b) < 70)
    rim = int((lean & (al > 24) & (al < 235)).sum())
    if solid > KEY_SOLID: bad.append('%d key-colour pixels' % solid)
    if rim > KEY_RIM: bad.append('%d magenta edge pixels' % rim)
    return bad, max(h, w)

def targets(args):
    for p in (args or ROOTS):
        if os.path.isdir(p): yield from sorted(glob.glob(os.path.join(p, '**', '*.png'), recursive=True))
        elif p.endswith('.png'): yield p

def main(args):
    files = [f for f in targets(args) if not any(s in f.replace('\\', '/') for s in SKIP)]
    sides, fails = defaultdict(list), {}
    for f in files:
        bad, side = check(f)
        sides[kind(f)].append((f, side))
        if bad: fails[f] = bad
    # a size outlier needs company to be judged by: kinds of three files or more, judged across the whole tree when only some were named
    if args:
        for f in targets(list(ROOTS)):
            if f in files or any(s in f for s in SKIP): continue
            k = kind(f)
            if k in sides: sides[k].append((f, max(Image.open(f).size)))
    named = set(files)
    for k, items in sides.items():
        if len(items) < 3 or k.endswith('/icon'): continue   # (icons and marks are drawn at a fixed size, whatever they were painted at)
        med = float(np.median([s for _, s in items]))
        for f, s in items:
            if f in named and s > SIZE_X * med:
                fails.setdefault(f, []).append('%d px, over %.0fx the %d px of its kind' % (s, SIZE_X, med))
    for f in sorted(fails): print('FAIL %s: %s' % (f, '; '.join(fails[f])))
    print('art-lint: %d files, %d failed' % (len(files), len(fails)))
    return 1 if fails else 0

def self_test():
    """The faults of past drops, made on purpose: each must be caught, and a clean sprite and rose cloth must pass."""
    import tempfile
    d = tempfile.mkdtemp()
    def sprite(name, size=(60, 100), ground=None, cloth=(200, 160, 120, 255), rim=None):
        a = np.zeros((size[1], size[0], 4), np.uint8)
        if ground: a[:] = ground
        a[10:-10, 15:-15] = cloth
        if rim: a[8:10, 15:-15] = rim; a[-10:-8, 15:-15] = rim; a[10:-10, 13:15] = rim; a[10:-10, -15:-13] = rim
        f = os.path.join(d, name + '.png'); Image.fromarray(a).save(f); return f
    cases = {
        sprite('clean'): False,
        sprite('rose', cloth=(0xA8, 0x36, 0x6E, 255)): False,                  # Byzantine rose is paint
        sprite('violet', cloth=(0x7A, 0x4A, 0x98, 255)): False,                # Mongol violet is paint
        sprite('pink_ground', ground=(255, 0, 255, 255)): True,                # 8b7d6f1, T-049
        sprite('key_left', cloth=(250, 10, 245, 255)): True,                   # the key itself inside the figure
        sprite('magenta_rim', size=(200, 300), rim=(230, 40, 220, 120)): True, # T-071
    }
    bad = 0
    for f, want in cases.items():
        got = bool(check(f)[0])
        if got != want: bad += 1; print('SELF-TEST FAIL %s: %s' % (os.path.basename(f), 'missed' if want else 'false alarm'))
    # a figure twenty times too big among its kind (c99b90e, T-054)
    k = os.path.join(d, 'assets/factions/x/units'); os.makedirs(k)
    for i, side in enumerate((50, 52, 48, 51, 1000)):
        Image.fromarray(np.zeros((side, side // 2, 4), np.uint8)).save(os.path.join(k, 'footman%s.png' % ('' if i == 0 else '_walk%d' % i)))
    import io, contextlib
    out = io.StringIO()
    with contextlib.redirect_stdout(out): rc = main([k])
    if rc != 1 or 'footman_walk4.png' not in out.getvalue() or out.getvalue().count('FAIL') != 1: bad += 1; print('SELF-TEST FAIL oversize figure:', out.getvalue())
    print('art-lint self-test: %s' % ('passed' if not bad else '%d failed' % bad))
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(self_test() if sys.argv[1:] == ['--self-test'] else main(sys.argv[1:]))
