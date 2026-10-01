// Seven Holds - valley generation. Pure data, seeded, no DOM.
// Guarantees: every start, village and resource node lies in ONE connected walkable region (the river has fords).

import { MAP_W, MAP_H, T_GRASS, T_DIRT, T_WATER, T_FORD, VILLAGE_KINDS, VILLAGE_SIZE, VILLAGE_NAMES, MATS } from './config.js';

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

  // Ponds, marsh shallows
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbm(x / 17, y / 17, ns) * 0.65 + fbm(x / 7, y / 7, ns + 9) * 0.35;
      if (n < 0.255) terrain[idx(x, y)] = T_WATER;
      else if (n < 0.31) terrain[idx(x, y)] = T_DIRT;
    }
  }

  // River with fords
  const riverTiles = [];
  let rx = Math.floor(W * (0.4 + r() * 0.2));
  for (let y = 0; y < H; y++) {
    for (let k = -1; k <= 1; k++) {
      const xx = rx + k;
      if (xx >= 0 && xx < W) { terrain[idx(xx, y)] = T_WATER; riverTiles.push([xx, y]); }
    }
    rx = Math.max(10, Math.min(W - 11, rx + r.int(-1, 1)));
  }
  const fords = [0.18, 0.5, 0.82].map((f) => Math.floor(H * f + r.int(-5, 5)));
  for (const [x, y] of riverTiles) if (fords.some((fy) => Math.abs(y - fy) <= 1)) terrain[idx(x, y)] = T_FORD;
  // Clear a margin of water at the very map edge so edge pans never show a lake
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (terrain[idx(x, y)] === T_WATER && (x < 2 || y < 2 || x >= W - 2 || y >= H - 2)) terrain[idx(x, y)] = T_GRASS;

  // Main connected region
  const comp = new Int16Array(W * H).fill(-1);
  const sizes = [];
  for (let s = 0; s < W * H; s++) {
    if (comp[s] !== -1 || terrain[s] === T_WATER) continue;
    const id = sizes.length;
    let count = 0;
    const stack = [s];
    comp[s] = id;
    while (stack.length) {
      const c = stack.pop();
      count++;
      const cx = c % W, cy = (c / W) | 0;
      if (cx > 0 && comp[c - 1] === -1 && terrain[c - 1] !== T_WATER) { comp[c - 1] = id; stack.push(c - 1); }
      if (cx < W - 1 && comp[c + 1] === -1 && terrain[c + 1] !== T_WATER) { comp[c + 1] = id; stack.push(c + 1); }
      if (cy > 0 && comp[c - W] === -1 && terrain[c - W] !== T_WATER) { comp[c - W] = id; stack.push(c - W); }
      if (cy < H - 1 && comp[c + W] === -1 && terrain[c + W] !== T_WATER) { comp[c + W] = id; stack.push(c + W); }
    }
    sizes.push(count);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  const inMain = (x, y) => x >= 0 && y >= 0 && x < W && y < H && comp[idx(x, y)] === main;
  const open = (x, y, s) => {
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const xx = x + i, yy = y + j;
      if (!inMain(xx, yy) || terrain[idx(xx, yy)] !== T_GRASS && terrain[idx(xx, yy)] !== T_DIRT) return false;
    }
    return true;
  };

  // Start positions: spread corners, centre last. Hall is 3x3, we want a 9x9 clear patch.
  const corners = [[13, 13], [W - 22, H - 22], [W - 22, 13], [13, H - 22], [Math.floor(W / 2) - 4, Math.floor(H / 2) - 4]];
  const starts = [];
  for (const [cx, cy] of corners.slice(0, Math.max(3, houses))) {
    let found = null;
    for (let rad = 0; rad < 24 && !found; rad++) {
      for (let dy = -rad; dy <= rad && !found; dy++) for (let dx = -rad; dx <= rad && !found; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        const x = cx + dx, y = cy + dy;
        if (x >= 6 && y >= 6 && x <= W - 15 && y <= H - 15 && open(x - 3, y - 3, 9)) found = [x, y];
      }
    }
    starts.push(found || [cx, cy]);
  }

  // Resource bookkeeping
  const resAt = new Int32Array(W * H).fill(-1);
  const resources = [];
  const reserved = new Uint8Array(W * H);
  for (const [sx, sy] of starts) for (let y = sy - 3; y <= sy + 5; y++) for (let x = sx - 3; x <= sx + 5; x++) if (x >= 0 && y >= 0 && x < W && y < H) reserved[idx(x, y)] = 1;

  const addNode = (kind, x, y, amount) => {
    if (!inMain(x, y) || terrain[idx(x, y)] !== T_GRASS || resAt[idx(x, y)] !== -1 || reserved[idx(x, y)]) return false;
    resAt[idx(x, y)] = resources.length;
    resources.push({ id: resources.length, kind, x, y, amount, max: amount });
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
  for (let i = 0; i < 46; i++) cluster('tree', r.int(4, W - 5), r.int(4, H - 5), r.int(6, 14), 3.4, treeAmt);
  for (let i = 0; i < 12; i++) cluster('berry', r.int(4, W - 5), r.int(4, H - 5), r.int(3, 5), 1.8, berryAmt);
  for (let i = 0; i < 16; i++) cluster('gold', r.int(4, W - 5), r.int(4, H - 5), r.int(1, 3), 1.6, goldAmt);

  // Villages in the gaps
  const spots = [];
  const kinds = r.shuffle(Object.keys(VILLAGE_KINDS).concat(Object.keys(VILLAGE_KINDS)).concat(['hamlet', 'mine']));
  const want = 14;
  for (let tries = 0; tries < 900 && spots.length < want; tries++) {
    const x = r.int(8, W - 12), y = r.int(8, H - 12);
    if (!open(x - 1, y - 1, VILLAGE_SIZE + 2)) continue;
    let blocked = false;
    for (let j = -1; j <= VILLAGE_SIZE && !blocked; j++) for (let i = -1; i <= VILLAGE_SIZE; i++) if (resAt[idx(x + i, y + j)] !== -1) { blocked = true; break; }
    if (blocked) continue;
    if (starts.some(([sx, sy]) => (x - sx) ** 2 + (y - sy) ** 2 < 25 * 25)) continue;
    if (spots.some(([vx, vy]) => (x - vx) ** 2 + (y - vy) ** 2 < 15 * 15)) continue;
    spots.push([x, y]);
  }
  const used = {};
  const villages = spots.map(([x, y], i) => {
    const kind = kinds[i % kinds.length];
    const list = VILLAGE_NAMES[kind];
    used[kind] = (used[kind] || 0);
    const name = list[used[kind]++ % list.length];
    // a village keeps a few fields/seams close to its walls
    if (kind === 'mine') cluster('gold', x + 1, y + 1, 3, 3.2, goldAmt);
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
  villages.forEach((v) => { if (v.kind === 'mine') { deposit(rm.pick(['iron', 'coal', 'copper', 'silver']), v.tx + 1, v.ty + 1, 3, 4.5); deposit('stone', v.tx + 1, v.ty + 1, 2, 4.5); } });

  // Dirt trails between halls and nearby villages (cosmetic, slightly faster to walk)
  const line = (x0, y0, x1, y1) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    let jx = 0, jy = 0;
    for (let s = 0; s <= steps; s++) {
      if (s % 7 === 0) { jx = r.int(-1, 1); jy = r.int(-1, 1); }
      const x = Math.round(x0 + ((x1 - x0) * s) / steps) + jx, y = Math.round(y0 + ((y1 - y0) * s) / steps) + jy;
      if (x >= 0 && y >= 0 && x < W && y < H && terrain[idx(x, y)] === T_GRASS && resAt[idx(x, y)] === -1) terrain[idx(x, y)] = T_DIRT;
    }
  };
  starts.forEach(([sx, sy]) => {
    const near = [...villages].sort((a, b) => (a.tx - sx) ** 2 + (a.ty - sy) ** 2 - ((b.tx - sx) ** 2 + (b.ty - sy) ** 2)).slice(0, 2);
    near.forEach((v) => line(sx + 1, sy + 3, v.tx + 1, v.ty + 1));
  });

  return { w: W, h: H, seed, terrain, resources, resAt, starts, villages, fords };
}
