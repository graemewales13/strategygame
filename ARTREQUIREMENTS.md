# Art requirements

What the game needs painted next, in priority order. Every request uses the **Seven Holds Art Instruction Set** for style, negatives, angle, lighting, QA and file naming. **For people, the character guide below overrides the instruction set** (its unit table, its kit colours and its old Vikings): what each role is for, how big it is drawn, and what each people actually wore.

Written 2026-10-08 for the `grok` branch. Updated 2026-10-11: priorities 1 to 4 delivered (Grok, 8b7d6f1). Updated 2026-10-12: priorities 5 to 7 delivered; three new peoples added (priority 8); the **character guide** written after the owner found soldiers that read as feeble civilians and every serf alike; priority 9 (soldiers) delivered; the owner then asked that **the folk of every people look like what they really wore: workers, soldiers and kings**. That is the open work below. Later on 2026-10-12: the 24 priority-9 soldiers scaled down to game size (T-054); T02 waypoints need no painting. 2026-10-13: T02 formations added; **priority 14** asks for eight order icons (stances and formations), wired with glyph fallbacks. 2026-10-15: walk cycles renumbered **15** (they had been given 14 twice); **priority 16** asks for a watchman mark (T-057 watchmen); T31 selection needs no painting. 2026-10-16: the owner's new **Attack**, **Retreat** and **Repair** buttons (T-059, T-061) and the **Stop** and **Attack-move** buttons join priority 14 (now thirteen order icons); the owner's disguise mask and painted ore deposits get their own numbers (**17** and **18**, prompts below) and are wired so a drop shows at once; T03 key rebinding needs no painting.

## Paint next: new characters are needed

**The character list is done.** Delivered 2026-10-19: the ram in two parts (13), thirteen order icons (14), walk cycles for every walking role (15), the watchman mark (16), the disguise mark (17), ore deposits per mineral (18), the siege line (13b), the women among the serfs, and the Scottish recruit without a kilt. Egyptian knights and kings stay chariots, so they have no walk cycle. An armed soldier still strides in code, from the still figure of his kit.

**Open (2026-10-26): priority 23, the repeat-training icon** (one 128x128 order icon for the new Repeat button on every training building's card; it shows 🔁 until then). **Open (2026-10-24): priority 22, the explore order icon** (one 128x128 order icon for the new Explore button on a scout's card; it shows 🧭 until then). **Open (2026-10-21): priority 21, the patrol order icon** (one 128x128 order icon for the new Patrol button; it shows ⟲ until then). **Open (2026-10-20): priority 20, the town bell icon** (one 128x128 order icon for the new Bell button; the button shows 🔔 until then). **Open (2026-10-19): priority 19, walk cycles for the armed soldiers.** A soldier who carries Armoury kit (spear, sword, heavy armour, longbow, crossbow, lance) is drawn from his kit's still figure, so he is the one person in the valley who still strides in code. Four frames for each of the six kit figures, all eight peoples (192 files; 168 without the Egyptian chariot lance). See priority 19 below.

| Order | New characters | Peoples | Files | Count | Brief |
|---|---|---|---|---|---|
| 1 | **Serfs**: the people's own workers, in their real working dress, with two work frames | all 8 | `units/serf.png`, `serf_work1.png`, `serf_work2.png` | 24 | priority 10 — **delivered** 2026-10-13 |
| 2 | **Kings on the field**: each ruler mounted (Pharaoh in his chariot), matching his portrait | all 8 | `units/king.png` | 8 | priority 12 — **delivered** 2026-10-13 |
| 3 | **The rest of the new peoples' folk**: levy, scout, spy, scholar | Vikings, Byzantines, Persians | `units/recruit.png`, `scout.png`, `spy.png`, `scholar.png` | 12 | priority 8 — **delivered** 2026-10-13 |
| 4 | **The new peoples' Armoury soldiers** | Vikings, Byzantines, Persians | the six keys of priority 3 | 18 | priorities 3 and 8 — **delivered** 2026-10-13 |
| 5 | **Spies repainted dark** | Egyptians, Scots, Mongols | `units/spy.png` | 3 | priority 11 — **delivered** 2026-10-13 |
| 6 | Building sites and ruins for the new peoples | Vikings, Byzantines, Persians | `buildings/<key>_build.png`, `<key>_ruin.png` for the 18 keys | 108 | priorities 6 and 8 — **delivered** 2026-10-13 |
| 8 | **The ram as a body and a wheel**, so its wheels really turn | shared | `assets/shared/units/ram_body.png`, `ram_wheel.png` | 2 | priority 13 — **delivered** 2026-10-19 |
| 9 | Walk cycles, soldiers and the rest of the folk | all 8 | `units/<role>_walk1.png` ... `_walk4.png` | 280 | priority 15 — **delivered and wired** 2026-10-19. No cycle for the Egyptian chariot |
| 7 | Women among the serfs | all 8 | `units/serf_f.png`, `serf_f_work1.png`, `serf_f_work2.png` | 24 | **delivered and wired** 2026-10-19. A woman's given name draws `serf_f` |
| 10 | **Thirteen order icons**: four stances, four formations, attack-move, attack, retreat, stop, repair | shared | `assets/shared/ui/orders/<key>.png` | 13 | priority 14 — **delivered** 2026-10-19 |
| 11 | **The watchman mark**: an eye-and-lantern badge for the Watch row of your villages | shared | `assets/shared/ui/marks/watch.png` | 1 | priority 16 — **delivered** 2026-10-19 |
| 12 | **Disguise mark**: a plain dark leather half mask, 64x64, neutral (no house colour), drawn over a disguised spy for his owner only | shared | `assets/shared/ui/marks/disguise.png` | 1 | priority 17 — **delivered** 2026-10-19 |
| 13 | **Ore deposits painted per mineral**: stone, copper, iron, coal and silver, each full and half-dug | shared | `assets/shared/resources/<mineral>.png`, `<mineral>_half.png` | 10 | priority 18 — **delivered** 2026-10-19 |
| 14 | **Siege engines**: the **Onager** and the **Trebuchet**, plus research icons for **Siegecraft**, **Torsion engines** and **Counterweight engines** | shared | `assets/shared/units/onager.png`, `trebuchet.png`; `assets/shared/ui/tech/siegecraft.png`, `torsion.png`, `counterweight.png` | 5 | priority 13b — **delivered** 2026-10-19 |
| 15 | **Walk cycles for the armed soldiers**: four stride frames for each kit figure | all 8 | `units/<kit key>_walk1.png` ... `_walk4.png` for `footman_spear`, `footman_sword`, `footman_heavy`, `bowman_longbow`, `bowman_crossbow`, `knight_lance` | 192 (168: no Egyptian chariot) | priority 19 — **open**, requested 2026-10-19 |
| 16 | **Town bell order icon** for the new Bell button (T38) | shared | `assets/shared/ui/orders/bell.png` | 1 | priority 20 — **open**, requested 2026-10-20 |
| 17 | **Patrol order icon** for the new Patrol button (T39) | shared | `assets/shared/ui/orders/patrol.png` | 1 | priority 21 — **open**, requested 2026-10-21 |
| 18 | **Explore order icon** for the new Explore button on a scout's card (T45) | shared | `assets/shared/ui/orders/explore.png` | 1 | priority 22 — **open**, requested 2026-10-24 |
| 19 | **Repeat-training icon** for the new Repeat button on a training building's card (T47) | shared | `assets/shared/ui/orders/repeat.png` | 1 | priority 23 — **open**, requested 2026-10-26 |

Paths are under `assets/factions/<people>/`, with `<people>` one of `egyptians`, `romans`, `scottish`, `british`, `mongols`, `vikings`, `byzantines`, `persians`. Dress for every people and tier is in **How each people really looked** in the character guide.

## Status at a glance

| Priority | What | Status |
|---|---|---|
| 1 | Armoury, complete, `_build` and `_ruin`, five peoples | **Delivered and wired** 2026-10-11 |
| 2 | Kit icons (7) and research icons (9) | **Delivered and wired** |
| 3 | Armed soldiers, six per people | **Delivered and wired** for all eight peoples (the new three on 2026-10-13) |
| 4 | Far-lander portraits (8), ruler portraits (5 plus jarl, basileus, shahanshah), captain standard, deed badges (6), fugitive mark | **Delivered and wired** |
| 5 | Plain figures per people: footman, bowman, knight, scout, recruit, spy, scholar | **Delivered** 2026-10-12. Footman, bowman and knight were replaced by priority 9 |
| 6 | Raising and ruin states for every building | **Delivered and wired** for all eight peoples (the new three on 2026-10-13) |
| 7 | War-horn alarm mark | **Delivered and wired** 2026-10-12 |
| 8 | Three new peoples: Vikings, Byzantines, Persians | **Delivered and wired** 2026-10-13: buildings in three states, armed variants, footman, bowman, knight, recruit, scout, spy, scholar, serfs, ruler portraits. Kings are priority 12 |
| 9 | Soldiers to the character guide: footman, bowman, knight (8 peoples, 24) | **Delivered and wired** 2026-10-12, scaled to 260 px on the long side (T-054) |
| 10 | **Serfs per people** (8 peoples, 24) | **Delivered and wired** 2026-10-13. `serf`, `serf_work1`, `serf_work2` are out of `REPAINT` |
| 11 | Spies easy to miss (Egyptians, Scots, Mongols) | **Delivered** 2026-10-13. Dark cloaks; the people's colour is only a cord |
| 13 | **Ram body and wheel** | **Delivered and wired** 2026-10-19. `RAM_PARTS` is true; `RAM_WHEELS` sits on the painted axles |
| 15 | Walk cycles (soldiers, then the rest of the folk) | **Delivered and wired** 2026-10-19. 280 frames. The game plays them while a figure walks, and still strides an armed kit in code. Egyptian chariots have no cycle |
| 12 | **Kings on the field** (8) | **Delivered and wired** 2026-10-13. `king` is out of `REPAINT`. The drawn crown is kept only when a people has no painted king |
| — | Waypoints and marching together (T02, 2026-10-12) | **No painting needed.** Queued legs are drawn in code |
| 14 | **Order icons**: four stances, four formations, and attack-move, attack, retreat, stop, repair | **Delivered and wired** 2026-10-19. `UI_KEYS.orders` lists all thirteen. The top-right eighth of each icon is empty for the grid key |
| 16 | **Watchman mark** | **Delivered and wired** 2026-10-19. `'watch'` is in `UI_KEYS.marks` |
| 17 | **Disguise mark** | **Delivered and wired** 2026-10-19. `'disguise'` is in `UI_KEYS.marks` |
| 18 | **Ore deposits per mineral**, full and half-dug | **Delivered and wired** 2026-10-19. `ORE_PAINTED` lists stone, copper, iron, coal, silver |
| 13b | **Onager, trebuchet, and the siege research icons** | **Delivered and wired** 2026-10-19. `SIEGE_ART` is true; `TECH_UNPAINTED` is empty |
| 19 | **Walk cycles for the armed soldiers** (six kit figures, 8 peoples) | **Requested** 2026-10-19. Until delivered the game strides the kit's still figure in code (render.js `gaitOf`); not probed until listed in `js/art.js` |
| 21 | **Patrol order icon** (1, shared) | **Requested** 2026-10-21 (T39). The Patrol button on a soldier's card shows the ⟲ glyph until delivered; not probed until `'patrol'` is added to `UI_KEYS.orders` in `js/art.js`. The patrol round on the field is drawn in code (an amber dashed loop through the posts), no painting needed |
| 22 | **Explore order icon** (1, shared) | **Requested** 2026-10-24 (T45). The Explore button on a scout's card shows the 🧭 glyph until delivered; not probed until `'explore'` is added to `UI_KEYS.orders` in `js/art.js`. The scout's next goal on the field is drawn in code (a pale blue dashed line) |
| 23 | **Repeat-training icon** (1, shared) | **Requested** 2026-10-26 (T47). The Repeat button on every training building's card shows the 🔁 glyph until delivered; not probed until `'repeat'` is added to `UI_KEYS.orders` in `js/art.js`. Shift-click training five needs no painting (the queue slots are drawn as before) |
| 20 | **Town bell order icon** (1, shared) | **Requested** 2026-10-20 (T38). The Bell button on the keep's card shows the 🔔 glyph until delivered; not probed until `'bell'` is added to `UI_KEYS.orders` in `js/art.js`. The minimap row's Bell button is text, like Home, Idle and Army |
| — | Siege engines on the command card and unit panel (T-073, 2026-10-19) | **No painting needed.** The Workshop's Ram, Onager and Trebuchet buttons, the unit panel and the control-group chips show the painted engines (`assets/shared/units/ram.png`, `onager.png`, `trebuchet.png`) in place of a card |
| — | Art lint (T30, 2026-10-19): `tools/art-lint.py` in CI | **No painting needed.** Every drop is now checked for RGBA, clear corners, the key colour and size against its kind |
| — | Selecting idle soldiers and a kind across the valley (T31, 2026-10-15) | **No painting needed.** Uses the existing Army button and keys |
| — | Pack animals per people: donkey, Bactrian camel, camel (T-063, 2026-10-16) | **No painting needed.** `assets/shared/units/donkey.png`, `bactrian.png`, `dromedary.png` were already painted; the British and Scots now use the donkey |
| — | Key rebinding (T03, 2026-10-16) | **No painting needed.** A text list in Options |
| — | Control groups on the HUD (T36, 2026-10-18): a row of chips over the minimap | **No painting needed.** Each chip shows the existing unit card of the kind most in the group (the glyph where a kind has no card), with the number and count printed over it; the fight flash is drawn in CSS |
| — | Several training buildings at once (T49, 2026-10-27): double-click a barracks selects every one on screen | **No painting needed.** Each building in the set wears the existing dashed selection outline; the panel's Selected row and its queue chips are text; the Repeat button keeps priority 23's icon request |
| — | Villages remembered under fog (T46, 2026-10-25): lord, folk and loyalty as last seen | **No painting needed.** Each village's own painting with the remembered lord's footing and banners, dimmed as before; the panel note is text |
| — | Fog memory (T44, 2026-10-23): rival buildings out of sight drawn as last seen | **No painting needed.** Each building's own painting, greyed in code (`render.js` `remembered`); the panel note is text |
| — | Keep arrows (T43, 2026-10-22): a garrisoned keep shoots back | **No painting needed.** The volleys are drawn as the tower's arrows are; the keep panel's Arrows row is text |
| — | Grid keys (T03, 2026-10-17): the command card pressed by place (Q W E R / A S D F / Z X C V) | **No painting needed.** The key is printed in each button's top-right corner; painted button icons must leave that corner clear (priority 14) |

## How the game uses delivered art

| What | Drop it at | Picked up |
|---|---|---|
| A faction building | `assets/factions/<faction>/buildings/<key>.png` | Automatically, on the next load (the key must be in `FACTION_BUILDINGS` in `js/config.js`; `armoury` already is) |
| A building's raising or ruined state | `assets/factions/<faction>/buildings/<key>_build.png`, `<key>_ruin.png` | Automatically for the armoury; other buildings need their key added to `STATED` in `js/art.js` |
| An armed soldier | `assets/factions/<faction>/units/<role>_<kit>.png` (the six keys in priority 3) | Automatically |
| A plain soldier in the new style | `assets/factions/<faction>/units/<role>.png` for `footman`, `bowman`, `knight`, `scout`, `recruit`, `spy`, `scholar` | Automatically (priority 5). `footman`, `bowman`, `knight` only once removed from `REPAINT` in `js/art.js` (priority 9) |
| A serf of one people | `assets/factions/<faction>/units/serf.png` (idle and walking), `serf_work1.png`, `serf_work2.png` (the two halves of a work swing) | Automatically (priority 10) |
| Icons (kit, research) | `assets/shared/ui/gear/<key>.png`, `assets/shared/ui/tech/<key>.png` | Automatically (keys are `GEAR` and `TECH` in `js/config.js`) |
| Order icons (stances, formations, orders) | `assets/shared/ui/orders/<key>.png` (keys are `STANCES` and `FORMATIONS` in `js/config.js`, plus `amove`, `charge`, `retreat`, `stop`, `repair`) | Automatically (all thirteen are listed in `UI_KEYS.orders` in `js/art.js`; a new order's key must be added there) |
| Ore deposits | `assets/shared/resources/<mineral>.png` and `<mineral>_half.png` for `stone`, `copper`, `iron`, `coal`, `silver` | Automatically for the five listed in `ORE_PAINTED` in `js/art.js`; the half-dug picture shows once a deposit is below half |
| Marks (deeds, captain, fugitive, alarm, watch, disguise) | `assets/shared/ui/marks/<key>.png` (deed keys are `DEEDS` in `js/config.js`) | Automatically |
| Portraits | `assets/shared/ui/portraits/<key>.png` (far-land keys are `FARLANDS`; rulers are `pharaoh`, `imperator`, `king`, `khan`, `highking`, `jarl`, `basileus`, `shahanshah`) | Automatically |

Until a file exists the game falls back to a stand-in: the forge sprite for the armoury, the old shared figure for a soldier, a text glyph for icons, no mark. Missing files never break the game.

### Preparing a drop (Claude does this; listed so anyone can)

Art painted on a flat #FF00FF ground is turned into game sprites with:

```text
python3 tools/chromakey.py --max 480 assets/factions/*/buildings/<new>.png    # buildings: key, trim, cap the longest side
python3 tools/chromakey.py <unit, icon, mark and portrait files>               # key and trim with a 4 px margin
python3 tools/defringe.py <the same files>                                      # any pink fringe left on edges
python3 tools/art-lint.py <the same files>                                      # RGBA, clear corners, no key colour, sized like its kind (CI runs it on all art)
node tools/art-smoke.cjs logs/art-smoke.png                                     # with the repo served on :8123: a screenshot of it all in game
```

Check that every corner pixel is transparent. Units must look right or straight out (the game mirrors them to walk left).

**Size on delivery.** Paint at any size, but deliver people at about 256 px on the long side (kings 320) and buildings at 480: the game draws a footman 50 px high, so a 1200 px figure only makes the download twenty times bigger. Oversized files are scaled down on arrival (`--max` on `tools/chromakey.py`, or a Lanczos resize in premultiplied alpha for files already keyed).

**Rose and violet are paint, not key.** The Byzantine rose (#A8366E) and the Mongol violet sit in the same hue band as the magenta key. Since T-054 `tools/defringe.py` only removes an opaque pixel that is close to #FF00FF itself, so it no longer eats rose cloth; still, check a Byzantine or Mongol drop by eye after defringing.

`<faction>` in this game is one of `egyptians`, `romans`, `scottish`, `british`, `mongols`, `vikings`, `byzantines`, `persians`.

## Character guide (read before painting any person)

The player must tell **what a figure is for** at a glance, at the size the game draws it, before reading any name or colour. A fighter must look able to fight. A worker must look like a worker. A spy should be easy to miss. Every people dresses each role its own way. This guide overrides any older brief in this file or the instruction set where they disagree.

### Size: the game sets it, the painting must earn it

Every person is painted at the same real-world scale and framed the same way: feet on the bottom margin, the top of the head, helmet or raised weapon on the top margin, 4 px each side. The game then draws each role at its height on the ladder below (`USCALE` in `js/render.js`, pixels at zoom 1). Do not make a role look bigger by padding the canvas.

| Role | Drawn height | How it should stand |
|---|---|---|
| `serf` | 34 | slight, a little stooped, busy with a tool; never squarer or heavier than a soldier |
| `recruit` | 40 | an ordinary man, upright but unready |
| `scholar` | 42 | robed, still, upright |
| `spy` | 43 | hunched into a cloak, narrow |
| `scout` | 46 | lean, leaning forward, light |
| `bowman` | 49 | upright, bow clear of the body |
| `footman` | 50 | the broadest person on foot: shield forward, weapon up, square shoulders |
| `knight` | 66 | horse and rider; the horse is half the picture |
| `king` | 68 | the house's best kit, unmistakable |

### Colour and contrast

- **Soldiers** (`footman`, `bowman`, `knight`, `king`) wear the people's colour (table below) on at least a quarter of the figure: shield face, tunic or surcoat, cloak, horse cloth. Their darkest third is near-black iron, leather or lacquer. Strong contrast between dark metal and bright cloth is what makes them read as armed men.
- **Serfs and recruits**: undyed working cloth (cream, brown, grey) with only a small touch of the people's colour (a hood, a sash, a patch).
- **Spies**: dark, muted cloak; the colour only as a hidden lining or a thin cord.
- **Scholars**: the people's own scholarly dress; the colour on a stole, sash or book cover.
- **The ghost rule**: no figure may be pale all over. If a figure squinted at on the grass is lighter overall than the ground, it fails.

| People | Colour | Hex |
|---|---|---|
| Egyptians | yellow | #C9A42E |
| Romans | red | #A83A3A |
| Scots | blue | #3A6EA8 |
| British | green | #37753F |
| Mongols | violet | #7A4A98 |
| Vikings | orange | #C0662A |
| Byzantines | rose | #A8366E |
| Persians | teal | #24857E |

Per-people figures are drawn as painted, **not re-dyed**, so the colour must be painted in. These colours replace the "banner/trim accent" lines in the instruction set's kits (which still show the Vikings blue and have no Scots).

### Every role: purpose, silhouette, never

| Role | What it does in the game | Must show (silhouette first) | Never |
|---|---|---|---|
| `serf` | gathers, builds, mines, carries | a working tool in use (axe, pick, hoe, basket, sack); bare head, hood or straw hat; work clothes | helmet, armour, shield, a weapon held as a weapon, a broader stance than a soldier |
| `recruit` | a levy or hired wanderer who barely fights until drilled | everyday clothes, an improvised weapon (club, wood-axe, hay fork), no armour | a shield, helmet or mail; anything that looks drilled |
| `footman` | holds the line, takes the hits | helmet; body armour in the people's style (mail, lamellar, scale, quilted coat, segmented plate); a shield in house colour facing the viewer; spear or sword held out from the body | a bare head; a plain tunic as the only garment; a club |
| `bowman` | shoots from behind the line | the bow drawn or held clear of the body so stave and string read against the ground; quiver; cap or light helmet; padded or light armour | the bow hidden behind the body; the same silhouette as a serf |
| `knight` | the charge | horse and rider; rider in the people's heaviest armour with lance or sword; shield or horse cloth in house colour; a proud, forward horse | a pony with a man in a tunic; an unarmoured rider |
| `scout` | runs or rides far and fast to see | light travelling clothes, a javelin or short bow, a forward lean | heavy armour, a shield |
| `spy` | goes unseen into rival villages | hooded cloak, face in shadow, small knife or satchel | bright colour, a big weapon, a pale all-over cloak |
| `scholar` | studies at the Academy | robes of the people's learned class (scribe, magistrate, monk, rune-carver, shaman, mobad, logothete), book, scroll or instrument | a weapon; armour |
| `king` | the house: when the line ends, the house falls | crown or mark of rule, the richest armour, house colour boldest, on foot or mounted as the people's kings were | the same figure as a knight |

### How each people really looked: workers, soldiers, kings

The owner wants each house's folk to look like the people they are: what they **actually wore**, in their own period. Not a costume-film idea of them. Each people is fixed to one period. Paint every tier from it, and keep the same people recognisable from the field hand to the king. Where an old brief or a delivered figure disagrees with this table, this table wins.

| People (period) | Workers (`serf`, also `recruit` in his own clothes with a tool or club) | Soldiers (`footman`, `bowman`, `knight`: see priority 9 for each) | King (`king`, field figure; the portrait is already painted) |
|---|---|---|---|
| **Egyptians** (New Kingdom, about 1300 BC) | men bare-chested in a short white linen kilt (shendyt) or loincloth, shaven or close-cropped head, barefoot; women in a plain linen sheath dress; wooden hoe, copper sickle, reed baskets on a shoulder yoke | linen-and-leather caps, quilted linen or bronze-scale corselets, tall round-topped hide shields, khopesh and spear; archers with composite bows; chariots for the horse | Pharaoh in the blue war crown (khepresh), broad bead collar, pleated gold-edged kilt, standing in a gilded two-horse chariot with a drawn bow |
| **Romans** (late Republic and early Empire, 1st century) | slaves and coloni in a coarse undyed wool tunic belted at the knee, or an exomis leaving one shoulder bare; straw petasus hat or felt cap; bare feet or hobnailed sandals; iron mattock, pruning hook, wicker basket | legionaries in mail or segmented plate, Imperial-Gallic helmets, red curved scuta, gladius; auxiliary archers in mail; cavalry with oval shields | Imperator in a muscled bronze cuirass with leather strips (pteruges), a crimson general's cloak (paludamentum), laurel wreath, on a white horse |
| **Scots** (Gaelic kingdom, 12th to 13th century) | a long saffron or undyed linen shirt (léine) to the knee, a wool mantle (brat) pinned with a brooch, bare legs, bare feet or rawhide shoes, long hair; foot plough (cas-chrom), peat spade, creel basket. **No kilts or belted plaids**: they come four centuries later | conical helmets, mail shirts or quilted coats over the léine, round targes, long spears and axes; short-bow archers; knights in mail | High King with a gold circlet over a mail coif, fur-lined blue mantle, broadsword, on a dark horse with a blue cloth |
| **British** (English, 13th to 14th century) | villeins in a knee-length wool tunic (cote) belted at the waist, wool hose, linen coif or straw hat, a hood with a short tail, leather turnshoes; billhook, flail, scythe, wooden spade shod with iron | kettle hats, gambesons and mail, heater shields, swords and spears; longbowmen in hoods; knights in mail and great helms with surcoats | King in mail under a green surcoat with gold, a crown over the mail coif, on a barded charger |
| **Mongols** (Mongol Empire, 13th century) | herders in a wool or felt deel wrapped right over left and tied with a sash, a felt hat with an upturned brim, felt boots with turned-up toes, braided hair loops; lasso pole (uurga), felt bundles, milk pail, hand axe | lamellar of lacquered leather and iron, conical helmets with neck guards, recurve bows in cases, sabres; heavy lancers on armoured horses | Khan in a gold-woven silk deel (nasij) with fur trim, a fur hat with a peak, bow case and quiver, on a steppe horse with a saddle cloth |
| **Vikings** (Norse, 9th to 10th century) | thralls in coarse undyed wool with cropped hair; free farmers (karls) in a wool tunic and trousers with wrapped leg bindings, a cloak pinned at the right shoulder; wooden spade, sickle, wood axe | spangenhelms, mail for the rich and padded coats for the rest, painted round shields, bearded axes and spears; hunting bows | Jarl in a mail byrnie with gold arm-rings, a fur-trimmed cloak, a helmet with gilt fittings, sword, an orange round shield, on a stocky northern horse |
| **Byzantines** (Komnenian empire, 11th to 12th century) | tenant farmers (paroikoi) in a long belted wool tunic, trousers and leggings, felt or straw cap, leather boots; ox and wooden plough, mattock, pruning hook, amphora | lamellar klivanion over a quilted coat, helmets with mail aventails, kite shields, spathion; cataphracts in scale on scale-barded horses | Basileus in a gilded lamellar klivanion with a rose and gold cloak, the jewelled crown with hanging pendilia, the imperial **red boots**, on a white horse |
| **Persians** (Sasanian, 3rd to 7th century) | farmers in a knee-length long-sleeved belted tunic over loose trousers tucked into soft boots or bare feet, a round felt cap or headcloth; spade, sickle, water jar for the channels (qanats) | ridge helmets, mail and quilted coats, wicker shields, swords; composite-bow archers; clibanarii in full mail on mailed horses | Shahanshah in the winged crown topped by a globe, with flowing ribbons at the diadem and shoulders, a pearl-edged tunic, a long sword, on a horse with tasselled harness, as on the rock reliefs |

**Women.** About a third of the names the game gives its folk are women's. A serf whose given name is one of those is drawn as `serf_f`, `serf_f_work1` and `serf_f_work2`, in the dress of the Workers column. Delivered and wired 2026-10-19.

### Before delivering: the lineup test

Make one picture per people of `serf`, `recruit`, `footman`, `bowman`, `knight`, `spy`, `scholar` and the king. Scale each to its height on the ladder and stand them on grass in a row. Pass only if:

1. Someone who has never played can point to the three soldiers and the serf without being told.
2. The serf is the smallest and lightest-built figure; the footman is the broadest on foot.
3. Every soldier's people colour can be named from across the room.
4. Nobody is a ghost (see the ghost rule).
5. Set beside another people's lineup, no two serfs or soldiers could be swapped unnoticed.

## Priority 1: the Armoury (new building)

The Armoury makes weapons and armour. It is unlocked by the Metallurgy research and sits beside the forge in a town. One per faction, five in all, each in three states: complete, `_build` and `_ruin`.

- **Size class:** 2x2 tiles since 2026-10-20 (T-080; it was 3x3). The delivered 768 px art is scaled to the footprint, so it needs no repaint. New paintings: 512 px wide, 400-500 px tall at 4x, like the tavern.
- **Must read as at a glance:** an armourer's workshop, *not* the forge. Show:
  - racks of spears and swords under an open-fronted roof
  - shields hung on the wall
  - a mail shirt on a wooden stand
  - a grindstone
  - one small chimney (much smaller than the forge's)
  - a few stacked bow staves

Prompt (Building template, filled):

```text
{FACTION_NAME} ARMOURY, 2x2 footprint, {STATE}. An armourer's workshop: an open-fronted bay with racks of spears and swords, shields hung on the wall, a mail shirt on a wooden stand, a grindstone, stacked bow staves, one small chimney. Faction details: {see below}. Banner in {ACCENT_COLOUR}. Show the south-east face door. Transparent background, small contact shadow, 4x resolution, image size 768x640.
```

| Faction | Faction details to paste | Accent |
|---|---|---|
| Egyptians | mudbrick walls with palm-log beams, khopesh blades and tall wicker-and-hide shields on the racks, linen awning | gold yellow #D9A520 |
| Romans | red-ochre plaster and terracotta tile roof, racks of pila and gladii, curved rectangular scuta stacked against the wall, a lorica segmentata on a stand | crimson #A32A24 |
| Scottish | grey drystone walls and heather thatch, racks of long spears and broadswords, round targe shields studded with brass, a mail shirt on a post | blue #3A6EA8 |
| British | half-timbered walls with a stone base, racks of spears and swords, heater shields, a mail hauberk on a stand, yew bow staves | green #2F6B3A |
| Mongols | a large ger workshop with the felt rolled up on one side, racks of sabres and lances, lacquered lamellar armour on a frame, bow cases | purple #5C3A7A |

Deliver: `assets/factions/<faction>/buildings/armoury.png`, `armoury_build.png` and `armoury_ruin.png`.

## Priority 2: kit and research icons (shared)

These go on the Armoury and Academy buttons and on the stockpile bar. Use the **Goods icon** template, 128x128 px, readable at 32 px.

### Kit (7)

| Key | Subject to paint |
|---|---|
| `spear` | three ash-shafted spears with iron heads, bound together |
| `sword` | a straight steel sword in a leather scabbard, crossguard showing |
| `longbow` | an unstrung yew longbow with a bundle of arrows |
| `crossbow` | a wooden crossbow with steel prod and a few bolts |
| `lance` | a long cavalry lance with a small pennon (plain, no faction colour) |
| `mail` | a folded mail shirt, iron rings visible |
| `plate` | a steel breastplate with shoulder plates, on its side |

Deliver: `assets/shared/ui/gear/<key>.png`.

### Research (9)

One object that stands for each technology, painted like a goods icon:

| Key | Technology | Subject to paint |
|---|---|---|
| `husbandry` | Husbandry | a sheaf of wheat with a wooden sickle |
| `masonry` | Masonry | a dressed stone block with mallet and chisel |
| `drill` | Drill | a wooden practice sword and a straw-stuffed target |
| `metallurgy` | Metallurgy | a clay crucible pouring glowing metal into a mould |
| `fletching` | Fletching | arrows with grey goose feathers and a knife |
| `medicine` | Medicine | a mortar and pestle with herbs and a linen bandage roll |
| `steelcraft` | Steelcraft | a sword blade being quenched, steam rising |
| `mechanics` | Mechanics | a wooden gear wheel and a crossbow trigger nut |
| `engineering` | Engineering | a set square, plumb line and a rolled plan |

Deliver: `assets/shared/ui/tech/<key>.png`.

## Priority 3: soldiers who look armed

Kit changes how a soldier fights. Without art, a soldier with plate looks the same as one without. Paint variant walk frames per faction (Human unit template, 256x256). The game will pick the variant for each soldier's best kit.

| Role and kit | File key | What changes from the plain unit |
|---|---|---|
| footman with spear | `footman_spear` | carries a spear instead of the default weapon |
| footman with sword | `footman_sword` | carries a drawn sword |
| footman in mail or plate | `footman_heavy` | mail coat or plate harness over the tunic, helmet with cheek pieces |
| bowman with longbow | `bowman_longbow` | bow nearly his own height |
| bowman with crossbow | `bowman_crossbow` | holds a crossbow at the hip |
| knight with lance | `knight_lance` | lance couched, small pennon |

This makes 6 variants for each of the 5 factions, 30 in all. Deliver: `assets/factions/<faction>/units/<file key>.png`.

## Priority 4: characters added this week

| Asset | Count | Notes |
|---|---|---|
| **Far-lander portraits** (tavern) | 8 | One each: Norse sea-wolf, Parthian rider, Greek physician, Han drillmaster, Rus bear-hunter, Moorish caravaneer, Aksumite envoy, wandering swordsman of the Eastern Isles. Each as a bust, 300x380, same painted style. Clothing must match the people: no fantasy dress, and none of the "do not" items in the kits. These fill the instruction set's "tavern hero portraits" slot. |
| **Leader portraits** | 5 | One king per house in faction dress: Pharaoh, Imperator, High King, King, Khan. Bust, 300x380, crowned or with his house's mark of rule. Shown in the Council. |
| **Captain marker** | 1 | Small standard or pennon on a pole, 64x64, neutral cloth (the game tints it per house). Drawn above captains. |
| **Deed badges** | 6 | 64x64 badges, painted, no text: Blooded (a red-dipped blade), the Slayer (crossed blades), Kingslayer (a broken crown), Giant-killer (a fallen helm), Death-cheater (a bandaged hand), Wall-breaker (a cracked stone). |
| **Fugitive marker** | 1 | 64x64: a hooded crown, for a king whose house has lost its seat. |

Deliver portraits to `assets/shared/ui/portraits/<key>.png` and markers and badges to `assets/shared/ui/marks/<key>.png`.

## Priority 5: plain soldiers in the same style (new 2026-10-11)

The armed soldiers of priority 3 are painted full length, lit and in each people's dress. The plain soldiers they stand beside are older, darker three-quarter figures shared by every house and recoloured, so an army mixes two looks. Paint the plain soldiers per people to match priority 3 exactly (Human unit template, 256x256 on #FF00FF, full length, feet at the bottom, looking right or straight out, same scale as the armed poses):

| File key | Subject |
|---|---|
| `footman` | the people's ordinary foot soldier with the plain issue weapon (no spear or sword from the Armoury), shield, no armour beyond a cap |
| `bowman` | a short-bow archer in plain dress, quiver at the hip |
| `knight` | the people's horseman with a plain sword, mail-less, small shield |
| `scout` | a light rider or runner in travelling clothes, no armour |
| `recruit` | a hired wanderer or levied villager: work clothes, a club or a farm tool |
| `spy` | a hooded figure in a plain cloak, face shadowed, a small knife |
| `scholar` | a robed scholar with a book or scroll and satchel |

Prompt (Human unit template, filled):

```text
{FACTION_NAME} {ROLE}, full length, standing, three-quarter view looking right. {SUBJECT}. Faction details: {people line from the faction kit}. Trim in {ACCENT_COLOUR}. Flat #FF00FF background, no shadow, 256x256, feet at the bottom edge less 8 px.
```

Deliver: `assets/factions/<faction>/units/<file key>.png` (7 per people, 35 in all). Accent colours and faction details as in the Armoury table above.

> **Superseded for `footman`, `bowman` and `knight`** (owner, 2026-10-12): this brief asked for soldiers with no armour beyond a cap and a mail-less knight, and the result read as civilians. Those three are repainted under priority 9 and the character guide. `recruit`, `scout`, `spy` and `scholar` stand.

## Priority 6: raising and ruined states for every building

The renderer now shows a painted building site while a building is raised and leaves its painted ruin for 30 s where it fell. Only the armoury has them. Paint `_build` and `_ruin` for the rest, most-built first: `barracks`, `keep`, `market`, `mine`, `cottage`, `farm`, `forge`, `foundry`, `tower`, `academy`, `tavern`, `temple`, `archery`, `stable`, `mill`, `warehouse`, `workshop`. Same framing and size as the complete building, Building template with `{STATE}` set to "under construction: timber scaffolding, half-raised walls, a stack of materials" or "ruined: fallen roof, broken walls, scattered goods, no fire".

## Priority 7: the alarm mark (new 2026-10-11, combat feedback T06)

T06 added combat feedback: a pulsing red ring on the minimap where you are being hit, your fighting folk blinking red there, **Space** to jump to the fight, lines from selected soldiers to where they are going, and optional damage numbers. All of that is drawn in code (rings, lines and numbers in the game's own colours) and needs **no painting**. One small painted mark finishes it:

| Key | Size | Subject to paint |
|---|---|---|
| `alarm` | 64x64 | a curved ox-horn war horn with a brass mouthpiece and a leather strap, tilted up as if being blown; no faction colour, no text |

Prompt (Goods icon template, filled):

```text
ALARM MARK, a curved ox-horn war horn with a brass mouthpiece and bands and a plain leather strap, tilted up as if being blown, painted in the same style as the deed badges. Neutral colours only, no faction colour, no text. Flat #FF00FF background, centred, 4 px margin, 256x256 (shown at 22-64 px).
```

Deliver: `assets/shared/ui/marks/alarm.png` (it is shown in the "...is under attack!" warning at 22 px; it must read on a dark red-bordered panel).

## Gaps in the instruction set itself

1. **No Scottish kit.** The game's houses are Egyptians, Romans, **Scots**, British and Mongols. The instruction set has Vikings in the Scots' place. Paste this kit for the Scots:

```text
FACTION KIT - SCOTS (Gaelic kingdom, 12th-13th century)
Banner/trim accent: blue #3A6EA8 with white.
Palette: grey granite and fieldstone, heather purple and brown, peat brown, moss and bracken green, undyed wool cream, sheep-grey, cold grey-blue shadows with low warm sun.
Architecture: square stone tower houses with crow-stepped gables and slate or heather-thatch roofs, drystone walls, round-ended blackhouses with low thatch roped and weighted with stones, small stone kirks, timber palisades on mottes, standing stones.
People: long linen shirts (leine) to the knee under a wool mantle (brat) pinned with a brooch, simple coloured checks, no kilts or belted plaids (they are four centuries later), rawhide shoes or bare feet; spearmen with long spear and round targe; swordsmen with broadsword and mail shirt; archers with short bows in plain wool; mounted knights in mail with a heater shield; monks in undyed robes.
Pack animal: Highland garron pony with panniers, or a donkey.
Do not: full Victorian kilts and tartan everywhere, Braveheart face paint, horned helmets, bagpipes on soldiers, fantasy claymores taller than the man.
```

2. **The game's sizes differ.** The game currently draws:
   - 3x3 buildings at about 365x420 px (2x2 ones, now including the market, forge and armoury, at about two-thirds of that)
   - units at about 145x195 px
   - UI unit portraits at 300x380 px

   The 4x sizes in the instruction set are fine as source: the game scales on load. Keep the aspect ratios and the 4 px margin.
3. **Not yet delivered from the original manifest.** The art-drop README already notes these:
   - construction and ruin states for every building
   - individual unit frames for every faction
   - spy, scholar and ram singles
   - action button icons

   These still count; the construction and ruin states are now priority 6 (delivered), and the stance, formation and order buttons are priority 14.
4. **Facing.** The old shared unit art looks left; the new per-people figures look right. The game handles both (it mirrors), but keep every new figure looking right or straight out.
5. **Captain standard** is painted with neutral cloth and the game dyes it per house. Keep any future marks that carry house colour neutral (white or pale grey cloth).
6. **Command-card icons need a clear corner** (2026-10-17). The instruction set's Goods icon template centres the subject with a 4 px margin; the game now prints a hotkey letter in the top-right corner of every command-card button when Grid keys are on. Paint button icons (orders, stances, formations, any future train or build button art) with the subject weighted to the lower left and the top-right eighth empty.
7. **Every figure that walks needs its own stride** (2026-10-19). The instruction set asks for one still per unit. The game now plays four walk frames per figure, and any figure without them (today the six Armoury kit figures, priority 19) strides in code and looks like a cut-out beside the rest. Any future person or mount (a new unit, a unique unit per people, T10) is delivered as a still plus `_walk1`-`_walk4`.
8. **Drops are linted** (2026-10-19). `tools/art-lint.py` (CI) fails a file that is not RGBA, has a corner a quarter opaque or more (cards and portraits excepted), shows the key colour or a magenta rim on its soft edges, or is over twice the size of its kind. Run it before committing art.

## Priority 8: three new peoples (Vikings, Byzantines, Persians)

Matches now seat up to eight houses. Three new peoples sit beside the first five. Each needs the same kit the others have. Until it arrives, their buildings and soldiers are the shared art tinted in their colour.

**Once a people's remaining files are in, take it out of `PARTIAL` in `js/art.js`** (one line). Until then the game asks only for its buildings and its three soldiers, so the missing files make no 404 noise. (The older `kit: false` flag in `FACTIONS` is no longer set for any people.)

| People (folder) | House | Colour (cloth hue) | Look: paste into the Building and Human unit templates | Do not |
| --- | --- | --- | --- | --- |
| Vikings (`vikings`) | House Ynglings | orange #C0662A (hue 24) | turf-roofed longhouses with carved dragon gables, stave timber, round shields hung along the walls; soldiers in wool tunics and mail, round painted shields, Dane axes, spangenhelm helmets | no horned helmets, no fur bikinis |
| Byzantines (`byzantines`) | House Komnenos | rose #A8366E (hue 330) | brick-and-stone banding, lead domes, gold mosaic over the doors, marble columns; soldiers in lamellar and klivanion, kite shields, cataphracts in scale on armoured horses, Varangian guards with axes | no Gothic spires, no Ottoman minarets |
| Persians (`persians`) | House Sassan | teal #24857E (hue 174) | iwan arches, glazed blue-green tile, walled gardens with water channels, fire temples; soldiers in quilted coats and mail, tall felt caps, composite bows, clibanarii in full mail on mailed horses | no turbans of later centuries, no flying carpets, no scimitar-and-genie fantasy |

For each people, deliver what the first five have:

- **Buildings**: all 18 keys in `FACTION_BUILDINGS`, complete state, in `assets/factions/<folder>/buildings/<key>.png`. The Vikings' `hall.png` is already there. The armoury needs `_build` and `_ruin` too.
- **People**: the six armed keys (priority 3); `footman`, `bowman`, `knight` to priority 9; `serf` and its two work frames to priority 10; `king` to priority 12; `recruit`, `scout`, `spy`, `scholar` as priority 5 describes. All to the **character guide** and its lineup test, in `assets/factions/<folder>/units/`. Paint the people's colour in: these figures are drawn as painted, not re-dyed.
- **Ruler portraits** (bust, 300x380) in `assets/shared/ui/portraits/`: `jarl.png` (a Jarl with a gold arm-ring and a fur cloak), `basileus.png` (the Basileus in a jewelled loros and crown with pendilia), `shahanshah.png` (the Shahanshah with the winged crown and a beard tied with ribbons).
- **Pack animals**: none new. Vikings and Byzantines use the donkey and Persians the dromedary.

Crests are drawn in code (a longship, an imperial crown, the winged sun), so no art is needed for them.

## Priority 9: soldiers who look like soldiers (repaint, 24)

Repaint `footman`, `bowman` and `knight` for all eight peoples (the first five replace the set-aside priority 5 figures; the three new peoples need them anyway). Follow the **character guide**: helmet, armour in the people's style, shield or bow clearly shown, people colour on a quarter of the figure, darkest third near-black. They are the **unequipped** soldier: the Armoury's kit (spear, sword, longbow, crossbow, lance, heavy armour) is shown by the priority 3 variants. So give the plain footman the people's standard sidearm (axe, short sword, khopesh, sabre), the plain bowman a short or composite bow, and the plain knight a sword. Then set the priority 3 variants beside them and check the man is recognisably the same before and after the Armoury.

| People | Footman | Bowman | Knight |
|---|---|---|---|
| Egyptians | leather-and-linen cap, scale or quilted linen corselet, tall wicker-and-hide shield painted yellow, khopesh | linen helmet, quilted corselet, composite bow drawn | chariot (two horses, a driver) with an archer in scale, yellow cloth |
| Romans | Imperial-Gallic helmet, mail or segmented plate, red curved scutum, gladius | auxiliary in mail and conical helmet, composite bow | cavalryman in mail on a saddled horse, oval red shield, spatha |
| Scots | conical helmet, mail shirt over a blue leine, round blue targe, axe | quilted aketon, steel cap, short bow, blue plaid | knight in mail and great helm, blue heater shield, blue horse cloth |
| British | kettle helm, gambeson and mail, green heater shield, sword | kettle helm, gambeson, short bow, green hood | mail, great helm, green surcoat and heater shield, barded horse |
| Mongols | conical helmet with aventail, lamellar in black lacquer, violet sash and small round shield, sabre | lamellar, recurve bow and case, violet coat | heavy lancer in lamellar on an armoured horse, violet cloth |
| Vikings | spangenhelm, mail, orange-and-black painted round shield, bearded axe | leather cap, quilted coat, hunting bow | mounted jarl's man in mail, orange round shield |
| Byzantines | helmet with aventail, lamellar klivanion, rose kite shield, spathion | quilted kavadion, helmet, composite bow | cataphract in scale on a scale-barded horse, rose cloth |
| Persians | ridge helmet, mail and quilted coat, teal wicker shield, sword | quilted coat, cap, composite bow | clibanarius in full mail on a mailed horse, teal cloth |

Prompt (Human unit template, filled):

```text
{PEOPLE} {ROLE}, a trained soldier, full length, three-quarter view looking right, realistic proportions, standing ready. {FOOTMAN/BOWMAN/KNIGHT cell from the table}. Strong value contrast: dark iron and leather against {COLOUR NAME} cloth that covers shield and tunic. Not a peasant, not a civilian, not pale. Flat #FF00FF background, no shadow, 256x256, feet at the bottom edge less 8 px, head or helmet at the top less 4 px.
```

Deliver: `assets/factions/<faction>/units/{footman,bowman,knight}.png`. After the lineup test passes for a people, remove the three keys from `REPAINT` in `js/art.js` (one line); they then replace the stand-ins for every people that has them.

## Priority 10: serfs of each people (24)

Every house's serfs were one shared figure. Since 2026-10-12 each of the first five peoples shows its painted villager (the `recruit` figure) as a stand-in, swaying at his task. That is better, but it has no work frames, and the Vikings, Byzantines and Persians still have the shared serf. Paint three frames per people from the **Workers** column of the dress table in the character guide:

| File key | Pose |
|---|---|
| `serf` | walking or standing, tool over the shoulder |
| `serf_work1` | the tool raised (top of a swing, or lifting a load) |
| `serf_work2` | the tool down (striking the ground or wood, or setting the load down) |

The game alternates `serf_work1` and `serf_work2` while a serf gathers, builds or mines, so the two must line up (same feet, same framing).

```text
{PEOPLE} SERF, a working labourer, full length, three-quarter view looking right, slight build, a little stooped. {WORKERS cell from the dress table}. Undyed working cloth with one small touch of {COLOUR NAME}. {POSE}. No helmet, no armour, no shield, no weapon. Flat #FF00FF background, no shadow, 256x256, feet at the bottom edge less 8 px.
```

Deliver: `assets/factions/<faction>/units/serf.png`, `serf_work1.png`, `serf_work2.png`. Then take `serf`, `serf_work1` and `serf_work2` out of `REPAINT` in `js/art.js` (they wait there so the game does not ask for files that are not painted yet). For the three new peoples also take them out of the `PARTIAL` unit list.

## Priority 11: spies who are easy to miss (3)

The lineup test on 2026-10-12 passed every new soldier, but the Egyptian, Scottish and Mongol spies are cream or pale grey from hood to hem. A spy is the one figure meant to vanish against the ground (character guide: "dark, muted cloak; the colour only as a hidden lining or a thin cord"). Repaint those three to match the Roman and British spies: a dark, dull cloak (umber, charcoal, deep olive), face in shadow, a small knife or satchel, the people's colour only as a lining or cord. Same framing as the delivered spies.

```text
{PEOPLE} SPY, hooded, full length, three-quarter view looking right, hunched slightly into a dark dull {umber/charcoal/olive} cloak, face in shadow, a small knife at the belt. {People line from the faction kit}. Only a thin cord or lining of {COLOUR NAME}. Not pale, not bright. Flat #FF00FF background, no shadow, 256x256, feet at the bottom edge less 8 px.
```

Deliver: `assets/factions/{egyptians,scottish,mongols}/units/spy.png`. The scholars' pale robes are true to their people and may stay, but a stole or book cover in the people's colour would help them read as part of the house.

## Priority 12: kings on the field (8)

A house falls when its last king dies, so the king is the most important figure on the field. Today he is drawn as his people's knight with a small crown drawn over him: he looks like any other rider. Paint one field figure per people from the **King** column of the dress table. He must match his Council portrait (same face, same crown, same colours) and be told apart from his own knights at a glance: crown or mark of rule, the richest kit, the people's colour boldest. Mounted (or in the Pharaoh's chariot), drawn at 68 px, the tallest figure on the field.

```text
{PEOPLE} KING on campaign, mounted, full length, three-quarter view looking right, realistic proportions. {KING cell from the dress table}. The same man as the portrait {pharaoh/imperator/highking/king/khan/jarl/basileus/shahanshah}.png. Richest kit of his house; {COLOUR NAME} cloth boldest. Flat #FF00FF background, no shadow, 320x320, feet or hooves at the bottom edge less 8 px.
```

Deliver: `assets/factions/<faction>/units/king.png`. Then take `king` out of `REPAINT` in `js/art.js` (and add it to the `PARTIAL` unit list for the three new peoples); the game draws `king` before falling back to the knight.

## Priority 14: order icons, stances, formations and orders (13; 8 on 2026-10-13, 5 more on 2026-10-16)

The command card has a **Stance** row (since T01) and, for a group, a **Formation** row (T02, 2026-10-13): Mass, Line, Box, Loose. All eight buttons show a text glyph today (⚔ ⛨ ⚓ ☮ and ◉ ☰ ▣ ⁘). Formations themselves need no painting: the soldiers stand in ranks and face the way they marched, using the figures already painted. Since 2026-10-16 the command card also has **Attack** (G, T-059), **Retreat** (R, T-059) and **Repair** (T-061) beside **Stop** and **Attack-move**, all with glyphs (■ ⚔ ⚑ ↩ 🔨). Only the thirteen button icons are wanted. Use the **Goods icon** template: 128x128 px, readable at 32 px on a dark wood button, neutral colours (no faction colour: every house uses the same buttons), no text or letters.

| Key | Order | Subject to paint |
|---|---|---|
| `aggressive` | Stance: engage and chase | two crossed swords, blades up, a little motion in the hilts |
| `defensive` | Stance: engage but come back | a round shield face-on with a sword lowered behind it |
| `hold` | Stance: never step off the spot | a spear planted upright in the ground, a heavy iron stake beside it |
| `passive` | Stance: never start a fight | a sword sheathed and bound to its scabbard with a cord (a peace-tie) |
| `mass` | Formation: a tight knot | seven small dark helmets seen from above, packed in a round cluster |
| `line` | Formation: ranks across the march | small helmets from above in two straight rows, shields along the front row, an arrow mark pointing forward |
| `box` | Formation: a square, bowmen inside | small helmets from above round the edge of a square, shields facing out, two bows in the middle |
| `loose` | Formation: spread wide | small helmets from above scattered widely with wide gaps between them |
| `amove` | Order: march and fight whatever is met | a sword laid along a forward arrow drawn on parchment, point leading |
| `charge` | Order: fall on the nearest foe | a war banner on a lance, dipped forward as in a charge, cloth streaming back (pale cloth: no house colour) |
| `retreat` | Order: off the field to the nearest keep | a round shield slung on the back of a small walking figure's silhouette, or a curved arrow turning back towards a tiny keep tower |
| `stop` | Order: halt where you stand | a spear butt planted in the ground and an open palm raised before it |
| `repair` | Order: serfs mend a damaged building | a carpenter's mallet and a peg over a split timber beam bound with fresh rope |

Prompt (Goods icon template, filled; one per key):

```text
ORDER ICON, {SUBJECT}, painted in the same hand-painted medieval style as the kit and research icons: iron, leather and wood, warm low sun from the upper left, soft shadow. Neutral colours only (iron grey, brown leather, natural wood), no faction colour, no text or letters. For formations: a top-down view of small round helmets and shields, like tokens on a war table, so the shape of the formation reads at 32 px. Flat #FF00FF background, centred, 4 px margin, 128x128 (shown at 24-32 px).
```

**Keep the top-right corner clear** (about the top-right eighth of the square): since 2026-10-17 Grid keys print the button's key there (Q, W, ⇧A...), so nothing important may sit under it. The same goes for any future command-card icon.

Deliver: `assets/shared/ui/orders/<key>.png` for the thirteen keys. Then add `...STANCES, ...FORMATIONS, 'amove', 'charge', 'retreat', 'stop', 'repair'` to `UI_KEYS.orders` in `js/art.js` (one line; the buttons already ask for `uiArt('orders', key)` and fall back to the glyph).

## Priority 13: a ram whose wheels turn (2)

The owner asked for the ram's wheels to turn. The ram is one painting, so the game can only rumble it. Paint it in two parts:

| File | Subject |
|---|---|
| `ram_body.png` | the same roofed ram as `ram.png`, same view, size and framing, but **with no wheels**: the axle ends and hubs' mounting showing where the wheels go |
| `ram_wheel.png` | one heavy wooden wheel seen **face-on** (a true circle, not an ellipse): plank face, iron tyre and studs, a hub, 128x128, centred, 4 px margin |

The game turns the wheel and squashes it into the three-quarter view itself, so paint it flat-on. It draws the two far wheels behind the body and the two near wheels in front.

```text
SIEGE RAM BODY: the roofed timber battering ram as in the current ram.png, same three-quarter view facing right, same size and framing, with the four wheels removed so the axle ends show. Flat #FF00FF background, no shadow, 420x392.
RAM WHEEL: a single heavy wooden cart wheel of thick planks with an iron tyre and iron studs, seen exactly face-on as a perfect circle, centred. Flat #FF00FF background, no shadow, 128x128, 4 px margin.
```

Deliver both to `assets/shared/units/`. Then set `RAM_PARTS = true` in `js/art.js`, and fit the four hub positions (`RAM_WHEELS` in `js/render.js`, fractions of the body picture) to the painted axles.

## Priority 15: walk cycles (later, soldiers first)

(Numbered 14 on 2026-10-14 by mistake, the same number as the order icons; renumbered 15 on 2026-10-15.)

Since 2026-10-14 the game makes still figures walk in code: it cuts each figure at the hip and swings the legs (scissoring for people, forelegs against hind legs for horses). That reads well at play zoom; close up it can look like a paper cut-out. Real walk cycles are the proper finish. Paint four frames of one stride per role, in the same framing as the role's still figure, starting with `footman`, `bowman` and `knight` for all eight peoples (96 files), then the rest.

| File | Pose |
|---|---|
| `<role>_walk1.png` | right foot forward, contact |
| `<role>_walk2.png` | passing, body highest |
| `<role>_walk3.png` | left foot forward, contact |
| `<role>_walk4.png` | passing, body highest |

Same feet line and head height in every frame so the figure does not jump. **Delivered and wired** 2026-10-19 for `footman`, `bowman`, `knight`, `scout`, `recruit`, `spy`, `scholar`, `serf` and `king` (not the Egyptian chariot, and not the six armed-kit stills).

## Priority 16: the watchman mark (1, new 2026-10-15)

Since T-057 a spy right-clicked onto a village you hold is posted inside as a **watchman**, and rival spies are far likelier to be caught there. The watchman himself is hidden inside (no figure to paint: he uses the people's dark `spy.png` when he comes out). The village panel now has a **Watch** row: how many watchmen are posted and whether someone is at work turning the village. It shows a 👁 glyph until a small mark is painted. Use the **Goods icon** template, as for the alarm mark.

| Key | Size | Subject to paint |
|---|---|---|
| `watch` | 64x64 | a hooded lantern with a half-open shutter throwing a narrow beam, a single watchful eye worked into the iron of the hood; neutral colours, no faction colour, no text |

```text
WATCHMAN MARK, a small iron hooded lantern with a half-open shutter throwing a narrow warm beam, a single watchful eye worked into the iron hood, painted in the same style as the deed badges and the alarm mark: iron, horn and warm candlelight, light from the upper left. Neutral colours only, no faction colour, no text. Flat #FF00FF background, centred, 4 px margin, 256x256 (shown at 16-24 px).
```

Deliver: `assets/shared/ui/marks/watch.png`. Then add `'watch'` to `UI_KEYS.marks` in `js/art.js` (one word; the panel already asks for `uiArt('marks', 'watch')` and falls back to the glyph, and nothing probes for the file before then).

## Priority 17: the disguise mark (1, new 2026-10-16)

Since T-060 a spy can wear a met house's colours. His figure is drawn in that house's colours for everyone, and only his owner sees a small mask over his head, so the player can tell his own disguised spy from a real rival. It shows a 🎭 glyph until painted. Use the **Goods icon** template, as for the watchman mark.

| Key | Size | Subject to paint |
|---|---|---|
| `disguise` | 64x64 | a plain half mask of dark leather with two eye holes, tied with a cord, a fold of a hooded cloak behind it; neutral colours, no faction colour, no text |

```text
DISGUISE MARK, a plain dark leather half mask with two eye holes and a thin tie cord, a fold of a muted grey hooded cloak behind it, painted in the same style as the deed badges and the watchman mark: leather and wool, light from the upper left, soft shadow. Neutral colours only, no faction colour, no text, not a carnival or theatre mask. Flat #FF00FF background, centred, 4 px margin, 256x256 (shown at 16-22 px over a figure's head).
```

Deliver: `assets/shared/ui/marks/disguise.png`. Then add `'disguise'` to `UI_KEYS.marks` in `js/art.js` (one word; the renderer already asks for the `disguise` mark and draws the glyph when it is missing).

## Priority 18: ore deposits per mineral (10, new 2026-10-16)

The owner could not tell iron from stone (T-062). Every deposit except gold is drawn from the gold pile or the rock recoloured. Paint each mineral as its own deposit, full and half-dug, in the board's style (the props and gold pile in `assets/world/`): a low heap of broken rock on bare ground, three-quarter view, no tools, no people, no buildings. Each must be told apart from the others at 25% zoom by shape and colour together, not colour alone.

| Mineral | Full (`<mineral>.png`) | Half-dug (`<mineral>_half.png`) |
|---|---|---|
| `stone` | grey dressed blocks and rubble, a few squared stones | a lower heap, a cut face, loose chips |
| `copper` | orange-brown rock stained bright green (malachite) | lower, the green showing on fresh faces |
| `iron` | dark red-brown haematite boulders with rust streaks on the ground | lower, rust-red earth around |
| `coal` | black glossy seams in grey shale, black dust on the ground | lower, more black dust than rock |
| `silver` | dark grey rock with pale silvery veins catching the light | lower, a few bright fragments |

```text
ORE DEPOSIT, {MINERAL DESCRIPTION}, a low heap of broken rock on bare ground, hand-painted in the same style as the board's gold pile and rocks: three-quarter top-down view, warm low sun from the upper left, soft contact shadow painted in. No tools, people, carts or buildings, no text. Flat #FF00FF background, centred, 4 px margin, 256x192 (shown about 50 px wide). Half-dug variant: the same deposit lower and smaller, with a fresh cut face.
```

Deliver: `assets/shared/resources/<mineral>.png` and `<mineral>_half.png` for the five minerals (ten files). Then list the minerals in `ORE_PAINTED` in `js/art.js` (the renderer already draws `ORE_ART`, half-dug below half, and falls back to the recoloured pile).

## Acceptance

Use the QA checklist from the instruction set, and the **lineup test** in the character guide for every person. Also:

- **The Armoury:** it must not be mistaken for the forge at 25% zoom. The forge has a big chimney and glow; the armoury has racks and shields.
- **Icons:** each must read at 32 px on a dark wood button.
- **Variant soldiers:** they must stand at the same height and foot position as the plain unit, so they can be swapped in place.

- **Plain soldiers (priority 5):** set beside the armed pose of the same role, the two must read as the same man before and after the Armoury.
- **Ram and other wheeled engines:** the game grounds the ram with a shadow spanning the lower 30% of the picture (its wheelbase in three-quarter view) and does not bob it like a walker. A repainted or new engine (a future siege tower or catapult) must keep that framing: three-quarter view, the front wheel touching the bottom edge, all wheels within the lower third, and no empty margin under the wheels. Otherwise it floats above its shadow.

## Priority 19: walk cycles for the armed soldiers (192, new 2026-10-19)

Priority 15 gave every plain figure four stride frames, and the game plays them. A soldier the Armoury has equipped is drawn from his kit's still figure (`footman_spear`, `footman_sword`, `footman_heavy`, `bowman_longbow`, `bowman_crossbow`, `knight_lance`), which has no frames, so the game still cuts him at the hip and swings his legs. In a mixed army the kitted men are the veterans the player looks at most, and they are the ones who walk like paper cut-outs.

Paint four frames for each kit figure of each people, exactly as priority 15: the same framing, height and foot line as that kit's still figure (`units/<kit key>.png`), so the game can swap them in place, the weapon carried at the march (spear upright on the shoulder, sword sheathed or held low, bow in the off hand, crossbow on the shoulder, lance upright). The Egyptian `knight_lance` is a chariot: no cycle.

| File | Pose |
|---|---|
| `units/<kit key>_walk1.png` | right foot forward, contact (a horse: near fore and off hind forward) |
| `units/<kit key>_walk2.png` | passing, body highest |
| `units/<kit key>_walk3.png` | left foot forward, contact |
| `units/<kit key>_walk4.png` | passing, body highest |

Deliver at the still figure's size (about 260 px on the long side; knights about 300). Dress, kit and colour as in **How each people really looked** in the character guide and priority 3; the people's colour on cloth only.

```text
UNIT WALK FRAME: {PEOPLE} {ROLE} carrying {KIT: spear / sword and mail / heavy plate or lamellar / longbow / crossbow / lance on horseback}, frame {1-4} of a four-frame walk cycle ({POSE from the table}), same costume, kit, proportions and scale as the still figure, three-quarter view facing right, painted AoE II style, realistic, weathered, no cartoon proportions. {FACTION KIT from the Seven Holds instruction set, or the Scots kit in Gaps 1}. Feet line and head height identical across the four frames. Flat #FF00FF background, no shadow, no ground, 4 px margin.
```

Wiring (Claude, on delivery): add the six kit keys to the walk-cycle loop in `js/art.js` `loadArt` and let render.js `gaitOf` prefer `<kit key>_walk<n>` over the hip-cut; run `tools/art-lint.py` on the drop.

## Priority 13b: the siege line (onager, trebuchet) and its research icons (5)

The academy now has a siege line (owner, 2026-10-19): **Siegecraft** unlocks the Ram, **Torsion engines** the Onager, **Counterweight engines** the Trebuchet. Each engine does more to walls than the one before. Paint the two new engines as the ram is painted: shared (all peoples use them), three-quarter view looking right, timber and iron, a small pennant or cloth that is plain (the game adds no colour to shared engines), no crew. Same framing rules as the ram: the front wheel on the bottom edge, all wheels in the lower third.

| File | Subject | Size |
|---|---|---|
| `units/onager.png` | a Roman-style onager: a low heavy timber bed on four wheels, a single upright throwing arm with a sling cup, a thick twisted-rope torsion skein at its foot, a padded buffer beam | 420x300 |
| `units/trebuchet.png` | a counterweight trebuchet on a wheeled base: tall A-frame, a long throwing beam with a boxed counterweight of stones at the short end and a sling at the long end, the sling lying in its trough | 420x520 |
| `ui/tech/siegecraft.png` | a battering ram's iron-capped head and a coil of rope | 256x256, icon style as the other research icons |
| `ui/tech/torsion.png` | a twisted rope skein in a timber frame with a sling cup | 256x256 |
| `ui/tech/counterweight.png` | a counterweight box of stones hanging from a beam | 256x256 |

```text
SIEGE ENGINE: {ONAGER or TREBUCHET as above}, three-quarter view facing right, realistic timber, rope and iron, weathered, on its wheels, no crew, plain undyed cloth only. Flat #FF00FF background, no shadow, {SIZE}, the front wheel on the bottom edge less 8 px.
```

The stones they throw are drawn by the game (no art needed).

## Priority 20: the town bell order icon (1, new 2026-10-20)

The town bell (T38, as in AoE II) sends every serf and scholar near a keep, tower, barracks or held village inside, and a second ring sends them back to work. It is a button on the keep's command card (key **B** by default) and on the minimap row. The keep's button wants an icon in the same set as the thirteen order icons of priority 14: same **Goods icon** template, 128x128 px, readable at 32 px on a dark wood button, neutral colours (no faction colour: every house rings the same bell), no text or letters, top-right corner kept clear for the Grid key label.

| Key | Order | Subject to paint |
|---|---|---|
| `bell` | Order: everyone into shelter; again for the all-clear | a bronze hand-bell or a small bell hung in a timber frame, swinging, with two short curved strokes beside it for its ring; a rope pull hanging below |

```text
ORDER ICON, a bronze town bell hung in a small timber frame, caught mid-swing, two short curved ring strokes beside it, a rope pull hanging below, painted in the same hand-painted medieval style as the kit and research icons: bronze, iron and weathered wood, warm low sun from the upper left, soft shadow. Neutral colours only, no faction colour, no text or letters, top-right eighth of the square left clear. Flat #FF00FF background, centred, 4 px margin, 128x128 (shown at 24-32 px).
```

Deliver: `assets/shared/ui/orders/bell.png`. Wiring (Claude, on delivery): key it (`tools/chromakey.py`, `tools/defringe.py`), run `tools/art-lint.py`, and add `'bell'` to `UI_KEYS.orders` in `js/art.js`; the button already asks for `uiArt('orders', 'bell')`.

## Priority 21: the patrol order icon (1, new 2026-10-21)

Patrol (T39, as in AoE II and IV) sends soldiers walking a round between where they stand and the posts the player clicks, fighting whatever they meet and walking on. It is a button on every fighting card, beside Attack-move (key **Z** by default). The button wants an icon in the same set as the thirteen order icons of priority 14 and the bell of priority 20: same **Goods icon** template, 128x128 px, readable at 32 px on a dark wood button, neutral colours (no faction colour), no text or letters, subject weighted to the lower left with the top-right eighth clear for the Grid key label.

| Key | Order | Subject to paint |
|---|---|---|
| `patrol` | Order: walk this round for ever, fighting what you meet | two worn boot prints on a short loop of trodden path that curls back on itself, with a planted spear standing at the far turn as the post; or a spear and a lantern on a pole at the near turn |

```text
ORDER ICON, a short loop of trodden earth path curling back on itself, two worn leather boot prints on it, a single spear planted upright at the far turn of the loop as a marker post, painted in the same hand-painted medieval style as the kit and research icons: packed earth, leather, iron and ash wood, warm low sun from the upper left, soft shadow. Neutral colours only, no faction colour, no text or letters, no arrows drawn as UI symbols, subject weighted to the lower left, top-right eighth of the square left clear. Flat #FF00FF background, 4 px margin, 128x128 (shown at 24-32 px).
```

Deliver: `assets/shared/ui/orders/patrol.png`. Wiring (Claude, on delivery): key it (`tools/chromakey.py`, `tools/defringe.py`), run `tools/art-lint.py`, and add `'patrol'` to `UI_KEYS.orders` in `js/art.js`; the button already asks for `uiArt('orders', 'patrol')`.

## Priority 22: the explore order icon (1, new 2026-10-24)

Explore (T45, as AoE IV's auto-scout) sends a scout riding off on his own to the nearest ground the house has not seen, then the next, keeping clear of foes, until nothing is left. It is a button on a scout's command card (key **O** by default). The button wants an icon in the same set as the order icons of priority 14, the bell of priority 20 and the patrol of priority 21: same **Goods icon** template, 128x128 px, readable at 32 px on a dark wood button, neutral colours (no faction colour: every house's scouts explore alike), no text or letters, subject weighted to the lower left with the top-right eighth clear for the Grid key label.

| Key | Order | Subject to paint |
|---|---|---|
| `explore` | Order: ride out and map unseen ground on your own | a rolled-out parchment map with its edge still blank, a brass hand compass resting on it; or a horseman's spyglass lying across a half-drawn map |

```text
ORDER ICON, a curling sheet of old parchment map with hills and a river inked on one half and the other half still blank, a small brass hand compass resting on the blank half, painted in the same hand-painted medieval style as the kit and research icons: parchment, brown ink, brass and leather, warm low sun from the upper left, soft shadow. Neutral colours only, no faction colour, no text or letters or legible writing on the map, no arrows drawn as UI symbols, subject weighted to the lower left, top-right eighth of the square left clear. Flat #FF00FF background, 4 px margin, 128x128 (shown at 24-32 px).
```

Deliver: `assets/shared/ui/orders/explore.png`. Wiring (Claude, on delivery): key it (`tools/chromakey.py`, `tools/defringe.py`), run `tools/art-lint.py`, and add `'explore'` to `UI_KEYS.orders` in `js/art.js`; the button already asks for `uiArt('orders', 'explore')`.

## Priority 23: the repeat-training icon (1, new 2026-10-26)

Repeat training (T47, as in AoE IV) keeps one soldier of a kind queued at a barracks, stable, archery range, keep, workshop or market, one after another, while the house can pay and has room. It is a toggle button after the unit buttons on every training building's card (it lights up and reads "Repeating" while on). The button wants an icon in the same set as the order icons of priority 14 and the bell, patrol and explore icons of priorities 20-22: same **Goods icon** template, 128x128 px, readable at 32 px on a dark wood button, neutral colours (no faction colour: every house's buildings repeat alike), no text or letters, subject weighted to the lower left with the top-right eighth clear for the Grid key label.

| Key | Order | Subject to paint |
|---|---|---|
| `repeat` | Order: keep training this kind, one after another | a row of three identical iron-shod spears leaning in a wooden rack, the last one just being set in place; or a sand hourglass beside a short stack of identical round shields |

```text
ORDER ICON, a small wooden weapon rack holding three identical ash-wood spears with iron heads standing side by side, a fourth identical spear leaning against the rack's end as if just added, painted in the same hand-painted medieval style as the kit and research icons: ash wood, iron, leather binding, warm low sun from the upper left, soft shadow. Neutral colours only, no faction colour, no text or letters or numbers, no arrows or circular UI symbols, subject weighted to the lower left, top-right eighth of the square left clear. Flat #FF00FF background, 4 px margin, 128x128 (shown at 24-32 px).
```

Deliver: `assets/shared/ui/orders/repeat.png`. Wiring (Claude, on delivery): key it (`tools/chromakey.py`, `tools/defringe.py`), run `tools/art-lint.py`, and add `'repeat'` to `UI_KEYS.orders` in `js/art.js`; the button already asks for `uiArt('orders', 'repeat')`.
