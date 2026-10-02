# Seven Holds — village art script for Grok

Paste **STYLE LOCK** first in every Grok session, then one prompt block at a time. Keep the same session so the look stays consistent. Ask Grok for **one image per prompt**, landscape 3:2.

You already delivered the six independent villages (`1tile/` and `4tile/`: hamlet, farm, fishing, mining, fortified, market). They work. This pass is the village each **people** founds itself, which grows from a handful of settlers to fifty folk, so each people needs **three growth stages**.

## What to generate

| Count | What | Why |
| --- | --- | --- |
| 18 | 6 peoples × 3 stages (hamlet / village / town), board size **2x2** | the founded village changes look as its population grows (1–15, 16–35, 36–50) |
| 6 | the same peoples, stage "village" only, board size **1x1** | optional: the compact version to test against 2x2 |
| 1 | "village site": cleared ground, stakes, a cart of timber, a tent | shown while the serfs are still building it |

Total 19 required, 6 optional.

### File names (important, the cutter reads these)
```
villages/peoples/<people>/hamlet.jpg
villages/peoples/<people>/village.jpg
villages/peoples/<people>/town.jpg
villages/site.jpg
```
`<people>` = `egyptians`, `romans`, `vikings`, `british`, `mongols`, `scottish`. Zip them keeping that folder structure.

---

## STYLE LOCK (paste first, every session)

```
Painted isometric strategy-game art, in the style of Age of Empires II concept paintings: hand-painted
oil/gouache texture, realistic proportions, warm muted earth palette, soft top-left light, gentle ground
shadows. NOT cartoon, NOT vector, NOT flat, NOT chibi, NOT pixel art, NOT low-poly, no outlines.
Camera: true 2:1 isometric, looking down about 30 degrees, from the south. The subject is one self-contained
diorama on an irregular island of ground that fades out at the edges (grass, dirt paths, scattered stones).
No ground beyond the island, no horizon, no sky, no text, no UI, no border, no watermark, no people close up.
Background: perfectly flat solid pure magenta #FF00FF filling the whole frame, no gradient, no shadow cast
onto the background, no magenta anywhere on the subject.
Image: landscape 3:2 (1168x784). The subject is centred and fills about 85% of the width.
Seasonless, early medieval / late antique feel. Small tasteful details (smoke, laundry, carts, animals)
but no clutter. No fantasy, no elves, no Tolkien, no Christmas.
```

Board-size suffix (add to every prompt):

- **2x2:** `Board size: 2x2 squares. A proper village: many dwellings (6 to 14), paths, a central feature, fields or workshops, a clear silhouette.`
- **1x1:** `Board size: 1x1 square. A compact version: 3 to 4 dwellings and one central feature, tight on a small island of ground.`

---

## Egyptians (Nile mudbrick; ochre, sand, turquoise accents)

Growth look: mud-brick huts → houses with flat roofs and awnings → a town with a small shrine and granary.

**egyptians/hamlet.jpg**
```
A tiny Nile hamlet of a handful of flat-roofed mudbrick houses, reed fences, a clay water jar, a donkey,
a small vegetable patch, a palm or two. A thin yellow-gold pennant on a pole. Board size: 2x2 squares.
Few dwellings (4 to 6), plenty of bare dirt.
```
**egyptians/village.jpg**
```
A Nile village: 8 to 10 mudbrick houses with flat roofs, linen awnings, outdoor ovens, a reed-fenced field
of emmer wheat, a shaduf well, a pottery stall, palms. Gold-yellow banner on a pole at the centre.
Board size: 2x2 squares.
```
**egyptians/town.jpg**
```
A prosperous Egyptian town: 12 to 14 mudbrick and limewashed houses of two storeys, a small columned
shrine with a gateway pylon, a round granary, a market awning, a date-palm grove, irrigation channels.
Gold-yellow banners. Board size: 2x2 squares.
```

## Romans (red tile, white plaster, stone; crimson accents)

Growth look: timber-and-plaster farmstead → villa village with tiled roofs → a small walled town with a forum.

**romans/hamlet.jpg**
```
A tiny Roman roadside hamlet: 4 to 6 small plastered cottages with terracotta tile roofs, a stone well,
a wooden cart, a few amphorae, a milestone on a paved path. One small crimson banner.
Board size: 2x2 squares.
```
**romans/village.jpg**
```
A Roman vicus: 8 to 10 tile-roofed houses of plaster and timber, a paved crossing with a fountain, a
bakery with a domed oven, an olive tree, a vineyard strip, a shrine with two columns. Crimson banners.
Board size: 2x2 squares.
```
**romans/town.jpg**
```
A small Roman town: 12 to 14 houses with red tile roofs, some two storeys, a little forum with a colonnade,
a stone bath house with a chimney, a short aqueduct arch at the edge, cypress trees. Crimson banners.
Board size: 2x2 squares.
```

## Vikings (dark timber, turf roofs, carved prows; blue accents)

Growth look: a longhouse and sheds → a farm-steading village with boats → a trading settlement with a hall.

**vikings/hamlet.jpg**
```
A tiny Norse hamlet: one longhouse with a turf roof, two small sheds, a drying rack of fish, a wooden
fence, an upturned boat, a pig pen. Blue pennant on a carved pole. Board size: 2x2 squares.
```
**vikings/village.jpg**
```
A Norse village: 6 to 8 turf-roofed longhouses and sheds, a smithy with smoke, hanging fish racks, a small
jetty with a clinker-built longship, a rune stone, hay stacks. Blue banners with carved dragon-head poles.
Board size: 2x2 squares.
```
**vikings/town.jpg**
```
A Norse trading settlement: 10 to 12 timber buildings including a large central hall with crossed roof
gables, a palisade fence on one side, a long jetty with two longships, stacked barrels, a market stall.
Blue banners. Board size: 2x2 squares.
```

## British (timber frame, thatch, whitewash; green accents)

Growth look: cottages around a green → village with a church → market town with a hall and mill.

**british/hamlet.jpg**
```
A tiny British hamlet: 4 to 6 thatched timber-frame cottages around a small green, a well, a haystack,
a duck pond, a wicker fence. One small green pennant. Board size: 2x2 squares.
```
**british/village.jpg**
```
A British village: 8 to 10 thatched and timber-framed houses around a green with a maypole-like standing
pole, a small stone chapel with a square tower, a pond, a cart, a field of barley, hedgerows.
Green banners. Board size: 2x2 squares.
```
**british/town.jpg**
```
A British market town: 12 to 14 timber-framed houses with thatched and slate roofs, a stone church, a
timber market hall on stilts, a watermill by a stream, a bridge, orchards. Green banners.
Board size: 2x2 squares.
```

## Mongols (felt gers, wood carts, banners; purple accents)

Growth look: a few gers → a ring of gers with herds → a trading camp with a great ger and a shrine.

**mongols/hamlet.jpg**
```
A tiny Mongol camp: 3 to 4 round white felt gers with wooden doors, a couple of horses on a tether line,
a cart, a cooking fire with smoke. One small purple pennant. Board size: 2x2 squares.
```
**mongols/village.jpg**
```
A Mongol village camp: 7 to 9 felt gers in a loose ring, a corral with sheep and horses, two ox carts,
a horse-hair standard on a pole, drying racks of meat, a small sacred cairn (ovoo). Purple banners.
Board size: 2x2 squares.
```
**mongols/town.jpg**
```
A large Mongol settlement: 12 to 14 felt gers around a central great ger with a gold-trimmed roof, wagon
lines, a horse market, a cairn shrine with blue prayer flags, a wooden palisade corner. Purple banners.
Board size: 2x2 squares.
```

## Scottish (grey stone, heather thatch, slate; blue saltire accents)

Growth look: blackhouses → a clachan with a kirk → a burgh with a tower house.

**scottish/hamlet.jpg**
```
A tiny Highland hamlet: 3 to 5 low drystone blackhouses with heather-thatch roofs, a peat stack, a dry-stone
dyke, a few Highland cattle, a stone well. One small blue pennant with a white saltire.
Board size: 2x2 squares.
```
**scottish/village.jpg**
```
A Highland clachan: 7 to 9 stone and heather-thatch houses, a small stone kirk with a bellcote, cultivated
rigs of oats, a peat-smoke haze, a standing stone, a burn with a footbridge. Blue banners with white
saltire. Board size: 2x2 squares.
```
**scottish/town.jpg**
```
A Scottish burgh: 11 to 13 grey stone houses with slate and thatch roofs, a tall tower house with a
crow-stepped gable, a market cross, a kirk, a stone bridge over a burn, walled gardens. Blue banners with
white saltire. Board size: 2x2 squares.
```

---

## The village site (all peoples share it)

**site.jpg**
```
A village building site: a cleared patch of ground marked by wooden stakes and rope, a stack of timber
and thatch bundles, a handcart, a small canvas tent, a firepit, a half-built timber frame of one house.
No banner. Board size: 2x2 squares.
```

## Optional: the 1x1 set
Re-run the six "village" prompts above with the 1x1 suffix instead of 2x2, and name them
`villages/peoples1/<people>.jpg`. Tell me and I will wire them into the 1x1 test mode (V key).

## Checks before you send the zip
- Flat magenta only; nothing magenta in the subject.
- Same camera angle and light direction across all 19.
- The three stages of one people read as the *same* settlement growing.
- Roof colour and banner colour follow the people's accent.
- No text, no signatures, no UI frames.

## Still missing from earlier rounds
- **Vikings buildings**: the 18-building kit (hall, keep, cottage, farm, mill, warehouse, market, forge, foundry, workshop, tavern, academy, temple, barracks, archery, stable, tower, mine) as single magenta-background JPGs, same format as the other five peoples.
