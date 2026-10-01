TILE = 32
MAP_W = 128
MAP_H = 128
WIN_W = 1280
WIN_H = 720
HUD_H = 132
TOP_H = 48

PLAYER = 0
DEFAULT_TEAMS = 4
MIN_TEAMS = 3
MAX_TEAMS = 5

FACTION = (
    {"name": "House Calder", "color_name": "yellow", "primary": (196, 160, 48), "accent": (242, 214, 110), "dark": (90, 68, 18)},
    {"name": "House Varr", "color_name": "red", "primary": (163, 59, 59), "accent": (255, 141, 122), "dark": (74, 28, 28)},
    {"name": "House Cael", "color_name": "blue", "primary": (58, 110, 165), "accent": (142, 196, 255), "dark": (28, 51, 77)},
    {"name": "House Thorn", "color_name": "green", "primary": (52, 110, 62), "accent": (140, 198, 120), "dark": (22, 54, 28)},
    {"name": "House Ash", "color_name": "violet", "primary": (120, 72, 150), "accent": (196, 150, 220), "dark": (48, 28, 64)},
)

GRASS = ((61, 90, 50), (69, 102, 56), (58, 84, 46), (74, 107, 60))
DIRT = (107, 84, 46)
WATER = ((27, 58, 74), (22, 64, 88))

COSTS = {
    "cottage": {"food": 0, "wood": 60, "gold": 0},
    "farm": {"food": 0, "wood": 70, "gold": 0},
    "mill": {"food": 0, "wood": 80, "gold": 0},
    "warehouse": {"food": 0, "wood": 100, "gold": 20},
    "market": {"food": 0, "wood": 120, "gold": 40},
    "forge": {"food": 0, "wood": 150, "gold": 60},
    "workshop": {"food": 0, "wood": 160, "gold": 70},
    "tavern": {"food": 40, "wood": 100, "gold": 40},
    "academy": {"food": 0, "wood": 140, "gold": 80},
    "temple": {"food": 0, "wood": 130, "gold": 50},
    "barracks": {"food": 0, "wood": 140, "gold": 20},
    "archery": {"food": 0, "wood": 130, "gold": 30},
    "stable": {"food": 0, "wood": 160, "gold": 50},
    "tower": {"food": 0, "wood": 100, "gold": 40},
    "keep": {"food": 0, "wood": 280, "gold": 120},
    "serf": {"food": 50, "wood": 0, "gold": 0},
    "scout": {"food": 40, "wood": 20, "gold": 0},
    "footman": {"food": 60, "wood": 20, "gold": 0},
    "bowman": {"food": 40, "wood": 30, "gold": 20},
    "knight": {"food": 80, "wood": 0, "gold": 60},
    "spy": {"food": 30, "wood": 20, "gold": 40},
    "scholar": {"food": 40, "wood": 20, "gold": 50},
    "ram": {"food": 0, "wood": 180, "gold": 40},
}

BUILD_TIME = {
    "cottage": 12,
    "farm": 14,
    "mill": 16,
    "warehouse": 18,
    "market": 20,
    "forge": 24,
    "workshop": 26,
    "tavern": 18,
    "academy": 24,
    "temple": 20,
    "barracks": 22,
    "archery": 20,
    "stable": 24,
    "tower": 20,
    "keep": 36,
    "serf": 8,
    "scout": 10,
    "footman": 14,
    "bowman": 16,
    "knight": 22,
    "spy": 16,
    "scholar": 18,
    "ram": 28,
}

STATS = {
    "hall": {"hp": 650, "sight": 7, "size": 3, "pop": 3},
    "keep": {"hp": 1800, "sight": 11, "size": 4, "pop": 6},
    "cottage": {"hp": 400, "sight": 5, "size": 2, "pop": 5},
    "farm": {"hp": 350, "sight": 4, "size": 3, "pop": 0},
    "mill": {"hp": 500, "sight": 5, "size": 2, "pop": 0},
    "warehouse": {"hp": 700, "sight": 5, "size": 3, "pop": 0},
    "market": {"hp": 550, "sight": 6, "size": 3, "pop": 0},
    "forge": {"hp": 750, "sight": 5, "size": 3, "pop": 0},
    "workshop": {"hp": 800, "sight": 5, "size": 3, "pop": 0},
    "tavern": {"hp": 500, "sight": 6, "size": 2, "pop": 0},
    "academy": {"hp": 650, "sight": 8, "size": 3, "pop": 0},
    "temple": {"hp": 600, "sight": 7, "size": 2, "pop": 0},
    "barracks": {"hp": 800, "sight": 6, "size": 3, "pop": 0},
    "archery": {"hp": 700, "sight": 7, "size": 3, "pop": 0},
    "stable": {"hp": 750, "sight": 6, "size": 3, "pop": 0},
    "tower": {"hp": 650, "sight": 10, "size": 2, "pop": 0, "range": 7, "dmg": 9, "cooldown": 1.1},
    "serf": {"hp": 40, "sight": 5, "speed": 78, "dmg": 3, "range": 1, "cooldown": 1.2, "gather": 7},
    "scout": {"hp": 55, "sight": 8, "speed": 130, "dmg": 5, "range": 1, "cooldown": 1.0},
    "footman": {"hp": 90, "sight": 6, "speed": 88, "dmg": 10, "range": 1, "cooldown": 1.15},
    "bowman": {"hp": 50, "sight": 8, "speed": 92, "dmg": 7, "range": 6, "cooldown": 1.35},
    "knight": {"hp": 140, "sight": 6, "speed": 120, "dmg": 16, "range": 1, "cooldown": 1.2},
    "spy": {"hp": 35, "sight": 11, "speed": 110, "dmg": 4, "range": 1, "cooldown": 1.0},
    "scholar": {"hp": 30, "sight": 9, "speed": 70, "dmg": 1, "range": 1, "cooldown": 1.5},
    "ram": {"hp": 220, "sight": 4, "speed": 42, "dmg": 28, "range": 1.2, "cooldown": 2.2},
}

TRAIN_FROM = {
    "hall": ("serf",),
    "keep": ("serf", "scout"),
    "barracks": ("footman",),
    "archery": ("bowman",),
    "stable": ("knight",),
    "tavern": ("spy",),
    "academy": ("scholar",),
    "workshop": ("ram",),
}

DROP_OFF = ("hall", "keep", "mill", "warehouse", "market")

GATHER_CAP = 15
START = {"food": 90, "wood": 100, "gold": 25}

LABELS = {
    "hall": "Hall",
    "keep": "Keep",
    "cottage": "Cottage",
    "farm": "Farm",
    "mill": "Mill",
    "warehouse": "Warehouse",
    "market": "Market",
    "forge": "Forge",
    "workshop": "Workshop",
    "tavern": "Tavern",
    "academy": "Academy",
    "temple": "Temple",
    "barracks": "Barracks",
    "archery": "Archery Range",
    "stable": "Stable",
    "tower": "Watchtower",
    "serf": "Serf",
    "scout": "Scout",
    "footman": "Footman",
    "bowman": "Bowman",
    "knight": "Knight",
    "spy": "Spy",
    "scholar": "Scholar",
    "ram": "Ram",
}

PLACE_KEYS = {
    "1": "cottage",
    "2": "farm",
    "3": "mill",
    "4": "warehouse",
    "5": "market",
    "6": "forge",
    "7": "workshop",
    "8": "tavern",
    "9": "academy",
    "0": "temple",
    "b": "barracks",
    "y": "archery",
    "l": "stable",
    "t": "tower",
    "c": "keep",
}

NEUTRAL = -1
CASTLE_INFLUENCE = 22
SPY_LOYALTY_RATE = 5.5
CASTLE_LOYALTY_RATE = 1.4
SUBMIT_LOYALTY = 72
VILLAGE_SIZE = 3

VILLAGE_KINDS = {
    "hamlet": {
        "label": "Hamlet",
        "folk": ("farmer", "herder", "mill-hand"),
        "protection": 32,
        "tribute": {"food": 1.6, "wood": 0.3, "gold": 0.1},
        "stores": {"food": 80, "wood": 20, "gold": 8},
    },
    "mine": {
        "label": "Mining camp",
        "folk": ("miner", "hauler", "overseer"),
        "protection": 48,
        "tribute": {"food": 0.2, "wood": 0.2, "gold": 1.8},
        "stores": {"food": 20, "wood": 15, "gold": 90},
    },
    "market": {
        "label": "Market town",
        "folk": ("trader", "carter", "watch"),
        "protection": 52,
        "tribute": {"food": 0.6, "wood": 0.6, "gold": 1.4},
        "stores": {"food": 40, "wood": 40, "gold": 70},
    },
    "hillfort": {
        "label": "Hillfort",
        "folk": ("spearman", "watch", "captain"),
        "protection": 88,
        "tribute": {"food": 0.4, "wood": 0.3, "gold": 0.6},
        "stores": {"food": 30, "wood": 25, "gold": 25},
    },
    "abbey": {
        "label": "Abbey",
        "folk": ("monk", "novice", "scribe"),
        "protection": 36,
        "tribute": {"food": 0.5, "wood": 0.2, "gold": 0.8},
        "stores": {"food": 35, "wood": 10, "gold": 40},
    },
    "inn": {
        "label": "Crossroads inn",
        "folk": ("innkeep", "sellsword", "spy-runner"),
        "protection": 28,
        "tribute": {"food": 0.4, "wood": 0.2, "gold": 1.1},
        "stores": {"food": 25, "wood": 10, "gold": 35},
    },
}
