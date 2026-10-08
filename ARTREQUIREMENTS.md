# Art requirements

What the game needs painted next, in priority order. Every request follows the **Seven Holds Art Instruction Set**: paste the style bible and negatives, then one faction kit, then the prompt given here. Sizes, angle, lighting, QA and the file-naming rules are the ones in that document. Nothing below changes the look.

Written 2026-10-08 for the `grok` branch.

## How the game uses delivered art

| What | Drop it at | Picked up |
|---|---|---|
| A faction building | `assets/factions/<faction>/buildings/<key>.png` | Automatically, on the next load (the key must be in `FACTION_BUILDINGS` in `js/config.js`; `armoury` already is) |
| A faction unit | `assets/factions/<faction>/units/<role>.png` | Needs wiring: tell Claude when delivered |
| Icons (kit, research, deeds) | `assets/shared/ui/<group>/<key>.png` | Needs wiring: tell Claude when delivered |
| Portraits | `assets/shared/ui/portraits/<key>.png` | Needs wiring: tell Claude when delivered |

Until a file exists the game falls back to a stand-in: the forge sprite for the armoury, a text glyph for icons. Missing files never break the game.

`<faction>` in this game is one of `egyptians`, `romans`, `scottish`, `british`, `mongols`. The Norse (`vikings` folder) are not a house. Their art is still useful for the Norse far-lander in taverns.

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

   These still count. Schedule them after priorities 1-2 above.

## Acceptance

Use the QA checklist from the instruction set. Also:

- **The Armoury:** it must not be mistaken for the forge at 25% zoom. The forge has a big chimney and glow; the armoury has racks and shields.
- **Icons:** each must read at 32 px on a dark wood button.
- **Variant soldiers:** they must stand at the same height and foot position as the plain unit, so they can be swapped in place.

Send the five Armoury images and the seven kit icons first. Claude will wire the icons and check the Armoury in game before the rest are made.
