// Auld World - balance, stats and constants. No DOM access: this file is shared by the host sim and the client.

export const TILE = 32;
// The board is 320 x 320, about 8x the area of the old 112 x 112 valley. Headless tests set AULD_MAP=112 to run the old small board quickly.
const ENV_MAP = typeof process !== 'undefined' && process.env && +process.env.AULD_MAP;
export const MAP_SIZES = { small: 160, standard: 320, huge: 400 };
// In the browser the chosen size is remembered between visits (Options > Board size) and read here at load, so the whole game runs at one size.
let SAVED_SIZE = 0; try { if (typeof localStorage !== 'undefined') SAVED_SIZE = MAP_SIZES[localStorage.getItem('auld-world.mapsize')] || 0; } catch (e) { /* storage blocked */ }
export const MAP_W = ENV_MAP || SAVED_SIZE || 320;
export const MAP_H = MAP_W;
export const AREA_MUL = (MAP_W * MAP_H) / (112 * 112);   // the board is this many times the old 112x112 valley (about 8x)
export const VISION_MUL = Math.sqrt(8);               // sight radii grow by this, so the ground revealed as you travel is 8x larger
export const PLAYER = 0;
export const MIN_HOUSES = 3;
export const MAX_HOUSES = 8;
export const DEFAULT_HOUSES = 4;

// Eight peoples. Each kit is the building art in assets/factions/<id>/buildings and the soldiers in .../units.
// kit: false means the people has no painted kit yet: it uses the shared buildings and soldiers, and the game does not ask for its files.
export const FACTIONS = {
  egyptians: { label: 'Egyptians', blurb: 'Mudbrick halls, dromedary caravans.' },
  romans:    { label: 'Romans',    blurb: 'Colonnades, tile roofs, donkey trains.' },
  british:   { label: 'British',   blurb: 'Timber frames and thatch.' },
  mongols:   { label: 'Mongols',   blurb: 'Gers, banners, Bactrian camels.' },
  scottish:  { label: 'Scottish',  blurb: 'Grey stone, heather thatch, tower houses.' },
  vikings:   { label: 'Vikings',   blurb: 'Longhouses, carved prows, shield walls.' },
  byzantines: { label: 'Byzantines', blurb: 'Golden domes, mosaics, cataphracts.' },
  persians:  { label: 'Persians',  blurb: 'Iwan halls, glazed tile, horse archers.' },
};
export const FACTION_BUILDINGS = ['mine', 'keep', 'cottage', 'farm', 'mill', 'warehouse', 'market', 'forge', 'foundry', 'workshop', 'tavern', 'academy', 'temple', 'barracks', 'archery', 'stable', 'tower', 'armoury'];
// The peoples. Each keeps its colour, sprite hue and crest device wherever it is seated (the Scots are always blue). `hue` is the
// target hue for tinting cloth in the art (see tinted() in art.js); `device` picks the crest drawn by drawCrest() in render.js.
const PEOPLE = [
  { faction: 'egyptians', name: 'House Khemet', short: 'Khemet', color: 'yellow', primary: '#c9a42e', accent: '#f4dc7a', dark: '#5c4510', hue: 46, device: 'sun', motto: 'The Black Land endures' },
  { faction: 'romans', name: 'House Aurelius', short: 'Aurelius', color: 'red', primary: '#a83a3a', accent: '#ff9078', dark: '#4b1b1b', hue: 2, device: 'sword', motto: 'Strength through order' },
  { faction: 'scottish', name: 'Clan MacAlpin', short: 'MacAlpin', color: 'blue', primary: '#3a6ea8', accent: '#92c6ff', dark: '#1c334d', hue: 214, device: 'waves', motto: 'Stand fast' },
  { faction: 'british', name: 'House Wessex', short: 'Wessex', color: 'green', primary: '#37753f', accent: '#97d17c', dark: '#173a1c', hue: 124, device: 'tree', motto: 'Hearth and crown' },
  { faction: 'mongols', name: 'Khanate Borjigin', short: 'Borjigin', color: 'violet', primary: '#7a4a98', accent: '#cb9ce0', dark: '#30203f', hue: 284, device: 'flame', motto: 'Under the eternal sky' },
  { faction: 'vikings', name: 'House Ynglings', short: 'Ynglings', color: 'orange', primary: '#c0662a', accent: '#ffb070', dark: '#55290c', hue: 24, device: 'ship', motto: 'The sea remembers' },
  { faction: 'byzantines', name: 'House Komnenos', short: 'Komnenos', color: 'rose', primary: '#a8366e', accent: '#f08cc0', dark: '#4a142e', hue: 330, device: 'crown', motto: 'By this sign, conquer' },
  { faction: 'persians', name: 'House Sassan', short: 'Sassan', color: 'teal', primary: '#24857e', accent: '#86e0d4', dark: '#0e3834', hue: 174, device: 'wings', motto: 'Good thoughts, good words, good deeds' },
];
// HOUSES[seat]: the people sitting in each seat this game (set by setPeoples). Seat 0 is the player's.
export const HOUSES = PEOPLE.map((p) => ({ ...p }));
export const PEOPLE_KEYS = PEOPLE.map((p) => p.faction);
// Each people's pack animal (the `camel` unit): what it is called and which picture it wears (owner, 2026-10-16: donkeys were being
// raised from a 'Raise camel' button; the British and Scots had dromedaries).
export const PACK = {
  donkey: { one: 'donkey', many: 'donkeys', sprite: 'donkey' },
  bactrian: { one: 'Bactrian camel', many: 'Bactrian camels', sprite: 'bactrian' },
  dromedary: { one: 'camel', many: 'camels', sprite: 'dromedary' },
};
export const PACK_OF = { romans: 'donkey', vikings: 'donkey', byzantines: 'donkey', british: 'donkey', scottish: 'donkey', mongols: 'bactrian', egyptians: 'dromedary', persians: 'dromedary' };
export const packOf = (team) => PACK[PACK_OF[HOUSES[team]?.faction] || 'dromedary'];
// say 'camel' the way this house's people would: every word camel/camels/Camel in a line shown to it becomes its own animal
export function packWords(text, team) {
  const p = packOf(team); if (p === PACK.dromedary || typeof text !== 'string') return text;
  const say = (t) => t.replace(/\b([Cc])amel(s?)\b/g, (m, c, s) => { const w = s ? p.many : p.one; return c === 'C' ? w[0].toUpperCase() + w.slice(1) : w; });
  // only the words a player reads: never inside a tag, where data-kind="camel" names the unit a button trains (owner, 2026-10-20: the
  // donkey button sent 'donkey', which is no unit, so it did nothing)
  return text.replace(/(<[^>]*>)|([^<]+)/g, (m, tag, words) => tag || say(words));
}
// Seat the peoples: order[seat] = index into PEOPLE. Everything moves with the people: nation, name, motto, colour and crest.
// An order from an older save (five peoples) is kept and the newer peoples fill the seats after it.
export function setPeoples(order) {
  const ok = Array.isArray(order) && order.length <= PEOPLE.length && new Set(order).size === order.length && order.every((k) => Number.isInteger(k) && k >= 0 && k < PEOPLE.length);
  const o = ok ? [...order, ...PEOPLE.map((_, i) => i).filter((i) => !order.includes(i))] : PEOPLE.map((_, i) => i);
  HOUSES.forEach((h, i) => Object.assign(h, PEOPLE[o[i]]));
  return o;
}
// A seating for a game: 'classic' keeps the old order; a faction key seats that people as the player; anything else is a random seating from the seed.
export function seatPeoples(choice, seed) {
  if (choice === undefined || choice === 'classic') return PEOPLE.map((_, i) => i);
  let a = ((seed >>> 0) ^ 0x5bd1e995) >>> 0; const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const idx = PEOPLE.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const want = PEOPLE_KEYS.indexOf(choice);
  if (want >= 0) { const at = idx.indexOf(want); [idx[0], idx[at]] = [idx[at], idx[0]]; }
  return idx;
}


// Terrain ids
export const T_GRASS = 0;
export const T_DIRT = 1;
export const T_WATER = 2;
export const T_FORD = 3; // wooden ford / bridge across the river: walkable
export const T_DRY = 4;  // steppe grass
export const T_SAND = 5; // dunes and gravel flats
export const T_ROCK = 6; // rocky ridges: impassable, nothing can be built
export const T_SNOW = 7; // snow field: slow going, thin harvests
// ground types you may build on, walking cost multiplier, and farm yield (0 = no farming)
export const LAND = [1, 1, 0, 0, 1, 1, 0, 1];
export const GROUND_COST = [1, 0.85, 1, 1, 1, 1.12, 1, 1.25];
export const FARM_SOIL = [1, 0.9, 0, 0.9, 0.8, 0.45, 0, 0.4];
// a seed picks one of these climates; noise then mixes the ground types inside it
export const BIOMES = {
  temperate: { label: 'Green valley', weight: 30, moist: 0, cold: -0.25, rocky: 0, trees: 1, lakes: 1, rivers: [0.15, 0.6, 0.25] },
  steppe: { label: 'Dry steppe', weight: 20, moist: -0.12, cold: -0.25, rocky: -0.006, trees: 0.55, lakes: 0.6, rivers: [0.2, 0.7, 0.1] },
  desert: { label: 'Desert flats', weight: 16, moist: -0.3, cold: -0.3, rocky: 0.003, trees: 0.35, lakes: 0.35, rivers: [0.3, 0.7, 0] },
  highland: { label: 'Rocky highland', weight: 16, moist: 0, cold: 0.04, rocky: 0.02, trees: 0.8, lakes: 0.8, rivers: [0.3, 0.55, 0.15] },
  winter: { label: 'Winter lands', weight: 18, moist: 0.05, cold: 0.3, rocky: 0.004, trees: 0.8, lakes: 0.8, rivers: [0.25, 0.6, 0.15] },
};

// Resources. value is used by markets (coin is worth more than grain or timber).
export const RES = ['food', 'wood', 'gold'];
export const RES_LABEL = { food: 'Grain', wood: 'Timber', gold: 'Coin' };
export const RES_VALUE = { food: 1, wood: 1, gold: 2, stone: 1.5, copper: 2.2, iron: 3, coal: 2, silver: 5, steel: 8, ware: 7 };
// Minerals: mined from deposits by serfs assigned to a Mine, kept in the house stockpile, tradeable between Trading Tents.
export const MATS = ['stone', 'copper', 'iron', 'coal', 'silver'];
export const PROCESSED = ['steel', 'ware']; // made by a Foundry from raw minerals
export const ALL_GOODS = [...RES, ...MATS, ...PROCESSED];
export const GOOD_LABEL = { food: 'Grain', wood: 'Timber', gold: 'Coin', stone: 'Stone', copper: 'Copper', iron: 'Iron', coal: 'Coal', silver: 'Silver', steel: 'Steel', ware: 'Fine ware' };
export const GOOD_COLOR = { food: '#c23a56', wood: '#8a5a2a', gold: '#e0b83a', stone: '#9a9a90', copper: '#c8743a', iron: '#9a4e32',   /* rust: iron ore is red-brown (owner, 2026-10-16: grey iron and grey stone were hard to tell apart) */ coal: '#35353a', silver: '#d8e0ea', steel: '#9fb4c8', ware: '#c9a0e0' };
export const GOOD_INFO = {
  gold: 'Coin: pays for troops and trade; a mine digs it from a seam.',
  stone: 'Raises keeps, towers and foundries.',
  copper: 'Smelted with coal into fine ware.',
  iron: 'Smelted with coal into steel.',
  coal: 'Fuel for the foundry.',
  silver: 'Pays for the deeper research at an Academy.',
  steel: 'Forges turn it into better arms.',
  ware: 'Taverns, markets and temples use it to make villagers content.',
};
export const MINEABLE = ['gold', ...MATS]; // every ore, coin included, can be dug from a deposit with a Mine
export const MINE_RATE = { gold: 0.6, stone: 0.6, copper: 0.5, iron: 0.45, coal: 0.5, silver: 0.3 }; // per worker per second
export const MINE_MAX_WORKERS = 4;
// Mines are worked by the folk of villages nearby, not by serfs you send. A village within `r` tiles that is yours or still independent
// lends up to `share` of the people above `keep` (mining camps lend more); with no village in range a mine has no workers at all.
// The mine's lord gains `pull` of influence over the village per worker employed, and a village of your own digs `ownBonus` times as fast.
export const MINE_JOBS = { r: 16, share: 0.3, campShare: 0.6, keep: 6, campKeep: 4, pull: 0.12, ownBonus: 1.5, freeBonus: 1.0, refresh: 2 };
export const SMELT = { steel: { in: { iron: 2, coal: 1 }, time: 7 }, ware: { in: { copper: 2, coal: 1 }, time: 8 } };
export const ARMS_STEEL = 6;   // steel per forge arms level (max 3)
export const FORGE_RESERVE = 8;   // with an armoury standing, the forge leaves this much steel for swords, lances, crossbows and plate
export const SCI_SILVER = 6;   // silver per science level (max 3)
export const SCIENCE = ['Husbandry', 'Masonry', 'Drill']; // (legacy names of the first three techs; see TECH)
// ---- science. The Academy is the house's science division: every academy makes LEARNING (a little on its own, more with scholars beside it,
// and each abbey you hold adds some). Learning, and silver for the deeper arts, pays for one research at a time from the tree below; a
// tech's `needs` must be known first. The Armoury and each weapon it makes are unlocked by research.
export const LEARNING = { academy: 0.3, scholar: 0.15, abbey: 0.05, cap: 600 };   // (the bank must hold a tier-3 research's 400)   // learning a second; the pool holds at most `cap`
// Research costs were raised threefold on 2026-10-19 (owner: every house mastered the whole academy in a quarter of an hour, which made
// it pointless). One academy with two scholars now takes about an hour for the lot, so choices matter and a second academy pays.
// The siege line (owner, same day): each engine needs its research, and each is stronger than the last against walls.
export const TECH = {
  husbandry:   { label: 'Husbandry',   tier: 1, cost: { learning: 90 },              needs: [],                          info: '+15% grain from farms, +10% gathering and digging.' },
  masonry:     { label: 'Masonry',     tier: 1, cost: { learning: 90 },              needs: [],                          info: 'New buildings +15% health.' },
  drill:       { label: 'Drill',       tier: 1, cost: { learning: 90 },              needs: [],                          info: 'New soldiers +15% health.' },
  siegecraft:  { label: 'Siegecraft',  tier: 1, cost: { learning: 90 },              needs: [],                          info: 'Unlocks the Ram at the Workshop: a roofed log that batters walls and gates up close.' },
  metallurgy:  { label: 'Metallurgy',  tier: 2, cost: { learning: 200, silver: 6 },  needs: ['masonry'],                 info: 'Unlocks the Armoury, which makes spears and mail.' },
  fletching:   { label: 'Fletching',   tier: 2, cost: { learning: 200, silver: 6 },  needs: ['drill'],                   info: 'The Armoury makes longbows.' },
  medicine:    { label: 'Medicine',    tier: 2, cost: { learning: 200, silver: 6 },  needs: ['husbandry'],               info: 'Idle soldiers mend their wounds; scholars heal twice as fast.' },
  torsion:     { label: 'Torsion engines', tier: 2, cost: { learning: 200, silver: 6 }, needs: ['siegecraft'],          info: 'Unlocks the Onager at the Workshop: a sling-armed engine that flings stones 7 tiles, harder on walls than a ram and deadly to men caught beneath.' },
  steelcraft:  { label: 'Steelcraft',  tier: 3, cost: { learning: 400, silver: 12 }, needs: ['metallurgy'],              info: 'The Armoury makes swords, lances and plate.' },
  mechanics:   { label: 'Mechanics',   tier: 3, cost: { learning: 400, silver: 12 }, needs: ['metallurgy', 'fletching'], info: 'The Armoury makes crossbows; new siege engines +30% health.' },
  engineering: { label: 'Engineering', tier: 3, cost: { learning: 400, silver: 12 }, needs: ['masonry', 'medicine'],     info: 'Towers shoot 2 tiles further; new keeps and towers +25% health.' },
  counterweight: { label: 'Counterweight engines', tier: 3, cost: { learning: 400, silver: 12 }, needs: ['torsion', 'masonry'], info: 'Unlocks the Trebuchet at the Workshop: a great counterweight engine that hurls boulders 11 tiles. The worst a wall can meet; slow, and poor against men.' },
};
export const SIEGE = new Set(['ram', 'onager', 'trebuchet']);
// a keep has a yard and sheds for this many siege engines, apart from its garrison: stored out of harm's way and kept in repair (owner, 2026-10-19)
export const SIEGE_STORE = 3;
// an unfinished building is scaffolding and loose stone: blows land this many times harder on it than on finished walls (owner, 2026-10-20)
export const SITE_FRAGILE = 2.5;
// peace bought with coin (owner, 2026-10-20): the shares of the treasury the player may offer with peace, and what a losing rival offers when it sues
export const PEACE_COIN = { shares: [0.1, 0.2, 0.35], sue: { min: 0.1, max: 0.35 } };   // the siege engines (built at the Workshop, each behind its research)
export const TECH_KEYS = Object.keys(TECH);
export const MEDICINE = { heal: 0.6, quiet: 6 };   // hp a second an idle soldier mends, once `quiet` seconds clear of a fight
// ---- weapons and armour, made at the Armoury and kept in the stockpile. A soldier takes up the best kit for his kind when he is trained or
// drilled, and swaps up (handing the old kit back) when he stands idle within REFIT.r tiles of an Armoury.
export const GEAR = {
  spear:    { label: 'Spears',    slot: 'weapon', for: ['footman'],                     tech: 'metallurgy', cost: { wood: 6, iron: 2 },  time: 8,  tier: 1, dmg: 2, vsHorse: 0.6, info: '+2 damage; +60% against knights, kings and siege engines.' },
  sword:    { label: 'Swords',    slot: 'weapon', for: ['footman'],                     tech: 'steelcraft', cost: { steel: 2 },          time: 10, tier: 2, dmg: 5, info: '+5 damage.' },
  longbow:  { label: 'Longbows',  slot: 'weapon', for: ['bowman'],                      tech: 'fletching',  cost: { wood: 10 },          time: 8,  tier: 1, dmg: 1, range: 1.5, info: '+1 damage, +1.5 range.' },
  crossbow: { label: 'Crossbows', slot: 'weapon', for: ['bowman'],                      tech: 'mechanics',  cost: { wood: 6, steel: 2 }, time: 12, tier: 2, dmg: 6, cd: 0.4, info: '+6 damage, a little slower to load.' },
  lance:    { label: 'Lances',    slot: 'weapon', for: ['knight'],                      tech: 'steelcraft', cost: { wood: 8, steel: 2 }, time: 12, tier: 2, dmg: 6, info: '+6 damage.' },
  mail:     { label: 'Mail',      slot: 'armour', for: ['footman', 'bowman', 'knight'], tech: 'metallurgy', cost: { iron: 4 },           time: 10, tier: 1, hp: 0.25, info: '+25% health.' },
  plate:    { label: 'Plate',     slot: 'armour', for: ['footman', 'knight'],           tech: 'steelcraft', cost: { steel: 4 },          time: 14, tier: 2, hp: 0.5, spd: -0.25, info: '+50% health, a little slower.' },
};
export const GEAR_KEYS = Object.keys(GEAR);
export const REFIT = { r: 7, every: 2 };
export const CRAFT_QUEUE = 5;
export const WARE_JOY = { every: 25, secs: 70 }; // one ware lifts a village for 70s; a village consumes at most one per 25s
export const NODE_RES = { tree: 'wood', berry: 'food', gold: 'gold' };
export const GATHER_RATE = { wood: 0.95, food: 1.1, gold: 0.7 }; // per second while working
export const CARRY_CAP = 10;

export const START_RES = { food: 300, wood: 480, gold: 320, stone: 60, copper: 0, iron: 0, coal: 0, silver: 0, steel: 0, ware: 0 };

// ---- Units -------------------------------------------------------------------------------
// speed in tiles/sec, range in tiles, cooldown in seconds, bld = damage multiplier vs buildings, vil = vs villages
export const UNITS = {
  serf:    { label: 'Serf',    hp: 40,  speed: 2.4, dmg: 3,  range: 1,   cd: 1.2,  sight: 6,  cost: { food: 50, wood: 0, gold: 0 },   time: 8,  from: ['keep'], bld: 0.3, vil: 0.3, info: 'Gathers, builds, drops off. Weak in a fight.' },
  scout:   { label: 'Scout',   hp: 55,  speed: 4.4, dmg: 5,  range: 1,   cd: 1.0,  sight: 10, cost: { food: 40, wood: 20, gold: 0 },  time: 10, from: ['keep'],         bld: 0.2, vil: 0.4, info: 'Fast and far-sighted. Maps the valley.' },
  footman: { label: 'Footman', hp: 90,  speed: 2.7, dmg: 10, range: 1,   cd: 1.1,  sight: 7,  cost: { food: 60, wood: 20, gold: 15 },  time: 14, from: ['barracks'],     bld: 0.5, vil: 1.0, info: 'Melee line infantry. Forge adds +3 damage.' },
  bowman:  { label: 'Bowman',  hp: 50,  speed: 2.8, dmg: 7,  range: 5.5, cd: 1.3,  sight: 8,  cost: { food: 40, wood: 30, gold: 30 }, time: 16, from: ['archery'],      bld: 0.35, vil: 0.8, info: 'Ranged. Forge adds +2 damage.' },
  knight:  { label: 'Knight',  hp: 150, speed: 3.9, dmg: 16, range: 1,   cd: 1.2,  sight: 7,  cost: { food: 80, wood: 0, gold: 80 },  time: 22, from: ['stable'],       bld: 0.5, vil: 1.0, info: 'Heavy cavalry. Forge adds +3 damage.' },
  spy:     { label: 'Spy',     hp: 35,  speed: 3.4, dmg: 3,  range: 1,   cd: 1.0,  sight: 11, cost: { food: 30, wood: 20, gold: 40 }, time: 16, from: ['tavern', 'academy'], bld: 0.1, vil: 0, info: 'Infiltrates villages to turn their loyalty, or watches one of yours to catch rival spies. Can be caught.' },
  scholar: { label: 'Scholar', hp: 30,  speed: 2.0, dmg: 1,  range: 1,   cd: 1.5,  sight: 9,  cost: { food: 40, wood: 20, gold: 50 }, time: 18, from: ['academy'],      bld: 0.1, vil: 0, info: 'Near an academy: +influence and heals friends nearby.' },
  recruit: { label: 'Recruit', hp: 55,  speed: 2.6, dmg: 5,  range: 1,   cd: 1.2,  sight: 6,  cost: { food: 0, wood: 0, gold: 0 },    time: 0,  from: [],              bld: 0.3, vil: 0.6, art: 'scout', info: 'A hired wanderer or levied villager. Fights poorly until drilled into a soldier inside a keep.' },
  camel:   { label: 'Camel',   hp: 90,  speed: 3.0, dmg: 0,  range: 1,   cd: 2.0,  sight: 7,  cost: { food: 40, wood: 20, gold: 30 },  time: 12, from: ['market'],       bld: 0, vil: 0, nopop: true, info: 'Pack animal. Select it, then click markets (yours or a treaty partner\'s) and it loops between them for ever, hauling goods both ways.' },
  king:    { label: 'King',    hp: 240, speed: 3.0, dmg: 14, range: 1,   cd: 1.0,  sight: 9,  cost: { food: 0, wood: 0, gold: 0 },    time: 0,  from: [],              bld: 0.5, vil: 1.2, art: 'knight', info: 'The ruler of a house. Rallies soldiers, sways villages by his presence, and must not fall.' },
  ram:     { label: 'Ram',     hp: 240, speed: 1.4, dmg: 30, range: 1.1, cd: 2.2,  sight: 5,  cost: { food: 0, wood: 180, gold: 40 }, time: 28, from: ['workshop'],     bld: 2.6, vil: 3.0, tech: 'siegecraft', info: 'Siege. Batters walls and gates up close. Needs Siegecraft.' },
  // ranged siege: `unit` scales what a shot does to men (a trebuchet's boulder rarely finds one)
  onager:  { label: 'Onager',  hp: 170, speed: 1.1, dmg: 52, range: 7,   cd: 4.0,  sight: 8,  cost: { food: 0, wood: 240, gold: 120, stone: 40 }, time: 34, from: ['workshop'], bld: 3.2, vil: 3.2, unit: 1, tech: 'torsion', info: 'Siege. Flings stones 7 tiles: harder on walls than a ram, and hurts men too. Needs Torsion engines.' },
  trebuchet: { label: 'Trebuchet', hp: 230, speed: 0.85, dmg: 110, range: 11, cd: 6.0, sight: 9, cost: { food: 0, wood: 360, gold: 200, stone: 80 }, time: 46, from: ['workshop'], bld: 3.6, vil: 3.6, unit: 0.3, tech: 'counterweight', info: 'Siege. Hurls boulders 11 tiles: the worst a wall can meet. Slow, and poor against men. Needs Counterweight engines.' },
};

// ---- Buildings ---------------------------------------------------------------------------
export const BUILDINGS = {
  keep:      { label: 'Keep',          size: 4, hp: 1900, sight: 12, pop: 8, cost: { food: 0, wood: 280, gold: 150, stone: 40 }, time: 36, requires: [],          info: 'Stone seat. Strong influence over villages while soldiers garrison it; shoots arrows at raiders while folk shelter inside; trains serfs and scouts, more pop.' },
  cottage:   { label: 'Cottage',       size: 2, hp: 380,  sight: 5,  pop: 5, cost: { food: 0, wood: 60, gold: 0 },   time: 12, requires: ['market'],          info: '+5 population.' },
  farm:      { label: 'Farm',          size: 3, hp: 330,  sight: 4,  pop: 0, cost: { food: 0, wood: 70, gold: 0 },   time: 14, requires: [],                   info: 'Steady grain. +25% beside a mill.' },   // (from the start: grain feeds the folk and drafts serfs; owner, 2026-10-20)
  mill:      { label: 'Mill',          size: 2, hp: 480,  sight: 5,  pop: 0, cost: { food: 0, wood: 80, gold: 0 },   time: 16, requires: ['farm'],          info: 'Timber drop-off. Processing: +20% timber delivered.' },
  warehouse: { label: 'Warehouse',     size: 3, hp: 700,  sight: 5,  pop: 0, cost: { food: 0, wood: 100, gold: 20 }, time: 18, requires: ['mine'],          info: 'Drop-off for all goods, +10% delivered.' },
  market:    { label: 'Market',        size: 2, hp: 540,  sight: 6,  pop: 0, cost: { food: 0, wood: 120, gold: 40 }, time: 20, requires: [],          info: 'Trade hub: stocked from nearby mines, foundries, farms, mills and warehouses. Trains camels to trade with other markets (yours or a trade partner\'s). Drop-off. Small coin trickle.' },
  forge:     { label: 'Forge',         size: 2, hp: 740,  sight: 5,  pop: 0, cost: { food: 0, wood: 150, gold: 60 }, time: 24, requires: ['barracks', 'foundry'],      info: 'Arms: footmen/knights +3 dmg, bowmen +2. Feeds on steel: each 6 steel is another arms level (max 3).' },
  workshop:  { label: 'Workshop',      size: 3, hp: 780,  sight: 5,  pop: 0, cost: { food: 0, wood: 160, gold: 70 }, time: 26, requires: ['forge', 'academy'], info: 'Builds siege engines: the Ram, Onager and Trebuchet, each once its research is done at the academy.' },
  tavern:    { label: 'Tavern',        size: 2, hp: 480,  sight: 6,  pop: 0, cost: { food: 40, wood: 100, gold: 40 }, time: 18, requires: [],         info: 'Trains spies. Local loyalty pull. Coin trickle.' },
  academy:   { label: 'Academy',       size: 3, hp: 640,  sight: 9,  pop: 0, cost: { food: 0, wood: 140, gold: 80 }, time: 24, requires: ['keep'],          info: 'The science division: makes learning (more with scholars beside it) and researches technologies, one at a time. Trains scholars. Unlocks the workshop and temple coin.' },
  armoury:   { label: 'Armoury',       size: 2, hp: 760,  sight: 5,  pop: 0, cost: { food: 0, wood: 150, gold: 60, stone: 20 }, time: 24, requires: ['forge'], tech: 'metallurgy', info: 'Makes weapons and armour from the stockpile (each unlocked by research): spears, swords, longbows, crossbows, lances, mail, plate. Soldiers take them up when trained, or when idle nearby.' },
  temple:    { label: 'Temple',        size: 2, hp: 590,  sight: 7,  pop: 0, cost: { food: 0, wood: 130, gold: 50 }, time: 20, requires: ['keep'],          info: 'Strong loyalty aura. Coin trickle with an academy.' },
  barracks:  { label: 'Barracks',      size: 3, hp: 780,  sight: 6,  pop: 0, cost: { food: 0, wood: 140, gold: 40 }, time: 22, requires: [],          info: 'Trains footmen.' },
  archery:   { label: 'Archery Range', size: 3, hp: 700,  sight: 7,  pop: 0, cost: { food: 0, wood: 130, gold: 30 }, time: 20, requires: ['barracks'],      info: 'Trains bowmen.' },
  stable:    { label: 'Stable',        size: 3, hp: 740,  sight: 6,  pop: 0, cost: { food: 0, wood: 160, gold: 50 }, time: 24, requires: ['keep', 'barracks'], info: 'Trains knights.' },
  mine:      { label: 'Mine',          size: 2, hp: 420,  sight: 5,  pop: 0, cost: { food: 0, wood: 80, gold: 10 },  time: 14, requires: [], onDeposit: true, info: 'Raised on a mineral deposit. Villagers from villages within 16 tiles dig for it (no village, no workers); your own villages dig harder and warm to you. Ore flows into your stockpile.' },
  foundry:   { label: 'Foundry',       size: 3, hp: 760,  sight: 5,  pop: 0, cost: { food: 0, wood: 140, gold: 40, stone: 25 }, time: 22, requires: ['mine'], info: 'Smelts iron+coal into steel, copper+coal into fine ware. Needs a mine first.' },
  village:   { label: 'Village',       size: 3, hp: 400,  sight: 7,  pop: 0, cost: { food: 100, wood: 150, gold: 30 }, time: 30, requires: [], requiresAny: ['keep', 'mine'], info: 'Found a village of your own (needs a keep or a mine). Founded within 10 tiles of an ore deposit it becomes a mining camp whose folk work the mines nearby at once. Otherwise: it starts with a few settlers and grows to 50 folk. Its people pay tax, till fields, house your population, and can be drafted as serfs or soldiers.' },
  tower:     { label: 'Watchtower',    size: 2, hp: 640,  sight: 11, pop: 0, cost: { food: 0, wood: 100, gold: 40, stone: 15 }, time: 20, requires: ['barracks'],          info: 'Sight and ranged defence. Small loyalty pull.', range: 7.5, dmg: 9, cd: 1.1 },
};
// basic buildings first; the rest unlock as their requirements are built (market -> cottage -> farm -> mill, mine -> warehouse, barracks -> archery ...)
export const BUILD_ORDER_UI = ['mine', 'farm', 'market', 'keep', 'barracks', 'tavern', 'foundry', 'village', 'cottage', 'mill', 'warehouse', 'archery', 'stable', 'tower', 'forge', 'workshop', 'academy', 'armoury', 'temple'];
// The first six are the game (the farm joined them on 2026-10-20). The rest unlock after them.
export const BASIC_BUILDINGS = ['mine', 'farm', 'market', 'keep', 'barracks', 'tavern'];

// Which buildings accept which goods from serfs
export const DROP_OFF = {
  keep: ['food', 'wood', 'gold'],
  warehouse: ['food', 'wood', 'gold'],
  market: ['food', 'wood', 'gold'],
  mill: ['wood'],
};
export const DROP_BONUS = { mill: { wood: 1.2 }, warehouse: { food: 1.1, wood: 1.1, gold: 1.1 } };

// Expansion has no leash: build anywhere you have scouted. What distance changes is the COMMUNITY around a site:
//  - influence: how strongly a village leans toward you (below), strongest from garrisoned castles, temples, taverns
//  - haul: ore dug far from any of your stores loses much of its yield on the road (a warehouse or market beside a remote mine fixes it)
//  - consumers: a market earns from the cottages and villages around it
export const HAUL = { free: 14, far: 60, min: 0.45 };       // distance to the nearest own store: full yield up to `free`, `min` of it at `far` and beyond
export const STORES = ['keep', 'warehouse', 'market'];   // (a village you hold is a store too)
export const CONSUMERS = { base: 0.15, each: 0.09, max: 10 };   // market coin per second = base + each * (own cottages and villages in reach, up to max)

// Loyalty pull: who is leaning on a village. r = radius in tiles, w = weight at the building (falls off linearly).
// `guard`: the pull scales with the soldiers garrisoned inside or standing watch within 5 tiles (0.35 with none, full at 4).
export const INFLUENCE = {
  keep: { r: 30, w: 1.5, guard: true },
  tower: { r: 8, w: 0.3, guard: true },
  barracks: { r: 12, w: 0.35, guard: true },
  market: { r: 12, w: 0.35 },
  warehouse: { r: 8, w: 0.2 },
  tavern: { r: 11, w: 0.55 },
  temple: { r: 17, w: 1.0 },
  academy: { r: 13, w: 0.4 },
};
// Rule: serfs may gather only on ground you rule: within these radii of one of your finished buildings or of a village you hold.
// (Raising buildings anywhere is how you extend your rule; influence below is how villages come over.)
export const RULE = { keep: 28, village: 20, default: 10 };
export const GUARD = { floor: 0.35, full: 4, watch: 5 };
export const LOYALTY_RATE = 1.6; // loyalty/sec per unit of net pull
export const SUBMIT_LOYALTY = 72;
// Influence over a free village builds slowly: castles, markets, taverns and temples nearby (or a spy inside) lean on it for minutes, not seconds.
export const FREE_RATE = 0.4;     // multiplier on LOYALTY_RATE while the village is still independent
// Buildings within this many tiles of a village's walls are part of the town: they change hands with it.
export const TOWN_RANGE = 4;
export const SPY_RATE = 1.7;     // loyalty/sec while a spy is inside
export const SPY_CATCH = 0.004;  // base catch chance per second, plus protection/16000
// A spy inside a village a rival house holds reports on that house (purse, army, captains, far-landers, plans) for `fresh` seconds after leaving;
// a spy caught in a held village costs you `caught` opinion with its lord.
export const SPY_INTEL = { fresh: 45, caught: -12 };
// counter-espionage: each spy of the village's own lord posted inside it adds `watch` to a rival spy's chance of being caught each second;
// the lord hears that someone is working on a village of theirs at most every `warnEvery` seconds
// Retreat (owner, 2026-10-15): a band may be ordered off the field, even out of a fight, but if at least `min` fighters (or the king) were
// in the fight it is a rout: every village of the house loses `loyalty` (a fifth) of its loyalty, for `shame` seconds loyalty comes back
// at `regain` of its pace, and every other house reads it as weakness (`tempt` toward war, see stance()). A rout counts once per `cool` s.
export const RETREAT = { min: 3, engaged: 6, loyalty: 0.2, shame: 180, regain: 0.35, cool: 60, tempt: 0.35 };
// A spy in a rival's colours (owner, 2026-10-15) can walk into that house's buildings. Inside he sends word home (the Council's spy
// report) and works against them: training there runs at `slow`, a market loses `coin` a second to us, an academy `learning` a second.
// He is caught at `catch` a second, plus SPY_WATCH.watch for each spy of theirs posted inside as a watchman; the owner hears that something
// is wrong there at most every SPY_WATCH.warnEvery seconds. Their soldiers and towers take a spy in their own colours for one of theirs.
export const SPY_COVER = { slow: 0.5, coin: 0.3, learning: 0.12, catch: 0.006, kinds: ['keep', 'barracks', 'archery', 'stable', 'tavern', 'market', 'academy', 'workshop', 'armoury'] };
export const SPY_WATCH = { watch: 0.07, warnEvery: 40, owned: 0.45 };   // owned: how fast a spy wears down a village that has a lord, against a free one
// difficulty tiers. playerMul scales the player's starting purse and stores; aiMul scales every coin an AI house earns;
// armyCap and warAfter govern how big and how soon rival armies come (warAfter x0.6 is the earliest a house starts a war; warBar is how strongly
// its stance must call for war, see stance() in diplomacy.js); think slows or quickens their decisions;
// wealth is the fortune (coin plus goods at market value) that wins the game when held for WEALTH_HOLD seconds.
export const DIFFICULTY = {
  // mass: share of its fighters a house gathers before it marches to war (0 = any seven, as before); regroup: a war band falls back to its
  // seat when the foes around it are this many times stronger (0 = it fights to the last). Owner, 2026-10-15: Mid was too easy, the rivals
  // grew slowly and lost their fights, so Mid and Hard rivals earn more, think faster, keep larger armies, mass them and regroup.
  // reach: how far from its seat a house will go to found a mining camp (metal is regional, so what it lacks lies out in the open ground).
  easy: { label: 'Easy', playerMul: 1.5, aiMul: 0.8,  armyCap: 14, warAfter: 1200, warBar: 0.65, think: 1.5, wealth: 4000, mass: 0, regroup: 0, reach: 80 },
  mid:  { label: 'Mid',  playerMul: 1.0, aiMul: 1.2,  armyCap: 30, warAfter: 720,  warBar: 0.45, think: 0.95, wealth: 6000, mass: 0.65, regroup: 1.6, reach: 130 },
  hard: { label: 'Hard', playerMul: 0.9, aiMul: 1.4,  armyCap: 46, warAfter: 420,  warBar: 0.32, think: 0.75, wealth: 10000, mass: 0.75, regroup: 1.4, reach: 150 },
};
// A house that is not copying the player plays to its people. bias buildings are raised a few slots early.
// armyMul scales the force they will pay. mix is the share of foot, bow and horse they drill toward.
// war is added to the difficulty war bar (positive waits longer). serf is added to the serf target. spies is how many they keep.
export const DOCTRINE = {
  egyptians: { label: 'granary', bias: ['farm', 'temple', 'market'], armyMul: 0.85, mix: { footman: 0.5, bowman: 0.35, knight: 0.15 }, war: 0.08, serf: 2, spies: 1 },
  romans:    { label: 'legion',  bias: ['barracks', 'tower', 'keep'], armyMul: 1.15, mix: { footman: 0.7, bowman: 0.15, knight: 0.15 }, war: 0, serf: 0, spies: 1 },
  scottish:  { label: 'hold',    bias: ['archery', 'tower', 'tavern'], armyMul: 1.0, mix: { footman: 0.3, bowman: 0.55, knight: 0.15 }, war: 0.04, serf: 0, spies: 2 },
  british:   { label: 'hearth',  bias: ['market', 'mill', 'cottage'], armyMul: 0.9, mix: { footman: 0.45, bowman: 0.35, knight: 0.2 }, war: 0.06, serf: 1, spies: 1 },
  mongols:   { label: 'raid',    bias: ['stable', 'archery', 'barracks'], armyMul: 1.25, mix: { footman: 0.2, bowman: 0.4, knight: 0.4 }, war: -0.08, serf: -1, spies: 2 },
  vikings:   { label: 'shield wall', bias: ['barracks', 'tavern', 'workshop'], armyMul: 1.15, mix: { footman: 0.65, bowman: 0.25, knight: 0.1 }, war: -0.06, serf: 0, spies: 1 },
  byzantines: { label: 'theme',   bias: ['academy', 'market', 'tower'], armyMul: 1.0, mix: { footman: 0.35, bowman: 0.3, knight: 0.35 }, war: 0.06, serf: 1, spies: 3 },
  persians:  { label: 'satrapy',  bias: ['stable', 'market', 'temple'], armyMul: 1.1, mix: { footman: 0.25, bowman: 0.4, knight: 0.35 }, war: 0.02, serf: 1, spies: 2 },
};
export const FORFEIT_AFTER = 45;   // legacy, unused: houses no longer forfeit; a house falls only with the last of its royal line
export const WEALTH_HOLD = 90;   // legacy, unused: wealth no longer wins
export const VILLAGE_WIN_SHARE = 0.7; // hold this share of villages ...
export const LAND_LOYALTY = 55;     // only villages at least this loyal count toward the land win: a sacked village must be won over
export const VILLAGE_WIN_HOLD = 120;   // ... for this many seconds to win

export const VILLAGE_SIZE = 3;
// Folk living in each village. Independent villages grow while their store has grain and shrink when it runs dry;
// a village you hold houses half its folk (they raise your population cap), pays tribute by how full it is, and can send settlers.
export const VILLAGE_POP = { hamlet: 16, mine: 12, market: 18, hillfort: 10, abbey: 9, inn: 6 };
export const POP_FOOD = 0.003;   // grain eaten per villager per second
export const POP_GROW = 45;      // seconds per new villager while fed
export const POP_HOUSING = 0.5;  // population cap you gain per villager in a village you hold
export const SETTLE_FOOD = 20;
// every house begins in a home village of this many folk (cap FOUND.max); there is no hall
export const HOME_POP = 30;
export const INFLUENCE_HOME = { r: 14, w: 0.5, guard: true };   // a village you hold leans on its neighbours a little
export const FOUND = { limit: 3, pop: 4, max: 50, grow: 22, loyalty: 82, campR: 10, campPop: 8 };   // campR: ore this close makes a founded village a mining camp of campPop folk   // a founded village: folk at the start, cap, seconds per newcomer while fed
export const DRAFT = { minLeft: 2, mineFood: 10, soldierFood: 25, perCall: 5, armEvery: 20 };   // armEvery: seconds between villagers a village can arm (one at a time)
export const SACK = { stores: 0.8, serfs: 0.15, soldiers: 0.2, killed: 0.2 };   // share of the village's goods you carry off; share of survivors who join you as serfs or soldiers   // grain to send for one settler (a serf) from a held village
export const VILLAGE_KINDS = {
  hamlet:   { label: 'Hamlet',         folk: ['farmers', 'herders'],            protection: 220, loyalty: 26, tribute: { food: 0.8,  wood: 0.15, gold: 0.02 }, stores: { food: 80, wood: 20, gold: 8 },  blurb: 'Farmers and herders. Easy to turn, pays grain.' },
  mine:     { label: 'Mining camp',    folk: ['miners', 'haulers'],             protection: 300, loyalty: 18, tribute: { food: 0.1,  wood: 0.1,  gold: 0.3 },  stores: { food: 20, wood: 15, gold: 90, stone: 70, iron: 45, coal: 45, copper: 35, silver: 14 }, blurb: 'Miners and haulers. Pays coin; sells ore to caravans.' },
  market:   { label: 'Market town',    folk: ['traders', 'watch'],              protection: 340, loyalty: 30, tribute: { food: 0.3,  wood: 0.3,  gold: 0.25 },  stores: { food: 40, wood: 40, gold: 70, stone: 20, copper: 25, ware: 10 }, blurb: 'Traders and the town watch. Good partner for trade.' },
  hillfort: { label: 'Hillfort',       folk: ['spearmen', 'captain'],           protection: 620, loyalty: 10, tribute: { food: 0.2,  wood: 0.15, gold: 0.1 },  stores: { food: 30, wood: 25, gold: 25, iron: 25, steel: 6 }, blurb: 'Spearmen and a captain. Tough walls: bring a ram.' },
  abbey:    { label: 'Abbey',          folk: ['monks', 'scribes'],              protection: 240, loyalty: 36, tribute: { food: 0.25, wood: 0.1,  gold: 0.15 }, stores: { food: 35, wood: 10, gold: 40, silver: 16, ware: 8 }, blurb: 'Monks and scribes. Loyal, but pays gently.' },
  inn:      { label: 'Crossroads inn', folk: ['innkeep', 'sellswords'],         protection: 200, loyalty: 24, tribute: { food: 0.2,  wood: 0.1,  gold: 0.2 }, stores: { food: 25, wood: 10, gold: 35, coal: 18 }, blurb: 'Innkeep and sellswords. Cheap to sack.' },
};
export const VILLAGE_NAMES = {
  hamlet: ['Aldermere', 'Fenwick', 'Hollin', 'Thatchley', 'Oakby', 'Lindow'],
  mine: ['Deepdelve', 'Ironcleave', 'Redscar', 'Coalgate', 'Greywash'],
  market: ['Marketon', 'Cheapside', 'Ferrowby', 'Wainmouth', 'Tollgate'],
  hillfort: ['Highcrag', 'Stonebarrow', 'Wyrmhold', 'Cairnholt', 'Bleakfort'],
  abbey: ['St Aldric', 'Veilmoor', 'St Wenna', 'Candlewick', 'Harrowgate'],
  inn: ['The Drover', 'The Gallows Oak', 'Crossways', 'The Pilgrim', 'The Ford Arms'],
};
// Parts for more names of each kind, once the lists above are used up (owner, 2026-10-19: on the big board 220 villages shared 31 names).
// A name is a first part and a second part ('Ash' + 'wick'); an abbey may also be a saint's, an inn 'The' + a word + a sign.
export const VILLAGE_NAME_PARTS = {
  hamlet: [['Alder', 'Ash', 'Bram', 'Birch', 'Thorn', 'Elm', 'Hazel', 'Oak', 'Rush', 'Willow', 'Mill', 'Fern', 'Holly', 'Brack', 'Wheat', 'Barley', 'Rye', 'Lark', 'Wren', 'Cress', 'Moss', 'Heath', 'Fox', 'Hare', 'Ram', 'Ewe', 'Kine', 'Sedge', 'Rowan', 'Plum'],
           ['mere', 'wick', 'by', 'ley', 'ton', 'ham', 'field', 'stead', 'thorpe', 'worth', 'combe', 'hurst', 'den', 'well', 'ford', 'cote']],
  mine: [['Deep', 'Iron', 'Red', 'Coal', 'Grey', 'Black', 'Copper', 'Silver', 'Slag', 'Tin', 'Rust', 'Ore', 'Flint', 'Shale', 'Cinder', 'Lode', 'Crag', 'Dark', 'Gall', 'Smelt'],
         ['delve', 'cleave', 'scar', 'gate', 'wash', 'hollow', 'shaft', 'seam', 'gill', 'pit', 'barrow', 'dale', 'heugh', 'level', 'rake']],
  market: [['Market', 'Cheap', 'Ferrow', 'Wain', 'Toll', 'Chap', 'Mart', 'Penny', 'Bridge', 'Fair', 'Wool', 'Salt', 'Corn', 'Cloth', 'Cooper', 'Mercer', 'Barter', 'Silk', 'Hay', 'Malt'],
           ['ton', 'side', 'by', 'mouth', 'gate', 'well', 'ford', 'cross', 'stow', 'port', 'ham', 'borough', 'stead', 'wick']],
  hillfort: [['High', 'Stone', 'Wyrm', 'Cairn', 'Bleak', 'Grim', 'Storm', 'Raven', 'Eagle', 'Wolf', 'Crow', 'Dun', 'Ward', 'Shield', 'Hawk', 'Black', 'Thorn', 'Gaunt', 'Skull', 'Bear'],
             ['crag', 'barrow', 'hold', 'holt', 'fort', 'keep', 'tor', 'burh', 'mount', 'rock', 'spur', 'ridge', 'edge', 'law']],
  abbey: [['Veil', 'Candle', 'Harrow', 'Bell', 'Chapel', 'Cloister', 'Vesper', 'Psalm', 'Lantern', 'Prior', 'Chantry', 'Matins', 'Rood', 'Hallow'],
          ['moor', 'wick', 'gate', 'hope', 'field', 'dale', 'ford', 'stow', 'minster', 'cell'],
          ['Aldric', 'Wenna', 'Cuthbert', 'Brigid', 'Columba', 'Hilda', 'Aidan', 'Petroc', 'Ninian', 'Kentigern', 'Oswin', 'Edith', 'Mungo', 'Bede', 'Winifred', 'Dunstan', 'Agnes', 'Mildred', 'Swithun', 'Chad', 'Werburgh', 'Guthlac', 'Botolph', 'Neot', 'Piran', 'Teilo', 'Illtud', 'Dyfrig']],
  inn: [['Golden', 'Black', 'White', 'Red', 'Old', 'Laughing', 'Sleeping', 'Wandering', 'Weary', 'Crooked', 'Merry', 'Drowned', 'Lame', 'Silver', 'Painted', 'Hungry'],
        ['Stag', 'Boar', 'Hart', 'Plough', 'Goose', 'Bell', 'Lantern', 'Wheel', 'Crown', 'Fiddle', 'Horn', 'Kettle', 'Swan', 'Ox', 'Mare', 'Barrel', 'Bear', 'Cockerel', 'Anchor', 'Harp']],
};

export const RELATIONS = ['peace', 'trade', 'alliance', 'war'];
export const DEFAULT_RELATION = 'peace';
export const WAR_MIN = 60;
export const ASK_DELAY = { min: 4, max: 8 };   // seconds before a rival's ruler answers the player's envoy   // seconds after a declaration before either side will hear of peace

export const FOG_REVEAL_MS = 0;

// ---- garrisons, recruits, castle -----------------------------------------------------------
// Units enter a friendly building or village by right-click. Capacity per building kind:
export const GARRISON = { keep: 8, tower: 3, barracks: 6 };
export const VILLAGE_GARRISON = 8;
// A garrisoned keep shoots back (T43, AoE II's town centre arrows): every `per` folk inside (soldiers, serfs sheltering from the bell,
// scholars; not the engines in the sheds) add one arrow to each volley, up to `cap`, at the nearest foes within `range` (+2 with
// Engineering, like a tower), one volley every `cd` seconds. An empty keep is silent.
export const KEEP_ARROWS = { per: 2, cap: 4, range: 8, dmg: 6, cd: 2 };
// The town bell (T38, as in AoE II): one ring sends every serf and scholar within `r` tiles of a keep, tower, barracks or held village with room
// inside the nearest of them; a second ring sends them back to the work they left. Rivals ring it when `foes` or more enemy fighters come within
// `raidR` of their seat and outnumber the guard there by `odds` (a fair fight keeps the serfs out mending), and sound the all-clear after `quiet` seconds with no foe in that ring.
// A feast (T33, a use for the grain that piles up by mid-game; CK3's feasts, Manor Lords' festivals): spent at a built keep, it lifts
// every village of the house within `r` tiles: +`loyalty` at once, `secs` of rejoicing (tribute x1.3, loyalty climbs, as fine ware gives),
// `stock` grain into each village store (a starving village eats again); a free village nearby that leans on no one else, or on this house,
// warms by `sway`. Costs `food` + `perVillage` for each held village fed; once per `cool` seconds a house. Rivals feast with `aiSpare` grain over the cost.
export const FEAST = { food: 300, perVillage: 40, r: 24, loyalty: 10, secs: 90, stock: 40, sway: 6, cool: 240, aiSpare: 600 };
export const BELL = { r: 18, kinds: ['serf', 'scholar'], raidR: 14, foes: 2, odds: 1.5, quiet: 15 };
// who can raise buildings, and how fast compared with a serf (soldiers can build a castle beside a village they mean to sway)
export const BUILDERS = { serf: 1, recruit: 0.5, footman: 0.6, bowman: 0.6, knight: 0.4, scout: 0.3 };
// What each kind of character may do (all orders are right-clicks).
export const ABILITIES = {
  serf: 'Builds (queue with Shift), gathers, mines, enters buildings',
  recruit: 'Fights weakly, enters buildings. Drill it in a keep',
  scout: 'Explores, fights lightly',
  footman: 'Fights, sacks villages, enters buildings',
  bowman: 'Ranged fighter, sacks villages',
  knight: 'Heavy cavalry, sacks villages',
  spy: 'Right-click a village to infiltrate it (turns it toward you); right-click one of yours to post him there as a watchman who catches rival spies',
  scholar: 'Heals friends, boosts academy influence',
  ram: 'Siege: right-click walls',
  onager: 'Siege: right-click walls or troops within 7 tiles',
  trebuchet: 'Siege: right-click walls from 11 tiles',
  king: 'Leads your soldiers (+damage near him), sways villages he visits, enters keeps to heal. If he falls your soldiers lose heart until an heir rises',
  camel: 'Carries up to 40 goods: select it, then click up to 5 markets to loop between for ever (markets only)',
};
// Keep (castle) drills garrisoned recruits and serfs into soldiers.
export const DRILL = {
  footman: { cost: { food: 20, wood: 0, gold: 10 }, time: 10 },
  bowman:  { cost: { food: 15, wood: 15, gold: 15 }, time: 12 },
  knight:  { cost: { food: 40, wood: 0, gold: 40 }, time: 16 },
};
export const LEVY = { every: 25, food: 10, villagePop: 8, regen: 60 }; // a levied village yields a villager every 25s, regrows one per minute
// Tavern: three random wanderers for hire; the roster refreshes now and then.
export const TAVERN_ROSTER = 3, TAVERN_REFRESH = 120;
export const WANDERER_NAMES = ['Tomas', 'Wynn', 'Garrick', 'Bryn', 'Osric', 'Mara', 'Hale', 'Ivo', 'Sable', 'Rook', 'Perrin', 'Edda', 'Corwin', 'Lysa', 'Dunstan', 'Tamsin', 'Alric', 'Nell'];
// ---- ratings: soldiers earn experience by hurting and killing foes and rise through the ranks. Each rank adds damage and health, and a rated
// soldier standing guard counts for more when a keep or village is swaying its neighbours (see guardOf).
export const RANKS = [{ label: 'Rookie', xp: 0 }, { label: 'Trained', xp: 40 }, { label: 'Veteran', xp: 110 }, { label: 'Elite', xp: 230 }, { label: 'Champion', xp: 420 }];
export const RANK_BONUS = { dmg: 0.12, hp: 0.10, guard: 0.25 };   // per rank
export const XP = { perDamage: 0.1, kill: 14, killBuilding: 8, killRankMul: 0.5 };
// ---- the ruler. Every house is led by a named character; his presence rallies soldiers and sways villages, his fall shakes the house.
// no running from a fight; garrisons sally out when foes come near their town
export const BUILD_GAP = 1;   // empty tiles required between a new building and any other
// Repair (owner, 2026-10-16: a damaged or burning building could never be mended): serfs restore a finished building's health at `pace`
// of their building speed, paying `cost` of its price for every full building's worth of health they put back, as they go.
export const REPAIR = { pace: 0.65, cost: 0.5 };
export const DEFEND_R = 14;   // idle soldiers this close to something under attack go to its defence (owner, 2026-10-16: at 5 soldiers a few squares off stood watching; now the whole town turns out, as a garrison's sally does)
// Unit stances (AoE II style). Aggressive: engage foes in sight and chase them. Defensive: engage, but break off and return when a chase
// leads more than `leash` tiles from where the fight began. Hold ground: never move to fight, only strike what is in reach. No attack: never
// start a fight (the 'no running from a fight' lock still holds). A player's order always overrides the stance. Attack-move fights its way to a spot.
export const STANCES = ['aggressive', 'defensive', 'hold', 'passive'];
export const STANCE = { leash: 8, label: { aggressive: 'Aggressive', defensive: 'Defensive', hold: 'Hold ground', passive: 'No attack' } };
// Shift-queued waypoints (T02): how many legs a march can hold after the one it is walking
export const WAYPOINTS = 12;
// Training (T47): a building's queue holds `queue`; Shift-click on a unit button asks for `shift` at once; Repeat keeps one queued.
// Several training buildings selected together (T49) train as one: at most `set` of them in one order.
export const TRAIN = { queue: 5, shift: 5, set: 24 };
// a unit kind's name for many of them, in words a player reads ('Footmen', 'Spies'; T-096: 'Spys' and 'footmans' were shown)
export const plural = (l) => (/man$/.test(l) ? l.replace(/man$/, 'men') : /[^aeiou]y$/.test(l) ? l.replace(/y$/, 'ies') : /s$/.test(l) ? l : l + 's');
export const unitPlural = (kind) => plural(UNITS[kind]?.label || kind);
// Patrol (T39): the AI's home guard walks a round between its seat and its nearest held village at peace: `pair` soldiers at most, sent only
// while `spare` stand idle at the seat, checked every `every` seconds; the village within `reach` tiles, else `out` tiles toward the middle.
export const PATROL = { pair: 2, spare: 4, every: 20, reach: 26, out: 10 };
// Explore (T45, AoE IV's auto-scout): a scout sent exploring rides to the nearest unseen ground he can reach, again and again. Unseen ground is
// sampled every `step` tiles; it is checked again every `look` seconds (on to the next place once his goal is seen, or a foe is near);
// he keeps `foe` tiles from any foe at war he can see or remembers, never rides for a place within `apart` tiles of another explorer's
// goal, and picks among the `pick` nearest places with the seeded roll. The AI keeps one scout exploring, trained from its keep once
// `after` seconds in (again `every` seconds after it is lost) while it has the food.
export const EXPLORE = { step: 6, look: 1, foe: 9, apart: 12, pick: 3, after: 150, every: 240, food: 160 };
// Formations (T02): where each member of a group sent together stands at the end of its march, and which way it faces. Mass: a tight knot
// (the old way, and the default). Line: ranks across the line of march, fighters in front, bowmen behind. Box: a square with the fighters
// on the outside and bowmen and the weak inside. Loose: spread wide, so fewer stand in one blow's way. `gap` and `loose` are tiles apart.
export const FORMATIONS = ['mass', 'line', 'box', 'loose'];
export const FORMATION = { gap: 1.1, mass: 0.9, loose: 1.9, label: { mass: 'Mass', line: 'Line', box: 'Box', loose: 'Loose' } };
export const SALLY = { lockFor: 5, lockR: 3.5, every: 0.5, townR: 14, postR: 11, lookR: 9 };
// The royal line: a house has a king and `heirs` heirs. Each fallen king is followed by the next heir after `heir` seconds; when the last of the
// line dies the house falls. A king whose house has lost its seat is a fugitive, seen by every house (`fugitiveSight`).
export const KING = { safeR: 12, aura: 8, dmg: 0.10, xp: 0.25, pull: 0.55, pullR: 14, heir: 20, heirs: 2, fugitiveSight: 2.5, leaderless: 0.85, loyaltyHit: 8, killXp: 80, leash: 14,
  titles: { egyptians: 'Pharaoh', romans: 'Imperator', british: 'King', mongols: 'Khan', scottish: 'High King', vikings: 'Jarl', byzantines: 'Basileus', persians: 'Shahanshah' } };
// Leaders have a temper that colours how they treat the other houses (see ai.js diplomacy): aggr, greed, honor and wary are 0..1.
export const TEMPERS = [
  { key: 'warlike', label: 'Warlike', tip: 'Quick to war, slow to forgive.' },
  { key: 'mercantile', label: 'Mercantile', tip: 'Loves trade and tribute; hates a poor partner.' },
  { key: 'honourable', label: 'Honourable', tip: 'Keeps oaths and expects the same.' },
  { key: 'cunning', label: 'Cunning', tip: 'Allies with the strong, turns on the weak.' },
];
export const TRAITS = {
  green:   { label: 'Green',    hp: 1,   dmg: 0, spd: 0,   cost: 25 },
  brawny:  { label: 'Brawny',   hp: 1.3, dmg: 1, spd: 0,   cost: 45 },
  keen:    { label: 'Keen',     hp: 1,   dmg: 3, spd: 0,   cost: 50 },
  fleet:   { label: 'Fleet',    hp: 1,   dmg: 0, spd: 0.7, cost: 40 },
  veteran: { label: 'Veteran',  hp: 1.2, dmg: 2, spd: 0.2, cost: 70 },
};
// Far-landers: travellers from peoples who have no house in the valley. Now and then one sits in a tavern (FARLAND_CHANCE per slot, never two
// in one roster). Each brings a gift of their homeland (perk) that stays with them when they are drilled into a soldier or sent out as a spy.
export const FARLAND_CHANCE = 0.3;
export const FARLANDS = {
  norse:    { label: 'Norse sea-wolf',      land: 'the Northern Fjords',              perk: 'Berserker',     tip: 'Fights harder the more wounded: up to +60% damage near death.',                    hp: 1.25, dmg: 2, spd: 0,   cost: 85 },
  parthian: { label: 'Parthian rider',      land: 'Parthia, beyond the salt deserts', perk: 'Outrider',      tip: 'Swift and far-sighted: +1.1 speed, +50% sight.',                                  hp: 1.1,  dmg: 1, spd: 1.1, cost: 80 },
  greek:    { label: 'Greek physician',     land: 'the Isles of the Middle Sea',      perk: 'Physician',     tip: 'Heals wounded friends within 4 tiles (2 health a second), even on the march.',     hp: 1,    dmg: 0, spd: 0,   cost: 75 },
  han:      { label: 'Han drillmaster',     land: 'the Middle Kingdom, far east',     perk: 'Drillmaster',   tip: 'Soldiers within 6 tiles earn +50% experience.',                                   hp: 1.1,  dmg: 1, spd: 0,   cost: 90 },
  rus:      { label: 'Rus bear-hunter',     land: 'the river forests of the Rus',     perk: 'Horse-breaker', tip: '+75% damage against knights, kings and siege engines.',                                     hp: 1.3,  dmg: 1, spd: 0,   cost: 80 },
  moor:     { label: 'Moorish caravaneer',  land: 'the Maghreb, past the great sands', perk: 'Caravaneer',   tip: 'Your camels within 8 tiles walk 25% faster.',                                     hp: 1,    dmg: 0, spd: 0.4, cost: 70 },
  aksum:    { label: 'Aksumite envoy',      land: 'Aksum, across the Red Sea',        perk: 'Envoy',         tip: 'Sways villages within 10 tiles toward your house, like a lesser king.',           hp: 1,    dmg: 0, spd: 0.3, cost: 95 },
  nihon:    { label: 'Wandering swordsman', land: 'the Eastern Isles',                perk: 'Duellist',      tip: '+40% damage against rated foes (Trained or better).',                             hp: 1.15, dmg: 3, spd: 0.2, cost: 100 },
};
export const PERK = { berserk: 0.6, sight: 1.5, healR: 4, heal: 2, drillR: 6, drillXp: 0.5, breaker: 0.75, caravanR: 8, caravan: 1.25, envoyR: 10, envoy: 0.3, duel: 0.4 };
// Deeds: soldiers earn a byname from what they have done, and it changes how they fight.
export const DEEDS = {
  blooded:    { label: 'Blooded',      tip: 'Made a first kill.' },
  slayer:     { label: 'the Slayer',   tip: 'Ten kills. +8% damage.', dmg: 0.08 },
  kingslayer: { label: 'Kingslayer',   tip: 'Slew a ruler. +10% damage; feared across the valley.', dmg: 0.10 },
  giant:      { label: 'Giant-killer', tip: 'Killed a foe two ranks above them. +10% health.', hp: 0.10 },
  survivor:   { label: 'Death-cheater', tip: 'Took a blow that left them near death, and lived. +10% health.', hp: 0.10 },
  breaker:    { label: 'Wall-breaker', tip: 'Brought down three buildings. +25% damage against buildings.', bld: 0.25 },
};
// Captains (the Seven Kingdoms general): an Elite or better soldier can be given command. Soldiers near a captain hit harder and learn faster.
export const CAPTAIN = { minRank: 3, cost: { food: 0, wood: 0, gold: 60 }, max: 3, aura: 6, dmg: 0.06, xp: 0.25, guard: 1.5 };

// ---- caravans: camels carry goods between markets (never villages: DEMANDS) ------------------------------
export const ROUTE_STOPS = 5;      // markets a camel keeps on its circuit (besides its home market)
// arb: share of the price gap paid out as coin when a camel moves goods to where they are scarcer; purse: working coin a camel draws to buy abroad;
// dwell: seconds spent at each stop; perGood: most of one good per leg; minGain: smallest coin gain per unit worth carrying
// home: what a camel earns carrying goods between a house's OWN markets, against the full arbitrage it makes with a partner (owner,
// 2026-10-15: trade was pointless when a house could shuttle goods round its own towns for the same coin; real money is abroad)
export const ROUTE = { home: 0.25, arb: 0.6, purse: 100, dwell: 1.2, perGood: 25, minGain: 0.05, eat: 0.02, eatEach: 0.012, pay: 0.45 };   // eat: goods a market's folk use per second per good that came by camel (+eatEach per customer), paid at pay x the local price
export const CAMEL_CAP = 40;       // goods per camel
// ---- communities. A market and the people and works around it form a district. The flow it models:
//   SUPPLY (mines dig, farms and mills grow)  ->  WORKS (foundries, forges, workshops make steel and ware)  ->  MARKET (shelf, camels, coin)  ->  HOMES (cottages, towns) who pay, and SERVICE (taverns, temples, abbeys) who keep them content.
// Each of the four links present within DISTRICT.r adds a bonus; all four make the district thrive. Held villages count as links too (by kind),
// so a mining camp, a hamlet and an abbey beside your market are a ready-made community. Buildings dotted about alone get nothing and work slowly.
export const DISTRICT = { r: 20, perLink: 0.25, thrive: 0.25, lone: 0.6 };
export const LINKS = {
  supply:  { label: 'Supply',  blds: ['mine', 'farm', 'mill'],                  towns: ['mine', 'hamlet'],  tip: 'mines, farms or mills (or a mining camp or hamlet you hold)' },
  works:   { label: 'Works',   blds: ['foundry', 'forge', 'workshop', 'warehouse'], towns: ['hillfort'],    tip: 'a foundry, forge, workshop or warehouse (or a hillfort you hold)' },
  homes:   { label: 'Homes',   blds: ['cottage'],                               towns: ['market'],          tip: 'cottages (or a market town, or any village you founded)' },
  service: { label: 'Service', blds: ['tavern', 'temple', 'academy'],           towns: ['abbey', 'inn'],    tip: 'a tavern, temple or academy (or an abbey or inn you hold)' },
};
export const MARKET_RADIUS = 20;   // a market is stocked by mines, foundries and warehouses within this many tiles
export const WAREHOUSE_CAP = 150;   // goods per kind a warehouse holds for the markets beside it: shelves spill into it when full and draw from it as they empty
export const WAREHOUSE_KEEP = 120;  // the stockpile keeps this much of a good before the surplus goes into the warehouse
export const WAREHOUSE_GOODS = [...MATS, ...PROCESSED];   // ore, steel and fine ware are stored; food, timber and coin stay in the stockpile
export const SHELF_CAP = 60;       // goods per kind on a market's shelf (100 with a warehouse beside it)
export const SHELF_RESERVE = { food: 100, wood: 100, gold: 100, other: 10 }; // the stockpile keeps this much before the market stocks from it
export const SPY_FEE = 25;         // coin to send a recruit out as a spy

// Village folk stay indoors. A quarter muster to defend when it is attacked; now and then a family sets out for another village.
// dps: what each of a village's fighting folk (a quarter of its people, `share`) deals back a second, times its walls (maxProtection
// over a hamlet's 220), shared among everyone attacking it (owner, 2026-10-16: ten soldiers died to a hillfort of ten folk, because
// every attacker took the village's full bite whatever its size and however many shared the fight)
export const MILITIA = { share: 0.25, rampEvery: 0.4, bite: 0.12, loss: 0.06, dps: 3 };
export const WANDER = { every: [90, 160], minPop: 6, range: 62, speed: 1.7, newsPull: 0.3, newsTime: 90, unrest: 2 };

// ---- money --------------------------------------------------------------------------------
// Coin is the house's lifeblood. Sources: digging gold, selling ore and goods at a market, caravans, village tax and tribute, sacks.
// The steady drain is the army's pay: soldiers beyond the household guard cost coin every second. An empty purse means
// shrinking tempers: they fight at 70% and a man deserts every half minute.
export const WAGE = { footman: 0.05, bowman: 0.065, knight: 0.12, scout: 0.03, spy: 0.05, scholar: 0.05 };   // coin per second each
export const WAGE_FREE = 4;            // soldiers kept on the household: no pay due for the first few
export const BROKE = { fight: 0.7, desertEvery: 30, grace: 20 };
export const SELL = { rate: 0.6, glut: 60, decay: 0.6, floor: 0.35 };   // a market buys your stockpile at 60% of worth; each unit sold lowers the price (glut), which recovers
export const TAX = 0.011;              // coin per second per villager in a village you hold, at full loyalty
export const INCOME_SOURCES = ['mining', 'panning', 'market', 'tavern', 'temple', 'tax', 'tribute', 'trade', 'sales', 'loot'];
