from __future__ import annotations

import pygame

from .config import FACTION, MAP_H, MAP_W, PLAYER, TILE, WIN_H, WIN_W


INK = (232, 221, 196)
DIM = (154, 141, 114)
GOLD = (212, 180, 74)
PANEL = (16, 18, 22)
LINE = (58, 50, 36)


def _panel(screen, fonts):
    screen.fill((8, 10, 14))
    pygame.draw.rect(screen, PANEL, (80, 50, WIN_W - 160, WIN_H - 100))
    pygame.draw.rect(screen, LINE, (80, 50, WIN_W - 160, WIN_H - 100), 2)
    title, body, small = fonts
    return title, body, small


def draw_menu(screen, game, fonts):
    title, body, small = _panel(screen, fonts)
    screen.blit(title.render("Seven Holds", True, GOLD), (120, 80))
    screen.blit(body.render("A small hall. A wide valley. Rule it.", True, DIM), (120, 118))
    items = [
        ("Enter", "Begin / resume the valley"),
        ("3 / 4 / 5", f"Houses in this match  ({game.n_teams} now)"),
        ("N", "Roll a new valley"),
        ("M  or  Tab", "Campaign map"),
        ("Esc", "Pause once the match has begun"),
        ("Q", "Quit"),
    ]
    y = 180
    for key, label in items:
        screen.blit(body.render(key, True, GOLD), (140, y))
        screen.blit(body.render(label, True, INK), (320, y))
        y += 36
    houses = "    ".join(f"{FACTION[i]['color_name']} {FACTION[i]['name']}" for i in range(game.n_teams))
    screen.blit(small.render(houses, True, DIM), (120, WIN_H - 90))


def draw_pause(screen, game, fonts):
    veil = pygame.Surface((WIN_W, WIN_H), pygame.SRCALPHA)
    veil.fill((8, 10, 14, 210))
    screen.blit(veil, (0, 0))
    title, body, small = fonts
    screen.blit(title.render("Paused", True, GOLD), (120, 120))
    lines = [
        "Enter  resume",
        "M      campaign map",
        "N      new valley",
        "Esc    main menu",
        "Q      quit",
    ]
    y = 180
    for line in lines:
        screen.blit(body.render(line, True, INK), (120, y))
        y += 32


def draw_campaign_map(screen, game, fonts):
    title, body, small = fonts
    screen.fill((10, 12, 16))
    margin = 48
    box_w, box_h = WIN_W - margin * 2, WIN_H - 140
    ox, oy = margin, 72
    pygame.draw.rect(screen, (18, 22, 28), (ox, oy, box_w, box_h))
    pygame.draw.rect(screen, LINE, (ox, oy, box_w, box_h), 2)
    sx, sy = box_w / MAP_W, box_h / MAP_H
    seen, vis = game.seen[PLAYER], game.visible[PLAYER]
    step = 2
    for y in range(0, MAP_H, step):
        for x in range(0, MAP_W, step):
            idx = y * MAP_W + x
            known = seen[idx]
            t = game.map.tiles[idx]
            if not known:
                col = (14, 16, 20)
            elif t == 2:
                col = (27, 58, 74)
            elif vis[idx]:
                col = (61, 90, 50)
            else:
                col = (36, 52, 40)
            pygame.draw.rect(screen, col, (ox + x * sx, oy + y * sy, sx * step + 0.5, sy * step + 0.5))
    for n in game.map.resources:
        if n.amount <= 0:
            continue
        idx = n.y * MAP_W + n.x
        if not seen[idx]:
            continue
        col = {"gold": GOLD, "tree": (70, 48, 22), "berry": (138, 47, 74)}.get(n.kind, INK)
        pygame.draw.circle(screen, col, (int(ox + (n.x + 0.5) * sx), int(oy + (n.y + 0.5) * sy)), 2)
    for v in game.villages:
        cx, cy = int(ox + (v.tx + 1.5) * sx), int(oy + (v.ty + 1.5) * sy)
        col = FACTION[v.owner]["primary"] if v.owner >= 0 else (170, 150, 110)
        pygame.draw.rect(screen, col, (cx - 5, cy - 5, 10, 10))
        pygame.draw.rect(screen, INK, (cx - 5, cy - 5, 10, 10), 1)
    for b in game.buildings:
        if b.kind not in ("hall", "keep"):
            continue
        cx, cy = int(ox + (b.tx + b.size / 2) * sx), int(oy + (b.ty + b.size / 2) * sy)
        pygame.draw.circle(screen, FACTION[b.team]["accent"], (cx, cy), 8)
        pygame.draw.circle(screen, FACTION[b.team]["primary"], (cx, cy), 5)
    camx = ox + (game.cam[0] / TILE) * sx
    camy = oy + (game.cam[1] / TILE) * sy
    vw = (WIN_W / TILE) * sx
    vh = ((WIN_H - 180) / TILE) * sy
    pygame.draw.rect(screen, INK, (camx, camy, vw, vh), 1)
    screen.blit(title.render("Campaign map", True, GOLD), (margin, 18))
    screen.blit(small.render("Click a point to travel there.  Esc or M returns to the field.", True, DIM), (margin + 220, 26))
    legend = "Hall/Keep = house disc    Village = square (tan = free)    Gold = coin    Timber = brown    Berries = dark red    Fog = unseen"
    screen.blit(small.render(legend, True, DIM), (margin, WIN_H - 36))
    return ox, oy, box_w, box_h


def map_click_to_world(mx, my, ox, oy, box_w, box_h):
    if not (ox <= mx <= ox + box_w and oy <= my <= oy + box_h):
        return None
    tx = (mx - ox) / box_w * MAP_W
    ty = (my - oy) / box_h * MAP_H
    return tx * TILE, ty * TILE
