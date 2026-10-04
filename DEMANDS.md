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
- Camels are simple: select a camel, click the market(s) to visit (up to 3), and it keeps looping until stopped.
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
- Keep tests green (`npm test`; `npm run test:big` for the full board) and record fixes in `TROUBLESHOOTING.md`.
- Update this file whenever the owner gives a new standing demand.

## Basics must always work
- A click on the splash is never lost: it shows "Loading the valley..." and opens the menu when ready (`node tools/boot-test.cjs`, also with a CPU throttle argument).
- Splash click, every main-menu button, Skirmish/Begin, Continue, Options, Campaign, and the HUD Menu/Map/speed/house buttons must respond to real mouse clicks. Run `node tools/ui-smoke.cjs` (serve the repo on :8123 first) before pushing any UI or startup change.
