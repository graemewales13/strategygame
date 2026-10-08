# Auld World

A browser real-time strategy game in the spirit of *Seven Kingdoms* and *Age of Empires II*. You start with a home village of thirty folk and three serfs in a wide valley, and grow a house until you rule it. Plain HTML, CSS and JavaScript modules; canvas for the field. No build step, no dependencies.

You are the yellow seat. Choose your people in Skirmish setup (Egyptians, Romans, Scots, British, Mongols) or leave it on Random: the nation, house name and motto are dealt per game (and per seed), the colours stay with the seats. Houses are named for their people: Khemet (Egyptian), Aurelius (Roman), MacAlpin (Scottish), Wessex (British), Borjigin (Mongol). Pick 3, 4 or 5 houses in the menu; empty seats are AI.

## Run it

ES modules do not load from `file://` (double-clicking index.html leaves the menu dead). Easiest: double-click `start.bat` (Windows) or `start.command` (Mac), or run `node serve.js`. Or serve the folder:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>. (Any static server works. Python is only used here as a file server.)

Handy URL options: `?seed=2024` (repeatable valley), `?houses=5`, `?fog=0` (see everything), `?start=1` (skip the menu).

Tests (Node 18+, no installs): `node test/sim.test.js`. They run the simulation headless: map connectivity on 90 generated valleys, economy, building, training, pillage, spies, influence, trade, war, AI growth and a full match.

## How to play

1. **Gather.** Drag-select your three serfs, right-click timber, berries or gold. They carry goods to your village.
2. **Grow.** Select your village (**H**). Draft serfs from its folk, or arm a villager now and then (one every 20 s, a recruit at about a quarter of a footman's strength: real soldiers come from a barracks or a keep's drill). Serfs fight back when struck, at about an eighth of a footman. At first you may raise only a mine, market, foundry, tavern, keep and barracks; cottage (needs a market), farm, mill, archery, tower, academy and the rest unlock as you build. There is no territory circle: build anywhere you have scouted. Distance changes the *community* around a site instead (see "Rules in one page").
3. **Take villages.** Fourteen independent villages sit in the gaps. Three ways to win one:
   - **Pillage.** Soldiers fight it until its *protection* hits zero. It submits to you with middling loyalty. The folk fight back, hillforts hardest: bring rams.
   - **Influence.** A hall, keep, tower, tavern, temple or academy near a village slowly raises its *loyalty*. Past 72 it comes over without a sack. Scholars beside an academy amplify it.
   - **Spy.** Hire a recruit at a tavern, select it and press **Become spy** (25 coin), then right-click the village (or use **Send spy** on the village panel). Loyalty rises while it is inside, but spies can be caught (sturdier villages watch harder). A spy inside a village a **rival house** holds also sends a **spy report** to that house's Council card: their exact purse, army by kind, captains and far-landers by name, whom they mean to make war on and which village they are marching on (it fades 45 s after the spy leaves). A spy caught in a held village angers its lord.
   
   Owned villages pay tribute. Loyalty drifts down if your seat is far away, and an enemy keep nearby pulls it the other way.
4. **Minerals and mines.** Deposits of stone, copper, iron, coal and silver lie in the valley (every hall has stone and two of the four metals near it; the rest must be found or traded for). Raise a **Mine** on a deposit, then villagers from villages within 16 tiles dig for it on their own (up to four; no village in reach means no workers; your own villages dig 50% harder and warm to you). The placement ghost shows the range and which villages would work it. Ore far from any village? Have serfs **found a village** beside it (needs a keep *or* a mine): founded within 10 tiles of a deposit it becomes a **mining camp** of 8 folk whose people dig the mines around it at once. Rival houses do the same: when they lack an ore that no village can dig, they found a camp beside it and raise its mine. At the tavern they hire for value, far-landers first. Ore goes straight into your stockpile (shown beside the grain/timber/coin counters). Each good has a value.
5. **Treaties, markets and camels.** Houses you have *met* can be offered a **trade treaty** (select your Market, or click their name in the top bar). An AI house answers at once; an AI offer shows an Accept/Decline card. A **Market** is the trade hub: its shelf fills from mines (their ore), foundries (steel, fine ware), farms, mills and warehouses within 24 tiles. Train **camels** at the market, select one beside it, load goods (40 max), then right-click a treaty partner's market or any village: it swaps what it carries for the good you picked (distance fee), walks home and unloads into your stockpile. Independent mining villages sell their ore without a treaty. Cancelling a treaty ends trade.
6. **Automatic use.** Stockpiled goods are used by the right building without orders: the **Foundry** smelts iron+coal into steel and copper+coal into fine ware; the **Forge** turns 6 steel into an arms level (max 3: more melee/ranged damage); the **Academy** turns 6 silver into a science level (Husbandry: more grain and gather speed; Masonry: sturdier new buildings; Drill: tougher new units); fine ware keeps villages near a market, tavern or temple content (+30% tribute, loyalty). Stone is also a building material (keep, tower, foundry). Steel and ware can be traded too.
7. **Characters and right-click orders.** Every order is a right-click: build (right-click a site; **Shift** queues more, so one serf can raise several buildings), gather or mine, attack a foe or a village, spies infiltrate a village, and **enter** your own hall, keep, tower, barracks or a village you hold (garrisoned units are hidden, heal, and soften a sack of a held village). Only serfs build and gather (villagers dig the mines); recruits and soldiers fight; each unit's panel lists what it can do. Different buildings train different characters.
8. **Tavern and castle.** The **Tavern** offers three random wanderers (each with a name and a trait such as Brawny, Keen, Fleet or Veteran) that you buy with coin and grain; the roster refreshes now and then. Put recruits, serfs, or **levied villagers** inside a **Keep** and drill them into footmen, bowmen or knights (they keep their traits). To levy, select the keep and right-click a village you hold: it sends a villager every 25s until it runs low, then regrows.
9. **Fight.** Attacking a house at peace declares war. A house falls when **the last of its royal line** dies: every house has a king and two heirs, each heir crowned 20 s after the king before him falls.
10. **Win** when the last king of every rival house is dead. You lose when the last of your own line dies. A house that loses its seat lives on while its king does, but a king without a seat is a fugitive whom every house can see.

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

## Camel routes
An idle camel never just stands: it resumes its route, or loops all your markets, or your best treaty partners. Only a camel you stopped (Stop / stop route) or sent somewhere by hand waits for a new order. Folk keep a full tile of room from each other, so a group reads as separate people.
Select a camel and press **All my markets** (circles every market you own, nearest first) or **Trade partners** (your market plus the best treaty-partner markets), or click markets on the map to build a loop of up to five. The loop is drawn on the map while the camel is selected (H = home market). The camel never stops: at each of **your** markets it unloads onto the shelf (goods bought abroad go to your stockpile), banks its coin, has the shelf topped up from the stockpile for goods the market's mines, foundries, farms, mills and warehouses supply, and loads whatever the next market lacks; the townsfolk pay a bounty for goods moved from where they are plentiful to where they are scarce (priced as shelves empty and fill, so shuttling the same goods back and forth earns nothing), and they eat goods that arrive by camel, paying coin, which keeps scarce goods wanted. At a **partner's** market it sells for coin (or the chosen good) and then spends its coin on goods that are cheap there and dear at the next stop, so trade runs both ways. It carries a working purse (up to 100 coin) from the treasury and returns it. Tuning lives in `ROUTE` in `config.js`.

## Warehouses and full markets
A market shelf holds 60 of each good (100 with a warehouse in reach). Once a shelf is full, a warehouse within 20 tiles takes the surplus (ore, steel, wares, wood goods; up to 150 of each) and refills the shelf as it empties, so camels on your own routes can move stock to your other markets, or sell it to other houses' markets.

## The rivals learn from you
Every match you play is recorded in your browser (menu > **AI training**: on by default, switch off, export, import, clear): your orders (what you build and train, when you attack, when you declare war) and a reading of your house every 20 seconds (serfs, army, camels, where the serfs work). After each match the game **learns a playbook** from your recordings and the rival AI blends it into its own habits: build order, how fast the army grows, how many serfs, the mix of footmen/bowmen/knights, when and how large the first attack is, when it goes to war, where serfs work, how many camels and whether they run loops. Wins count more than losses. The rivals trust the playbook in proportion to how much you have taught them (confidence = 1 - e^(-matches/3), capped at 85%, "well trained" from 80%, about five wins' worth) and never stop learning: the playbook is rebuilt between matches, never mid-match.
- `node tools/train.js` merges exported recording files from `data/recordings/` into `data/features.json`, which the game ships with, so a trained AI can be committed and every copy of the game starts trained.
- `node tools/arena.js [minutes] [seeds] [houses] [file]` is the measure of "well trained": headless matches where one house plays by the playbook and the rest by the built-in habits, against a control where nobody does, reporting the change in relative power.
- `RECORD=dir node tools/play.js ...` records the scripted test player the same way a human is recorded (for testing the pipeline).

## War and peace: how the houses read each other
Every house keeps a reading of every house it knows, and the Council card shows its reading of you ("They see you: wary · threat 40% · temptation 20% · ties 30%", with the reasons):
- **Threat**: your keeps, temples and markets swaying *their* villages, your soldiers standing in their land, your army close by and stronger.
- **Temptation**: you are weaker, already at war with someone else, have an empty throne or treasury, or a village of yours lies close and poorly guarded.
- **Ties**: trade, alliance, a common enemy, goodwill, distance and a peace newly made.
- **Weariness** (in a war): how long it has lasted, men lost, an empty purse, other fronts.

All of it fades with distance: neighbours quarrel, far houses rarely do. A house goes to war when threat and temptation, weighed by its ruler's temper, clearly outweigh its ties (Easy waits for a strong case, Hard for a weaker one; no house starts a war in the first part of a match). Against you it sends an **ultimatum** first: a letter naming its grievance and the coin that would keep the peace. **Accept** (pay) and the peace holds for a while; **Decline** and it is war at once; ignore it and it is war when the letter lapses. Or remove the grievance: select a building of your own and **Pull down** (two clicks, a third of the cost back; a site still being built can be cancelled for four fifths back). A house sues for peace (and accepts one) when weariness and being outmatched outweigh what it hopes to win; a peace is kept a while, and both armies stand down. Two houses threatened by the same neighbour lean toward alliance. Border friction (their buildings over your villages, soldiers in your land) slowly sours opinion.

Rival houses play for the crown: at war they strike an **exposed king** first (seen, outside walls, within reach), lay siege to the keep a king shelters in, and run a fugitive king down. Their own king shelters in a keep when foes come near and he is hurt, outnumbered or the last of his line, and steps out once it is quiet. Guard yours the same way.

## Rulers, ratings and the Council
- **Every house has a king** (Pharaoh, Imperator, King, Khan or High King by people), a named character with a temper: *warlike, mercantile, honourable or cunning*. Yours begins at your home village; **K** selects him. Soldiers within 8 tiles of him hit 10% harder and learn faster, and villages he stands among lean toward his house. He is not counted as population, army or a pay-roll soldier. If he falls, villages lose loyalty, soldiers fight at 85% until the next **heir** is crowned (20 s), and the slayer is famed. A house has two heirs: when the last of the line dies, the house falls (the Council card shows how many heirs each house has left). Keep him in a keep to heal.
- **No running from a fight.** A soldier (or king) who has traded blows with a foe still within 3.5 tiles cannot break off: move, garrison and work orders turn into fighting on until the foe is dead. Serfs, scouts, spies and camels may still run. **Garrisons sally:** when foes come near a garrisoned keep, tower, barracks or village (or something in its town is hit), the soldiers inside march out and fight; afterwards they look round the town, fight any other threat, and only then walk back in.
- **Ratings.** Soldiers (and recruits, scouts, kings) earn experience by wounding and killing, and rise Rookie, Trained, Veteran, Elite, Champion. Each rank adds +12% damage and +10% health, and a rated soldier standing guard counts for +25% per rank when a keep or village is swaying its neighbours (a king counts double). Ranks show as gold chevrons; the unit panel shows progress. A *power* score (health x damage, ranks included) is what leaders weigh.
- **Council of Houses (C or the Council button).** Ranked cards for every house: leader and temper, villages, folk, army and power (against yours), money (exact for trade partners and allies, otherwise a guess), influence, learning, how they feel about you and why, who they are allied or at war with, and every action: peace, trade, **alliance**, war, gifts, demand tribute, ask for aid, ask them to declare war on a third house. Below, the correspondence.
- **Opinions and letters.** Every house keeps an opinion of every other. Trade, common enemies and gifts warm it; envy of the strongest, broken oaths, sacked villages, slain kings and fighting a friend sour it. Leaders judge requests by opinion, strength and temper, and **write to you**: alliance offers, calls to arms against a third house, tribute demands (defy a stronger house and it may declare war), pleas for aid, offers of peace when losing, gifts, warnings. Letters appear as cards top right with Accept and Decline, and lapse if ignored (ignoring a demand or call to arms counts as refusing). Allies trade freely, never fight each other, and join each other's wars; breaking an oath is remembered by everyone. Victory is still conquest only: allies are for convenience.

## Science and weapons
**The Academy is your science division.** Every academy makes *learning* (0.3 a second, +0.15 for each scholar beside it, up to four; each abbey you hold adds 0.05; up to 300 is banked). Select an academy and choose one research at a time; learning pays for it, and the deeper tiers also cost silver (paid when chosen, refunded if you change your mind):

| Tier | Research | Needs | Does |
|---|---|---|---|
| 1 (30 learning) | Husbandry | - | +15% farm grain, +10% gathering and digging |
| 1 | Masonry | - | new buildings +15% health |
| 1 | Drill | - | new soldiers +15% health |
| 2 (60 + 4 silver) | Metallurgy | Masonry | unlocks the **Armoury**: spears, mail |
| 2 | Fletching | Drill | longbows |
| 2 | Medicine | Husbandry | idle soldiers mend; scholars heal twice as fast |
| 3 (100 + 8 silver) | Steelcraft | Metallurgy | swords, lances, plate |
| 3 | Mechanics | Metallurgy, Fletching | crossbows; rams +30% health |
| 3 | Engineering | Masonry, Medicine | towers +2 range; keeps and towers +25% health |

**The Armoury** (needs a forge and Metallurgy) makes kit into your stockpile from timber, iron and steel, five orders at a time: spears (+2 damage, +60% against horse), swords (+5), longbows (+1 damage, +1.5 range), crossbows (+6, slower to load), lances (+6), mail (+25% health), plate (+50% health, a little slower). Soldiers take up the best kit for their kind when trained or drilled, and swap up (handing the old kit back) when they stand idle within 7 tiles of an Armoury or sit garrisoned in a keep or barracks. The unit panel shows each soldier's kit. Rival houses research too, build armouries and keep kit in stock. Art still to come is listed in `ARTREQUIREMENTS.md` (until then the armoury borrows the forge's sprite).

## Characters: far-landers, deeds and captains
Every fighter keeps a **service record** (kills, buildings razed, time served, where they were raised) and earns **deeds** from what they do: Blooded, the Slayer (10 kills, +8% damage), Kingslayer (+10% damage), Giant-killer and Death-cheater (+10% health each), Wall-breaker (+25% against buildings). Taverns sometimes offer a **far-lander**, a traveller of a people with no house in the valley (Norse, Parthian, Greek, Han, Rus, Moorish, Aksumite, Eastern Isles), with a gift of their homeland that stays with them when drilled (berserker, outrider, physician, drillmaster, horse-breaker, caravaneer, envoy, duellist). An Elite or better soldier can be made **captain** (60 coin, three per house): soldiers near a captain hit harder and learn faster. Training buildings show a **muster roll** of everyone raised there, a group selection lists each person, and a click on a rival unit or building shows their house, standing, opinion of you and ruler, with a Council button. See `CHARACTERS.md` for the assessment and the comparison with Seven Kingdoms, Age of Empires II and others.

## Tech tree (short)

Start: mine, market, foundry, tavern, keep, barracks. Then: market → cottage → farm → mill; mine → warehouse; keep → village, academy, temple; barracks → archery, tower; and so on.
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
  render.js       isometric (2:1) canvas drawing only; reads state, never changes it
  terrain.js      painted terrain chunks (soft river banks, trails, fords) and the smoothed fog layer, drawn isometrically
  art.js          loads the painted sprites in assets/world/ and recolours banners and unit trim per house
  assets/ui/      portraits, building icons and menu backdrop cropped from the concept boards
  assets/world/   buildings, trees, units and the village cluster cut out of the concept boards
  ui.js           HUD, input, menu, campaign map; talks to the host via intents
  main.js         requestAnimationFrame loop
test/sim.test.js  headless simulation tests
assets/           screenshots, art sheets, early concept boards
legacy/python/    the first pygame prototype, kept for reference (not the playable build)
```

## Multiplayer note (not shipped yet)

The structure is host-authoritative. `Game` is the only thing that mutates state; it has no DOM access and runs under Node. Every player command is an *intent* (`move`, `attack`, `gather`, `place`, `train`, `pillage`, `infiltrate`, `trade`, `relation`, `respond`, `gift`, `demand`, `askwar`, `askaid`, `rally`, `context` ...), sent with `host.send(intent)`. Today `LocalHost` applies it to an in-process `Game`.

To go online: run a `Game` on a server, let each client's `SocketClient.send` forward intents tagged with its team, apply them with `game.applyIntent`, tick on the server, and broadcast `game.snapshot()` (compact JSON of players, units, buildings, villages and relations) a few times a second. Clients render the latest snapshot instead of the local `Game`. There is no lockstep and no prediction yet; the AI would simply run on the host for empty seats.

## Not in this slice

Steam, matchmaking, lockstep replays and a cloud cluster. Single-player against AI is finishable.

## Licence

MIT. See `LICENSE`.

## Troubleshooting

`node tools/soak.js [minutes] [seeds] [houses] [chaos]` plays headless matches, checks invariants (stuck units, negative stock, sync of garrisons, NaN, snapshots, tick time) and writes `logs/soak-latest.log`; `chaos` replaces the player's AI with a random intent generator. Findings and fixes are tracked in `TROUBLESHOOTING.md`.

## Village population
Every village has folk (hamlet 16, market town 18, mining camp 12, hillfort 10, abbey 9, inn 6 at most), drawn as villagers strolling about and counted in its panel. They eat from the village store (0.003 grain each per second): fed villages grow a villager every 45 s, a dry store shrinks them. Selling a village's grain to your camels can starve it; buying grain for it grows it. A village you hold houses half its folk (they raise your population cap), pays tribute by how full it is (50% empty to 120% full), can **Call settler** (one villager becomes your serf for 20 grain), and feeds a keep's levy. A sack costs a quarter of the folk.

## Random terrain
Each game picks a climate from its seed (Green valley, Dry steppe, Desert flats, Rocky highland, Winter lands) and noise mixes seven ground types inside it, using the painted tiles cut from `assets/art-drop/shared/terrain` (`python3 tools/cut_terrain.py` rebuilds `assets/terrain/`). Rivers are random (none, one or two, at any angle, with fords), as are ponds, ridges, and which corner each house starts in. Rock ridges and water block movement and building; snow slows walking (x1.25 cost) and sand (x1.12); steppe and snow farms yield less. Halls always stand on a livable patch, every hall is connected to every other, and a building may not seal off a pocket of ground (units inside would be stuck). Pines grow in snow, palms in sand.

## Rules in one page

The point of the game is to expand and rule, so **nothing stops you building as far as you can scout**. What distance and company change is how a place *works*:

| Rule | What it does |
|------|--------------|
| **Build anywhere scouted** | Only water, blocked ground, deposits (other than mines) and unexplored fog stop a site. Scouts and keeps reveal the valley |
| **Influence** | Villages lean toward whoever has castles, temples and taverns near them. A hall, keep, tower or barracks pulls at 35% unguarded and at full strength with 4 soldiers garrisoned or standing watch. Soldiers billeted in a village you hold steady it |
| **Haul** | Ore dug far from any of your stores (hall, keep, warehouse, market) loses yield on the road: full within 14 tiles, 45% at 60+. A warehouse or market beside a remote mine restores it |
| **Workforce** | Builders and gatherers are serfs (mines are dug by nearby villagers), housed by cottages and held villages; remote sites need serfs to walk there and back |
| **Consumers** | A market's coin grows with the cottages and villages of yours within 24 tiles, and its shelf only fills from suppliers that near |
| **Loyalty drifts away** | A village you hold with no castle, temple or garrison near it slowly forgets you and slips back to independence |

## Trade routes and standings
Money is the first measure of a house; the others are land influence (villages held), population, army, science and loyalty. Press **T** for the standings table.

- Select a partner's market or a village: the **trade board** shows its coin purse, what it sells, what it pays for your shelf goods (scarce there = dear) and the profit of a full load.
- **Select route** sends your nearest free camel: load the best-selling goods at its home market, sell them for coin (or the good chosen under *Bring home*), walk back, repeat. **Stop route** ends it. Fees grow with distance; independent villages pay a little less than treaty markets.
- Village purses refill from their folk (bigger villages pay more); AI markets pay from their treasury.

## Peoples and painted kits
Five peoples (`FACTIONS` in config): Egyptians, Romans, British, Mongols, Scottish. Vikings are not a house. The peoples are seated by `setPeoples/seatPeoples` in config (default order: Khemet Egyptian, Aurelius Roman, MacAlpin Scottish, Wessex British, Borjigin Mongol); seat colours never move. Single-sprite JPGs dropped in `assets/art-drop/{factions,shared}` are keyed from magenta and trimmed by `python3 tools/cut_sprites.py` into `assets/factions/<people>/buildings/<kind>.png` (committed). A house draws its own people's building when the PNG exists, else the common set. Camels draw as dromedary (Mongols: Bactrian, Romans: donkey); the ram and hamlet use the shared art. There is no Viking kit.

## Money and manpower (the economy)
Start: a home village of **30 folk**, **three serfs**, 300 grain, 480 timber, **320 coin**, 60 stone. Coin is booked by source (hover the coin counter; the green/red figure beside it is net income per second after army pay). `node tools/econ.js [minutes] [seed] [team]` prints a per-minute table of any rival house.

| Flow | How |
| --- | --- |
| Income | digging or panning gold (0.6–0.7/s a serf; seams are finite), **selling the stockpile at a market** (60% of worth, each sale lowers the price, it recovers), caravans on routes (profit over worth), market consumers, taverns, **village tax** (0.011/s per villager), village tribute, sacks |
| Upkeep | **army pay**: footman 0.05, bowman 0.065, knight 0.12 coin/s each beyond the first four (household guard). An empty purse for 20 s: soldiers hit at 70% and one deserts every 30 s |
| Up-front | footman 15c, bowman 30c, knight 80c, keep 150c, barracks 40c, village 30c plus timber and grain |
| Manpower | hall 6 + cottage 5 + keep 8 + half of the folk of every village you hold. Serfs 50 grain / 8 s. Villages feed more: **draft** serfs (20 grain) or arm a villager (25, one per village every 20 s) |

## Villages you found
Build **Village** (needs a keep or a mine, 100 grain, 150 timber, 30 coin, 30 s). When serfs finish it, it becomes a living village of 4 settlers that grows (one every 22 s while fed; it tills its own fields) to **50**. Villages are always 1x1 tiles, drawn with the supplied art (hamlet, then farmland past 15 folk, then a market town past 35). Select it: **Serfs ×5**, **Soldiers ×5** (footmen if you have a barracks and coin, else recruits). Never emptied below 2 folk.
**Sack**: when soldiers take a village by force you carry off 80% of its stores (coin included); a fifth of the folk die, and of the survivors 15% become serfs and 20% soldiers (40% in a hillfort or inn) as long as you have room. Winning by influence or a spy brings no loot.
**Castles**: serfs and soldiers can raise a keep beside a village (soldiers at 60% speed); a keep garrisons up to **8** soldiers.
**Names**: every unit is named from its people's pool (`js/names.js`), shown in the selection panel and over selected units.

### Playtesting tools
`node tools/play.js [minutes] [seeds] [houses] [econ|rush|turtle]` plays house 0 like a person (only the intents the buttons send) against the AI and lists refused orders, stalls and outcomes. `tools/soak.js` runs all-AI matches; `tools/econ.js` prints a house's economy per minute.

### Ways to win and lose
- **Conquest is the only win:** the royal line of every rival house must end (king and two heirs). Wealth and village share never win.
- You lose when your last village and keep fall.
The first five buildings are the game: mine, market, keep, barracks, tavern. The rest unlock after them.

| Tier | Your purse | Rival income | Rival army cap | First war | Fortune to win |
|---|---|---|---|---|---|
| Easy | x1.5 | x0.8 | 14 | 20 min | 4000 |
| Mid | x1.0 | x1.0 | 22 | 14 min | 6000 |
| Hard | x0.9 | x1.1 | 32 | 10 min | 10000 |

Set it in the Skirmish panel or with `?diff=easy|mid|hard`. `tools/play.js [min] [seeds] [houses] [style] [tier]` (styles econ, trader, conquer, rush, turtle; `QUIET=1` for one line per run) is how the tiers were compared.


## Features added on grok
- **Save / load**: the game autosaves; use the Save and Load buttons or F5 / F9. Saves stay in this browser.
- **Sound**: effects and music with volume and mute in Options (button in the top bar).
- **Objectives**: a ten-step guide in the top left; hide it in Options.
- **Economy view**: markets show four pips (supply, works, homes, service). Select a market, or press E, to see its district ring and links.
- **Board size**: Options, Board size: Small, Standard or Huge. Changing it reloads the page. A save only loads on the board size it was made at.

See ROADMAP.md for what is still to do.
