# Seven Holds (Python)

A compact real-time strategy game in the spirit of *Age of Empires* and *Seven Kingdoms*. Written in Python 3 with pygame.

You are yellow **House Calder**. The campaign map is 128×128 tiles with open wilderness, mines, and independent villages. Default rivals: red Varr, blue Cael, green Thorn. **F3** cycles 3 / 4 / 5 houses.

Neutral villages have protection (garrison) and loyalty. Sack them with soldiers, pull them with a nearby keep or tower, or send a spy to turn them over time. Submitted villages pay tribute.

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Play

```bash
python play.py
```

or

```bash
python -m seven_holds
```

## Controls

| Action | Key / mouse |
|---|---|
| Select / box-select | Left mouse |
| Move, gather, attack, finish a building | Right mouse |
| Pan | WASD or arrows (Shift = faster) or screen edge |
| Cottage Farm Mill Warehouse Market Forge Workshop Tavern Academy Temple | 1–9, 0 |
| Barracks / Archery / Stable / Tower | B Y L T |
| Train serf scout footman bowman knight spy scholar ram | Q E F R K I U M |
| Jump to keep | H |
| New valley | N |
| Cycle 3 / 4 / 5 houses | F3 |
| Cancel placement | Esc |
| Jump camera | Click minimap |

Train from the hall that owns the unit (Keep, Barracks, Archery, Stable, Tavern, Academy, Workshop). Serfs drop cargo at Keep, Mill, Warehouse, or Market. Farms and taverns drip grain and coin. A finished Forge steels footmen and knights.

## Project layout

```
play.py                 entry script
seven_holds/
  config.py             costs, stats, colours
  mapgen.py             terrain and resources
  pathfinding.py        A*
  entities.py           units and buildings
  game.py               economy, combat, commands
  ai.py                 House Varr
  render.py             pygame draw
  main.py               input loop
```

Balance lives in `seven_holds/config.py`. Enemy behaviour lives in `seven_holds/ai.py`.

## GitHub

```bash
git init
git add .
git commit -m "Initial commit: Seven Holds Python RTS"
git branch -M main
git remote add origin git@github.com:YOU/seven-holds.git
git push -u origin main
```

CI compiles every module on push so a syntax error fails the build.
