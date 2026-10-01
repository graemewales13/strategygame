from __future__ import annotations

from dataclasses import dataclass, field
from math import hypot

from .config import STATS, TILE

_next_id = 1


def _id() -> int:
    global _next_id
    i = _next_id
    _next_id += 1
    return i


@dataclass
class Building:
    kind: str
    team: int
    tx: int
    ty: int
    id: int = field(default_factory=_id)
    type: str = "building"
    size: int = 2
    hp: float = 100
    max_hp: float = 100
    sight: int = 6
    pop: int = 0
    built: float = 1.0
    queue: list = field(default_factory=list)
    cooldown: float = 0.0
    selected: bool = False
    x: float = 0.0
    y: float = 0.0

    def __post_init__(self):
        s = STATS[self.kind]
        self.size = s["size"]
        self.max_hp = s["hp"]
        if self.hp == 100:
            self.hp = s["hp"]
        self.sight = s["sight"]
        self.pop = s.get("pop", 0)
        self.x = (self.tx + self.size / 2) * TILE
        self.y = (self.ty + self.size / 2) * TILE


@dataclass
class Unit:
    kind: str
    team: int
    x: float
    y: float
    id: int = field(default_factory=_id)
    type: str = "unit"
    hp: float = 40
    max_hp: float = 40
    sight: int = 5
    speed: float = 80
    dmg: float = 3
    range: float = 1
    cooldown: float = 0
    max_cooldown: float = 1.2
    gather_rate: float = 0
    path: list = field(default_factory=list)
    task: dict = field(default_factory=lambda: {"type": "idle"})
    carry_kind: str | None = None
    carry_amount: float = 0
    selected: bool = False
    facing: int = 1
    anim: float = 0

    def __post_init__(self):
        s = STATS[self.kind]
        self.hp = self.max_hp = s["hp"]
        self.sight = s["sight"]
        self.speed = s["speed"]
        self.dmg = s["dmg"]
        self.range = s["range"]
        self.max_cooldown = s["cooldown"]
        self.gather_rate = s.get("gather", 0)


@dataclass
class Village:
    kind: str
    tx: int
    ty: int
    id: int = field(default_factory=_id)
    type: str = "village"
    owner: int = -1
    protection: float = 40
    max_protection: float = 40
    loyalty: float = 20
    folk: tuple = ()
    stores: dict = field(default_factory=dict)
    size: int = 3
    hp: float = 1
    selected: bool = False
    x: float = 0.0
    y: float = 0.0
    name: str = "Village"
    spies: dict = field(default_factory=dict)

    def __post_init__(self):
        from .config import TILE, VILLAGE_KINDS, VILLAGE_SIZE

        spec = VILLAGE_KINDS[self.kind]
        self.size = VILLAGE_SIZE
        self.max_protection = spec["protection"]
        if self.protection == 40:
            self.protection = spec["protection"]
        self.folk = spec["folk"]
        self.stores = dict(spec["stores"])
        self.name = spec["label"]
        self.x = (self.tx + self.size / 2) * TILE
        self.y = (self.ty + self.size / 2) * TILE
        self.hp = self.protection


def dist(a, b) -> float:
    return hypot(a.x - b.x, a.y - b.y)


def dist_tiles(a, b) -> float:
    return dist(a, b) / TILE


def in_range(a, b, range_tiles: float) -> bool:
    extra = (b.size * TILE) / 2 if getattr(b, "size", None) else 10
    return dist(a, b) <= range_tiles * TILE + extra + 8


def tile_of(e) -> tuple[int, int]:
    return int(e.x // TILE), int(e.y // TILE)
