// Auld World - valley generation. Pure data, seeded, no DOM.
// Guarantees: every start, village and resource node lies in ONE connected walkable region (the river has fords).

import { MAP_W, MAP_H, T_GRASS, T_DIRT, T_WATER, T_FORD, T_DRY, T_SAND, T_ROCK, T_SNOW, BIOMES, VILLAGE_KINDS, VILLAGE_SIZE, VILLAGE_NAMES, MATS, AREA_MUL } from './config.js';

export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(f() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return f;
}

function hash2(x, y, s) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const lerp = (a, b, t) => a + (b - a) * t;
function vnoise(x, y, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const ix = fx * fx * (3 - 2 * fx), iy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2(x0, y0, s), hash2(x0 + 1, y0, s), ix), lerp(hash2(x0, y0 + 1, s), hash2(x0 + 1, y0 + 1, s), ix), iy);
}
function fbm(x, y, s) {
  let n = 0, a = 1, f = 1, t = 0;
  for (let i = 0; i < 4; i++) { n += a * vnoise(x * f, y * f, s + i); t += a; a *= 0.5; f *= 2; }
  return n / t;
}

export function createMap(seed, houses = 4) {
  const W = MAP_W, H = MAP_H;
  const r = rng(seed);
  const ns = Math.floor(r() * 1e6);
  const terrain = new Uint8Array(W * H);
  const idx = (x, y) => y * W + x;

  // ---- climate: one biome per game, then noise mixes grass, steppe, sand, snow and rock inside it
  const total = Object.values(BIOMES).reduce((a, b) => a + b.weight, 0);
  let roll = r() * total, biomeKey = 'temperate';
  for (const [k, b] of Object.entries(BIOMES)) { roll -= b.weight; if (roll <= 0) { biomeKey = k; break; } }
  const biome = BIOMES[biomeKey];
  const warp = r() * 40;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const m = fbm(x / 24 + warp, y / 24, ns + 31) + biome.moist;
      const c = fbm(x / 30, y / 30 + warp, ns + 57) + biome.cold;
      let t = T_GRASS;
      if (c > 0.6) t = T_SNOW;
      else if (m < 0.33) t = T_SAND;
      else if (m < 0.47) t = T_DRY;
      terrain[idx(x, y)] = t;
    }
  }
  // Rocky ridges (impassable): thin lines where a noise field crosses its middle, so they read as ridges with gaps
  const ridgeCut = 0.014 + biome.rocky;
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const n = fbm(x / 13, y / 13, ns + 77);
      if (Math.abs(n - 0.5) < ridgeCut && fbm(x / 9, y / 9, ns + 91) > 0.46) terrain[idx(x, y)] = T_ROCK;
    }
  }
  // Ponds and mud shallows
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbm(x / 17, y / 17, ns) * 0.65 + fbm(x / 7, y / 7, ns + 9) * 0.35;
      if (n < 0.255 * biome.lakes) terrain[idx(x, y)] = T_WATER;
      else if (n < 0.31 * biome.lakes && terrain[idx(x, y)] !== T_ROCK) terrain[idx(x, y)] = T_DIRT;
    }
  }

  // Rivers: none, one or two, running from edge to edge at a random angle, with fords
  const riverTiles = [];
  const nRivers = (() => { const q = r(); return (q < biome.rivers[0] ? 0 : q < biome.rivers[0] + biome.rivers[1] ? 1 : 2) * 2; })();   // twice as many on a board this size
  const fords = [];
  for (let k = 0; k < nRivers; k++) {
    const orient = r.int(0, 3);
    const sx = [W * (0.35 + r() * 0.3), 0, W * (0.1 + r() * 0.2), W * (0.7 + r() * 0.2)][orient];
    const sy = [0, H * (0.35 + r() * 0.3), 0, 0][orient];
    let heading = [Math.PI / 2, 0, Math.PI / 4, (3 * Math.PI) / 4][orient];
    let px = sx, py = sy, wob = 0;
    const path = [];
    for (let s = 0; s < 1200 && px > -3 && py > -3 && px < W + 3 && py < H + 3; s++) {
      wob = Math.max(-0.45, Math.min(0.45, wob + (r() - 0.5) * 0.35));
      const hd = heading + wob;
      px += Math.cos(hd); py += Math.sin(hd);
      path.push([Math.round(px), Math.round(py)]);
    }
    const mid = path.length;
    const fordAt = [0.2, 0.5, 0.8].map((f) => Math.floor(mid * f + r.int(-4, 4)));
    path.forEach(([x, y], i) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        terrain[idx(xx, yy)] = T_WATER; riverTiles.push([xx, yy, i, k, fordAt]);
      }
    });
    fordAt.forEach((i) => { if (path[i]) fords.push(path[i][1]); });
  }
  for (const [x, y, i, , fordAt] of riverTiles) if (fordAt.some((f) => Math.abs(i - f) <= 1)) terrain[idx(x, y)] = T_FORD;
  // Clear a margin of water and rock at the very map edge so edge pans never show a lake
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = terrain[idx(x, y)];
    if ((t === T_WATER || t === T_ROCK) && (x < 2 || y < 2 || x >= W - 2 || y >= H - 2)) terrain[idx(x, y)] = T_GRASS;
  }

  const blocked = (t) => t === T_WATER || t === T_ROCK;
  const isLand = (t) => t === T_GRASS || t === T_DIRT || t === T_DRY || t === T_SAND || t === T_SNOW;
  const component = (sx, sy) => {
    const seen = new Uint8Array(W * H), stack = [idx(sx, sy)];
    seen[stack[0]] = 1;
    while (stack.length) {
      const c = stack.pop(), cx = c % W, cy = (c / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = idx(nx, ny);
        if (!seen[ni] && !blocked(terrain[ni])) { seen[ni] = 1; stack.push(ni); }
      }
    }
    return seen;
  };
  const clearPatch = (x, y, s) => { // can a hall (9x9 clear patch) stand here? Pure ground check, connectivity comes later
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const xx = x + i, yy = y + j;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || !isLand(terrain[idx(xx, yy)])) return false;
    }
    return true;
  };

  // Start positions: shuffled anchors (corners, with the middle kept for the fifth house), jittered; each gets a livable 9x9 patch.
  const fx = (f) => Math.round(W * f), fy = (f) => Math.round(H * f);
  const anchors = r.shuffle([[fx(0.14), fy(0.14)], [fx(0.84), fy(0.84)], [fx(0.84), fy(0.14)], [fx(0.14), fy(0.84)]]);
  anchors.push([Math.floor(W / 2) - 4, Math.floor(H / 2) - 4]);
  if (r() < 0.4) { const j = r.int(0, 3); [anchors[j], anchors[4]] = [anchors[4], anchors[j]]; }
  const starts = [];
  for (const [ax, ay] of anchors.slice(0, Math.max(3, houses))) {
    const cx = ax + r.int(-6, 6), cy = ay + r.int(-6, 6);
    let found = null;
    for (let rad = 0; rad < 40 && !found; rad++) {
      for (let dy = -rad; dy <= rad && !found; dy++) for (let dx = -rad; dx <= rad && !found; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        const x = cx + dx, y = cy + dy;
        if (x >= 6 && y >= 6 && x <= W - 15 && y <= H - 15 && clearPatch(x - 3, y - 3, 9)) found = [x, y];
      }
    }
    const [hx, hy] = found || [cx, cy];
    for (let y = hy - 9; y <= hy + 11; y++) for (let x = hx - 9; x <= hx + 11; x++) {
      if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
      const t = terrain[idx(x, y)], d = Math.hypot(x - hx - 1, y - hy - 1);
      if (d < 9 && (t === T_ROCK || t === T_SAND || t === T_SNOW)) terrain[idx(x, y)] = biomeKey === 'winter' || d > 5.5 ? T_DRY : T_GRASS;
    }
    starts.push([hx, hy]);
  }
  // Every hall must reach every other: any start cut off by rock or water gets a trail (rock to dirt, water to ford)
  for (let i = 1; i < starts.length; i++) {
    const reach = component(starts[0][0], starts[0][1]);
    if (reach[idx(starts[i][0], starts[i][1])]) continue;
    const [x0, y0] = starts[i], [x1, y1] = starts[0], steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 0; s <= steps; s++) for (let k = 0; k < 2; k++) {
      const x = Math.round(x0 + ((x1 - x0) * s) / steps) + k, y = Math.round(y0 + ((y1 - y0) * s) / steps);
      const t = terrain[idx(x, y)];
      if (t === T_ROCK) terrain[idx(x, y)] = T_DIRT; else if (t === T_WATER) terrain[idx(x, y)] = T_FORD;
    }
  }
  // Main connected region: the one holding the first hall (all halls are in it now)
  const mainSet = component(starts[0][0], starts[0][1]);
  const inMain = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mainSet[idx(x, y)] === 1;
  const open = (x, y, s) => {
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const xx = x + i, yy = y + j;
      if (!inMain(xx, yy) || !isLand(terrain[idx(xx, yy)]) || terrain[idx(xx, yy)] === T_FORD) return false;
    }
    return true;
  };

  // Resource bookkeeping
  const resAt = new Int32Array(W * H).fill(-1);
  const resources = [];
  const reserved = new Uint8Array(W * H);
  for (const [sx, sy] of starts) for (let y = sy - 3; y <= sy + 5; y++) for (let x = sx - 3; x <= sx + 5; x++) if (x >= 0 && y >= 0 && x < W && y < H) reserved[idx(x, y)] = 1;

  const addNode = (kind, x, y, amount) => {
    const t = x >= 0 && y >= 0 && x < W && y < H ? terrain[idx(x, y)] : T_WATER;
    if (!inMain(x, y) || !isLand(t) || t === T_FORD || resAt[idx(x, y)] !== -1 || reserved[idx(x, y)]) return false;
    resAt[idx(x, y)] = resources.length;
    const node = { id: resources.length, kind, x, y, amount, max: amount };
    if (kind === 'tree') node.v = t === T_SNOW ? 'pine' : t === T_SAND ? 'palm' : 'oak';
    resources.push(node);
    return true;
  };
  const cluster = (kind, cx, cy, count, spread, amt) => {
    let placed = 0;
    for (let k = 0; k < count * 8 && placed < count; k++) {
      const x = Math.round(cx + (r() + r() + r() - 1.5) * spread), y = Math.round(cy + (r() + r() + r() - 1.5) * spread);
      if (addNode(kind, x, y, amt())) placed++;
    }
    return placed;
  };
  const treeAmt = () => 90 + r.int(0, 50), goldAmt = () => 380 + r.int(0, 260), berryAmt = () => 120 + r.int(0, 80);

  // Starter resources: each hall has timber, berries and a mine within reach, but they are not on top of it.
  starts.forEach(([sx, sy], i) => {
    const base = r() * Math.PI * 2;
    const place = (kind, dist, n, spread, amt, ang) => {
      for (let tries = 0; tries < 16; tries++) {
        const a = ang + tries * 0.4;
        const px = Math.round(sx + 1 + Math.cos(a) * dist), py = Math.round(sy + 1 + Math.sin(a) * dist);
        if (cluster(kind, px, py, n, spread, amt) >= Math.ceil(n / 2)) return;
      }
    };
    place('tree', 8, 9, 3.2, treeAmt, base);
    place('berry', 7, 5, 1.6, berryAmt, base + 2.1);
    place('gold', 12, 3, 1.6, goldAmt, base + 4.2);
    place('tree', 13, 11, 3.6, treeAmt, base + 1.0);
  });

  // Wilderness: stands of timber, bush patches, seams of gold
  for (let i = 0; i < Math.round(46 * biome.trees * AREA_MUL); i++) cluster('tree', r.int(4, W - 5), r.int(4, H - 5), r.int(6, 14), 3.4, treeAmt);
  for (let i = 0; i < Math.round(12 * AREA_MUL); i++) cluster('berry', r.int(4, W - 5), r.int(4, H - 5), r.int(3, 5), 1.8, berryAmt);
  for (let i = 0; i < 16; i++) cluster('gold', r.int(4, W - 5), r.int(4, H - 5), r.int(1, 3), 1.6, goldAmt);

  // Villages in the gaps
  const spots = [];
  const kinds = r.shuffle(Object.keys(VILLAGE_KINDS).concat(Object.keys(VILLAGE_KINDS)).concat(['hamlet', 'mine']));
  const want = Math.round(26 * AREA_MUL);   // same frequency per tile as before
  for (let tries = 0; tries < 2600 * AREA_MUL * 2 && spots.length < want; tries++) {
    const x = r.int(8, W - 12), y = r.int(8, H - 12);
    if (!open(x - 1, y - 1, VILLAGE_SIZE + 2)) continue;
    let blocked = false;
    for (let j = -1; j <= VILLAGE_SIZE && !blocked; j++) for (let i = -1; i <= VILLAGE_SIZE; i++) if (resAt[idx(x + i, y + j)] !== -1) { blocked = true; break; }
    if (blocked) continue;
    if (starts.some(([sx, sy]) => (x - sx) ** 2 + (y - sy) ** 2 < 25 * 25)) continue;
    if (spots.some(([vx, vy]) => (x - vx) ** 2 + (y - vy) ** 2 < 12 * 12)) continue;
    spots.push([x, y]);
  }
  const used = {};
  let mineCamps = 0, campOre = 0;
  const villages = spots.map(([x, y], i) => {
    const kind = kinds[i % kinds.length];
    const list = VILLAGE_NAMES[kind];
    used[kind] = (used[kind] || 0);
    const name = list[used[kind]++ % list.length];
    // a village keeps a few fields/seams close to its walls
    if (kind === 'mine' && (mineCamps++ % Math.round(AREA_MUL)) === 0) cluster('gold', x + 1, y + 1, 3, 3.2, goldAmt);   // ore stays as scarce as on the small board
    if (kind === 'hamlet') cluster('berry', x + 1, y + 1, 3, 3.5, berryAmt);
    return { kind, name, tx: x, ty: y };
  });

  // Mineral deposits. Own RNG stream so older layouts keep their trees, gold and villages.
  // Every hall has stone close by and two of the four metals; the others must be found in the wild or traded for.
  const rm = rng((seed ^ 0x9e3779b9) >>> 0);
  const inVillage = (x, y) => villages.some((v) => x >= v.tx - 1 && x <= v.tx + VILLAGE_SIZE && y >= v.ty - 1 && y <= v.ty + VILLAGE_SIZE);
  const metals = ['copper', 'iron', 'coal', 'silver'];
  const mineAmt = (kind) => (kind === 'silver' ? 320 : 480) + rm.int(0, 260);
  const deposit = (kind, cx, cy, count, spread) => {
    let placed = 0;
    for (let k = 0; k < count * 10 && placed < count; k++) {
      const x = Math.round(cx + (rm() + rm() - 1) * spread), y = Math.round(cy + (rm() + rm() - 1) * spread);
      if (inVillage(x, y)) continue;
      if (addNode(kind, x, y, mineAmt(kind))) placed++;
    }
    return placed;
  };
  const near = (kind, sx, sy, dist, n, base) => {
    for (let tries = 0; tries < 24; tries++) {
      const a = base + tries * 0.45, px = Math.round(sx + 1 + Math.cos(a) * dist), py = Math.round(sy + 1 + Math.sin(a) * (dist * 0.9));
      if (deposit(kind, px, py, n, 1.7) >= 2) return;
    }
  };
  starts.forEach(([sx, sy], i) => {
    const base = rm() * Math.PI * 2;
    near('stone', sx, sy, 10, 4, base);
    near(metals[i % 4], sx, sy, 14, 3, base + 2.2);
    near(metals[(i + 1) % 4], sx, sy, 16, 3, base + 4.2);
  });
  for (const kind of MATS) for (let i = 0; i < (kind === 'stone' ? 5 : 4); i++) deposit(kind, rm.int(6, W - 7), rm.int(6, H - 7), 3, 2);
  villages.forEach((v) => { if (v.kind === 'mine' && (campOre++ % Math.round(AREA_MUL)) === 0) { deposit(rm.pick(['iron', 'coal', 'copper', 'silver']), v.tx + 1, v.ty + 1, 3, 4.5); deposit('stone', v.tx + 1, v.ty + 1, 2, 4.5); } });

  // Dirt trails between halls and nearby villages (cosmetic, slightly faster to walk)
  const line = (x0, y0, x1, y1) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    let jx = 0, jy = 0;
    for (let s = 0; s <= steps; s++) {
      if (s % 7 === 0) { jx = r.int(-1, 1); jy = r.int(-1, 1); }
      const x = Math.round(x0 + ((x1 - x0) * s) / steps) + jx, y = Math.round(y0 + ((y1 - y0) * s) / steps) + jy;
      if (x >= 0 && y >= 0 && x < W && y < H && isLand(terrain[idx(x, y)]) && terrain[idx(x, y)] !== T_FORD && resAt[idx(x, y)] === -1) terrain[idx(x, y)] = T_DIRT;
    }
  };
  starts.forEach(([sx, sy]) => {
    const near = [...villages].sort((a, b) => (a.tx - sx) ** 2 + (a.ty - sy) ** 2 - ((b.tx - sx) ** 2 + (b.ty - sy) ** 2)).slice(0, 2);
    near.forEach((v) => line(sx + 1, sy + 3, v.tx + 1, v.ty + 1));
  });

  return { w: W, h: H, seed, terrain, resources, resAt, starts, villages, fords, biome: biomeKey, biomeLabel: biome.label };
}
