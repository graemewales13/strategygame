# Seven Holds

A browser real-time strategy game in the spirit of *Seven Kingdoms* and *Age of Empires II*. You start with one timber hall and two serfs in a wide valley, and grow a house until you rule it. Plain HTML, CSS and JavaScript modules; canvas for the field. No build step, no dependencies.

You are yellow **House Calder**. Rivals: red **Varr**, blue **Cael**, green **Thorn**, violet **Ash**. Pick 3, 4 or 5 houses in the menu; empty seats are AI.

## Run it

ES modules do not load from `file://`, so serve the folder:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>. (Any static server works. Python is only used here as a file server.)

Handy URL options: `?seed=2024` (repeatable valley), `?houses=5`, `?fog=0` (see everything), `?start=1` (skip the menu).

Tests (Node 18+, no installs): `node test/sim.test.js`. They run the simulation headless: map connectivity on 90 generated valleys, economy, building, training, pillage, spies, influence, trade, war, AI growth and a full match.

## How to play

1. **Gather.** Drag-select your two serfs, right-click timber, berries or gold. They carry goods to the hall.
2. **Grow.** Select the hall (**H**). Train serfs; raise cottages (population), a farm, a mill, a barracks. Buildings can only go inside your territory: a hall claims 17 tiles, a **keep** claims 30, so build one toward the villages you want.
3. **Take villages.** Fourteen independent villages sit in the gaps. Three ways to win one:
   - **Pillage.** Soldiers fight it until its *protection* hits zero. It submits to you with middling loyalty. The folk fight back, hillforts hardest: bring rams.
   - **Influence.** A hall, keep, tower, tavern, temple or academy near a village slowly raises its *loyalty*. Past 72 it comes over without a sack. Scholars beside an academy amplify it.
   - **Spy.** Train a spy at a tavern and right-click the village. Loyalty rises while it is inside, but spies can be caught (sturdier villages watch harder).
   
   Owned villages pay tribute. Loyalty drifts down if your seat is far away, and an enemy keep nearby pulls it the other way.
4. **Trade.** A market trades with houses you set to *trade* (click their name in the top bar: peace, trade, war) and with villages you own or befriend. Fees rise with distance.
5. **Fight.** Attacking a house at peace declares war. Destroy a house's hall and keep and it falls.
6. **Win** by being the last house with a hall or keep, or by holding 65% of the villages for 45 seconds. You lose when your hall and keep are gone.

### Controls

| Action | Input |
|---|---|
| Select / box-select | Left mouse (Shift adds; double-click selects that type on screen) |
| Move, gather, attack, sack, infiltrate, help build | Right mouse (the host decides from what is under the cursor) |
| Rally point | Right-click the field with a training building selected |
| Pan | WASD or arrows (Shift faster), or push the mouse to the screen edge |
| Zoom | Mouse wheel |
| Jump camera | Click or drag the minimap; right-click the minimap to send units |
| Focus hall | **H** |
| Campaign map | **M** or **Tab**; click a point to travel there; **Esc** returns |
| Menu | **Esc** from the field (the match pauses) |
| Pause / speed | **P**, **+** / **-** or the speed button |
| Idle serf / all soldiers | **.** / **,** |
| Control groups | **Ctrl+1..9** set, **1..9** recall |
| Cancel placement | Right-click or **Esc** |

## Tech tree (short)

Hall → cottage, farm, mill, warehouse, market, barracks, tavern, tower, keep.
Barracks → archery range, forge. Keep + barracks → stable. Keep → academy, temple. Forge + academy → workshop (rams).

Buildings have jobs, none are cosmetic: forge adds damage, mill and warehouse boost deliveries, keep/temple/tavern/academy/tower pull village loyalty, tavern trains spies, academy trains scholars and unlocks the workshop.

## Layout

```
index.html        the game page         gallery.html   screenshots and art boards
style.css         wood-and-brass chrome sheets.html    renders the art sheets from the game's own renderer
js/
  config.js       balance: costs, stats, village kinds, influence, constants
  map.js          seeded valley: river with fords, ponds, timber, berries, gold, villages
  entities.js     unit / building / village factories and geometry
  game.js         the host: ONE Game object ticks all state; intents in, state out
  ai.js           rival houses (hall first, then cottages, barracks, keep ...)
  net.js          intent/snapshot seam: LocalHost now, SocketClient stub for later
  render.js       canvas drawing only; reads state, never changes it
  ui.js           HUD, input, menu, campaign map; talks to the host via intents
  main.js         requestAnimationFrame loop
test/sim.test.js  headless simulation tests
assets/           screenshots, art sheets, early concept boards
legacy/python/    the first pygame prototype, kept for reference (not the playable build)
```

## Multiplayer note (not shipped yet)

The structure is host-authoritative. `Game` is the only thing that mutates state; it has no DOM access and runs under Node. Every player command is an *intent* (`move`, `attack`, `gather`, `place`, `train`, `pillage`, `infiltrate`, `trade`, `relation`, `rally`, `context` ...), sent with `host.send(intent)`. Today `LocalHost` applies it to an in-process `Game`.

To go online: run a `Game` on a server, let each client's `SocketClient.send` forward intents tagged with its team, apply them with `game.applyIntent`, tick on the server, and broadcast `game.snapshot()` (compact JSON of players, units, buildings, villages and relations) a few times a second. Clients render the latest snapshot instead of the local `Game`. There is no lockstep and no prediction yet; the AI would simply run on the host for empty seats.

## Not in this slice

Steam, matchmaking, lockstep replays and a cloud cluster. Single-player against AI is finishable.

## Licence

MIT. See `LICENSE`.
