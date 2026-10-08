# Auld World: the owner's standing demands

Everyone working on this repo (people and agents) keeps to these. They come straight from the project owner. Do not reverse one without being told to.

## Identity and look
- The game is **Auld World** (not Seven Holds). Art is painted, AoE II style, never cartoony.
- Five peoples only: Egyptians, Romans, British, Mongols, Scottish. No Vikings. *(branch `grok`)*

## Winning and losing
- **Conquest is the only win.** Every rival house must be killed or forfeit. Trading, wealth or holding villages must never win the game.
- **Do not modify or reintroduce a land (village-share) win or a wealth win.**
- A house forfeits after 45 s with no home village and no soldiers.

## Map and fog
- The board is at least 8x the original area (320x320). Mining material stays at the original total, so it is scarcer. Village frequency stays the same.
- The black fog must reveal about 8x more ground as a player travels.

## Villages and influence
- Independent villages must be plentiful enough to sack or influence; influence builds up over time from buildings placed beside a village, or by attacking.
- A captured village brings every building within about four tiles with it; those buildings are marked as belonging to the town.

## Camels and trade
- Camels are simple: select a camel, click the market(s) to visit (up to 5) or press All my markets / Trade partners, and it keeps looping until stopped. A route camel must NEVER stall or go idle on its own: it always walks its circuit, loading at every stop, trading both ways with treaty partners, and must not be able to earn coin by shuttling the same goods back and forth.
- Camels trade only with markets (yours or a treaty partner's), never with villages.
- A market shows its goods and the revenue a camel's load would earn.

## Economy logic
- Mined materials flow to a market or are used to make something, which then flows to a market. Small local towns follow that chain.
- Compact communities (market + supply + works + homes + service nearby) must benefit a team more than buildings dotted around at random.

## Controls and UI
- Clicking characters must show build options straight away (units are picked before buildings); no need to select several first.
- Serfs get one button each to cut trees or go home.
- The diplomacy buttons (peace, trade, war) must work and say why when refused.
- The black-screen failure must never come back: failures are caught and reported, not left as a blank canvas.

## Process
- Run `node tools/stamp.js` before pushing anything under `js/`: it versions the module URLs so a browser can never mix a cached old file with a new one (that mismatch leaves the game stuck on the splash).
- Keep tests green (`npm test`; `npm run test:big` for the full board) and record fixes in `TROUBLESHOOTING.md`.
- Update this file whenever the owner gives a new standing demand.

## Basics must always work
- A click on the splash is never lost: it shows "Loading the valley..." and opens the menu when ready (`node tools/boot-test.cjs`, also with a CPU throttle argument).
- Splash click, every main-menu button, Skirmish/Begin, Continue, Options, Campaign, and the HUD Menu/Map/speed/house buttons must respond to real mouse clicks. Run `node tools/ui-smoke.cjs` (serve the repo on :8123 first) before pushing any UI or startup change.

- Board size is chosen before the match and stored in the browser; do not make the land or wealth victory rules depend on it.

## The AI learns from the player
- The player's play is recorded (orders + periodic samples, in the browser) and the rival AI is trained from it **continually**, until it is well trained. Recording must never break play (the recorder is wrapped and switches itself off on error), must be switchable off, exportable and clearable, and the AI must fall back to its built-in habits when there is no usable recording. A playbook only nudges the AI (confidence-capped); it must never remove the AI's ability to build everything or fight.
- Full markets spill into warehouses (`WAREHOUSE_CAP`), which refill the shelf; goods can be moved on by camel routes or sold.

## Title screens, crowds, defence, the throne
- The splash and title menu are the painted pictures (`assets/menu/`), with the menu buttons as hotspots over the art. The owner rejected the "clean type over a live valley" title look (reverted 2026-10-08): do not bring it back. Keep `#hContinue/#hNew/#hMap/#hSkirmish/#hOptions/#hQuit` ids as real buttons.
- The game is 2D only. The owner rejected the Three.js 3D view (reverted 2026-10-08): do not reintroduce it.
- Units keep room (`Game.separate`): a marching group is never stacked into one body.
- Idle soldiers within `DEFEND_R` (5) squares of a building, unit or village under attack turn on the attacker (`rallyDefenders`).
- A king is always appointed: an heir is crowned `KING.heir` (2 s) after a king falls, and a house with no king and no heir timer is given one.

## Peoples, names and building room
- Characters must never stack into what looks like one person: keep at least about a tile between them. Camels with work available must not stand idle unless the player stopped them.
- House names must fit their nation (Khemet, Aurelius, MacAlpin, Wessex, Borjigin). The player is not always the same people: Skirmish setup has "Your people" (Random by default, seeded; the seating is saved with the game).
- Buildings keep a one-tile lane between them (`BUILD_GAP`, mines excepted) so tall sprites never pile onto each other.

## Rulers, ratings and rival houses
- Every house is led by a named **king** character; soldiers carry **ratings** (ranks) that matter in combat and in influence over villages.
- Information and interaction with other houses must be rich, like a real strategy game: stats (size, money, influence, power), trade/war/alliance, and rival leaders who **send letters** (alliance offers, calls to join wars against third houses, tribute demands, aid requests). Keep this on the Council screen (C) and the house panel.
- An AI that makes peace must not re-declare war within moments; a house with only a village left must still be attacked to finish it (an idle player must lose).
- In a fight characters must not simply run away (serfs excepted). When something in a town is attacked, garrisoned soldiers leave their buildings and fight, then assess the town, fight on if needed, otherwise return inside.
