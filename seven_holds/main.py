from __future__ import annotations

import sys

import pygame

from .config import HUD_H, MAP_H, MAP_W, PLAYER, TILE, TOP_H, WIN_H, WIN_W
from .game import Game
from .render import draw_hud, draw_minimap, draw_world
from .ui import draw_campaign_map, draw_menu, draw_pause, map_click_to_world


def run():
    pygame.init()
    pygame.display.set_caption("Seven Holds")
    screen = pygame.display.set_mode((WIN_W, WIN_H))
    clock = pygame.time.Clock()
    fonts = (
        pygame.font.SysFont("serif", 28, bold=True),
        pygame.font.SysFont("sans", 18),
        pygame.font.SysFont("sans", 14),
    )
    game = Game()
    game.mode = "menu"
    world = pygame.Surface((WIN_W, WIN_H - HUD_H - TOP_H))
    mini = pygame.Surface((160, 96))
    drag = None
    map_box = None
    running = True

    while running:
        dt = clock.tick(60) / 1000.0
        keys = pygame.key.get_pressed()
        mx, my = pygame.mouse.get_pos()
        view_h = WIN_H - HUD_H - TOP_H

        for ev in pygame.event.get():
            if ev.type == pygame.QUIT:
                running = False
            elif ev.type == pygame.KEYDOWN:
                running = handle_key(game, ev.key, running)
            elif ev.type == pygame.MOUSEBUTTONDOWN:
                if game.mode == "map" and ev.button == 1 and map_box:
                    hit = map_click_to_world(mx, my, *map_box)
                    if hit:
                        game.cam[0] = hit[0] - world.get_width() / 2
                        game.cam[1] = hit[1] - world.get_height() / 2
                        game.mode = "play"
                elif game.mode == "menu" and ev.button == 1:
                    game.mode = "play"
                elif game.mode == "play":
                    if ev.button == 1 and _in_minimap(mx, my):
                        jump_minimap(game, mx, my, world.get_size())
                    elif ev.button == 1 and TOP_H <= my < TOP_H + view_h:
                        wx, wy = screen_to_world(game, mx, my)
                        if game.placing:
                            b = game.place_building(game.placing, PLAYER, game.placing_tx, game.placing_ty)
                            if not b:
                                game.toast("Cannot raise that here.")
                            if not keys[pygame.K_LSHIFT]:
                                game.placing = None
                        else:
                            drag = [mx, my - TOP_H, mx, my - TOP_H, wx, wy]
                    elif ev.button == 3 and TOP_H <= my < TOP_H + view_h:
                        game.placing = None
                        wx, wy = screen_to_world(game, mx, my)
                        game.right_click(wx, wy)
            elif ev.type == pygame.MOUSEBUTTONUP and ev.button == 1 and drag and game.mode == "play":
                wx, wy = screen_to_world(game, mx, my)
                if abs(mx - drag[0]) < 6 and abs(my - TOP_H - drag[1]) < 6:
                    game.select_at(wx, wy)
                else:
                    game.select_in_box(drag[4], drag[5], wx, wy)
                drag = None
            elif ev.type == pygame.MOUSEMOTION and game.mode == "play":
                if TOP_H <= my < TOP_H + view_h:
                    wx, wy = screen_to_world(game, mx, my)
                    game.placing_tx = int(wx // TILE)
                    game.placing_ty = int(wy // TILE)
                if drag:
                    drag[2] = mx
                    drag[3] = my - TOP_H

        if game.mode == "play":
            pan(game, keys, mx, my, dt, world.get_size())
            game.update(dt)
            world_drag = (drag[0], drag[1], drag[2], drag[3]) if drag else None
            draw_world(world, game, world_drag)
            draw_minimap(mini, game, world.get_width(), world.get_height())
            screen.fill((11, 13, 17))
            screen.blit(world, (0, TOP_H))
            screen.blit(mini, (12, WIN_H - HUD_H + 10))
            draw_hud(screen, game, fonts)
        elif game.mode == "menu":
            draw_menu(screen, game, fonts)
        elif game.mode == "pause":
            draw_world(world, game, None)
            screen.fill((11, 13, 17))
            screen.blit(world, (0, TOP_H))
            draw_hud(screen, game, fonts)
            draw_pause(screen, game, fonts)
        elif game.mode == "map":
            map_box = draw_campaign_map(screen, game, fonts)
        pygame.display.flip()

    pygame.quit()


def handle_key(game, key, running):
    if key == pygame.K_q and game.mode in ("menu", "pause"):
        return False
    if game.mode == "menu":
        if key in (pygame.K_RETURN, pygame.K_SPACE):
            game.mode = "play"
        elif key == pygame.K_3:
            game.reset(n_teams=3)
        elif key == pygame.K_4:
            game.reset(n_teams=4)
        elif key == pygame.K_5:
            game.reset(n_teams=5)
        elif key == pygame.K_n:
            game.reset()
        elif key in (pygame.K_m, pygame.K_TAB):
            game.mode = "map"
        elif key == pygame.K_ESCAPE:
            return False
        return True
    if game.mode == "pause":
        if key in (pygame.K_RETURN, pygame.K_SPACE, pygame.K_p):
            game.mode = "play"
        elif key == pygame.K_ESCAPE:
            game.mode = "menu"
        elif key in (pygame.K_m, pygame.K_TAB):
            game.mode = "map"
        elif key == pygame.K_n:
            game.reset()
            game.mode = "play"
        return True
    if game.mode == "map":
        if key in (pygame.K_ESCAPE, pygame.K_m, pygame.K_TAB, pygame.K_RETURN):
            game.mode = "play"
        return True

    if key == pygame.K_ESCAPE:
        if game.placing:
            game.placing = None
            game.clear_selection()
        else:
            game.mode = "pause"
    elif key in (pygame.K_m, pygame.K_TAB):
        game.mode = "map"
    elif key == pygame.K_p:
        game.mode = "pause"
    elif key == pygame.K_h:
        focus_keep(game)
    elif key == pygame.K_n:
        game.reset()
    elif key == pygame.K_F3:
        nxt = 3 + (game.n_teams - 3 + 1) % 3
        game.reset(n_teams=nxt)
        game.toast(f"{game.n_teams} houses in the valley.")
    elif key == pygame.K_1:
        start_place(game, "cottage")
    elif key == pygame.K_2:
        start_place(game, "farm")
    elif key == pygame.K_3:
        start_place(game, "mill")
    elif key == pygame.K_4:
        start_place(game, "warehouse")
    elif key == pygame.K_5:
        start_place(game, "market")
    elif key == pygame.K_6:
        start_place(game, "forge")
    elif key == pygame.K_7:
        start_place(game, "workshop")
    elif key == pygame.K_8:
        start_place(game, "tavern")
    elif key == pygame.K_9:
        start_place(game, "academy")
    elif key == pygame.K_0:
        start_place(game, "temple")
    elif key == pygame.K_b:
        start_place(game, "barracks")
    elif key == pygame.K_y:
        start_place(game, "archery")
    elif key == pygame.K_l:
        start_place(game, "stable")
    elif key == pygame.K_t:
        start_place(game, "tower")
    elif key == pygame.K_c:
        start_place(game, "keep")
    elif key == pygame.K_q:
        game.command_train("serf")
    elif key == pygame.K_e:
        game.command_train("scout")
    elif key == pygame.K_f:
        game.command_train("footman")
    elif key == pygame.K_r:
        game.command_train("bowman")
    elif key == pygame.K_k:
        game.command_train("knight")
    elif key == pygame.K_i:
        game.command_train("spy")
    elif key == pygame.K_u:
        game.command_train("scholar")
    elif key == pygame.K_j:
        game.command_train("ram")
    return True


def start_place(game, kind):
    from .config import COSTS

    if not game.can_afford(PLAYER, COSTS[kind]):
        game.toast("Not enough timber or coin.")
        return
    game.placing = kind


def focus_keep(game):
    k = next((b for b in game.buildings if b.kind in ("hall", "keep") and b.team == PLAYER), None)
    if not k:
        return
    game.cam[0] = k.x - WIN_W / 2
    game.cam[1] = k.y - (WIN_H - HUD_H - TOP_H) / 2


def pan(game, keys, mx, my, dt, size):
    spd = 780 if keys[pygame.K_LSHIFT] or keys[pygame.K_RSHIFT] else 460
    if keys[pygame.K_w] or keys[pygame.K_UP]:
        game.cam[1] -= spd * dt
    if keys[pygame.K_s] or keys[pygame.K_DOWN]:
        game.cam[1] += spd * dt
    if keys[pygame.K_a] or keys[pygame.K_LEFT]:
        game.cam[0] -= spd * dt
    if keys[pygame.K_d] or keys[pygame.K_RIGHT]:
        game.cam[0] += spd * dt
    vw, vh = size
    edge = 14
    if 0 <= mx < WIN_W and TOP_H <= my < TOP_H + vh:
        if mx < edge:
            game.cam[0] -= spd * dt
        if mx > WIN_W - edge:
            game.cam[0] += spd * dt
        if my < TOP_H + edge:
            game.cam[1] -= spd * dt
        if my > TOP_H + vh - edge:
            game.cam[1] += spd * dt
    game.cam[0] = max(0, min(MAP_W * TILE - vw, game.cam[0]))
    game.cam[1] = max(0, min(MAP_H * TILE - vh, game.cam[1]))


def screen_to_world(game, mx, my):
    return mx + game.cam[0], my - TOP_H + game.cam[1]


def _in_minimap(mx, my):
    return 12 <= mx <= 172 and WIN_H - HUD_H + 10 <= my <= WIN_H - HUD_H + 106


def jump_minimap(game, mx, my, size):
    vw, vh = size
    lx = (mx - 12) / 160
    ly = (my - (WIN_H - HUD_H + 10)) / 96
    game.cam[0] = lx * MAP_W * TILE - vw / 2
    game.cam[1] = ly * MAP_H * TILE - vh / 2


def main():
    try:
        run()
    except KeyboardInterrupt:
        pygame.quit()
        sys.exit(0)


if __name__ == "__main__":
    main()
