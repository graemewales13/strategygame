# Art requirements

What the game needs painted next, in priority order. Every request uses the **Seven Holds Art Instruction Set** for style, negatives, angle, lighting, QA and file naming. **For people, the character guide below overrides the instruction set** (its unit table, its kit colours and its old Vikings): what each role is for, how big it is drawn, and what each people actually wore.

Written 2026-10-08 for the `grok` branch. Updated 2026-10-11: priorities 1 to 4 delivered (Grok, 8b7d6f1). Updated 2026-10-12: priorities 5 to 7 delivered; three new peoples added (priority 8); the **character guide** written after the owner found soldiers that read as feeble civilians and every serf alike; priority 9 (soldiers) delivered; the owner then asked that **the folk of every people look like what they really wore: workers, soldiers and kings**. That is the open work below. Later on 2026-10-12: the 24 priority-9 soldiers scaled down to game size (T-054); T02 waypoints need no painting.

## Paint next: new characters are needed

**Yes, new characters are required.** Soldiers are done. Workers and kings are not: every Viking, Byzantine and Persian serf is still one shared figure, the first five peoples' serfs are a stand-in, and every king is just his people's knight with a crown drawn over him. Paint in this order. Each line links to its brief; every figure follows the character guide and passes its lineup test.

| Order | New characters | Peoples | Files | Count | Brief |
|---|---|---|---|---|---|
| 1 | **Serfs**: the people's own workers, in their real working dress, with two work frames | all 8 | `units/serf.png`, `serf_work1.png`, `serf_work2.png` | 24 | priority 10 |
| 2 | **Kings on the field**: each ruler mounted (Pharaoh in his chariot), matching his portrait | all 8 | `units/king.png` | 8 | priority 12 |
| 3 | **The rest of the new peoples' folk**: levy, scout, spy, scholar | Vikings, Byzantines, Persians | `units/recruit.png`, `scout.png`, `spy.png`, `scholar.png` | 12 | priority 8 |
| 4 | **The new peoples' Armoury soldiers** | Vikings, Byzantines, Persians | the six keys of priority 3 | 18 | priorities 3 and 8 |
| 5 | **Spies repainted dark** | Egyptians, Scots, Mongols | `units/spy.png` | 3 | priority 11 |
| 6 | Building sites and ruins for the new peoples | Vikings, Byzantines, Persians | `buildings/<key>_build.png`, `<key>_ruin.png` for the 18 keys | 108 | priorities 6 and 8 |
| 7 | *Optional:* women among the serfs | all 8 | `units/serf_f.png`, `serf_f_work1.png`, `serf_f_work2.png` | 24 | character guide (not wired yet: say when they are coming and it is one line) |

Paths are under `assets/factions/<people>/`, with `<people>` one of `egyptians`, `romans`, `scottish`, `british`, `mongols`, `vikings`, `byzantines`, `persians`. Dress for every people and tier is in **How each people really looked** in the character guide.

## Status at a glance

| Priority | What | Status |
|---|---|---|
| 1 | Armoury, complete, `_build` and `_ruin`, five peoples | **Delivered and wired** 2026-10-11 |
| 2 | Kit icons (7) and research icons (9) | **Delivered and wired** |
| 3 | Armed soldiers, six per people (30) | **Delivered and wired** for the first five peoples. The new three: open (order 4) |
| 4 | Far-lander portraits (8), ruler portraits (5), captain standard, deed badges (6), fugitive mark | **Delivered and wired** |
| 5 | Plain figures per people: footman, bowman, knight, scout, recruit, spy, scholar | **Delivered** 2026-10-12. The footman, bowman and knight read as civilians and were replaced by priority 9. `recruit` (also the serf stand-in), `scout`, `spy` and `scholar` are in use |
| 6 | Raising and ruin states for every other building | **Delivered and wired** 2026-10-12 for the first five peoples. The new three: open (order 6) |
| 7 | War-horn alarm mark | **Delivered and wired** 2026-10-12 |
| 8 | Three new peoples: Vikings, Byzantines, Persians | **Part delivered** 2026-10-12: 18 buildings, footman, bowman, knight, ruler portraits. **Open**: serfs, king, recruit, scout, spy, scholar, the six armed variants, building sites and ruins (orders 1 to 4 and 6). `PARTIAL` in `js/art.js` keeps them on the shared art meanwhile |
| 9 | Soldiers to the character guide: footman, bowman, knight (8 peoples, 24) | **Delivered and wired** 2026-10-12. They pass the lineup test. Delivered at about 800x1200 px (1 MB each, 24 MB in all, drawn 50-66 px high); scaled to 260 px on the long side by the daily review (1.5 MB in all, T-054) |
| 10 | **Serfs per people** (8 peoples, 24) | **Requested: order 1.** Stand-in today: the first five peoples' `recruit` figure, swaying at work; the new three: the shared serf. Wired: the keys wait in `REPAINT` in `js/art.js` |
| 11 | Spies easy to miss (Egyptians, Scots, Mongols) | **Requested: order 5.** Delivered spies are pale all over (ghost rule) |
| 13 | Waypoints and marching together (T02, 2026-10-12) | **No painting needed.** The queued legs are drawn in code as dashed lines and small ground marks in the order-line colours (green march, red attack-move) |
| 12 | **Kings on the field** (8) | **Requested: order 2.** Today: his people's knight with a drawn crown. Wired: `king` waits in `REPAINT` |

## How the game uses delivered art

| What | Drop it at | Picked up |
|---|---|---|
| A faction building | `assets/factions/<faction>/buildings/<key>.png` | Automatically, on the next load (the key must be in `FACTION_BUILDINGS` in `js/config.js`; `armoury` already is) |
| A building's raising or ruined state | `assets/factions/<faction>/buildings/<key>_build.png`, `<key>_ruin.png` | Automatically for the armoury; other buildings need their key added to `STATED` in `js/art.js` |
| An armed soldier | `assets/factions/<faction>/units/<role>_<kit>.png` (the six keys in priority 3) | Automatically |
| A plain soldier in the new style | `assets/factions/<faction>/units/<role>.png` for `footman`, `bowman`, `knight`, `scout`, `recruit`, `spy`, `scholar` | Automatically (priority 5). `footman`, `bowman`, `knight` only once removed from `REPAINT` in `js/art.js` (priority 9) |
| A serf of one people | `assets/factions/<faction>/units/serf.png` (idle and walking), `serf_work1.png`, `serf_work2.png` (the two halves of a work swing) | Automatically (priority 10) |
| Icons (kit, research) | `assets/shared/ui/gear/<key>.png`, `assets/shared/ui/tech/<key>.png` | Automatically (keys are `GEAR` and `TECH` in `js/config.js`) |
| Marks (deeds, captain, fugitive, alarm) | `assets/shared/ui/marks/<key>.png` (deed keys are `DEEDS` in `js/config.js`) | Automatically |
| Portraits | `assets/shared/ui/portraits/<key>.png` (far-land keys are `FARLANDS`; rulers are `pharaoh`, `imperator`, `king`, `khan`, `highking`, `jarl`, `basileus`, `shahanshah`) | Automatically |

Until a file exists the game falls back to a stand-in: the forge sprite for the armoury, the old shared figure for a soldier, a text glyph for icons, no mark. Missing files never break the game.

### Preparing a drop (Claude does this; listed so anyone can)

Art painted on a flat #FF00FF ground is turned into game sprites with:

```text
python3 tools/chromakey.py --max 480 assets/factions/*/buildings/<new>.png    # buildings: key, trim, cap the longest side
python3 tools/chromakey.py <unit, icon, mark and portrait files>               # key and trim with a 4 px margin
python3 tools/defringe.py <the same files>                                      # any pink fringe left on edges
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

**Women.** About a third of the names the game gives its folk are women's (every people's name list has them). A future `serf_f`, `serf_f_work1` and `serf_f_work2` per people, in the same dress table, would let them be seen (optional, after priority 10).

### Before delivering: the lineup test

Make one picture per people of `serf`, `recruit`, `footman`, `bowman`, `knight`, `spy`, `scholar` and the king. Scale each to its height on the ladder and stand them on grass in a row. Pass only if:

1. Someone who has never played can point to the three soldiers and the serf without being told.
2. The serf is the smallest and lightest-built figure; the footman is the broadest on foot.
3. Every soldier's people colour can be named from across the room.
4. Nobody is a ghost (see the ghost rule).
5. Set beside another people's lineup, no two serfs or soldiers could be swapped unnoticed.

## Priority 1: the Armoury (new building)

The Armoury makes weapons and armour. It is unlocked by the Metallurgy research and sits beside the forge in a town. One per faction, five in all, each in three states: complete, `_build` and `_ruin`.

- **Size class:** 3x3 tiles, 768 px wide, 560-720 px tall at 4x.
- **Must read as at a glance:** an armourer's workshop, *not* the forge. Show:
  - racks of spears and swords under an open-fronted roof
  - shields hung on the wall
  - a mail shirt on a wooden stand
  - a grindstone
  - one small chimney (much smaller than the forge's)
  - a few stacked bow staves

Prompt (Building template, filled):

```text
{FACTION_NAME} ARMOURY, 3x3 footprint, {STATE}. An armourer's workshop: an open-fronted bay with racks of spears and swords, shields hung on the wall, a mail shirt on a wooden stand, a grindstone, stacked bow staves, one small chimney. Faction details: {see below}. Banner in {ACCENT_COLOUR}. Show the south-east face door. Transparent background, small contact shadow, 4x resolution, image size 768x640.
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
People: long wool tunics (leine) and belted plaids, simple coloured checks, leather brogues, cloaks pinned with a brooch; spearmen with long spear and round targe; swordsmen with broadsword and mail shirt; archers with short bows in plain wool; mounted knights in mail with a heater shield; monks in undyed robes.
Pack animal: Highland garron pony with panniers, or a donkey.
Do not: full Victorian kilts and tartan everywhere, Braveheart face paint, horned helmets, bagpipes on soldiers, fantasy claymores taller than the man.
```

2. **The game's sizes differ.** The game currently draws:
   - 3x3 buildings at about 365x420 px
   - units at about 145x195 px
   - UI unit portraits at 300x380 px

   The 4x sizes in the instruction set are fine as source: the game scales on load. Keep the aspect ratios and the 4 px margin.
3. **Not yet delivered from the original manifest.** The art-drop README already notes these:
   - construction and ruin states for every building
   - individual unit frames for every faction
   - spy, scholar and ram singles
   - action button icons

   These still count; the construction and ruin states are now priority 6.
4. **Facing.** The old shared unit art looks left; the new per-people figures look right. The game handles both (it mirrors), but keep every new figure looking right or straight out.
5. **Captain standard** is painted with neutral cloth and the game dyes it per house. Keep any future marks that carry house colour neutral (white or pale grey cloth).

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

## Acceptance

Use the QA checklist from the instruction set, and the **lineup test** in the character guide for every person. Also:

- **The Armoury:** it must not be mistaken for the forge at 25% zoom. The forge has a big chimney and glow; the armoury has racks and shields.
- **Icons:** each must read at 32 px on a dark wood button.
- **Variant soldiers:** they must stand at the same height and foot position as the plain unit, so they can be swapped in place.

- **Plain soldiers (priority 5):** set beside the armed pose of the same role, the two must read as the same man before and after the Armoury.
- **Ram and other wheeled engines:** the game grounds the ram with a shadow spanning the lower 30% of the picture (its wheelbase in three-quarter view) and does not bob it like a walker. A repainted or new engine (a future siege tower or catapult) must keep that framing: three-quarter view, the front wheel touching the bottom edge, all wheels within the lower third, and no empty margin under the wheels. Otherwise it floats above its shadow.
