"""Cut the 7x6 terrain sheet (assets/art-drop/shared/terrain) into one PNG per tile: assets/terrain/<type>_<k>.png
Each PNG is the tile's diamond bounding box (rock tiles may rise above it). Usage: python3 tools/cut_terrain.py"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from cut_art import key
from PIL import Image
import numpy as np
ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets')
SRC = os.path.join(ROOT, 'art-drop', 'shared', 'terrain', 'terrain-sheet.jpg')
OUT = os.path.join(ROOT, 'terrain')
ROWS = ['grass', 'dry', 'sand', 'rock', 'dirt', 'water', 'snow']
os.makedirs(OUT, exist_ok=True)
sheet = Image.open(SRC).convert('RGB')
for r, name in enumerate(ROWS):
    for c in range(6):
        x0 = 5 + c * 194
        cell = sheet.crop((x0, 112 * r + 1, x0 + 183, 112 * r + 112))
        rgba, _ = key(cell, flood=30, lo=6, hi=26)
        # snow is as white as the sheet background, so every tile also gets a geometric diamond mask; only rock may rise above it
        w, h = cell.size
        yy, xx = np.mgrid[0:h, 0:w]
        d = np.abs((xx - w / 2 + .5) / (w / 2)) + np.abs((yy - h / 2 + .5) / (h / 2))
        geo = np.clip((0.955 - d) * 40, 0, 1)
        arr = np.asarray(rgba).copy()
        a = arr[..., 3] / 255.0
        if name == 'rock': a = np.maximum(a, geo)
        else: a = geo
        base = np.asarray(cell).astype(float)
        if name != 'rock': arr[..., :3] = base
        arr[..., 3] = (a * 255).astype(np.uint8)
        rgba = Image.fromarray(arr, 'RGBA')
        rgba = rgba.resize((128, 78), Image.LANCZOS)
        rgba.save(os.path.join(OUT, f'{name}_{c}.png'))
print('ok', len(os.listdir(OUT)))
