# Seven Holds art — first delivery for Claude

Painted isometric set from the art instruction. JPG sheets (the generator does not emit true PNG alpha). Magenta (#FF00FF) backgrounds are the chroma key; Claude should key them to alpha before dropping into the game.

This is the approved reference pass, not the full 270-file manifest (18 buildings x 5 factions x 3 states, plus work poses). Use these as the style lock, then generate the missing keys from the instruction set.

## Factions

| Folder | Accent | Hall | Units on roster |
| --- | --- | --- | --- |
| egyptians | gold | mudbrick hall | fellah, spearman, bowman, chariot, dromedary |
| romans | crimson | colonnaded hall | peasant, legionary, archer, cavalry, donkey |
| vikings | blue | longhouse | thrall, axeman, hunter, chieftain, pony |
| british | green | timber hall, keep, cottage, economy sheet | villein, spearman, longbow, knight, friar |
| mongols | purple trim | ger hall | herder, sabre, archer, horse archer, Bactrian |

Reference sheet for each faction: `assets/factions/<faction>/ui/reference-sheet.jpg`

## Shared

- `shared/villages/six-villages.jpg` — hamlet, mine camp, market town, hillfort, abbey, crossroads inn
- `shared/nodes/nodes-sheet.jpg` — oak, pine, palm, berries, gold, stone, iron, copper, stump
- `shared/goods/goods-sheet.jpg` — grain, timber, coin, stone, copper, iron, coal, silver, steel, pottery
- `shared/terrain/terrain-sheet.jpg` — grass, dry, sand, rock, road, water, snow
- `shared/ui/crests.jpg` — Egypt, Rome, Norse, British, Mongol

## Claude notes

- Map British to the player house if the current build is still Calder. The other four are rival kits.
- Do not invent Christmas or Tolkien elves.
- Buildings face south-east. Units face screen-right; flip in code for the other direction.
- Missing from this zip: per-building construction and ruin states, individual 256px unit frames, spy/scholar/ram singles, UI button icons. Cut those from the sheets or regenerate with the style bible.
