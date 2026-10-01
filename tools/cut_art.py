"""Key the background of each painted sheet in assets/art-drop to alpha and
cut it into separate sprites under assets/factions/<f>/... (PNG, trimmed).
Usage: python3 tools/cut_art.py [--preview]"""
import sys, glob, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets')
DROP = os.path.join(ROOT, 'art-drop')

def key(img, flood=46, lo=9, hi=34):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    d = np.sqrt(((a - bg) ** 2).sum(2))
    ext_cand = d < flood
    lab, n = ndi.label(ext_cand)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    ext = np.isin(lab, list(edge))
    alpha = np.where(ext, np.clip((d - lo) / (hi - lo), 0, 1), 1.0)
    # remove the thin fringe the ramp leaves next to the subject
    a_ = alpha[..., None]
    col = np.where(a_ > 0.02, (a - (1 - a_) * bg) / np.maximum(a_, 0.02), a)
    col = np.clip(col, 0, 255)
    out = np.dstack([col, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA'), alpha

def pieces(alpha, grow=6, min_area=2500, thr=0.35, opening=1):
    mask = alpha > thr
    mask = ndi.binary_opening(mask, iterations=opening)
    merged = ndi.binary_dilation(mask, iterations=grow)
    lab, n = ndi.label(merged)
    boxes = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl is None: continue
        area = (mask[sl] & (lab[sl] == i)).sum()
        if area < min_area: continue
        boxes.append((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop))
    # reading order: rows (by y centre bands) then x
    boxes.sort(key=lambda b: ((b[1] + b[3]) // 2 // 160, b[0]))
    return boxes

def run(preview=False):
    report = []
    for path in sorted(glob.glob(DROP + '/**/*.jpg', recursive=True)):
        rel = os.path.relpath(path, DROP)
        img = Image.open(path)
        rgba, alpha = key(img)
        out = os.path.join(ROOT, os.path.splitext(rel)[0])
        os.makedirs(out, exist_ok=True)
        boxes = pieces(alpha, grow=2, thr=0.9, opening=2) if '/units/' in rel else pieces(alpha)
        for k, (x0, y0, x1, y1) in enumerate(boxes):
            pad = 3
            c = rgba.crop((max(0, x0 - pad), max(0, y0 - pad), min(rgba.width, x1 + pad), min(rgba.height, y1 + pad)))
            c.save(os.path.join(out, f'{k:02d}.png'))
        rgba.save(os.path.join(out, '_keyed.png'))
        report.append((rel, len(boxes)))
        print(rel, len(boxes))
    return report

if __name__ == '__main__':
    run('--preview' in sys.argv)
