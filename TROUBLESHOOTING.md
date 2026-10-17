# Auld World - troubleshooting log

How this works: `node tools/soak.js [minutes] [seeds] [houses]` plays headless matches with **every** house (the player's too) under the AI,
checks invariants every 10 s and writes `logs/soak-latest.log`. Findings are triaged here: **ID, symptom, cause, fix, how it is guarded**.
`npm test` holds the regression tests; `tools/soak.js` is the wide net. Newest cycle at the bottom.

Status: OPEN, FIXED, WONTFIX (with reason), HARNESS (the detector was wrong, not the game).

## Cycle 1 - first soak (20 min x 3 seeds, 4 houses)

| ID | Status | Symptom | Cause | Fix / guard |
|----|--------|---------|-------|-------------|
| T-001 | FIXED | Serfs froze for minutes carrying coin ("return" with no path), builders froze beside a site | A unit standing off-centre on the tile diagonal to a building's corner picked its **own tile** as the goal; `findPath` returned `[]` (same tile), distance stayed 1.36 > 1.35 reach, so it never arrived and never repathed to anything else | `setPathToEntity` now ranks free tiles by working reach first, then ring, then closeness, and tries up to 8 until one is reachable; `setPath` walks to the exact point when the goal is the same tile. Soak: `stuck serf` anomalies gone |
| T-002 | FIXED | Tavern never paid its coin trickle | Two `case 'tavern'` labels in `updateBuildings`; the second was dead code | Merged into one case |
| T-003 | HARNESS | "stuck serf while gather/mine", "stuck footman/spy/bowman while attack/infiltrate" (hundreds) | Digging, hitting a target in range and a spy waiting at a village all stand still by design | Detector now treats "near the target / within weapon range" as working |
| T-004 | HARNESS | "mine with no diggers", "task on vanished target" | Stone mines are released on purpose when stone > 120; targets vanish between `cleanup` and the next unit update | Exempt glutted ores; a target must stay vanished for 5 s to count |

## Cycle 2 - economy, AI and soft-locks (soak 20 min x 6 seeds, plus chaos-intent mode)

`node tools/soak.js 20 1,2,3 4 chaos` replaces the player's AI with a random intent generator (every intent type, valid or not) to hunt exceptions and broken invariants.

| ID | Status | Symptom | Cause | Fix / guard |
|----|--------|---------|-------|-------------|
| T-005 | FIXED | Rival houses never made steel or arms (arms 0 after 20 min), iron piled at the 220 cap | The AI only looked for coal within 16 tiles of the hall and fell through to silver; no coal meant a cold foundry | Ore search radius 30 (stone stays 16); order stone, iron, coal, copper, silver |
| T-006 | FIXED | Rival camels never traded (0 exchanges in 20 min) | Needed a partner **house** market holding what they lacked; independent villages were ignored | AI camels now also buy from independent (or allied) villages that store the ore, and sell any shelf surplus. Soak now shows 6-15 exchanges per match |
| T-007 | FIXED | A house that lost its Timber Hall but kept its keep could never build again ("Needs a Timber Hall"), so it sat at its population cap for ever | Every recipe requires `hall`; nothing else counted | `hasBuilding(team, 'hall')` is also satisfied by a keep. Found by chaos mode |
| T-008 | FIXED | Mine diggers flapped: released above 120 stone, re-sent below, walking back and forth | No hysteresis on the glut rule | Stand down above 160 (ore 260), resume below 100 (180) |
| T-009 | FIXED | Rivals sat on 1000 grain while starved of timber | Idle serfs were shared out by fixed ratios | A pile above 450 of any good removes that good's share |
| T-010 | FIXED | Rivals walked far for timber with only the hall to drop at | No warehouse in the build plan | Warehouse added after the mill, placed beside the nearest tree stand; homes and farms may spill 8 tiles further out when the hall is crowded |
| T-011 | FIXED | Rival armies marched at 6-7 minutes and wiped an idle player within 30 s of first contact | War opened at 340 s | `WAR_AFTER = 600` (10 min of peace). An idle player now falls at 10-12 min |
| T-012 | HARNESS | "population capped" while a cottage was already rising or the house was dead | Detector ignored both | Only flagged with timber to spare, a live seat and no cottage under construction |

## Cycle 3 - the human's view (browser fuzz, real clicks, UX)

Browser checks (Playwright, not committed): every building and unit kind selected with its panel rendered and every button clicked, no page errors; right-click on every enemy building kind gives an attack order; a camel loaded and sent to a village by real mouse clicks buys coal and brings it home.

| ID | Status | Symptom | Cause | Fix / guard |
|----|--------|---------|-------|-------------|
| T-013 | FIXED | Bottom panel clipped: with a keep selected the "Raise a building" grid sat below the fold, so viable options were not visible | Fixed 214 px HUD and tall stacked sections | HUD height `clamp(214px, 31vh, 320px)`, visible thin scrollbar, shorter keep hint |
| T-014 | FIXED | A camel whose home market was razed idled for ever holding its cargo | `caravanHome` only knew markets | Falls back to any market of ours, then the hall or keep; goods always reach the stockpile. Test added |
| T-015 | CHECKED | Snapshot (host to client) after chaos play | n/a | Soak now serialises a snapshot every 10 s and checks for NaN and size; clean |
| T-016 | CHECKED | Speed | n/a | 500-740x realtime headless, slowest tick under 8 ms with 4-5 houses |

### Open / ideas
- A house with no timber stand in reach has no fallback besides trade (the AI buys timber from nobody yet: villages store food, ore and coin, not timber).
- Rival aggression is one number (`WAR_AFTER`); a difficulty setting would expose it with army-cap scaling.
- The soak harness has no "good human" player; adding a scripted opening would let balance be measured against a player who plays well.

## Cycle 4 - rules audit against the game's point (expand and rule)

Review of every rule that limits the player, asked of each: does it serve expanding and ruling, or just leash the player?

| ID | Status | Rule found | Verdict and change |
|----|--------|-----------|--------------------|
| T-017 | FIXED | Buildings only within 17 tiles of a hall or 30 of a keep ("Outside your territory") | Leash, not strategy: it defined *where you may expand* instead of *what expanding costs*. **Removed.** You may build anywhere you have scouted ("Unexplored: scout there first" for the player under fog). A remote ghost warns "no villagers near, no guard", and the placing overlay now shows influence circles (dim when unguarded) rather than a border |
| T-018 | FIXED | Influence was the same whether or not a castle held any soldiers | Castles protect by being manned. Hall, keep, tower and barracks pull at 35% empty and 100% with 4 soldiers garrisoned or idling within 5 tiles; barracks now count; soldiers billeted in a held village add loyalty |
| T-019 | FIXED | A mine 80 tiles away delivered ore instantly and in full | Haul efficiency: 100% within 14 tiles of a store, down to 45% at 60+; a warehouse or market beside the mine fixes it (a reason to build local stores, i.e. community, not a ban on distance) |
| T-020 | FIXED | Market coin was a flat trickle | Scales with local consumers: cottages and held villages within 24 tiles |
| T-021 | FIXED | AI keeps were planted at most 12 tiles out because of the territory radius | Keeps now go about 9 tiles short of the target village; soak shows rivals still settle and fight normally |
| T-022 | KEPT | Requires-chains (hall first, barracks for archery, etc.), population cap by cottages, 4 diggers per mine, garrison caps, treaty needs a met house | These shape *what* you build and *when*, not how far you may reach; they stay |

Tests added: guard-scaled influence, remote mine haul and warehouse fix, market consumers, far scouted ground is open.

## Cycle 6: random terrain (T-027 to T-028)

| ID | Status | Symptom | Cause and fix |
|----|--------|---------|---------------|
| T-027 | FIXED | Serfs, recruits and a spy stuck for minutes at one spot on a rocky map (soak seed 7) | The AI built a tavern and a market flush against a rock ridge, sealing a 6-tile pocket with units inside. `wallsOff()` in `canPlace` now refuses a footprint that splits the ground around it into more pieces than before ("Would wall off a pocket of ground"); a fully open ring skips the check, so it costs nothing in open country |
| T-028 | FIXED | Test asked for open ground 36 tiles east of the hall; random start corners can put the hall on the right edge | Test now searches the whole map for scouted ground more than 30 tiles away |

| T-029 | FIXED | Villages had no visible people and "pop" only mattered to the keep's levy | Real village population: growth and starvation from the village store, drawn villagers, panel line, housing and tribute effects, settlers (see README "Village population"). Test: fed villages grow, dry ones shrink, held ones house folk and send settlers |

### T-030 Routes unprofitable at distance
Symptom: route quote empty for a far village (fee 0.38, price 1.5x gave ratio < 1). Fix: lower fees (0.1-0.3 villages, 0.06-0.22 markets), steeper scarcity premium (up to 1.9x), village purse regen by population. Test: `routes: a camel shuttles shelf goods...`.

### T-031 Coin had no use and came from the wrong place (cycle 7)
Symptom: AI houses sat on 500-900 coin by minute 8 and earned most of it from village tribute (mining camp 0.9/s); mining and trade were invisible; stone/coal piled to 1000. Cause: no coin sink, tribute far too rich, ore could only leave by caravan. Fix: army wages, coin in soldier costs, village tribute cut to a third plus tax by population, markets buy the stockpile (with glut), AI digs gold first, sells surplus, runs camels on routes and sizes its army by what income can pay. Probe: `tools/econ.js`.

### T-032 Market built late starved the early economy
AI plan put the market after the forge (minute 8). Moved to fourth building.

### T-033 Timber hall removed
The hall is gone: every house starts with an owned home village of 30 folk (the seat) and three serfs. Only mine, market, foundry, tavern, keep and barracks are available at first; the rest unlock through the `requires` chain and the build grid hides locked buildings. Village build button had no image (icon pointed at a removed path): now uses the 1tile hamlet art. Camels could not swap goods for coin when full (cap check counted coin): coin is now weightless for that check.

### T-034 Playtest sweep (scripted human, cycle 8)
- Founding villages was a runaway: villages were cheap, counted toward the 65% valley win, and the bot won at minute 10 holding 28 of 41. Now a house may found 3 villages (FOUND.limit) and founded villages are left out of the valley count.
- Drafting villagers lowered the population cap (housing was half the village's current folk) so 12/10 pop appeared. Housing now has a floor (home village 30 folk, others 30% of max).
- "Seam is spent" and "Keep is full" lines flooded the feed thousands of times: identical log lines within 6 s are now one. Diggers on a dry seam walk to another mine with ore and room.
- Start vision was ~5 tiles, so deposits were not visible: home village now sees 13 tiles, held villages 8.
- Idle serfs after a build go to grain or timber near the seat.
- Known: Viking building art is not drawn yet, so the browser logs 404s and falls back to the shared kit.

### T-035 Tiers and ways to win (cycle 9)
Bot matrix (4 houses, 6 seeds each; W = wins): Easy econ 6/6, trader 6/6, rush 5/6, turtle 5/6, conquer 2/6; Mid econ 5/6, trader 4/6, turtle 4/6, rush 3/6, conquer 2/6; Hard (70 min cap) econ 1/6, trader 1/6, conquer 2/6. Wealth wins land at 20-27 min (Easy), 32-41 (Mid), 50-57 (Hard). Findings: a conqueror took 12 of 14 villages in 6 minutes and won on land at minute 7: now a village counts toward the land win only at 55+ loyalty (a sack leaves it near 48), share 70%, hold 120 s. Hard at 9000 fortune was lost to the AI by minute 40 for every peaceful style: now 10000 fortune, rivals x1.1 income, your purse x0.9. Bots do not manage loyalty, so land wins are under-sampled.

## T-036 - Rebrand to Auld World
The game is now **Auld World** (was Seven Holds). Title, header, README, package name, source headers and the console tag changed; the splash and main menu use the new `assets/menu/auld-world-splash.jpg` and `auld-world-menu.jpg`. The menu picture carries its own labels (Continue, New Game, Campaign, Skirmish, Options, Quit), so the six hotspots in `index.html` sit at tops 27.9 / 36.5 / 45.1 / 53.7 / 62.4 / 71.0 %; if the picture is swapped again, re-measure the label centres and subtract 4.6. The Python prototype under `legacy/` keeps its old name. The debugging hook `window.__seven` is unchanged.

## T-037 - Big board, conquest-only wins, simple camels, communities, diplomacy
- Board is 320x320 (~8x the area); ore totals unchanged so it is scarcer, village frequency unchanged, vision radius x sqrt(8) so about 8x the ground clears per trek. `AULD_MAP=112` gives a small board for fast tests (`npm test`); `npm run test:big` is the full size.
- Victory is conquest only: every rival fallen, or forfeited (no home village and no soldiers for 45 s). Wealth/land wins were removed (trading alone won the game).
- Camels: select, click up to 3 markets, it loops until stopped. Markets only (own, or a treaty partner's); villages are refused.
- Districts: a market with supply, works, homes and service buildings within 20 tiles earns up to +125%; mines, foundries and village tribute also gain per link.
- Diplomacy: the house chip opens a panel with plain reasons for any refusal (war must last 60 s before peace talks).

## T-038 - Idle player never lost; AI broke peace at once
- Symptom: with the player idle, AI armies sat at home forever (test "an idle player can be beaten" timed out). Cause: the AI only picked *buildings* of its war target; a house with only a village had none. Fix: attack the target's seat village when no building is left (`ai.js` step 6).
- Symptom: an AI made peace, then declared war again seconds later (its ally pulled it back in, or a hostility rule fired). Fix: `settled()` in `diplomacy.js`: no new war against a house peace was made with in the last 240 s, and joining an ally's war is refused for the same houses.


## T-039 - 3D view (removed)
- The Three.js 3D view (`render3d.js`, `models3d.js`, `vendor/`) and the live-valley title screen were removed on 2026-10-08 at the owner's request; the 2D `Renderer` and the painted splash/menu are back. `game.titleView` is kept (harmless, tested) but nothing sets it now.

## T-040 - Warehouse overflow, record-and-train AI
- `ui.js` imported `MARKET_RADIUS` twice; `node --check` does not catch duplicate imports, only loading the module does. The page failed to start ("Identifier ... already declared"). Always run `tools/boot-test.cjs` / a real page load after touching imports.
- An imported or odd playbook could name a building that does not exist and crash the AI (`BUILDINGS[kind]` undefined): `learn.js` now drops unknown kinds both when learning and when blending the plan (test: "playbooks with missing or odd fields never crash a match").

## T-041 - Title screens, crowding, defenders, heirs
- A leftover duplicate of the old painted-menu CSS block (later in `style.css`) kept painting `#mainmenu` black; the old rules are gone. When replacing a CSS block, grep for a second copy.
- Camel unloads into a full shelf+warehouse no longer push a shelf past its cap (surplus is bought by the townsfolk), which the soak had flagged as "bad shelf value".

## T-042 - Stacked people, idle camels
- `separate()` now keeps a full tile (R=1.0), parts exactly-stacked pairs in opposite directions, slides along walls, and lets a unit stuck on blocked ground step out (before, a unit on a blocked tile never moved, so a group there stayed one body).
- `autoCamels()` puts every idle camel back to work (own route, all own markets, or partner markets); `u.parked` marks camels the player stopped or moved by hand. Test helper reminder: `run(g, secs)` takes the game first; `run(secs)` silently does nothing.

## T-040 - Carry-over between matches; stale forfeit text (fixed 2026-10-08)
- `Game.losses` (war weariness) and `Game.spyIntel` (spy reports) were created lazily and never cleared by `reset()`, so a new match inherited the last one's war losses and spy reports; a save also dropped them. `reset()` now clears both (and the `_stance` cache); `serialize()`/`restore()` keep them.
- After the royal-line rule replaced forfeits, the top bar still counted down "forfeits in N s", and the first-match objective and the hold-bar tooltip described the old win. They now speak of the royal line; `checkForfeit` is gone.

## T-041 - Science and armoury loose ends (fixed 2026-10-08, hourly run 5)
- README step 6 still said the Academy turns silver into science levels; it now points to the research tree.
- Pulling down an Armoury lost the goods already paid for kit in its queue; they are now refunded with the building's share.
- The forge ate every 6 steel for arms levels, starving the Armoury of steel for swords, lances, crossbows and plate. With an Armoury standing the forge leaves `FORGE_RESERVE` (8) steel.
- The Council's Learning stat for a rival was a bare number with an old tooltip; it now reads N/9 and names the techs for partners, allies and spied houses. Spy reports add the research under way and the kit in store.

## T-042 - Doctrine invisible; stale difficulty table (fixed 2026-10-08, hourly run 8)
- The Grok pass gave each people an AI doctrine (granary, legion, hold, hearth, raid) but nothing showed it; the Council card now says "plays the <doctrine>" with what it means.
- README: "You lose when your last village and keep fall" (now the royal line), the difficulty table had pre-Grok Hard numbers, a "First war" timer that is now only the earliest war, and a "Fortune to win" column for a win that no longer exists. Rewritten, with a doctrine table.

## T-043 - Placement, overlap and movement audit (fixed 2026-10-08)
Measured with a headless audit (AI playing every seat, 20-minute matches, seeds 3/11/21, sampled every 5 s while the match was live):

| Measure | Before | After |
|---|---|---|
| Buildings flush against a village (mine, armoury) | 0-2 per match | 0 |
| Unit-samples standing on a building or village footprint | 59-471 | 0 |
| Unit-samples on water or rock | 147-576 | 0 |
| Idle pairs stacked within 0.45 tiles | 21-146 | 0-4 (momentary) |

Causes and fixes:
- `canPlace` looked for neighbours within the *new* building's size + 2 tiles, so a small building could be put flush against the east or south side of a big one. It now uses the larger footprint. Buildings (and mines, and founded villages) also keep the `BUILD_GAP` lane from villages, whose art spreads past their footprint.
- Crowd separation (`separate`) only refused tiles under buildings, so crowds at the water's edge shoved people into water and onto rock; its slide-along-the-wall fallback had been commented out by accident. It now uses `walk` and slides.
- A building raised over a standing unit trapped it inside the footprint. `rescueStranded` steps any idle unit on unwalkable ground to the nearest open tile; units whose route crosses a new site re-plan.
- Bushes, trees and deposits under a village footprint were gathered by serfs standing inside the village (and drawn under its art): they are now covered. Serfs stop panning gold a mine has been raised over.
- Everyone leaving a building was put on one tile; AI keeps also emptied every turn and refilled (recruits in, one drilled, all out). Units now step out onto the least crowded open tiles round the front of the building, and AI keeps let out only drilled soldiers.
- Draw order: buildings are keyed by their front corner, so a person or tree just east or south of a building's back corner was drawn first and swallowed by its walls. `Renderer.orderAround` puts anything within 1.5 tiles past a footprint's east or south edge in front of it, and anything else near it behind.
- (Diagnosis note: "stuck" serfs in the first audit were frozen after the match had ended; ticks stop on `outcome`. The audit now stops at the outcome and lets an AI play the player's seat.)

## T-044 - Unanswerable ultimatum; stale first-match guide (fixed 2026-10-08, hourly run 9)
- An ultimatum always asked at least 40 coin, so a player with less could not Accept: the only outcome was war. The price is now never more than the player holds; with nothing to give, accepting means bending the knee.
- The first-match guide said rivals march after about ten minutes of peace (war now comes from each house's reading of you), and had no step for the Academy and Armoury. Fixed, with a new "Study and arm" step.
- Checked and sound: a save taken 18 minutes into a busy AI match keeps research, kit, crafting queues, heirs, ultimatums and war losses, and plays on after loading.

## T-045 - Drilling threw away earned health (fixed 2026-10-08, hourly run 11)
- Drilling a recruit into a soldier (and sending one out as a spy) set health from the kind's base only, dropping rank, deeds and the Drill research: a Veteran Death-cheater became a 90-hp footman, weaker than a fresh 103-hp one. `Game.maxHpFor(u)` now rebuilds full health from kind, trait, rank, deeds and Drill; kit is added on top by `equip()`.

## T-046 - A rival king could not shelter in a keep full of recruits (fixed 2026-10-09, hourly run 12)
- Rival keeps hold recruits waiting to be drilled (up to the keep's 8); the king's shelter rule needed fewer than 8 inside, so a keep full of recruits left the last of the line in the open. Now a full keep lets one recruit out (cancelling its drill if need be) and the king goes in.
- Tried first and reverted: capping recruits at 6 and turning them out when the house could not pay for drills. It changed how many soldiers rivals train and broke the playbook test in `test/learn.test.js` (a tiny-army playbook ended with more trained soldiers than a big-army one), so the narrower fix was kept.

## T-047 - Gap hunt after the full re-check (fixed 2026-10-10)
- The Council's Army stat, the standings table and your home panel counted only soldiers outside buildings (`militaryOf`), though the tooltip says "in the field and garrisons": a full keep made a house look weaker. They now use `soldiersOf` (garrisons included).
- A unit on a plain move order walked straight through a building site placed across its route (only tasks with a target re-planned). Marches now re-plan to where they were going.
- Rival barracks, archery ranges and towers were meant to face the nearest rival, but `findSpot` looked for a building of kind `hall`, which no longer exists, so they never did. It now uses the rival houses' seats.
- A rival mine could stand for good with nobody to dig (its villages' folk all busy at other mines, and the house at its limit of three founded villages). Mines now track `idleT`; a rival founds a camp beside an unstaffed mine if it can, and pulls it down after three idle minutes if not.
- README and the map legend still spoke of halls in ten places; houses start in a home village. Fixed.
- Looked at and left: rivals hoarding grain, timber and coin past minute 13 is their army cap being reached, not a bug (a serf rebalance was tried and reverted: grain comes from farms and tribute, and the change broke the playbook test).

## T-048 - Minimap right-click threw; the chaos soak died at 0:00 (fixed 2026-10-11, daily review)
- Right-clicking the minimap with units selected called `command(x, y)` with world coordinates in the screen-coordinate slots, so the order went out with no spot (`x: undefined`) and `contextCommand` threw inside `nodeAt`. The minimap now passes world coordinates as such (and Ctrl+right-click on it attack-moves); `contextCommand` and `cmdMove` refuse an order with no finite spot.
- `tools/soak.js ... chaos` crashed on its first intent on every seed: its "any building" picker returned nothing because houses now start in a home village with no buildings. It falls back to a village, and the chaos generator now also sends attack-move and stance orders (including a bad stance).


## T-049 - Pink armouries; a load forgot covered deposits and every timer (fixed 2026-10-11, daily review)
- Grok's art drop (8b7d6f1) was painted on flat #FF00FF and not keyed, and the armoury is picked up automatically, so every armoury drew as a pink rectangle. All 82 files are now keyed to alpha, trimmed and defringed (`tools/chromakey.py`, then `tools/defringe.py`), and the icons, portraits, marks and armed soldiers are wired (see `ARTREQUIREMENTS.md`). `tools/art-smoke.cjs` screenshots it all in a live match.
- A save kept each deposit's amount but not whether a mine or village stood on it (`covered`), so after loading, serfs could again gather gold from under a mine (the T-043 fix undone by a load). Saves now keep `resCov`; older saves recover it from each mine's `nodeIds`.
- A save dropped every `_` field: game timers (opinion drift, mine crews, refits, sallies, visibility), unit and building timers (`_idleT`, `_haulT`, `_pt`, `_brink`...) and their caches, and loading re-seeded the random stream from the clock and recomputed fog at once. A loaded match therefore played on differently from one never saved (houses could meet earlier, a near-dead soldier lost his Death-cheater chance). Now only the renderer's per-frame fields are left out, links inside caches are saved as ids, and fog, timers and both random streams are saved (part of T05).
- Diagnosis note: the determinism test compares halves with halves. `run(g, 360)` steps 0.1 s in floating point and may tick once more than `run(g, 180)` twice.

## T-050 - A village under attack gave no warning; the army step ignored garrisons (fixed 2026-10-11, daily review)
- Only units and buildings raised "Your ... is under attack!" (from `damage()`); a village is struck through `hitVillage()`, which never warned, so a rival could sack the player's home village (their seat) in silence. Both now go through `Game.alertPlayer()`: one warning and alarm every 8 s, plus (with a UI attached) an alert spot for the minimap ring and the Space key (T06). Alert spots are UI-only like `fx`: never queued in the headless sim, cleared by `reset()` and a load, not saved.
- The first-match guide's "Raise an army" step counted `militaryOf` (soldiers outside buildings), so eight soldiers drilled and kept in a keep did not count: the same gap T-047 fixed for the Council. It now counts `soldiersOf`.
- Checked and left: the boot test logs about 35 "404" lines; they are the optional art the game looks for (plain soldiers per people, building states) and were there before. Backlog T29 (art manifest).


## T-053 - Answered offers stayed on screen; treaties with the AI were instant; top bar icons gone; AI soldiers idle; rams floated (fixed 2026-10-12)
- **Offer cards.** The card's signature included its countdown, so the card was rebuilt several times a second and a click could land on a card that had just been replaced ("element was detached"). The countdown now ticks in place (`.ocd`), and panels are not rebuilt while a button is held (`uiHold`). After an answer, the signature was reset to `''`; with no offers left the new html is also `''`, so it looked unchanged and the answered card stayed up. It is now reset to `null`.
- **AI treaties.** `proposeRelation` answered for an AI house at once, so the player just found themselves partners. The player's proposal now sends an envoy (`game.asks`, saved), and 4-8 s later (`ASK_DELAY`) the ruler answers by letter: accepted, or declined with the reason. One envoy per house at a time. Rule tests that check the AI's judgement call `proposeRelation(a, b, state, true)`.
- **Top bar icons.** A later rule for the painted `<img class="ico">` icons set every `.ico` to `width: auto`, which collapsed the drawn food, wood, gold and population icons (empty spans) to 0-2 px. That rule is now `img.ico`.
- **AI soldiers standing about.** After 5 min, the AI builds a keep beside each village it wants (up to 4), posts `GUARD.full` soldiers in each, drills in every keep, and shelters its idle surplus in barracks and towers. At war the posted soldiers come out, leaving 2 per keep. Drilled soldiers are marked `drilledAt`, so the drill step ejects only the newly drilled and not the guards. The army cap now counts sheltered soldiers (`raised`); without that, sheltering looked like an empty army and the AI recruited without end.
- **learn.test.** "A house with a playbook raises the army the player raised" passed only by a tie: with 4000 gold both houses hit the difficulty cap (41 = 41), and it counted undrilled recruits standing outside. It now uses a 600-gold purse and counts drilled soldiers, and asserts the big playbook drills strictly more (`b > a`). It passes on the old and new AI. Across seeds 11-15 the big playbook drills more every time.
- **Rams floated.** The ram's art is three-quarter view, so its rear wheels sit about 30% up the picture, but the shadow was a walker's thin ellipse under the front wheel, and it bobbed and rocked like a walker. It now has a shadow and team ring under the whole wheelbase, and a slight rumble instead of the bob. Art rule noted in `ARTREQUIREMENTS.md`.

## T-054 - Soldier art 20x too big; defringe ate rose and violet cloth; stale notes (fixed 2026-10-12, daily review)
- Grok's priority-9 soldiers (c99b90e, 24 files: footman, bowman, knight for all eight peoples) arrived at about 800x1200 px, 0.8-1.3 MB each, 24 MB in all, while every other figure is about 220 px and the game draws a footman 50 px high. Every boot downloaded and decoded 24 MB for them. They are now scaled to 260 px on the long side (Lanczos in premultiplied alpha, so edges stay clean): 1.5 MB in all, drawn exactly as before (the renderer scales by height). Corners checked transparent; the only magenta left is a few pixels at alpha under 32, invisible.
- `tools/defringe.py` keyed out every pixel in the hue band 285-345 with some saturation, opaque or not. The Byzantine rose (#A8366E, hue 330) and the Mongol violet are in that band, so a run over the Byzantine buildings removed up to 3,600 pixels of painted cloth per file (caught before commit and reverted). An opaque pixel now has to be close to #FF00FF itself (red and blue more than 110 above green) and the despill only touches pixels leaning more than 70 towards magenta. Re-run on today's art: no opaque pixel is touched. ARTREQUIREMENTS now says to deliver people at about 256 px and to check rose and violet drops by eye.
- Stale notes: `js/art.js` said "REPAINT is empty" while it holds the serf and king keys; DEMANDS listed only five house names; ARTREQUIREMENTS still told the painter to delete `kit: false` (no people has it; `PARTIAL` in `js/art.js` is the switch now).
- The chaos soak (`tools/soak.js ... chaos`) crashed in its own intent generator once the chaos-driven house lost its seat (`g.seatOf(0)` is undefined for a seatless house, which plays on by the rules). It now places around the middle of the board instead. The chaos generator also sends Shift-queued moves and attack-moves now (T02).

## T-055 - The build stamp dropped the import map; a load re-read every house's stance early; stale treaty and Scots-kit text (fixed 2026-10-13, daily review)
- **Import map gone.** Commit ea216f1 stamped `index.html` with the import map removed and never written back: `tools/stamp.js` deleted the old map with a regex, then inserted the new one by matching `<script>\n// Before the game code`, which cannot match on a CRLF (Windows) checkout. The game still started (plain relative imports), but no module carried a version, so a browser could again mix a cached old module with a new one: exactly what the stamp exists to stop. `stamp.js` now reads CRLF or LF and writes the file back the way it found it, refuses to write a file it could not stamp completely, and tidies the run of blank lines earlier stamps left. A rules test checks that `index.html` has an import map that versions every file in `js/` with the current build.
- **A load played on differently (T05).** Each house's reading of every other (`stance()` in `diplomacy.js`) is cached for `STANCE.every` seconds in `game._stance`. The save left the cache out and `restore()` emptied it, so a loaded match re-read every stance at once while the match never saved still used the cached one: opinion drift then differed by a hair and the two matches parted. The determinism test only caught it after the T02 change below shifted a seed's timing. The cache is now saved with the other timers (links inside it saved as ids); older saves start with an empty cache, as before.
- **Formations could not sort themselves.** Two units of one house always pushed each other apart, so footmen ordered to the front of a Line had to shove through their own bowmen and pushed them ahead (the line ended with the bowmen in front). A walker now slips past a friend who is standing still; two walkers, or two standing, still keep a tile apart (DEMANDS: no stacking).
- **Stale text.** README still said an AI house "answers at once" to a treaty (since T-053 the envoy carries it and the ruler answers by letter), as did a comment in `game.js`. ARTREQUIREMENTS' pasted Scots kit still dressed the Scots in belted plaids and brogues, which the character guide forbids for the 12th to 13th century; it now says léine and brat, no kilts or belted plaids.

## T-056 - Playtest fixes: treaty cards squeezed off screen, serfs stuck inside a village, heirs crowned among raiders, vague refusals (fixed 2026-10-14, playtester)
- **Treaty cards broken.** An AI trade offer drew its text as a narrow column and pushed Decline and Intel off the right edge of the screen. The card's class is its kind (`offer treaty`), and `.treaty` is also the Council's row style (`display: flex`), so the card became a flex row. `.offer` is now always a block (`style.css`, end).
- **Serfs stuck inside.** Right-clicking near the home village with serfs selected sent them inside it. The selection stayed, and every later order to them did nothing: `cmdGather` gave them a gather task they could never start (they sat inside for ever), and `cmdBuild` and `cmdAttack` skipped them silently. A player-issued order (move, attack-move, attack, sack, infiltrate, gather, build, place) now brings anyone sheltering inside out first (`out()` in `_applyIntent`; the AI never sends intents, so its garrisons are unchanged), and `cmdGather` no longer hands a task to someone inside. Test in `test/rules.test.js`.
- **Heirs crowned into the enemy.** `thronePlace` always crowned an heir at the seat, even with raiders standing on it: in play an heir died moments after his crowning, twice, and the house fell at minute 17. An heir is now crowned at the first holding (seat, villages, buildings) with no hostile soldier within `KING.safeR` (12) tiles, and at the seat as before when there is none. The king's own alarm no longer waits behind another alarm's 8-second quiet time and says how many heirs are left. Tests in `test/rules.test.js`.
- **Vague refusals.** "Not enough goods." now names what is missing ("you need 50 coin and 5 stone more": `Game.lacking` and `Game.shortfall`), for building, training, hiring, drilling and crafting.
- **Setup labels cut short.** The Skirmish setup's buttons had a fixed 54 px, cutting "Egyptians", "Medium" and "Standard" short and pushing the "8" houses button outside the panel.

## T-057 - Mid too easy; spies only from taverns and never at your villages; rivals stayed home; trade pointless (fixed 2026-10-15)
- **Owner: "the game is too easy" (on Mid: "I win fights easily", "rivals are slow to grow").** Rivals marched to war with any seven idle soldiers, so they were beaten one band at a time, and every band fought to the last man. Now Mid and Hard rivals gather most of their army before marching (`DIFFICULTY.mass`) and a band facing a much stronger force falls back to its seat to regroup (`regroup()` in ai.js, `DIFFICULTY.regroup`). Mid rivals also earn more (aiMul 1.2), think faster, keep larger armies (30) and start wars a little earlier; Hard is raised in step; Easy is unchanged.
- **Spies.** The Academy trains spies as well as the tavern. Rival spies now work on the player's (and each other's) villages: outlying ones near their land, and any village of a house they are at war with or dislike. They used to touch only free villages. Counter-espionage: a spy right-clicked onto a village of your own is posted there as a watchman (it used to garrison), and each watchman adds 0.07 per second to a rival spy's chance of being caught (`SPY_WATCH`). The lord is warned when someone is turning a village against them, at most every 40 s. A spy wears down a village that has a lord at 0.45 times the free-village rate: an unopposed spy took an outlying village in about 41 s, now about 90 s. Villages under the castle's walls resist a lone spy entirely. AI houses post a watchman where they have lately found spying.
- **Trade.** A house's own land now holds only its own two metals: wild metal is placed only beyond 22% of the map width from every hall, and a mining camp inside a house's land carries that house's metals (map.js). A camel moving goods between a house's own markets earns a quarter of what it did (`ROUTE.home`); the arbitrage with a partner is unchanged.
- **Expansion.** Rivals go out for metal they lack, up to `DIFFICULTY.reach` tiles (80, 130 or 150; it was 70, which with regional metal would have kept them home), and sometimes stake a rich seam in the open ground anyway. Their far camps get a keep and posted guards.
- Diagnosis note: at map-building time villages carry `tx`/`ty`, not `x`/`y`. Reading `v.x` there gives `undefined` silently.

## T-058 - A new match inherited the last match's timers; watchmen unseen (fixed 2026-10-15, daily review)
- **A reused Game remembered the last match.** `Game.reset()` cleared most state but not `_refitT`, `_sallyT`, `_crewV`, `_infl`, `_spyWarn`, `_kingAlertT` or `_lastLog`. Starting a new valley from the end card (same page, same Game) therefore played a seed differently from a fresh page, and because `time` starts again at 0, last match's times silenced the new match's spy warnings, the king's own alarm and any log line already said last match (`time - last < 6` is true for minutes when `last` is from the old match). All are now reset; a test runs a seed fresh and on a reused Game and compares the saves byte for byte.
- **Watchmen were invisible.** T-057 let you post spies inside your villages as watchmen, but nothing showed how many were posted or that a rival was at work. Your village panel now has a **Watch** row (count, and "someone is at work here" for 20 s after a rival spy touches it); the right-click hint for a spy says it keeps watch in a village you hold. The row's mark is ARTREQUIREMENTS priority 16 (👁 until painted).
- **Ghosts on a keep's roll.** The soak's "garrison list out of sync" (new since T-057, 4 samples on seed 2 from minute 13): a soldier who deserted for want of pay while garrisoned was removed from the game but stayed on the keep's roll, so the keep showed him inside and had one slot fewer for good. `cleanup()` now takes anyone who dies inside off the roll of the building or village holding them. Test in `test/rules.test.js`; the soak no longer shows the anomaly.
- **ARTREQUIREMENTS numbering.** Walk cycles had been filed as a second "priority 14" next to the order icons, and the status table had two 13s and two 14s; walk cycles are now 15, the no-painting rows carry no number.

## T-059 - Rivals stopped growing at 11-25 villages; no way to order a retreat (fixed 2026-10-15)
- **Owner: rivals "get to around 11-25 and stop growing".** Every rival search (villages to take or court, villages to spy on) was measured from its seat (42 to 50 tiles), and keeps were capped at four. Once the land around home was taken there was nothing left in reach. Now the seat still reaches as far as before (42 to 50 tiles), and every firmly held village (loyalty 50 or more) or keep reaches 18 tiles beyond itself (`frontierOf`/`nearestFromFrontier` in ai.js). The keep cap grows to ten (2 + one per 400 s). A first try that gave every holding the seat's full reach made growth snowball (30 villages a house by 15 minutes, conquest by 30). Measured in 6-house AI matches on Mid, villages per house went from about 15 / 18 / 19 at 15 / 30 / 45 minutes (stalled) to about 21 / 27 and still climbing, with one house winning by conquest before 45 minutes.
- **Attack and Retreat orders** (owner). Attack (G) falls on the nearest foe in sight (`cmdCharge`). Retreat (R) sends the band to the nearest keep, else the seat, and breaks the no-running lock (`cmdRetreat`). Leaving a fight with three or more fighters, or the king, is a rout (`rout()`, `RETREAT` in config): every village of the house loses a fifth of its loyalty; for 180 s loyalty regains at 0.35 of its pace; other houses add "their army fled the field" to their temptation (half weight even when far: news travels). A rout counts once a minute. The AI's regroup now uses the same retreat, so rivals pay the same price.
- DEMANDS updated: Retreat is the one sanctioned way out of a fight, and it costs.
- Test note: `stance()` caches its reading for a few seconds, so a test that changes the world and reads stance at once must clear `g._stance`.

## T-060 - A spy sent at a rival building attacked it (fixed 2026-10-16)
- **Owner: "you click an enemy building as a spy and they just attack. this is useless".** A right-click on a rival building gave every selected unit, spies included, an attack order. Spies now never attack (units or buildings). A spy can wear a met house's colours (`disguise`, intent `disguise`, the Disguise row on the spy's panel). That house's soldiers and towers then pass him over (`passesFor` in `closestEnemy` and `towerFire`). In those colours he can be sent into its keep, barracks, archery, stable, tavern, workshop, armoury, market or academy (`cmdInfiltrateB` / `doInfiltrateB`, task `infiltrateB`). Inside he files the spy report, slows training to half (`b._spyT`), skims 0.3 coin a second from a market, copies 0.12 learning a second from an academy (`SPY_COVER`), and is unmasked at 0.006 a second plus `SPY_WATCH.watch` for each watchman inside. A spy right-clicked onto one of your own buildings keeps watch there. Owners are warned (`spiedOnBuilding`); rival AIs send disguised spies into hostile houses' buildings and post watchmen where they find them.
- Diagnosis note: `contextCommand` declared `units` as a const; it is now `let` so a branch can hand on what is left after the spies are dealt with.

## T-061 - Soldiers stood by while a town was hit; men would not leave a fleeing foe; burning buildings could not be mended (fixed 2026-10-16)
- **Owner: "enemy armies will attack and my soldiers will just be standing around about 3 squares away".** The call to arms (`rallyDefenders`) reached only idle soldiers within `DEFEND_R` = 5 squares of the building or village struck: the doorstep. A soldier a few squares further off stood idle unless a raider came within his own reach (6.5). `DEFEND_R` is now 14, the town radius a garrison's sally already uses. Measured: soldiers 9 and 12 squares from an attacked barracks or village used to never come; now they come within a fifth of a second.
- **Owner: "I call them back to move elsewhere and they do not obey; once a team retreats, my team should be able to pull back".** The fight lock (`locked()`) held a soldier while any foe within 3.5 squares had traded blows with him, even a foe in full retreat. A foe who is retreating, or marching away on a plain move, no longer holds anyone. An idle foe beside you still does: he can still strike. A move order after the enemy turns away is obeyed, and is no rout.
- **Owner: "once buildings are damaged and go on fire there is no way to repair".** Serfs could only raise unfinished buildings (`cmdBuild` refused a finished one). Serfs right-clicked onto a damaged building of theirs, or sent by the new Repair button (`repairWith`, intent `repair`), now mend it (`cmdRepair` / `doRepair`, task `repair`, `REPAIR` in config): two thirds of building pace, half the price for the health restored, paid as they work, stopping with a message if the purse runs dry. The fire and smoke are drawn from health, so they go as it heals. AI houses mend buildings below 75% once no foe is within 12 squares.
- Tests: the old defence test encoded the 5-square reach and was updated to 14; the melee-lock test still holds (an idle foe beside you keeps you in the fight).

## T-062 - Iron and stone looked alike; a mine did not say what it dug (fixed 2026-10-16)
- **Owner: "iron and stone is hard to tell apart. at least have mines say what mineral it is mining".** Metal deposits are the gold pile recoloured (`oreSprite` in art.js), and iron was tinted a pale blue-grey (`ORE_LOOK.iron`). Its goods colour (`GOOD_COLOR.iron`) was a grey too, next to stone's grey rock. Iron is now dark rust red in both. Every mine wears a name plate on the map in its mineral's colour (`oreLabel` in render.js, shown at zoom 0.55 and above), and its panel title reads "Mine · Iron". Painted deposits per mineral are requested (ARTREQUIREMENTS, Paint next 11).

## T-063 - Pack animals counted as people; donkeys raised from a 'camel' button (fixed 2026-10-16)
- **Owner: "population capped for making camels. camels are not people. also some are donkeys and there is a raise camel button".** `popUsed` counted every unit but the king, and `train` refused at the cap. Units marked `nopop` (the pack animal) no longer count, in the field or in a queue, and are never refused for population.
- Each people now has its pack animal in `PACK_OF` (config). Romans, Vikings, Byzantines, British and Scots use the donkey; the Mongols the Bactrian camel; the Egyptians and Persians the dromedary. Before, the British and Scots drew dromedaries. Everything shown to the player (buttons, tooltips, panels, toasts, log lines) passes through `packWords`, which says donkey or Bactrian camel for that house; a rival's beast keeps its own name when selected.

## T-064 - Ten soldiers died to a village of ten; a soldier at a wall ignored the man killing him; hires looked possible when there was no room (fixed 2026-10-16)
- **Owner: "i attack a village of 10 folk with 10 soldiers and all of my soldiers die".** Every soldier who struck a village was struck back by `maxProtection / 32` times his swing time (`hitVillage`), whatever its size and however many shared the fight. A hillfort (620) cut down ten footmen in 6 s. Now its fighting folk (a quarter of its people, `MILITIA.share`) deal `MILITIA.dps` each, times its walls (maxProtection / 220) and its armed villagers, and that is shared among everyone attacking it. Measured with 10 footmen: every kind of village of 10 folk is taken with all ten alive (a hillfort costs about a sixth of their health); a hillfort of 40 still holds.
- **Owner: "a character attacks a building, another character attacks the first, and the first continues hitting the building and dies".** A fighter attacking a building or village who is struck by an enemy unit now turns on him (`turnOnAttacker`, called from `damage`), and when that foe is dealt with goes back to the building (`task.resume`, handled in `endFight`). Hold ground still only answers a foe within reach; No attack never does.
- **Owner: "i cant recruit people from the tavern".** Hiring itself worked (checked: a tavern raised by serfs, rich, poor, at the population cap). But the hire buttons looked live with no room for anyone, and the refusal only flashed by as a toast. They now grey out, saying "No room: raise a cottage", with a note under the roster. The training buttons already did this, but greyed out pack animals too, which need no room since T-063; fixed.

## T-065 - Rivals refused pack animals at the population cap; a repair warning timer outlived its match; stale "no running" text; new buttons with no art request (fixed 2026-10-16, daily review)
- **AI-versus-player asymmetry after T-063.** Pack animals need no room since T-063, but the rivals' market logic (`treasury` in ai.js) still refused to raise one when the house was full (`popUsed < popCap`), so a capped rival lost its trade while the player kept his. It now skips the check for a `nopop` unit. Test: a rival at the cap queues a pack animal (fails on the old line).
- **A new match inherited `_repairWarn`** (T-061's "repairs have stopped" timer): `reset()` cleared every other warning timer (T-058) but not this one, so a fresh valley on the same page could stay silent about stalled repairs for its first ten seconds of play time. Reset with the others; tested.
- **README said soldiers "cannot break off" a fight** with no word of the Retreat order (T-059) or of a fleeing foe letting go (T-061). Rewritten.
- **Art requests missing for the owner's new things.** The Attack, Retreat and Repair buttons (and Stop and Attack-move) had no icon request; the disguise mask and the ore deposits had rows but no priority, no prompt and no wiring, and two rows shared the numbers 10 and 11. ARTREQUIREMENTS: priority 14 now thirteen icons, new priorities 17 (disguise mark) and 18 (ore per mineral, full and half-dug) with prompts; all wired (`uiArt('orders', ...)` on the five buttons, the `disguise` mark in the renderer, `ORE_ART`/`ORE_PAINTED` in art.js), with no file probes until a drop is listed.
- **T03 key rebinding** (not a bug; logged with the change): every keyboard command now goes through `js/keys.js` (`KEY_ACTIONS`, `rebind`, `loadKeys`/`saveKeys`, stored in `auld-world.keys`); a test checks `onKey` compares no letter directly, so a new hard-wired key would fail it.

## T-066 - No visible way to ask another king for help in a war (fixed 2026-10-17)
- **Owner: "there is no way for me to ask another king to help me in a war".** The request existed (`askwar`, judged by `judge('joinwar')`; allies also take up each other's wars on their own), but its row of buttons was drawn only in the full Council, not on the card that opens from a house's chip on the top bar. It is now on both, headed "Ask them to help you: declare war on", with the houses you are at war with first and marked "(your enemy)".
- The answer to any request (gift, demand, aid, help in a war) was toasted twice: once as the game's message and again by the panel. Now it is said once.

## T-067 - Hints named keys the player may have moved (fixed 2026-10-17, daily review)
- **Stale text after T03.** Since 2026-10-16 every key can be rebound, but four hints still named the default letters: the empty command card and the house panel ("Press **H** for your home village... **M** opens the campaign map"), the soldiers' hint ("**F** then a click attack-moves"), and two guide steps ("Press H to open your home village", "Press T for standings"). A player who moved Home village to J was told to press H. The HUD hints now print the bound key (`keyName(this.kmap...)`), and the guide's steps say `{key:hall}` / `{key:standings}`, filled from the key map when shown (`fillKeys` in keys.js). The simulation's "No foe in sight" line named F; the game has no key map, so it now says "Use Attack-move" and the button carries the key. A test fails if a guide step or a HUD hint names a bare letter again.
- **T03 grid keys** (not a bug; logged with the change): Menu > Keys > *Grid keys* (`gridKeys`, stored in `auld-world.gridkeys`). `labelGrid` in ui.js gives each command-card button a slot after every redraw (`assignGrid` in keys.js); `onKey` presses the button in a key's slot ahead of the key map, and falls through to the map when the slot is empty. Footmen, bowmen and knights can build, so their card led with the build menu and the first try put Stop and the stances on the Shift page; a card with stances now keeps orders, stances and formations on the three rows and puts everything else on Shift.
