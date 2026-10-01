from __future__ import annotations

from math import hypot
from random import randint

from .config import (
    BUILD_TIME,
    COSTS,
    DEFAULT_TEAMS,
    DROP_OFF,
    FACTION,
    GATHER_CAP,
    MAP_H,
    MAP_W,
    PLAYER,
    START,
    STATS,
    TILE,
    TRAIN_FROM,
)
from .entities import Building, Unit, Village, dist, dist_tiles, in_range, tile_of
from .mapgen import can_place, create_map, walkable_grid
from .pathfinding import astar


class Game:
    def __init__(self, seed: int | None = None, n_teams: int = DEFAULT_TEAMS):
        self.reset(seed, n_teams)

    def reset(self, seed: int | None = None, n_teams: int | None = None):
        if n_teams is not None:
            self.n_teams = max(3, min(5, n_teams))
        elif not hasattr(self, "n_teams"):
            self.n_teams = DEFAULT_TEAMS
        self.seed = seed if seed is not None else randint(1, 10**9)
        self.map = create_map(self.seed, self.n_teams)
        self.buildings: list[Building] = []
        self.villages: list[Village] = list(self.map.villages)
        self.units: list[Unit] = []
        self.projectiles: list[dict] = []
        self.floaters: list[dict] = []
        self.players = [
            {**START, "think": 0.35 * i, "name": FACTION[i]["name"], "alive": True}
            for i in range(self.n_teams)
        ]
        self.seen = [bytearray(MAP_W * MAP_H) for _ in range(self.n_teams)]
        self.visible = [bytearray(MAP_W * MAP_H) for _ in range(self.n_teams)]
        self.placing = None
        self.placing_tx = 0
        self.placing_ty = 0
        self.outcome = None
        self.time = 0.0
        if not hasattr(self, "mode"):
            self.mode = "menu"
        houses = ", ".join(FACTION[i]["name"] for i in range(1, self.n_teams))
        self.msg = f"A small hall and two serfs. Expand, claim villages, raise a keep. Rivals: {houses}."
        self.msg_t = 7.0
        for i, (sx, sy) in enumerate(self.map.starts[: self.n_teams]):
            self.spawn_base(i, sx, sy)
        self.rebuild_walk()
        keep = self.buildings[0]
        self.cam = [keep.x - 520, keep.y - 280]

    def spawn_base(self, team: int, tx: int, ty: int):
        hall = Building("hall", team, tx, ty)
        self.buildings.append(hall)
        for i in range(2):
            self.units.append(Unit("serf", team, hall.x + 22 + i * 18, hall.y + 42))

    def rebuild_walk(self):
        self.walk = walkable_grid(self.map, list(self.buildings) + list(self.villages))

    def used_pop(self, team: int) -> int:
        return sum(1 for u in self.units if u.team == team and u.hp > 0)

    def pop_cap(self, team: int) -> int:
        return sum(b.pop for b in self.buildings if b.team == team and b.hp > 0 and b.built >= 1)

    def can_afford(self, team: int, cost: dict) -> bool:
        p = self.players[team]
        return p["food"] >= cost["food"] and p["wood"] >= cost["wood"] and p["gold"] >= cost["gold"]

    def pay(self, team: int, cost: dict):
        p = self.players[team]
        p["food"] -= cost["food"]
        p["wood"] -= cost["wood"]
        p["gold"] -= cost["gold"]

    def can_place_at(self, tx: int, ty: int, size: int) -> bool:
        return can_place(self.map, self.walk, tx, ty, size)

    def place_building(self, kind: str, team: int, tx: int, ty: int):
        cost = COSTS[kind]
        if not self.can_afford(team, cost):
            return None
        size = STATS[kind]["size"]
        if not self.can_place_at(tx, ty, size):
            return None
        self.pay(team, cost)
        b = Building(kind, team, tx, ty)
        b.built = 0
        b.hp = STATS[kind]["hp"] * 0.15
        self.buildings.append(b)
        self.rebuild_walk()
        serfs = [u for u in self.units if u.team == team and u.kind == "serf" and u.hp > 0]
        if team == PLAYER:
            chosen = [u for u in serfs if u.selected] or serfs[:2]
        else:
            chosen = serfs[:2]
        self.command_build(chosen, b)
        return b

    def selected_units(self):
        return [u for u in self.units if u.selected and u.hp > 0]

    def selected_buildings(self):
        return [b for b in self.buildings if b.selected and b.hp > 0]

    def selected_villages(self):
        return [v for v in self.villages if v.selected]

    def clear_selection(self):
        for u in self.units:
            u.selected = False
        for b in self.buildings:
            b.selected = False
        for v in self.villages:
            v.selected = False

    def select_in_box(self, x0, y0, x1, y1, team=PLAYER):
        minx, maxx = min(x0, x1), max(x0, x1)
        miny, maxy = min(y0, y1), max(y0, y1)
        self.clear_selection()
        any_u = False
        for u in self.units:
            if u.team != team or u.hp <= 0:
                continue
            if minx <= u.x <= maxx and miny <= u.y <= maxy:
                u.selected = True
                any_u = True
        if not any_u:
            for b in self.buildings:
                if b.team == team and b.hp > 0 and minx <= b.x <= maxx and miny <= b.y <= maxy:
                    b.selected = True
                    break

    def select_at(self, wx, wy, team=PLAYER):
        self.clear_selection()
        u = self.unit_at(wx, wy, team)
        if u:
            u.selected = True
            return u
        b = self.building_at(wx, wy)
        if b and b.team == team:
            b.selected = True
            return b
        v = self.village_at(wx, wy)
        if v:
            v.selected = True
            return v
        return None

    def village_at(self, wx, wy):
        for v in self.villages:
            half = (v.size * TILE) / 2
            if abs(wx - v.x) <= half and abs(wy - v.y) <= half:
                return v
        return None

    def unit_at(self, wx, wy, team=None):
        best, best_d = None, 18
        for u in self.units:
            if u.hp <= 0:
                continue
            if team is not None and u.team != team:
                continue
            d = hypot(u.x - wx, u.y - wy)
            if d < best_d:
                best, best_d = u, d
        return best

    def building_at(self, wx, wy):
        for b in reversed(self.buildings):
            if b.hp <= 0:
                continue
            half = (b.size * TILE) / 2
            if abs(wx - b.x) <= half and abs(wy - b.y) <= half:
                return b
        return None

    def resource_at(self, wx, wy):
        tx, ty = int(wx // TILE), int(wy // TILE)
        best, best_d = None, 2.2
        for n in self.map.resources:
            if n.amount <= 0:
                continue
            d = hypot(n.x + 0.5 - tx, n.y + 0.5 - ty)
            if d < best_d:
                best, best_d = n, d
        return best

    def command_move(self, units, x, y):
        for i, u in enumerate(units):
            ox = x + (i % 5) * 14 - 28
            oy = y + (i // 5) * 14
            u.task = {"type": "walk"}
            u.path = self.path_for(u, ox, oy)

    def command_attack(self, units, target):
        for u in units:
            u.task = {"type": "attack", "target_id": target.id, "target_type": target.type}
            u.path = []

    def command_infiltrate(self, units, village):
        for u in units:
            u.task = {"type": "infiltrate", "target_id": village.id, "target_type": "village"}
            u.path = self.path_for(u, village.x, village.y)

    def command_gather(self, units, node):
        for u in units:
            if u.kind != "serf":
                continue
            u.task = {"type": "gather", "node": node}
            u.path = self.path_for(u, (node.x + 0.5) * TILE, (node.y + 0.5) * TILE)

    def command_build(self, units, building):
        for u in units:
            if u.kind != "serf":
                continue
            u.task = {"type": "build", "target_id": building.id}
            u.path = self.path_for(u, building.x, building.y)

    def command_train(self, kind: str, team: int = PLAYER):
        buildings = self.selected_buildings() if team == PLAYER else []
        if team != PLAYER:
            buildings = [b for b in self.buildings if b.team == team and b.built >= 1]
        if not buildings:
            return
        b = buildings[0]
        allowed = kind in TRAIN_FROM.get(b.kind, ())
        if team != PLAYER or not allowed:
            home = next(
                (
                    x
                    for x in self.buildings
                    if x.team == team and x.built >= 1 and x.hp > 0 and kind in TRAIN_FROM.get(x.kind, ())
                ),
                None,
            )
            if home:
                b = home
                allowed = True
        if not allowed:
            if team == PLAYER:
                self.toast("Select the building that trains that levy.")
            return
        if not self.can_afford(team, COSTS[kind]):
            if team == PLAYER:
                self.toast("Not enough resources.")
            return
        if self.used_pop(team) + 1 > self.pop_cap(team):
            if team == PLAYER:
                self.toast("Raise cottages. Population is capped.")
            return
        if len(b.queue) >= 5:
            if team == PLAYER:
                self.toast("Training queue is full.")
            return
        self.pay(team, COSTS[kind])
        b.queue.append({"kind": kind, "t": 0.0, "need": BUILD_TIME[kind]})

    def path_for(self, u, x, y):
        sx, sy = tile_of(u)
        tx = max(0, min(MAP_W - 1, int(x // TILE)))
        ty = max(0, min(MAP_H - 1, int(y // TILE)))
        if not self.walk[ty * MAP_W + tx]:
            n = self.nearest_walkable(tx, ty)
            if not n:
                return []
            tx, ty = n
        path = astar(self.walk, MAP_W, MAP_H, sx, sy, tx, ty)
        return [((p[0] + 0.5) * TILE, (p[1] + 0.5) * TILE) for p in path[1:]]

    def nearest_walkable(self, tx, ty):
        for r in range(1, 9):
            for y in range(ty - r, ty + r + 1):
                for x in range(tx - r, tx + r + 1):
                    if 0 <= x < MAP_W and 0 <= y < MAP_H and self.walk[y * MAP_W + x]:
                        return x, y
        return None

    def toast(self, text: str):
        self.msg = text
        self.msg_t = 3.2

    def update(self, dt: float):
        if self.outcome:
            return
        self.time += dt
        if self.msg_t > 0:
            self.msg_t -= dt
        self.rebuild_walk()
        self.update_visibility()
        self.update_buildings(dt)
        self.update_villages(dt)
        self.update_units(dt)
        self.update_projectiles(dt)
        from .ai import update_all_ai

        update_all_ai(self, dt)
        self.units = [u for u in self.units if u.hp > 0]
        self.buildings = [b for b in self.buildings if b.hp > 0]
        self.check_victory()

    def update_buildings(self, dt):
        for b in self.buildings:
            if b.hp <= 0 or b.built < 1:
                continue
            if b.kind == "tower":
                self.tower_fire(b, dt)
            self.building_income(b, dt)
            if not b.queue:
                continue
            q = b.queue[0]
            q["t"] += dt
            if q["t"] >= q["need"]:
                if self.used_pop(b.team) >= self.pop_cap(b.team):
                    q["t"] = q["need"]
                    continue
                b.queue.pop(0)
                self.units.append(Unit(q["kind"], b.team, b.x, b.y + (b.size * TILE) / 2 + 12))
                if b.team == PLAYER:
                    from .config import LABELS

                    self.toast(f"{LABELS[q['kind']]} trained.")

    def has_building(self, team, kind):
        return any(b.team == team and b.kind == kind and b.hp > 0 and b.built >= 1 for b in self.buildings)

    def building_income(self, b, dt):
        p = self.players[b.team]
        if b.kind == "farm":
            p["food"] += 2.2 * dt
        elif b.kind == "tavern":
            p["gold"] += 1.1 * dt
        elif b.kind == "market":
            p["gold"] += 0.8 * dt
        elif b.kind == "temple" and self.has_building(b.team, "academy"):
            p["gold"] += 0.4 * dt

    def update_villages(self, dt):
        from .config import CASTLE_INFLUENCE, CASTLE_LOYALTY_RATE, SUBMIT_LOYALTY, VILLAGE_KINDS

        for v in self.villages:
            v.hp = v.protection
            if v.protection < v.max_protection:
                v.protection = min(v.max_protection, v.protection + 1.2 * dt)
            self.castle_pull(v, dt, CASTLE_INFLUENCE, CASTLE_LOYALTY_RATE)
            if v.owner >= 0:
                spec = VILLAGE_KINDS[v.kind]["tribute"]
                rate = 0.35 + v.loyalty / 200.0
                p = self.players[v.owner]
                p["food"] += spec["food"] * rate * dt
                p["wood"] += spec["wood"] * rate * dt
                p["gold"] += spec["gold"] * rate * dt
            if v.owner < 0 and v.loyalty >= SUBMIT_LOYALTY:
                # spy or keep already set pending_owner?
                puller = self.strongest_influence(v, CASTLE_INFLUENCE)
                if puller is not None:
                    self.submit_village(v, puller, "influence")

    def castle_pull(self, v, dt, radius, rate):
        best_team, best = None, 0.0
        for b in self.buildings:
            if b.hp <= 0 or b.built < 1 or b.kind not in ("hall", "keep", "tower"):
                continue
            d = dist_tiles(v, b)
            if d > radius:
                continue
            strength = (radius - d) / radius
            if b.kind == "keep":
                strength *= 1.8
            elif b.kind == "hall":
                strength *= 0.55
            if strength > best:
                best, best_team = strength, b.team
        if best_team is None:
            return
        if v.owner == best_team:
            v.loyalty = min(100, v.loyalty + rate * best * dt)
        elif v.owner < 0:
            v.loyalty = min(100, v.loyalty + rate * best * dt)
            if v.loyalty >= 72:
                self.submit_village(v, best_team, "castle")
        else:
            v.loyalty = max(0, v.loyalty - rate * best * 0.7 * dt)
            if v.loyalty <= 8:
                v.owner = -1
                if best_team == PLAYER:
                    self.toast(f"{v.name} slips from its lord.")

    def strongest_influence(self, v, radius):
        best_team, best = None, 0.0
        for b in self.buildings:
            if b.hp <= 0 or b.kind not in ("hall", "keep", "tower"):
                continue
            d = dist_tiles(v, b)
            if d > radius:
                continue
            s = (radius - d) / radius
            if s > best:
                best, best_team = s, b.team
        return best_team

    def pillage_village(self, u, v):
        v.protection = max(0, v.protection - u.dmg)
        stolen = min(4, v.stores.get("gold", 0))
        if stolen:
            v.stores["gold"] -= stolen
            self.players[u.team]["gold"] += stolen * 0.4
        v.loyalty = max(0, v.loyalty - 2.5)
        if v.protection <= 0:
            self.submit_village(v, u.team, "pillage")

    def submit_village(self, v, team, how):
        if v.owner == team:
            v.protection = max(v.protection, v.max_protection * 0.35)
            return
        v.owner = team
        v.loyalty = 55 if how == "pillage" else 68
        v.protection = v.max_protection * 0.45
        from .config import FACTION, LABELS

        who = FACTION[team]["name"]
        if team == PLAYER:
            word = {"pillage": "falls after the sack", "castle": "bows to your nearby keep", "influence": "comes over", "spy": "is turned by your spy"}.get(how, "submits")
            self.toast(f"{v.name} {word}.")

    def do_infiltrate(self, u, dt):
        from .config import SPY_LOYALTY_RATE, SUBMIT_LOYALTY

        v = self.find_target(u.task)
        if not v:
            u.task = {"type": "idle"}
            return
        if not in_range(u, v, 2.2):
            if not u.path:
                u.path = self.path_for(u, v.x, v.y)
            self.follow_path(u, dt)
            return
        u.path = []
        v.spies[u.team] = v.spies.get(u.team, 0) + dt
        if v.owner == u.team:
            v.loyalty = min(100, v.loyalty + SPY_LOYALTY_RATE * dt * 0.4)
        else:
            v.loyalty = min(100, v.loyalty + SPY_LOYALTY_RATE * dt)
            v.protection = max(0, v.protection - 0.8 * dt)
            if v.loyalty >= SUBMIT_LOYALTY:
                self.submit_village(v, u.team, "spy")

    def tower_fire(self, b, dt):
        b.cooldown -= dt
        if b.cooldown > 0:
            return
        tgt = self.closest_enemy(b, STATS["tower"]["range"], b.team)
        if not tgt:
            return
        b.cooldown = STATS["tower"]["cooldown"]
        self.projectiles.append(
            {"x": b.x, "y": b.y - 18, "target_id": tgt.id, "dmg": STATS["tower"]["dmg"], "dead": False}
        )

    def update_units(self, dt):
        for u in self.units:
            if u.hp <= 0:
                continue
            u.anim += dt * (8 if u.path else 3)
            u.cooldown = max(0, u.cooldown - dt)
            t = u.task["type"]
            if t == "walk":
                if not self.follow_path(u, dt):
                    u.task = {"type": "idle"}
            elif t == "attack":
                self.do_attack(u, dt)
            elif t == "gather":
                self.do_gather(u, dt)
            elif t == "build":
                self.do_build(u, dt)
            elif t == "return":
                self.do_return(u, dt)
            elif t == "infiltrate":
                self.do_infiltrate(u, dt)
            else:
                self.auto_defend(u)

    def follow_path(self, u, dt) -> bool:
        if not u.path:
            return False
        px, py = u.path[0]
        dx, dy = px - u.x, py - u.y
        d = hypot(dx, dy)
        if d < 4:
            u.path.pop(0)
            return bool(u.path)
        step = u.speed * dt
        u.x += dx / d * step
        u.y += dy / d * step
        u.facing = 1 if dx >= 0 else -1
        return True

    def do_attack(self, u, dt):
        t = self.find_target(u.task)
        if not t or t.hp <= 0:
            u.task = {"type": "idle"}
            return
        if not in_range(u, t, u.range):
            if not u.path:
                u.path = self.path_for(u, t.x, t.y)
            self.follow_path(u, dt)
            return
        u.path = []
        if u.cooldown > 0:
            return
        u.cooldown = u.max_cooldown
        if getattr(t, "type", None) == "village":
            self.pillage_village(u, t)
            return
        dmg = u.dmg
        if u.kind in ("footman", "knight") and self.has_building(u.team, "forge"):
            dmg += 3
        if u.kind == "bowman" and self.has_building(u.team, "archery") and self.has_building(u.team, "forge"):
            dmg += 2
        if u.range > 1.5:
            self.projectiles.append({"x": u.x, "y": u.y - 8, "target_id": t.id, "dmg": dmg, "dead": False})
        else:
            self.damage(t, dmg)

    def do_gather(self, u, dt):
        node = u.task.get("node")
        if not node or node.amount <= 0:
            n = self.nearest_resource(u, u.carry_kind)
            if n:
                u.task = {"type": "gather", "node": n}
                u.path = self.path_for(u, (n.x + 0.5) * TILE, (n.y + 0.5) * TILE)
            else:
                u.task = {"type": "idle"}
            return
        if u.carry_amount >= GATHER_CAP:
            u.task = {"type": "return", "resume": node}
            u.path = []
            return
        nx, ny = (node.x + 0.5) * TILE, (node.y + 0.5) * TILE
        if hypot(u.x - nx, u.y - ny) > 28:
            if not u.path:
                u.path = self.path_for(u, nx, ny)
            self.follow_path(u, dt)
            return
        u.path = []
        if u.cooldown > 0:
            return
        u.cooldown = 0.85
        take = min(u.gather_rate, node.amount, GATHER_CAP - u.carry_amount)
        node.amount -= take
        kind = {"tree": "wood", "gold": "gold", "berry": "food"}[node.kind]
        u.carry_kind = kind
        u.carry_amount += take

    def do_return(self, u, dt):
        drop = self.nearest_drop(u)
        if not drop:
            u.task = {"type": "idle"}
            return
        if dist(u, drop) > 46:
            if not u.path:
                u.path = self.path_for(u, drop.x, drop.y)
            self.follow_path(u, dt)
            return
        if u.carry_kind and u.carry_amount:
            self.players[u.team][u.carry_kind] += u.carry_amount
            self.floaters.append(
                {"x": u.x, "y": u.y - 20, "text": f"+{int(u.carry_amount)} {u.carry_kind}", "t": 0.0}
            )
        u.carry_amount = 0
        u.carry_kind = None
        resume = u.task.get("resume")
        if resume and resume.amount > 0:
            u.task = {"type": "gather", "node": resume}
            u.path = self.path_for(u, (resume.x + 0.5) * TILE, (resume.y + 0.5) * TILE)
        else:
            u.task = {"type": "idle"}

    def do_build(self, u, dt):
        b = next((x for x in self.buildings if x.id == u.task.get("target_id")), None)
        if not b or b.hp <= 0 or b.built >= 1:
            u.task = {"type": "idle"}
            return
        if dist(u, b) > 46:
            if not u.path:
                u.path = self.path_for(u, b.x, b.y)
            self.follow_path(u, dt)
            return
        u.path = []
        b.built = min(1.0, b.built + dt / BUILD_TIME[b.kind])
        b.hp = min(b.max_hp, b.hp + (b.max_hp * dt) / BUILD_TIME[b.kind])

    def auto_defend(self, u):
        if u.kind == "serf":
            return
        t = self.closest_enemy(u, 5, u.team)
        if t:
            u.task = {"type": "attack", "target_id": t.id, "target_type": t.type}

    def find_target(self, task):
        tid = task.get("target_id")
        if task.get("target_type") == "unit":
            return next((u for u in self.units if u.id == tid), None)
        if task.get("target_type") == "village":
            return next((v for v in self.villages if v.id == tid), None)
        return next((b for b in self.buildings if b.id == tid), None)

    def closest_enemy(self, frm, rng, team):
        best, best_d = None, rng
        for u in self.units:
            if u.hp <= 0 or u.team == team:
                continue
            d = dist_tiles(frm, u)
            if d < best_d:
                best, best_d = u, d
        for b in self.buildings:
            if b.hp <= 0 or b.team == team:
                continue
            d = dist_tiles(frm, b)
            if d < best_d:
                best, best_d = b, d
        return best

    def nearest_resource(self, u, prefer):
        best, best_d = None, 1e18
        fallback = None
        fallback_d = 1e18
        for n in self.map.resources:
            if n.amount <= 0:
                continue
            kind = {"tree": "wood", "gold": "gold", "berry": "food"}[n.kind]
            d = (n.x * TILE - u.x) ** 2 + (n.y * TILE - u.y) ** 2
            if d < fallback_d:
                fallback, fallback_d = n, d
            if prefer and kind != prefer:
                continue
            if d < best_d:
                best, best_d = n, d
        return best or fallback

    def nearest_drop(self, u):
        best, best_d = None, 1e18
        for b in self.buildings:
            if b.team != u.team or b.hp <= 0 or b.built < 1:
                continue
            if b.kind not in DROP_OFF:
                continue
            d = dist(u, b)
            if d < best_d:
                best, best_d = b, d
        return best

    def damage(self, t, amt):
        t.hp -= amt
        if t.hp <= 0:
            t.hp = 0
            if t.type == "building":
                self.rebuild_walk()

    def update_projectiles(self, dt):
        for p in self.projectiles:
            p["t"] = p.get("t", 0) + dt
            target = next((u for u in self.units if u.id == p["target_id"]), None)
            if not target:
                target = next((b for b in self.buildings if b.id == p["target_id"]), None)
            if not target:
                p["dead"] = True
                continue
            dx, dy = target.x - p["x"], target.y - p["y"]
            d = hypot(dx, dy) or 1
            spd = 420 * dt
            if d <= spd:
                p["dead"] = True
                if target.hp > 0:
                    self.damage(target, p["dmg"])
            else:
                p["x"] += dx / d * spd
                p["y"] += dy / d * spd
        self.projectiles = [p for p in self.projectiles if not p["dead"]]
        for f in self.floaters:
            f["t"] += dt
        self.floaters = [f for f in self.floaters if f["t"] < 1.2]

    def living_teams(self):
        return sorted({b.team for b in self.buildings if b.kind in ("hall", "keep") and b.hp > 0})

    def check_victory(self):
        living = self.living_teams()
        for i, p in enumerate(self.players):
            p["alive"] = i in living
        if PLAYER not in living:
            self.outcome = "defeat"
        elif living == [PLAYER]:
            self.outcome = "victory"

    def update_visibility(self):
        for vis in self.visible:
            vis[:] = b"\x00" * len(vis)

        def mark(team, x, y, sight):
            vis, seen = self.visible[team], self.seen[team]
            tx, ty = int(x // TILE), int(y // TILE)
            r = sight
            for j in range(ty - r, ty + r + 1):
                for i in range(tx - r, tx + r + 1):
                    if 0 <= i < MAP_W and 0 <= j < MAP_H and (i - tx) ** 2 + (j - ty) ** 2 <= r * r:
                        idx = j * MAP_W + i
                        vis[idx] = 1
                        seen[idx] = 1

        for u in self.units:
            if u.hp > 0:
                mark(u.team, u.x, u.y, u.sight)
        for b in self.buildings:
            if b.hp > 0:
                mark(b.team, b.x, b.y, b.sight)
        for v in self.villages:
            if v.owner >= 0:
                mark(v.owner, v.x, v.y, 6)

    def right_click(self, wx, wy, team=PLAYER):
        units = [u for u in self.selected_units() if u.team == team]
        if not units:
            return
        enemy_u = self.unit_at(wx, wy)
        if enemy_u and enemy_u.team != team:
            self.command_attack(units, enemy_u)
            return
        v = self.village_at(wx, wy)
        if v and v.owner != team:
            spies = [u for u in units if u.kind == "spy"]
            rest = [u for u in units if u.kind != "spy"]
            if spies:
                self.command_infiltrate(spies, v)
            if rest:
                self.command_attack(rest, v)
            return
        b = self.building_at(wx, wy)
        if b and b.team != team:
            self.command_attack(units, b)
            return
        if b and b.team == team and b.built < 1:
            self.command_build(units, b)
            return
        node = self.resource_at(wx, wy)
        if node and any(u.kind == "serf" for u in units):
            self.command_gather(units, node)
            return
        self.command_move(units, wx, wy)
