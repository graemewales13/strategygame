# Seven Holds - troubleshooting log

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
