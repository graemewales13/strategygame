# Characters: assessment, comparison and what was built

Written 2026-10-08 on the `grok` branch.

## 1. Where character attributes stood

Every person on the board already had a name drawn from their people (`names.js`), and fighters had a **rank** (Rookie to Champion, +12% damage and +10% health per rank). Tavern hires had one of five **traits** (Green, Brawny, Keen, Fleet, Veteran). Each house has a **king** with a temper, an aura and an heir.

Gaps found:

| Gap | Effect |
|---|---|
| Traits only on tavern hires, and only stat bumps | Most soldiers were interchangeable once trained |
| No memory of what a soldier had done | A Champion with 40 kills looked like any other Champion |
| The panel showed base speed and base damage | Fleet traits, the forge, arms levels, the king's aura and an empty treasury were all invisible, so the numbers on screen were wrong |
| Only the king led | Nothing like Seven Kingdoms' generals; a big army far from the king had no leadership at all |
| Taverns offered only local folk with generic names | No sense of a wider world |

## 2. Views: what a click should show

| Click on | Before | Now |
|---|---|---|
| One of your soldiers | Name, trait, health, base damage/speed, rank, task | Plus the true damage and speed, far-land gift, captaincy, deeds, kills, buildings razed, time served, where they were raised |
| Several units | Counts by type; first names if 8 or fewer | Counts by type, plus a chip for each person (up to 16): name, rank chevrons, captain flag, far-land mark, red edge when badly hurt; click one to select them |
| Your barracks / archery range / stable / keep / tavern / academy / market | Training queue and garrison | Plus a **muster roll**: everyone raised there who still lives, best first, clickable, and a **Select roll** button for those in the field |
| Your village | Loyalty, people, influence | Plus the garrison by name |
| A rival unit | Their stats only; command card said nothing | Their house, where you stand (peace/trade/war), how they think of you, their ruler and temper; a **Council** button |
| A rival building | Health; Attack button | Plus house, standing, opinion, ruler and temper; the garrison size when your scouts can see it (hidden under fog); a **Council** button |
| A market (yours or theirs) | Shelf, prices, camels, trade board | Unchanged: it already showed what matters there |

Seeing every soldier individually belongs on the barracks (the muster roll) and in group selections, not as a permanent list. A 60-man army as a list is noise; a roll you can open from where they were raised, sorted best first, is useful.

## 3. New characters from far lands

These are peoples with no house in the valley. Now and then (30% a slot, never two at once) one sits in a tavern. They cost more than local wanderers, start Trained, and keep their gift when drilled into a soldier.

| Who | From | Gift |
|---|---|---|
| Norse sea-wolf | the Northern Fjords | **Berserker**: up to +60% damage as they near death |
| Parthian rider | Parthia, beyond the salt deserts | **Outrider**: +1.1 speed, +50% sight |
| Greek physician | the Isles of the Middle Sea | **Physician**: heals friends within 4 tiles, even on the march |
| Han drillmaster | the Middle Kingdom | **Drillmaster**: soldiers within 6 tiles learn 50% faster |
| Rus bear-hunter | the river forests of the Rus | **Horse-breaker**: +75% damage against knights, kings and rams |
| Moorish caravaneer | the Maghreb | **Caravaneer**: your camels within 8 tiles walk 25% faster |
| Aksumite envoy | Aksum, across the Red Sea | **Envoy**: sways villages within 10 tiles, like a lesser king |
| Wandering swordsman | the Eastern Isles | **Duellist**: +40% damage against rated foes |

Each people has its own name pool (`FAR_NAMES` in `names.js`). Rival AIs hire them too.

## 4. Compared with similar games

| Game | They have, we did not | We have, they do not |
|---|---|---|
| **Seven Kingdoms** (closest relative) | Generals with leadership that trains the troops under them; mercenaries of every nationality at inns; per-unit loyalty, bribery and defection | Rival leaders who write letters with reasons; an AI that learns from your play; camel trade routes with scarcity pricing; districts that reward compact towns |
| **Age of Empires II** | Unique units per civilisation; stances (aggressive, defensive, stand ground); formations; monks who convert | Named individuals with careers; villages won by influence and spies as well as by force |
| **Stronghold** | A visible lord character; popularity driven by food, tax and religion | Several rival houses with diplomacy; village loyalty per village rather than one global number |
| **Total War / Crusader Kings** | Characters gain traits from events; generals with retinues; assassination and agents | Real-time battles that feed those characters directly |
| **Warcraft III / Age of Mythology** | Heroes with active abilities and items | Every soldier can become someone; no single hero carries the army |
| **Mount & Blade / Battle Brothers** | Companions from distant lands with backstories; injuries and permanent scars | A whole economy and diplomacy layer around the soldiers |

### What was built from that comparison

- **Captains** (Seven Kingdoms' generals): an Elite or better footman, bowman or knight can be commissioned for 60 coin, at most 3 per house. Soldiers within 6 tiles get +6% damage and +25% experience, and a captain on guard counts half again for village influence. The AI appoints captains too.
- **Far-land mercenaries at the inn** (Seven Kingdoms, Mount & Blade companions): section 3.
- **Deeds** (traits earned in play, as in Total War, Crusader Kings and Battle Brothers):

| Deed | Earned by | Effect |
|---|---|---|
| Blooded | first kill | none |
| the Slayer | 10 kills | +8% damage |
| Kingslayer | killing a ruler | +10% damage |
| Giant-killer | killing a foe two ranks above them | +10% health |
| Death-cheater | living through a blow that left them under 10% health | +10% health |
| Wall-breaker | razing 3 buildings | +25% damage against buildings |

- **A service record** for every fighter: kills, buildings razed, time served, where they were raised.

### Worth doing next (not built)

1. **Unit loyalty and bribery** (Seven Kingdoms): soldiers of a far people, or long unpaid, may be bought by a rival's spy. This is the deepest missing system and it fits the spy and loyalty rules already in place.
2. **Stances** (AoE II): hold ground, defend, or pursue, per unit or group. The "no running from a fight" and sally rules already cover part of this.
3. **Injuries** (Battle Brothers): a fighter who nearly dies may come back with a lasting wound, a counterweight to Death-cheater.
4. **Unique unit per people** (AoE II): for example a Mongol horse archer or a Roman legionary, trained only by that house.
5. **Rival character intel through spies**: a spy inside a rival town reveals their captains and best soldiers by name.
