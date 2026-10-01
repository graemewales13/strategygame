from __future__ import annotations

from dataclasses import dataclass, field
from random import Random

from .config import MAP_H, MAP_W, VILLAGE_KINDS, VILLAGE_SIZE


@dataclass
class Resource:
    kind: str
    x: int
    y: int
    amount: float


@dataclass
class MapData:
    w: int
    h: int
    tiles: list[int]
    resources: list[Resource] = field(default_factory=list)
    starts: list[tuple[int, int]] = field(default_factory=list)
    villages: list = field(default_factory=list)


def create_map(seed: int = 1337, n_starts: int = 4) -> MapData:
    rng = Random(seed)
    tiles = [0] * (MAP_W * MAP_H)
    for y in range(MAP_H):
        for x in range(MAP_W):
            n = fbm(x / 18, y / 18) * 0.65 + fbm(x / 7, y / 7) * 0.35
            if n < 0.28:
                tiles[y * MAP_W + x] = 2
            elif n < 0.34:
                tiles[y * MAP_W + x] = 1
    carve_river(tiles, rng)
    resources = place_resources(tiles, rng)
    starts = pick_starts(tiles, rng, n_starts)
    villages = place_villages(tiles, starts, rng)
    return MapData(MAP_W, MAP_H, tiles, resources, starts, villages)


def walkable_grid(world: MapData, buildings) -> list[int]:
    walk = [0 if t == 2 else 1 for t in world.tiles]
    for b in buildings:
        if b.hp <= 0:
            continue
        for y in range(b.ty, b.ty + b.size):
            for x in range(b.tx, b.tx + b.size):
                if 0 <= x < world.w and 0 <= y < world.h:
                    walk[y * world.w + x] = 0
    return walk


def can_place(world: MapData, walk: list[int], tx: int, ty: int, size: int) -> bool:
    if tx < 1 or ty < 1 or tx + size >= world.w - 1 or ty + size >= world.h - 1:
        return False
    for y in range(ty, ty + size):
        for x in range(tx, tx + size):
            if not walk[y * world.w + x] or world.tiles[y * world.w + x] == 2:
                return False
    return True


def place_resources(tiles: list[int], rng: Random) -> list[Resource]:
    nodes: list[Resource] = []
    for _ in range(520):
        x, y = rng.randint(3, MAP_W - 5), rng.randint(3, MAP_H - 5)
        if tiles[y * MAP_W + x] == 0:
            nodes.append(Resource("tree", x, y, 80 + rng.randint(0, 50)))
    for _ in range(48):
        x, y = rng.randint(4, MAP_W - 6), rng.randint(4, MAP_H - 6)
        if tiles[y * MAP_W + x] != 2:
            nodes.append(Resource("gold", x, y, 420 + rng.randint(0, 280)))
    for _ in range(56):
        x, y = rng.randint(4, MAP_W - 6), rng.randint(4, MAP_H - 6)
        if tiles[y * MAP_W + x] != 2:
            nodes.append(Resource("berry", x, y, 130 + rng.randint(0, 90)))
    return nodes


def place_villages(tiles, starts, rng: Random):
    from .entities import Village

    kinds = list(VILLAGE_KINDS)
    spots = []
    for _ in range(80):
        x = rng.randint(10, MAP_W - 14)
        y = rng.randint(10, MAP_H - 14)
        if tiles[y * MAP_W + x] == 2:
            continue
        if not open_patch(tiles, x, y, VILLAGE_SIZE + 1):
            continue
        if any((x - sx) ** 2 + (y - sy) ** 2 < 22 * 22 for sx, sy in starts):
            continue
        if any((x - vx) ** 2 + (y - vy) ** 2 < 16 * 16 for vx, vy in spots):
            continue
        spots.append((x, y))
        if len(spots) >= 14:
            break
    villages = []
    for i, (x, y) in enumerate(spots):
        kind = kinds[i % len(kinds)]
        villages.append(Village(kind, x, y))
    return villages


def pick_starts(tiles: list[int], rng: Random, n: int = 4) -> list[tuple[int, int]]:
    corners = [
        (16, 16),
        (MAP_W - 22, 16),
        (16, MAP_H - 22),
        (MAP_W - 22, MAP_H - 22),
        (MAP_W // 2 - 4, MAP_H // 2 - 4),
    ]
    picked = []
    for cx, cy in corners[: max(2, n)]:
        spot = nearest_open(tiles, cx, cy)
        picked.append(spot)
    return picked[:n]


def nearest_open(tiles: list[int], x: int, y: int) -> tuple[int, int]:
    if open_patch(tiles, x, y, 5):
        return x, y
    for r in range(1, 16):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                nx, ny = x + dx, y + dy
                if 6 <= nx <= MAP_W - 12 and 6 <= ny <= MAP_H - 12 and open_patch(tiles, nx, ny, 5):
                    return nx, ny
    return max(6, min(MAP_W - 12, x)), max(6, min(MAP_H - 12, y))


def open_patch(tiles: list[int], x: int, y: int, s: int) -> bool:
    for j in range(s):
        for i in range(s):
            if tiles[(y + j) * MAP_W + (x + i)] == 2:
                return False
    return True


def carve_river(tiles: list[int], rng: Random) -> None:
    x, y = int(MAP_W * (0.35 + rng.random() * 0.3)), 0
    while y < MAP_H:
        for k in (-1, 0, 1):
            xx = x + k
            if 0 <= xx < MAP_W:
                tiles[y * MAP_W + xx] = 2
        x = max(4, min(MAP_W - 5, x + rng.randint(-1, 1)))
        y += 1


def fbm(x: float, y: float) -> float:
    n = a = s = 0.0
    f = a = 1.0
    s = 0.0
    n = 0.0
    a = 1.0
    f = 1.0
    for _ in range(4):
        n += a * value_noise(x * f, y * f)
        s += a
        a *= 0.5
        f *= 2
    return n / s


def value_noise(x: float, y: float) -> float:
    x0, y0 = int(x), int(y)
    fx, fy = x - x0, y - y0
    ix = fx * fx * (3 - 2 * fx)
    iy = fy * fy * (3 - 2 * fy)
    v00, v10 = hash2(x0, y0), hash2(x0 + 1, y0)
    v01, v11 = hash2(x0, y0 + 1), hash2(x0 + 1, y0 + 1)
    return lerp(lerp(v00, v10, ix), lerp(v01, v11, ix), iy)


def hash2(x: int, y: int) -> float:
    n = x * 374761393 + y * 668265263
    n = (n ^ (n >> 13)) * 1274126177
    return ((n ^ (n >> 16)) & 0xFFFFFFFF) / 4294967296


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t
