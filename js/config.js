// Seven Holds - balance, stats and constants. No DOM access: this file is shared by the host sim and the client.

export const TILE = 32;
export const MAP_W = 112;
export const MAP_H = 112;
export const PLAYER = 0;
export const MIN_HOUSES = 3;
export const MAX_HOUSES = 5;
export const DEFAULT_HOUSES = 4;

export const HOUSES = [
  { name: 'House Calder', short: 'Calder', color: 'yellow', primary: '#c9a42e', accent: '#f4dc7a', dark: '#5c4510', motto: 'Hold what you till' },
  { name: 'House Varr', short: 'Varr', color: 'red', primary: '#a83a3a', accent: '#ff9078', dark: '#4b1b1b', motto: 'Blood and iron' },
  { name: 'House Cael', short: 'Cael', color: 'blue', primary: '#3a6ea8', accent: '#92c6ff', dark: '#1c334d', motto: 'Still waters' },
  { name: 'House Thorn', short: 'Thorn', color: 'green', primary: '#37753f', accent: '#97d17c', dark: '#173a1c', motto: 'We endure' },
  { name: 'House Ash', short: 'Ash', color: 'violet', primary: '#7a4a98', accent: '#cb9ce0', dark: '#30203f', motto: 'From embers' },
];

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
export const GOOD_COLOR = { food: '#c23a56', wood: '#8a5a2a', gold: '#e0b83a', stone: '#9a9a90', copper: '#c8743a', iron: '#6f7a86', coal: '#35353a', silver: '#d8e0ea', steel: '#9fb4c8', ware: '#c9a0e0' };
export const GOOD_INFO = {
  gold: 'Coin: pays for troops and trade; a mine digs it from a seam.',
  stone: 'Raises keeps, towers and foundries.',
  copper: 'Smelted with coal into fine ware.',
  iron: 'Smelted with coal into steel.',
  coal: 'Fuel for the foundry.',
  silver: 'Academies burn it for science.',
  steel: 'Forges turn it into better arms.',
  ware: 'Taverns, markets and temples use it to make villagers content.',
};
export const MINEABLE = ['gold', ...MATS]; // every ore, coin included, can be dug from a deposit with a Mine
export const MINE_RATE = { gold: 0.6, stone: 0.6, copper: 0.5, iron: 0.45, coal: 0.5, silver: 0.3 }; // per worker per second
export const MINE_MAX_WORKERS = 4;
export const SMELT = { steel: { in: { iron: 2, coal: 1 }, time: 7 }, ware: { in: { copper: 2, coal: 1 }, time: 8 } };
export const ARMS_STEEL = 6;   // steel per forge arms level (max 3)
export const SCI_SILVER = 6;   // silver per science level (max 3)
export const SCIENCE = ['Husbandry', 'Masonry', 'Drill']; // +farm/gather yield, +building HP, +unit HP
export const WARE_JOY = { every: 25, secs: 70 }; // one ware lifts a village for 70s; a village consumes at most one per 25s
export const NODE_RES = { tree: 'wood', berry: 'food', gold: 'gold' };
export const GATHER_RATE = { wood: 0.95, food: 1.1, gold: 0.7 }; // per second while working
export const CARRY_CAP = 10;

export const START_RES = { food: 300, wood: 520, gold: 220, stone: 60, copper: 0, iron: 0, coal: 0, silver: 0, steel: 0, ware: 0 };

// ---- Units -------------------------------------------------------------------------------
// speed in tiles/sec, range in tiles, cooldown in seconds, bld = damage multiplier vs buildings, vil = vs villages
export const UNITS = {
  serf:    { label: 'Serf',    hp: 40,  speed: 2.4, dmg: 3,  range: 1,   cd: 1.2,  sight: 6,  cost: { food: 50, wood: 0, gold: 0 },   time: 8,  from: ['hall', 'keep'], bld: 0.3, vil: 0.3, info: 'Gathers, builds, drops off. Weak in a fight.' },
  scout:   { label: 'Scout',   hp: 55,  speed: 4.4, dmg: 5,  range: 1,   cd: 1.0,  sight: 10, cost: { food: 40, wood: 20, gold: 0 },  time: 10, from: ['keep'],         bld: 0.2, vil: 0.4, info: 'Fast and far-sighted. Maps the valley.' },
  footman: { label: 'Footman', hp: 90,  speed: 2.7, dmg: 10, range: 1,   cd: 1.1,  sight: 7,  cost: { food: 60, wood: 20, gold: 0 },  time: 14, from: ['barracks'],     bld: 0.5, vil: 1.0, info: 'Melee line infantry. Forge adds +3 damage.' },
  bowman:  { label: 'Bowman',  hp: 50,  speed: 2.8, dmg: 7,  range: 5.5, cd: 1.3,  sight: 8,  cost: { food: 40, wood: 30, gold: 20 }, time: 16, from: ['archery'],      bld: 0.35, vil: 0.8, info: 'Ranged. Forge adds +2 damage.' },
  knight:  { label: 'Knight',  hp: 150, speed: 3.9, dmg: 16, range: 1,   cd: 1.2,  sight: 7,  cost: { food: 80, wood: 0, gold: 60 },  time: 22, from: ['stable'],       bld: 0.5, vil: 1.0, info: 'Heavy cavalry. Forge adds +3 damage.' },
  spy:     { label: 'Spy',     hp: 35,  speed: 3.4, dmg: 3,  range: 1,   cd: 1.0,  sight: 11, cost: { food: 30, wood: 20, gold: 40 }, time: 16, from: ['tavern'],       bld: 0.1, vil: 0, info: 'Infiltrates villages to turn their loyalty. Can be caught.' },
  scholar: { label: 'Scholar', hp: 30,  speed: 2.0, dmg: 1,  range: 1,   cd: 1.5,  sight: 9,  cost: { food: 40, wood: 20, gold: 50 }, time: 18, from: ['academy'],      bld: 0.1, vil: 0, info: 'Near an academy: +influence and heals friends nearby.' },
  recruit: { label: 'Recruit', hp: 60,  speed: 2.6, dmg: 6,  range: 1,   cd: 1.2,  sight: 6,  cost: { food: 0, wood: 0, gold: 0 },    time: 0,  from: [],              bld: 0.3, vil: 0.6, art: 'scout', info: 'A hired wanderer or levied villager. Fights poorly until drilled into a soldier inside a keep.' },
  camel:   { label: 'Camel',   hp: 90,  speed: 3.0, dmg: 0,  range: 1,   cd: 2.0,  sight: 7,  cost: { food: 40, wood: 20, gold: 30 },  time: 12, from: ['market'],       bld: 0, vil: 0, info: 'Pack animal. Load goods at a market, then right-click another market or village to trade there.' },
  ram:     { label: 'Ram',     hp: 240, speed: 1.4, dmg: 30, range: 1.1, cd: 2.2,  sight: 5,  cost: { food: 0, wood: 180, gold: 40 }, time: 28, from: ['workshop'],     bld: 2.6, vil: 3.0, info: 'Siege. Splinters halls and hillforts.' },
};

// ---- Buildings ---------------------------------------------------------------------------
export const BUILDINGS = {
  hall:      { label: 'Timber Hall',   size: 3, hp: 520,  sight: 8,  pop: 6, cost: null,                          time: 0,  requires: [],                      info: 'Your seat. Trains serfs, drop-off. Low HP. Raises nearby loyalty a little.' },
  keep:      { label: 'Keep',          size: 4, hp: 1900, sight: 12, pop: 8, cost: { food: 0, wood: 280, gold: 120, stone: 40 }, time: 36, requires: ['hall'],          info: 'Stone seat. Strong influence over villages while soldiers garrison it; trains serfs and scouts, more pop.' },
  cottage:   { label: 'Cottage',       size: 2, hp: 380,  sight: 5,  pop: 5, cost: { food: 0, wood: 60, gold: 0 },   time: 12, requires: ['hall'],          info: '+5 population.' },
  farm:      { label: 'Farm',          size: 3, hp: 330,  sight: 4,  pop: 0, cost: { food: 0, wood: 70, gold: 0 },   time: 14, requires: ['hall'],          info: 'Steady grain. +25% beside a mill.' },
  mill:      { label: 'Mill',          size: 2, hp: 480,  sight: 5,  pop: 0, cost: { food: 0, wood: 80, gold: 0 },   time: 16, requires: ['hall'],          info: 'Timber drop-off. Processing: +20% timber delivered.' },
  warehouse: { label: 'Warehouse',     size: 3, hp: 700,  sight: 5,  pop: 0, cost: { food: 0, wood: 100, gold: 20 }, time: 18, requires: ['hall'],          info: 'Drop-off for all goods, +10% delivered.' },
  market:    { label: 'Market',        size: 3, hp: 540,  sight: 6,  pop: 0, cost: { food: 0, wood: 120, gold: 40 }, time: 20, requires: ['hall'],          info: 'Trade hub: stocked from nearby mines, foundries, farms, mills and warehouses. Trains camels to trade with other markets and villages. Drop-off. Small coin trickle.' },
  forge:     { label: 'Forge',         size: 3, hp: 740,  sight: 5,  pop: 0, cost: { food: 0, wood: 150, gold: 60 }, time: 24, requires: ['barracks'],      info: 'Arms: footmen/knights +3 dmg, bowmen +2. Feeds on steel: each 6 steel is another arms level (max 3).' },
  workshop:  { label: 'Workshop',      size: 3, hp: 780,  sight: 5,  pop: 0, cost: { food: 0, wood: 160, gold: 70 }, time: 26, requires: ['forge', 'academy'], info: 'Trains rams.' },
  tavern:    { label: 'Tavern',        size: 2, hp: 480,  sight: 6,  pop: 0, cost: { food: 40, wood: 100, gold: 40 }, time: 18, requires: ['hall'],         info: 'Trains spies. Local loyalty pull. Coin trickle.' },
  academy:   { label: 'Academy',       size: 3, hp: 640,  sight: 9,  pop: 0, cost: { food: 0, wood: 140, gold: 80 }, time: 24, requires: ['keep'],          info: 'Trains scholars. Unlocks the workshop and temple coin. Burns silver into science (3 levels).' },
  temple:    { label: 'Temple',        size: 2, hp: 590,  sight: 7,  pop: 0, cost: { food: 0, wood: 130, gold: 50 }, time: 20, requires: ['keep'],          info: 'Strong loyalty aura. Coin trickle with an academy.' },
  barracks:  { label: 'Barracks',      size: 3, hp: 780,  sight: 6,  pop: 0, cost: { food: 0, wood: 140, gold: 20 }, time: 22, requires: ['hall'],          info: 'Trains footmen.' },
  archery:   { label: 'Archery Range', size: 3, hp: 700,  sight: 7,  pop: 0, cost: { food: 0, wood: 130, gold: 30 }, time: 20, requires: ['barracks'],      info: 'Trains bowmen.' },
  stable:    { label: 'Stable',        size: 3, hp: 740,  sight: 6,  pop: 0, cost: { food: 0, wood: 160, gold: 50 }, time: 24, requires: ['keep', 'barracks'], info: 'Trains knights.' },
  mine:      { label: 'Mine',          size: 2, hp: 420,  sight: 5,  pop: 0, cost: { food: 0, wood: 80, gold: 10 },  time: 14, requires: ['hall'], onDeposit: true, info: 'Raised on a mineral deposit. Assign serfs to dig; ore flows into your stockpile.' },
  foundry:   { label: 'Foundry',       size: 3, hp: 760,  sight: 5,  pop: 0, cost: { food: 0, wood: 140, gold: 40, stone: 25 }, time: 22, requires: ['hall'], info: 'Smelts iron+coal into steel, copper+coal into fine ware. Automatic.' },
  tower:     { label: 'Watchtower',    size: 2, hp: 640,  sight: 11, pop: 0, cost: { food: 0, wood: 100, gold: 40, stone: 15 }, time: 20, requires: ['hall'],          info: 'Sight and ranged defence. Small loyalty pull.', range: 7.5, dmg: 9, cd: 1.1 },
};
export const BUILD_ORDER_UI = ['cottage', 'farm', 'mill', 'warehouse', 'market', 'mine', 'foundry', 'barracks', 'archery', 'stable', 'tower', 'forge', 'workshop', 'tavern', 'academy', 'temple', 'keep'];

// Which buildings accept which goods from serfs
export const DROP_OFF = {
  hall: ['food', 'wood', 'gold'],
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
export const STORES = ['hall', 'keep', 'warehouse', 'market'];
export const CONSUMERS = { base: 0.15, each: 0.09, max: 10 };   // market coin per second = base + each * (own cottages and villages in reach, up to max)

// Loyalty pull: who is leaning on a village. r = radius in tiles, w = weight at the building (falls off linearly).
// `guard`: the pull scales with the soldiers garrisoned inside or standing watch within 5 tiles (0.35 with none, full at 4).
export const INFLUENCE = {
  hall: { r: 14, w: 0.5, guard: true },
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
export const RULE = { hall: 20, keep: 28, village: 14, default: 10 };
export const GUARD = { floor: 0.35, full: 4, watch: 5 };
export const LOYALTY_RATE = 1.6; // loyalty/sec per unit of net pull
export const SUBMIT_LOYALTY = 72;
export const SPY_RATE = 1.7;     // loyalty/sec while a spy is inside
export const SPY_CATCH = 0.004;  // base catch chance per second, plus protection/16000
export const VILLAGE_WIN_SHARE = 0.65; // hold this share of villages ...
export const VILLAGE_WIN_HOLD = 45;    // ... for this many seconds to win

export const VILLAGE_SIZE = 3;
export const VILLAGE_KINDS = {
  hamlet:   { label: 'Hamlet',         folk: ['farmers', 'herders'],            protection: 220, loyalty: 26, tribute: { food: 0.8,  wood: 0.15, gold: 0.05 }, stores: { food: 80, wood: 20, gold: 8 },  blurb: 'Farmers and herders. Easy to turn, pays grain.' },
  mine:     { label: 'Mining camp',    folk: ['miners', 'haulers'],             protection: 300, loyalty: 18, tribute: { food: 0.1,  wood: 0.1,  gold: 0.9 },  stores: { food: 20, wood: 15, gold: 90, stone: 70, iron: 45, coal: 45, copper: 35, silver: 14 }, blurb: 'Miners and haulers. Pays coin; sells ore to caravans.' },
  market:   { label: 'Market town',    folk: ['traders', 'watch'],              protection: 340, loyalty: 30, tribute: { food: 0.3,  wood: 0.3,  gold: 0.7 },  stores: { food: 40, wood: 40, gold: 70, stone: 20, copper: 25, ware: 10 }, blurb: 'Traders and the town watch. Good partner for trade.' },
  hillfort: { label: 'Hillfort',       folk: ['spearmen', 'captain'],           protection: 620, loyalty: 10, tribute: { food: 0.2,  wood: 0.15, gold: 0.3 },  stores: { food: 30, wood: 25, gold: 25, iron: 25, steel: 6 }, blurb: 'Spearmen and a captain. Tough walls: bring a ram.' },
  abbey:    { label: 'Abbey',          folk: ['monks', 'scribes'],              protection: 240, loyalty: 36, tribute: { food: 0.25, wood: 0.1,  gold: 0.45 }, stores: { food: 35, wood: 10, gold: 40, silver: 16, ware: 8 }, blurb: 'Monks and scribes. Loyal, but pays gently.' },
  inn:      { label: 'Crossroads inn', folk: ['innkeep', 'sellswords'],         protection: 200, loyalty: 24, tribute: { food: 0.2,  wood: 0.1,  gold: 0.55 }, stores: { food: 25, wood: 10, gold: 35, coal: 18 }, blurb: 'Innkeep and sellswords. Cheap to sack.' },
};
export const VILLAGE_NAMES = {
  hamlet: ['Aldermere', 'Fenwick', 'Hollin', 'Thatchley', 'Oakby', 'Lindow'],
  mine: ['Deepdelve', 'Ironcleave', 'Redscar', 'Coalgate', 'Greywash'],
  market: ['Marketon', 'Cheapside', 'Ferrowby', 'Wainmouth', 'Tollgate'],
  hillfort: ['Highcrag', 'Stonebarrow', 'Wyrmhold', 'Cairnholt', 'Bleakfort'],
  abbey: ['St Aldric', 'Veilmoor', 'St Wenna', 'Candlewick', 'Harrowgate'],
  inn: ['The Drover', 'The Gallows Oak', 'Crossways', 'The Pilgrim', 'The Ford Arms'],
};

export const RELATIONS = ['peace', 'trade', 'war'];
export const DEFAULT_RELATION = 'peace';

export const FOG_REVEAL_MS = 0;

// ---- garrisons, recruits, castle -----------------------------------------------------------
// Units enter a friendly building or village by right-click. Capacity per building kind:
export const GARRISON = { hall: 4, keep: 12, tower: 3, barracks: 6 };
export const VILLAGE_GARRISON = 6;
// What each kind of character may do (all orders are right-clicks).
export const ABILITIES = {
  serf: 'Builds (queue with Shift), gathers, mines, enters buildings',
  recruit: 'Fights weakly, enters buildings. Drill it in a keep',
  scout: 'Explores, fights lightly',
  footman: 'Fights, sacks villages, enters buildings',
  bowman: 'Ranged fighter, sacks villages',
  knight: 'Heavy cavalry, sacks villages',
  spy: 'Right-click a village to infiltrate it (gains influence)',
  scholar: 'Heals friends, boosts academy influence',
  ram: 'Siege: right-click walls',
  camel: 'Carries up to 40 goods: load at a market, right-click a market or village to trade',
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
export const TRAITS = {
  green:   { label: 'Green',    hp: 1,   dmg: 0, spd: 0,   cost: 25 },
  brawny:  { label: 'Brawny',   hp: 1.3, dmg: 1, spd: 0,   cost: 45 },
  keen:    { label: 'Keen',     hp: 1,   dmg: 3, spd: 0,   cost: 50 },
  fleet:   { label: 'Fleet',    hp: 1,   dmg: 0, spd: 0.7, cost: 40 },
  veteran: { label: 'Veteran',  hp: 1.2, dmg: 2, spd: 0.2, cost: 70 },
};

// ---- caravans: camels carry goods between markets and villages ------------------------------
export const CAMEL_CAP = 40;       // goods per camel
export const MARKET_RADIUS = 24;   // a market is stocked by mines, foundries and warehouses within this many tiles
export const SHELF_CAP = 60;       // goods per kind on a market's shelf (100 with a warehouse beside it)
export const SHELF_RESERVE = { food: 100, wood: 100, gold: 100, other: 10 }; // the stockpile keeps this much before the market stocks from it
export const SPY_FEE = 25;         // coin to send a recruit out as a spy
