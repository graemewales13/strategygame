# Auld World – Roadmap and task backlog

What the game has, what players of strategy games expect in 2026, and the work between here and a game people would buy and keep playing. Rules in `DEMANDS.md` always win over anything here (2D only, the painted menus, conquest-only victory, and so on).

This file is reviewed daily (see "Daily review" at the end). Each task has an ID, a priority, the reason it matters, a done-when line, a rough size and a status. Sizes: **S** is one session, **M** is a few, **L** needs outside help (art, audio, a server, a store account).

## What the game has today (`grok`, 2026-10-11)

- **Core.** Real-time strategy on a seeded isometric valley of 160, 320 or 400 tiles, with five climates, rivers and fords. Three to five houses, each one of five peoples with its own doctrine. Easy, Mid and Hard difficulty.
- **Economy.** Serfs, mines worked by village folk, mining camps, foundry, forge, markets with shelves and warehouses, camel trade routes, districts that reward compact towns, and village population, tax and tribute.
- **Villages.** Influence, spies and sacking; founded villages and mining camps; drafting and arming villagers.
- **Characters.** Named people, ranks, deeds, a service record, captains, far-land tavern characters and kings with tempers.
- **Royal line.** A house falls when the last of its king and two heirs dies. A fugitive king can be hunted.
- **War and peace.** Each house reads every other (threat, temptation, ties, weariness). Ultimatums, letters, alliances, tribute and aid. Spy reports.
- **Science and arms.** Academy research tree (nine technologies) and the Armoury, which makes kit that soldiers carry.
- **Orders.** Attack-move (F or Ctrl+right-click) and four stances (Aggressive, Defensive, Hold ground, No attack), used by the AI too. Combat feedback: alert rings on the minimap, Space to jump to a fight, order lines, optional damage numbers.
- **AI.** Learns from the player's recorded play. Each people has its own doctrine. It plays for the crown and uses research, armouries, camps and captains.
- **Art.** Painted per-people buildings (the armoury with raising and ruin states), soldiers drawn with the kit they carry, portraits for far-landers and rulers, kit, research and deed icons.
- **Tooling.** Save and load with autosave (a loaded match plays on exactly as before: the simulation is seeded); synthesised sound; a guided first match; CI with browser click-through tests; headless soak, arena and placement audits.

## What strategy players expect: the market in brief

- **Proven hits.** Age of Empires II and IV, Manor Lords, Northgard, Crusader Kings III, Against the Storm, Total War and Bannerlord.
- **What sells:**
  - a strong single-player campaign
  - replayability through seeded or roguelite runs
  - co-op against AI before competitive play
  - drama from characters and events
  - seasons that change how you play
  - modding and map tools
  - replays and spectating
  - accessibility, and a Steam Deck that "just works"
- **What players won't forgive:**
  - missing basic RTS controls (attack-move, stances, waypoints, hotkey grid, idle-worker button)
  - unreadable UI
  - a weak tutorial
  - desync or lag in multiplayer
- **Where Auld World is already distinctive** (keep these and lean on them):
  - named characters with careers and deeds
  - a royal line that decides survival
  - diplomacy that explains itself
  - camel trade routes
  - an AI that learns from you

## Backlog

Priority: **P0** is needed before anyone outside plays it, **P1** before a public demo, **P2** before release, **P3** after release.

### P0: basics players expect

| ID | Task | Why | Done when | Size | Status |
|---|---|---|---|---|---|
| T01 | **Attack-move and unit stances** (aggressive, defensive, hold ground, no attack) | The most common complaint in any RTS without them; the CHARACTERS backlog asks for stances | A-click attack-moves; a stance per unit or group, shown on the panel; the AI uses them; tests | M | done 2026-10-11 (attack-move is **F** or Ctrl+right-click, since A pans the camera; T03 may let players rebind it to A) |
| T02 | **Waypoints and formations** (Shift-queued moves; line, box and loose formations) | Standard since AoE II; keeps armies readable | Shift-right-click queues moves; a formation button; groups march at the slowest member's speed | M | todo |
| T03 | **Hotkey grid and key rebinding** | Competitive and accessibility baseline | Every command has a key; an Options screen to rebind, saved locally | M | todo |
| T04 | **Interactive tutorial mission** on a scripted map, beyond the objectives panel | The first 10 minutes decide whether a player stays | A short tutorial map that teaches gather, build, train, influence, war and the royal line, with checks; skippable | M | todo |
| T05 | **Deterministic simulation** (all randomness through the seeded `game.rnd`) | Needed for replays (T11), lockstep multiplayer (T15) and fair daily challenges (T08) | Same seed and same intents give an identical state hash after 30 minutes, in a test | M | **mostly done 2026-10-11**: no `Math.random` left in the sim (game.js, ai.js, entities.js; names use the seeded `rnd`, everything else the seeded `roll`), both streams, fog and every timer saved, so a load plays on identically; `test/sim.test.js` checks two runs and a save/load at 6 minutes with 4 AI houses. Left: a 30-minute check on the full board with player intents, and a per-tick state hash to catch drift early (cheap, do it with T11) |
| T06 | **Readable combat feedback**: damage numbers optional, attacked-unit flash, minimap pings, rally lines | Players must see what is happening | Each shows in game; an Options toggle for numbers | S | **done 2026-10-11**: damage numbers (Options checkbox, off by default; red for blows you take, pale for blows you deal, only where you can see); the hit flash already existed and your fighting folk now blink red on the minimap; a pulsing red ring on the minimap where you are hit, and **Space**/**Home** jumps there (again for the next place); lines from selected soldiers to where they march or whom they attack (building rally lines already existed); your villages now warn when attacked. Tests in `test/rules.test.js`, browser check `tools/combat-smoke.cjs`. The painted alarm mark is ARTREQUIREMENTS priority 7 (wired, text until delivered) |

### P1: what makes a demo memorable

| ID | Task | Why | Done when | Size | Status |
|---|---|---|---|---|---|
| T26 | **Rivals go to war with each other.** In the 2026-10-11 soak (4 AI houses, 15 minutes, seeds 2 and 3) there were 0 wars between AI houses, while they hoarded over 3000 grain, timber and coin | A valley where the rivals only trade looks dead to a watching player; AoE and Total War AIs fight each other. Linked to T12 (what to spend the hoard on) | Soak shows at least one AI-vs-AI war by minute 15 on most seeds, with reasons on the Council; `test/learn.test.js` still green | S | todo |
| T28 | **Idle rival mines.** The 2026-10-11 soak still logs 36 samples of "mine with no diggers" (from minute 9, seeds 2 and 3) after the T-047 fix | An AI that builds mines it cannot work wastes its stone and looks careless; the hoarding (T12) partly comes from it | Soak shows under 10 such samples per seed; rival mines are only placed where a village or camp can staff them; `test/learn.test.js` green | S | todo |
| T27 | **One look per army.** The armed soldiers are full-length per-people figures; the plain ones are older shared three-quarter crops, so a mixed army looks like two games | The owner's rule is "do not change the look"; mixing two styles in one army is the most visible art flaw today | ARTREQUIREMENTS priority 5 delivered; the renderer already picks it up; a screenshot check | S (code done) + art | waiting on art |
| T07 | **Seasons and weather.** Winter slows walking and stops farms, autumn harvest, spring floods fords; ties into the existing climates | Manor Lords and Northgard show seasons create planning and drama | A visible season cycle; food and movement rules per season; the AI stockpiles before winter; tests | M | todo |
| T08 | **Daily seeded challenge and local leaderboard.** The same map for everyone each day; score by time to conquest | Cheap replayability; streamers love a shared seed | A Daily button; seed from the date; best results kept in local storage (online later, T17) | S | todo |
| T09 | **Random events with choices**, character-driven: bandits, plague, a far-land embassy, a defecting captain, a festival, a heir's coming of age | Crusader Kings-style stories; uses our characters | An event card with two or three choices every few minutes; outcomes change opinion, loyalty or stock; the AI gets events too | M | todo |
| T10 | **Unit loyalty and bribery; injuries; a unique unit per people** (CHARACTERS backlog) | Deepens the character system that sets the game apart | Each item done with panels, AI use and tests | M | todo |
| T11 | **Replays**: record intents and replay them with a speed control (needs T05) | Learning, sharing and spotting bugs | Save a replay after a match; play it back from the menu | M | todo |
| T12 | **Late-game sinks**: prestige projects (great hall, cathedral, castle walls) that cost the hoarded grain, timber and coin; mercenary companies to hire | Soak runs show rivals hoarding from minute 13; players hate a stalled late game | Projects that give influence, defence or loyalty (never a win: DEMANDS); the AI spends its surplus on them | M | todo |
| T13 | **Scenario campaign of five historical-style maps**, using the objectives system | Campaigns are the top single-player draw | Five scripted scenarios with intro text, special starts and goals; progress saved | L | todo |

### P2: release

| ID | Task | Why | Done when | Size | Status |
|---|---|---|---|---|---|
| T14 | **Desktop build** (Tauri or Electron) with **Steam**: achievements, cloud saves, Steam Deck controls | Strategy players buy on Steam; Deck verification widens the audience | An installable build; 20 achievements; controller layout | L | todo |
| T15 | **Co-op against AI, then 1v1 online** over a WebSocket relay | Multiplayer drives long-term play | Two browsers co-op a match through a relay; reconnect; lobby | L | **in progress**. Groundwork done 2026-10-11: lockstep over `relay.js` (zero-dependency server), `LockstepClient` in js/net.js, seat-stamped orders, desync detection, rejoin by replay, rules keyed to `game.humans` not `PLAYER`, URL lobby panel; tests `test/net.test.js` and `tools/mp-smoke.cjs` (in CI). Hosting ready 2026-10-12: Dockerfile, deploy/ (Compose and Caddy), DEPLOY.md for AWS (one instance; rooms are in memory), PORT, /healthz, keep-alive pings, limits, clean shutdown. Still to do: a shared room store before running more than one relay; a proper lobby screen in the menu; pause and speed votes; fast rejoin (state snapshot instead of replaying); chat; host migration; a hosted public relay; latency tuning |
| T16 | **Accessibility and localisation**: colour-blind team palettes, UI scale, subtitles for letters, a string table | Wider audience; store requirements | Options for each; all UI strings in one table | M | todo |
| T17 | **Online leaderboards and opt-in telemetry** for balance | Live balance needs data | Opt-in only; a privacy note; dashboard of win rates per people and tier | L | todo |
| T18 | **Performance on Huge maps and weak machines**: simulation in a worker thread, profiling | The soak shows slow ticks above 40 ms on busy turns | Huge map at 60 fps on a mid laptop; no tick over 33 ms in the soak | M | todo |
| T19 | **Art delivery and wiring** per `ARTREQUIREMENTS.md`: armoury, kit icons, portraits, construction and ruin states | Store screenshots and trailer | Each delivered asset wired, with fallbacks kept | L | priorities 1-4 delivered and wired 2026-10-11; waiting on priority 5 (plain soldiers per people, so an army has one look) and 6 (raising and ruin states for every building) |
| T20 | **Real audio**: recorded effects and a composed score per people | Synth sound is serviceable only | Delivered and wired; volume sliders still work | L | waiting on audio |
| T29 | **Art manifest instead of probing.** The game asks for about 35 optional art files that do not exist yet (plain soldiers per people, building states), so every boot logs 35 "404 File not found" errors (seen in `tools/boot-test.cjs`) | Console noise hides real errors, and a slow host pays for each miss; a store build should load clean | `tools/art-manifest.js` writes `assets/manifest.json` of what exists; `js/art.js` loads only listed files; boot test shows 0 404s; art drops still picked up after running the tool | S | todo |
| T21 | **Store page kit**: trailer capture mode (hide UI, free camera), screenshots, short description | Needed to sell | A photo mode; ten screenshots; a 60-second capture | S | todo |

### P3: after release

| ID | Task | Why | Done when | Size | Status |
|---|---|---|---|---|---|
| T22 | **Map and scenario editor**, with sharing and Steam Workshop later | Modding keeps RTS games alive for years | Place terrain, villages, ore and houses; save, load and share a file | L | todo |
| T23 | **Roguelite "Conquest" mode**: a chain of maps with persistent heirs, captains and relics | The Against the Storm and Northgard Conquest model of replayability | Three-map run; carry-over choices between maps | L | todo |
| T24 | **Naval layer** on rivers and lakes (barges, river trade, fording fights) | Rivers are already on every map | Boats on water tiles; river trade; AI use | L | idea |
| T25 | **Spectator and caster tools**: player views, a stats overlay | Esports and streaming | Observer mode on replays and online matches | M | idea |

### Standing work (every session)

- **Gap hunt first** (owner's standing order): stale text, state not reset or saved, AI-and-player asymmetry, dead ends, wrong numbers, rules that clash. Log fixes in `TROUBLESHOOTING.md`.
- **Keep tests green:**
  - `npm test`
  - `node test/big.test.js`
  - the soak (`node tools/soak.js 15 2,3 4` and `... chaos`)
  - placement audits at zero (DEMANDS: T-043)
- **Balance check after any AI or economy change:** `test/learn.test.js` guards the learned-playbook behaviour; do not weaken it to make a change pass.

## Daily review

Each day the review agent:
1. Re-reads this backlog against the game.
2. Updates statuses.
3. Adds or re-ranks tasks with a reason.
4. Does a gap hunt.
5. Takes one task forward.
6. Appends a dated line below.

Newest first.

- 2026-10-11 (third run): Reviewed the backlog, the last commits (no new art from Grok since 8b7d6f1) and the soak. **Art**: re-checked every delivered file (RGBA, transparent corners, no pink left: only the old rectangular unit cards and the sheet are meant to be opaque); the armoury and armed soldiers look right in a live fight screenshot; added ARTREQUIREMENTS **priority 7** (a war-horn alarm mark), wired into the under-attack warning with text as the fallback, and noted that the rest of T06 is drawn in code. **T06 done**: optional damage numbers (Options), minimap alert rings and red blinking for your folk in a fight, **Space**/**Home** jumps to the fight, order lines for selected soldiers. Gaps fixed (T-050): your villages (your home seat included) gave no warning when attacked; the "Raise an army" step ignored soldiers garrisoned in a keep. Backlog: added **T28** (rival mines nobody digs: 36 soak samples) and **T29** (35 missing-art 404s on every boot: use a manifest). Next: T26 (rivals still fought no wars with each other in 15 minutes) or T02 (Shift-queued waypoints and formations), then T28.
- 2026-10-11 (second run): Reviewed the backlog, Grok's art drop and the last two commits. **Art**: all 82 files from 8b7d6f1 were on a pink ground (armouries drew as pink rectangles); keyed, trimmed and defringed with a new `tools/chromakey.py`, then wired: armoury raising and ruin states, armed soldiers drawn with their kit, kit and research icons on the Armoury, Academy, queue, stockpile and unit panel, far-lander and ruler portraits (tavern, unit panel, Council), deed badges, the captain standard dyed per house, the fugitive crown; `tools/art-smoke.cjs` screenshots it all. ARTREQUIREMENTS now has a status table and asks for priority 5 (plain soldiers per people) and 6 (raising and ruin states for every building). **T05 mostly done**: no `Math.random` left in the simulation, both seeded streams, fog and all timers saved, and a test proves two runs of a seed and a saved-and-loaded match end identical. Gaps fixed (T-049): a load forgot which deposits lay under a mine or village (serfs dug under mines again) and dropped every timer; stale README armoury text; the spy test stubbed `Math.random`. Backlog: added **T27** (one look per army, waiting on art); T05 and T19 statuses updated. Next: T26 (rivals fight each other: still 0 AI-vs-AI wars in today's soak) or T06 (combat feedback); T08 (daily seeded challenge) is now unblocked and small.
- 2026-10-11: Reviewed the backlog against the game and the soak. **T01 done**: attack-move (F, the Attack-move button, or Ctrl+right-click; fights every foe on the way, then walks on) and four stances per soldier (Aggressive, Defensive with an 8-tile leash, Hold ground, No attack), shown on the unit panel and command card, saved with the game; rival houses keep their home guard Defensive at peace and send war hosts out Aggressive. Four new rules tests and a browser click-through (`tools/stance-smoke.cjs`). Gaps fixed (T-048): minimap right-click threw, and the chaos soak crashed at 0:00 on every seed. Backlog: added **T26** (P1: AI houses never fought each other in the 15-minute soak); noted the `Math.random` calls still to route for T05. Next: T05 (determinism), then T06 (combat feedback) or T26.
- 2026-10-10: Backlog written. Next up: T01 (attack-move and stances), then T05 (determinism), which unlocks T08, T11 and T15.
