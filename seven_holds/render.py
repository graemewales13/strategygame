from math import sin

import pygame

from .config import (
    DIRT,
    FACTION,
    GRASS,
    HUD_H,
    LABELS,
    MAP_H,
    MAP_W,
    PLAYER,
    TILE,
    TOP_H,
    WATER,
    WIN_H,
    WIN_W,
)


INK = (232, 221, 196)
DIM = (154, 141, 114)
PANEL = (12, 14, 18)
LINE = (58, 50, 36)
GOLD = (212, 180, 74)


def draw_world(surf, game, drag=None):
    camx, camy = game.cam
    w, h = surf.get_size()
    surf.fill((11, 13, 17))
    x0 = max(0, int(camx // TILE))
    y0 = max(0, int(camy // TILE))
    x1 = min(MAP_W, int((camx + w) // TILE) + 2)
    y1 = min(MAP_H, int((camy + h) // TILE) + 2)
    vis = game.visible[PLAYER]
    seen = game.seen[PLAYER]

    for y in range(y0, y1):
        for x in range(x0, x1):
            idx = y * MAP_W + x
            if not seen[idx]:
                continue
            sx, sy = x * TILE - camx, y * TILE - camy
            t = game.map.tiles[idx]
            if t == 2:
                col = WATER[(x + y) & 1]
            elif t == 1:
                col = DIRT
            else:
                col = GRASS[(x * 13 + y * 7) & 3]
            pygame.draw.rect(surf, col, (sx, sy, TILE, TILE))
            if not vis[idx]:
                overlay = pygame.Surface((TILE, TILE), pygame.SRCALPHA)
                overlay.fill((8, 10, 14, 184))
                surf.blit(overlay, (sx, sy))

    for n in game.map.resources:
        if n.amount <= 0:
            continue
        idx = n.y * MAP_W + n.x
        if not seen[idx]:
            continue
        x, y = n.x * TILE - camx, n.y * TILE - camy
        if n.kind == "tree":
            pygame.draw.polygon(surf, (28, 59, 26) if vis[idx] else (21, 38, 22), [(x + 16, y + 4), (x + 28, y + 24), (x + 4, y + 24)])
            pygame.draw.rect(surf, (90, 58, 28), (x + 14, y + 24, 4, 6))
        elif n.kind == "gold":
            pygame.draw.polygon(surf, (212, 180, 74) if vis[idx] else (122, 106, 48), [(x + 16, y + 8), (x + 26, y + 22), (x + 6, y + 22)])
        else:
            pygame.draw.circle(surf, (138, 47, 74) if vis[idx] else (74, 34, 48), (x + 16, y + 18), 8)

    for b in game.buildings:
        tx, ty = int(b.x // TILE), int(b.y // TILE)
        idx = max(0, min(len(seen) - 1, ty * MAP_W + tx))
        if not seen[idx]:
            continue
        half = (b.size * TILE) / 2
        x, y = b.x - half - camx, b.y - half - camy
        f = FACTION[b.team]
        body = pygame.Surface((int(half * 2), int(half * 2)), pygame.SRCALPHA)
        alpha = 115 if not vis[idx] else 255
        pygame.draw.rect(body, (*f["dark"], alpha), (4, 8, half * 2 - 8, half * 2 - 10))
        pygame.draw.rect(body, (*f["primary"], alpha), (6, 6, half * 2 - 12, 14))
        if b.kind == "hall":
            pygame.draw.rect(body, (180, 150, 90, alpha), (10, 22, half * 2 - 20, 16))
        if b.kind == "keep":
            pygame.draw.rect(body, (207, 198, 176, alpha), (10, 22, 18, half * 2 - 32))
            pygame.draw.rect(body, (207, 198, 176, alpha), (half * 2 - 28, 22, 18, half * 2 - 32))
            pygame.draw.rect(body, (*f["accent"], alpha), (half - 4, 0, 6, 16))
        if b.kind == "tower":
            pygame.draw.rect(body, (207, 198, 176, alpha), (half - 8, 0, 16, 16))
        if b.kind == "farm":
            pygame.draw.rect(body, (120, 140, 60, alpha), (8, 24, half * 2 - 16, 10))
        if b.kind == "tavern":
            pygame.draw.rect(body, (160, 70, 50, alpha), (half - 6, 16, 12, 10))
        if b.kind == "academy":
            pygame.draw.polygon(body, (220, 210, 180, alpha), [(half, 2), (half + 10, 16), (half - 10, 16)])
        if b.kind == "forge":
            pygame.draw.rect(body, (40, 40, 40, alpha), (10, 22, 14, 12))
        if b.kind == "market":
            pygame.draw.rect(body, (200, 170, 70, alpha), (8, 18, half * 2 - 16, 8))
        if b.kind == "stable":
            pygame.draw.rect(body, (90, 70, 40, alpha), (8, 26, half * 2 - 16, 8))
        if b.kind == "workshop":
            pygame.draw.rect(body, (70, 70, 80, alpha), (12, 20, 16, 14))
        if b.kind == "temple":
            pygame.draw.rect(body, (230, 220, 190, alpha), (half - 3, 4, 6, 16))
        if b.kind == "archery":
            pygame.draw.rect(body, (50, 80, 50, alpha), (half * 2 - 16, 20, 6, 16))
        if b.kind == "warehouse":
            pygame.draw.rect(body, (140, 110, 60, alpha), (8, 20, half * 2 - 16, 16))
        surf.blit(body, (x, y))
        if b.built < 1:
            pygame.draw.rect(surf, (20, 16, 12), (x + 6, y + half * 2 - 12, half * 2 - 12, 6))
            pygame.draw.rect(surf, GOLD, (x + 6, y + half * 2 - 12, (half * 2 - 12) * b.built, 6))
        if b.selected:
            pygame.draw.rect(surf, INK, (x - 2, y - 2, half * 2 + 4, half * 2 + 4), 2)
        _hp(surf, x, y - 6, half * 2, b.hp / b.max_hp)

    for v in game.villages:
        tx, ty = int(v.x // TILE), int(v.y // TILE)
        idx = max(0, min(len(seen) - 1, ty * MAP_W + tx))
        if not seen[idx]:
            continue
        half = (v.size * TILE) / 2
        x, y = v.x - half - camx, v.y - half - camy
        col = FACTION[v.owner]["primary"] if v.owner >= 0 else (148, 132, 96)
        pygame.draw.rect(surf, (40, 34, 24), (x + 4, y + 10, half * 2 - 8, half * 2 - 14))
        pygame.draw.rect(surf, col, (x + 6, y + 8, half * 2 - 12, 12))
        pygame.draw.rect(surf, (90, 78, 52), (x + 10, y + 24, 12, 16))
        pygame.draw.rect(surf, (70, 62, 42), (x + half, y + 22, 16, 18))
        _hp(surf, x, y - 8, half * 2, v.protection / max(1, v.max_protection))
        pygame.draw.rect(surf, (20, 16, 12), (x, y - 2, half * 2, 4))
        pygame.draw.rect(surf, (90, 140, 200), (x, y - 2, half * 2 * (v.loyalty / 100), 4))
        if v.selected:
            pygame.draw.rect(surf, INK, (x - 2, y - 2, half * 2 + 4, half * 2 + 4), 2)

    for u in game.units:
        tx, ty = int(u.x // TILE), int(u.y // TILE)
        if not (0 <= tx < MAP_W and 0 <= ty < MAP_H):
            continue
        if not vis[ty * MAP_W + tx] and u.team != PLAYER:
            continue
        if not seen[ty * MAP_W + tx]:
            continue
        x, y = u.x - camx, u.y - camy
        f = FACTION[u.team]
        bob = sin(u.anim) * 1.2
        pygame.draw.ellipse(surf, (0, 0, 0, 80), (x - 8, y + 6, 16, 8))
        pygame.draw.circle(surf, f["primary"], (int(x), int(y - 2 + bob)), 7 if u.kind == "serf" else 8)
        pygame.draw.rect(surf, f["accent"], (x - 2, y - 12 + bob, 4, 5))
        if u.kind == "footman":
            pygame.draw.rect(surf, (200, 196, 184), (x + 6 * u.facing, y - 8, 3, 12))
        if u.carry_amount > 0:
            col = {"gold": GOLD, "wood": (107, 62, 24), "food": (138, 47, 74)}.get(u.carry_kind, INK)
            pygame.draw.rect(surf, col, (x - 10, y + 2, 6, 6))
        if u.selected:
            pygame.draw.ellipse(surf, INK, (x - 11, y + 6, 22, 10), 1)
        if u.hp < u.max_hp:
            _hp(surf, x - 10, y - 18, 20, u.hp / u.max_hp)

    for p in game.projectiles:
        pygame.draw.circle(surf, (243, 226, 160), (int(p["x"] - camx), int(p["y"] - camy)), 3)

    font = pygame.font.SysFont("serif", 14)
    for f in game.floaters:
        img = font.render(f["text"], True, INK)
        img.set_alpha(int(255 * (1 - f["t"] / 1.2)))
        surf.blit(img, (f["x"] - camx - img.get_width() / 2, f["y"] - camy - f["t"] * 24))

    if game.placing:
        from .config import STATS

        s = STATS[game.placing]["size"]
        tx, ty = game.placing_tx, game.placing_ty
        ok = game.can_place_at(tx, ty, s)
        ghost = pygame.Surface((s * TILE, s * TILE), pygame.SRCALPHA)
        ghost.fill((90, 180, 90, 90) if ok else (180, 60, 60, 90))
        surf.blit(ghost, (tx * TILE - camx, ty * TILE - camy))

    if drag:
        x = min(drag[0], drag[2])
        y = min(drag[1], drag[3])
        rw, rh = abs(drag[2] - drag[0]), abs(drag[3] - drag[1])
        box = pygame.Surface((max(1, rw), max(1, rh)), pygame.SRCALPHA)
        box.fill((242, 230, 194, 30))
        surf.blit(box, (x, y))
        pygame.draw.rect(surf, INK, (x, y, rw, rh), 1)


def draw_minimap(surf, game, view_w, view_h):
    w, h = surf.get_size()
    surf.fill((18, 21, 28))
    sx, sy = w / MAP_W, h / MAP_H
    seen, vis = game.seen[PLAYER], game.visible[PLAYER]
    for y in range(MAP_H):
        for x in range(MAP_W):
            idx = y * MAP_W + x
            if not seen[idx]:
                continue
            t = game.map.tiles[idx]
            col = (27, 58, 74) if t == 2 else ((61, 90, 50) if vis[idx] else (36, 52, 40))
            pygame.draw.rect(surf, col, (x * sx, y * sy, sx + 0.5, sy + 0.5))
    for b in game.buildings:
        pygame.draw.rect(surf, FACTION[b.team]["accent"], (b.tx * sx, b.ty * sy, b.size * sx, b.size * sy))
    for v in game.villages:
        col = FACTION[v.owner]["accent"] if v.owner >= 0 else (170, 150, 110)
        pygame.draw.rect(surf, col, (v.tx * sx, v.ty * sy, v.size * sx, v.size * sy))
    for u in game.units:
        tx, ty = int(u.x // TILE), int(u.y // TILE)
        if 0 <= tx < MAP_W and 0 <= ty < MAP_H:
            if vis[ty * MAP_W + tx] or u.team == PLAYER:
                pygame.draw.rect(surf, FACTION[u.team]["primary"], (tx * sx, ty * sy, 2, 2))
    pygame.draw.rect(
        surf,
        INK,
        (
            (game.cam[0] / TILE) * sx,
            (game.cam[1] / TILE) * sy,
            (view_w / TILE) * sx,
            (view_h / TILE) * sy,
        ),
        1,
    )


def draw_hud(screen, game, fonts):
    w, h = screen.get_size()
    pygame.draw.rect(screen, PANEL, (0, 0, w, TOP_H))
    pygame.draw.line(screen, LINE, (0, TOP_H), (w, TOP_H))
    pygame.draw.rect(screen, PANEL, (0, h - HUD_H, w, HUD_H))
    pygame.draw.line(screen, LINE, (0, h - HUD_H), (w, h - HUD_H))
    title, body, small = fonts
    p = game.players[PLAYER]
    screen.blit(title.render("Seven Holds", True, INK), (16, 12))
    stats = f"Grain  {int(p['food'])}     Timber  {int(p['wood'])}     Coin  {int(p['gold'])}     Banners  {game.used_pop(PLAYER)} / {game.pop_cap(PLAYER)}"
    houses = "   ".join(
        f"{FACTION[i]['color_name']} {game.players[i]['name'].split()[-1]}"
        + ("" if game.players[i].get("alive", True) else " (fallen)")
        for i in range(game.n_teams)
    )
    screen.blit(body.render(stats, True, INK), (240, 16))
    screen.blit(small.render(houses + "   F3 teams", True, DIM), (240, 32))
    m, s = divmod(int(game.time), 60)
    screen.blit(body.render(f"{m}:{s:02d}", True, DIM), (w - 80, 16))
    if game.msg_t > 0:
        img = title.render(game.msg, True, INK)
        screen.blit(img, (w / 2 - img.get_width() / 2, TOP_H + 12))
    sel = (game.selected_units() + game.selected_buildings() + game.selected_villages())
    text = "No banner selected."
    if sel:
        e = sel[0]
        extra = ""
        if getattr(e, "type", "") == "village":
            lord = FACTION[e.owner]["name"] if e.owner >= 0 else "independent"
            folk = ", ".join(e.folk)
            extra = f"  · {lord}  loyalty {int(e.loyalty)}  protection {int(e.protection)}/{int(e.max_protection)}  folk: {folk}"
            text = f"{e.name}{extra}"
        else:
            if getattr(e, "queue", None):
                extra = f"  · training {LABELS[e.queue[0]['kind']]}" if e.queue else ""
            elif getattr(e, "task", None):
                extra = f"  · {e.task['type']}"
            text = f"{LABELS.get(e.kind, e.kind)}  {int(e.hp)}/{int(e.max_hp)}{extra}"
    screen.blit(body.render(text, True, DIM), (190, h - HUD_H + 12))
    help_l = [
        "Place 1 cottage 2 farm 3 mill 4 warehouse 5 market 6 forge 7 workshop 8 tavern 9 academy 0 temple  C keep  B barracks  Y archery  L stable  T tower",
        "Train Q E F R K I U J-ram   · H hall  M/Tab map  Esc pause  N new valley  F3 houses",
    ]
    screen.blit(small.render(help_l[0], True, DIM), (190, h - HUD_H + 48))
    screen.blit(small.render(help_l[1], True, DIM), (190, h - HUD_H + 70))

    if game.outcome:
        veil = pygame.Surface((w, h), pygame.SRCALPHA)
        veil.fill((8, 10, 14, 200))
        screen.blit(veil, (0, 0))
        title_t = "The other keeps are ash." if game.outcome == "victory" else "Your keep has fallen."
        living = ", ".join(game.players[i]["name"] for i in game.living_teams()) or "none"
        sub = (
            "House Calder holds the valley."
            if game.outcome == "victory"
            else f"The field belongs to {living}."
        )
        t1 = title.render(title_t, True, GOLD)
        t2 = body.render(sub + "   Press N for a new valley.", True, INK)
        screen.blit(t1, (w / 2 - t1.get_width() / 2, h / 2 - 30))
        screen.blit(t2, (w / 2 - t2.get_width() / 2, h / 2 + 10))


def _hp(surf, x, y, w, r):
    pygame.draw.rect(surf, (26, 18, 12), (x, y, w, 4))
    col = (109, 191, 106) if r > 0.45 else ((212, 180, 74) if r > 0.2 else (204, 68, 68))
    pygame.draw.rect(surf, col, (x, y, w * max(0, r), 4))
