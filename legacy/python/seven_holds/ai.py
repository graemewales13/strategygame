from math import pi, cos, sin

from .config import BUILD_TIME, COSTS, PLAYER, STATS, TILE


def update_all_ai(game, dt):
    for team in range(1, game.n_teams):
        update_ai(game, dt, team)


def update_ai(game, dt, team: int = 1):
    if team >= len(game.players):
        return
    enemy = game.players[team]
    enemy["think"] += dt
    if enemy["think"] < 1.4:
        return
    enemy["think"] = 0

    seats = [b for b in game.buildings if b.kind in ("hall", "keep") and b.team == team and b.hp > 0]
    if not seats:
        return
    keep = next((b for b in seats if b.kind == "keep"), seats[0])
    hall = next((b for b in seats if b.kind == "hall"), keep)
    serfs = [u for u in game.units if u.team == team and u.kind == "serf" and u.hp > 0]
    army = [u for u in game.units if u.team == team and u.hp > 0 and u.kind != "serf"]
    barracks = [b for b in game.buildings if b.team == team and b.kind == "barracks" and b.built >= 1 and b.hp > 0]

    trainer = hall if hall.kind == "hall" else keep
    if len(serfs) < 5 and can_afford(enemy, COSTS["serf"]) and has_pop(game, team, 1):
        enqueue(trainer, "serf", enemy)

    if not game.has_building(team, "keep") and can_afford(enemy, COSTS["keep"]):
        spot = ring_spot(game, hall, 5, STATS["keep"]["size"])
        if spot:
            game.place_building("keep", team, spot[0], spot[1])

    if not barracks and game.has_building(team, "keep") and can_afford(enemy, COSTS["barracks"]):
        spot = ring_spot(game, keep, 6, STATS["barracks"]["size"])
        if spot:
            game.place_building("barracks", team, spot[0], spot[1])

    cottages = [b for b in game.buildings if b.team == team and b.kind == "cottage" and b.hp > 0]
    if len(cottages) < 3 and can_afford(enemy, COSTS["cottage"]):
        spot = ring_spot(game, keep, 5, STATS["cottage"]["size"])
        if spot:
            game.place_building("cottage", team, spot[0], spot[1])

    if not game.has_building(team, "forge") and can_afford(enemy, COSTS["forge"]):
        spot = ring_spot(game, keep, 7, STATS["forge"]["size"])
        if spot:
            game.place_building("forge", team, spot[0], spot[1])
    if not game.has_building(team, "farm") and can_afford(enemy, COSTS["farm"]):
        spot = ring_spot(game, keep, 8, STATS["farm"]["size"])
        if spot:
            game.place_building("farm", team, spot[0], spot[1])

    if barracks and len(army) < 10:
        kind = "bowman" if len(army) % 3 == 2 else "footman"
        if can_afford(enemy, COSTS[kind]) and has_pop(game, team, 1):
            enqueue(barracks[0], kind, enemy)

    for s in serfs:
        if s.task["type"] in ("idle", "walk"):
            node = nearest_node(game, s)
            if node:
                game.command_gather([s], node)

    mark = nearest_village(game, keep, team)
    if mark and game.has_building(team, "keep") and len(army) >= 4:
        ready = [u for u in army if u.task["type"] == "idle"]
        if len(ready) >= 3:
            game.command_attack(ready, mark)

    prey = nearest_rival_keep(game, keep, team)
    if prey and len(army) >= 5:
        ready = [u for u in army if u.task["type"] == "idle"]
        if len(ready) >= 3:
            game.command_attack(ready, prey)
    elif prey:
        for u in army:
            if u.task["type"] == "idle" and ((u.x - keep.x) ** 2 + (u.y - keep.y) ** 2) ** 0.5 > 10 * TILE:
                game.command_move([u], keep.x + 40, keep.y + 40)


def nearest_village(game, keep, team):
    best, best_d = None, 28 * TILE
    for v in game.villages:
        if v.owner == team:
            continue
        d = ((v.x - keep.x) ** 2 + (v.y - keep.y) ** 2) ** 0.5
        if d < best_d:
            best, best_d = v, d
    return best


def nearest_rival_keep(game, keep, team):
    best, best_d = None, 1e18
    for b in game.buildings:
        if b.kind not in ("hall", "keep") or b.hp <= 0 or b.team == team:
            continue
        d = (b.x - keep.x) ** 2 + (b.y - keep.y) ** 2
        if d < best_d:
            best, best_d = b, d
    return best


def enqueue(building, kind, player):
    if len(building.queue) >= 5:
        return
    pay(player, COSTS[kind])
    building.queue.append({"kind": kind, "t": 0.0, "need": BUILD_TIME[kind]})


def can_afford(p, c):
    return p["food"] >= c["food"] and p["wood"] >= c["wood"] and p["gold"] >= c["gold"]


def pay(p, c):
    p["food"] -= c["food"]
    p["wood"] -= c["wood"]
    p["gold"] -= c["gold"]


def has_pop(game, team, extra):
    return game.used_pop(team) + extra <= game.pop_cap(team)


def ring_spot(game, keep, radius, size):
    for a in range(16):
        ang = (a / 16) * pi * 2
        tx = round(keep.tx + cos(ang) * radius)
        ty = round(keep.ty + sin(ang) * radius)
        if game.can_place_at(tx, ty, size):
            return tx, ty
    return None


def nearest_node(game, u):
    best, best_d = None, 1e18
    for n in game.map.resources:
        if n.amount <= 0:
            continue
        d = (n.x * TILE + 16 - u.x) ** 2 + (n.y * TILE + 16 - u.y) ** 2
        if d < best_d:
            best, best_d = n, d
    return best
