// Auld World - the host-authoritative simulation. One Game object owns ALL state and ticks on dt.
// Clients never mutate it directly: they send intents through applyIntent() (see net.js) and read state to draw.
// No DOM access in this file, so it runs unchanged under Node for tests.

import {
  MAP_W, MAP_H, VISION_MUL, PLAYER, MIN_HOUSES, MAX_HOUSES, DEFAULT_HOUSES, HOUSES, T_DIRT, T_WATER, T_GRASS, T_FORD, T_ROCK, GROUND_COST, FARM_SOIL, POP_FOOD, POP_GROW, POP_HOUSING, SETTLE_FOOD, MILITIA, WANDER,
  WAGE, WAGE_FREE, BROKE, SELL, TAX, INCOME_SOURCES,
  RES_VALUE, NODE_RES, GATHER_RATE, CARRY_CAP, START_RES, UNITS, BUILDINGS, DROP_OFF, DROP_BONUS, HAUL, STORES, CONSUMERS, GUARD, RULE,
  INFLUENCE, LOYALTY_RATE, FREE_RATE, TOWN_RANGE, VILLAGE_SIZE, SUBMIT_LOYALTY, SPY_RATE, SPY_CATCH, VILLAGE_WIN_SHARE, VILLAGE_WIN_HOLD, LAND_LOYALTY, DIFFICULTY, WEALTH_HOLD, FORFEIT_AFTER, WAR_MIN,
  VILLAGE_KINDS, RELATIONS, DEFAULT_RELATION, RES, MATS, ALL_GOODS, MINE_RATE, MINE_MAX_WORKERS, SMELT, ARMS_STEEL, SCI_SILVER, SCIENCE, WARE_JOY, GOOD_LABEL,
  MINEABLE, CAMEL_CAP, ROUTE_STOPS, MARKET_RADIUS, DISTRICT, LINKS, SHELF_CAP, SHELF_RESERVE, SPY_FEE, PROCESSED,
  FOUND, HOME_POP, INFLUENCE_HOME, DRAFT, SACK, GARRISON, VILLAGE_GARRISON, BUILDERS, DRILL, LEVY, TAVERN_ROSTER, TAVERN_REFRESH, WANDERER_NAMES, TRAITS,
} from './config.js';
import { createMap } from './map.js';
import { makeUnit, makeBuilding, makeVillage, distTo, dist } from './entities.js';
import { updateAI } from './ai.js';
import { pickName, shortName, FOUNDED } from './names.js';

const SPIRAL = (() => {
  const a = [];
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) a.push([x, y]);
  a.sort((p, q) => p[0] ** 2 + p[1] ** 2 - (q[0] ** 2 + q[1] ** 2));
  return a;
})();

const SOLDIER = new Set(['footman', 'bowman', 'knight']);
export class Game {
  constructor(opts = {}) {
    this.events = [];
    this.sfxQ = []; this.sfxOn = false;   // the client turns this on; the headless sim never queues sounds
    this.reset(opts);
  }

  // ------------------------------------------------------------------ setup
  reset({ seed, houses = DEFAULT_HOUSES, fog = true, ai = true, diff = 'mid' } = {}) {
    this.diffKey = DIFFICULTY[diff] ? diff : 'mid'; this.diff = DIFFICULTY[this.diffKey];
    this.houses = Math.max(MIN_HOUSES, Math.min(MAX_HOUSES, houses));
    this.fogOn = fog;
    this.aiOn = ai;
    this.seed = seed ?? Math.floor(Math.random() * 1e9) + 1;
    { let a = (this.seed ^ 0x9e3779b9) >>> 0; this.rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; this.named = []; }
    const map = createMap(this.seed, this.houses);
    this.map = map;
    this.W = map.w;
    this.H = map.h;
    this.terrain = map.terrain;
    this.resources = map.resources;
    this.resAt = map.resAt;
    this.biome = map.biome;
    this.biomeLabel = map.biomeLabel;
    this.nextId = 1;
    this.time = 0;
    this.outcome = null;
    this.units = [];
    this.buildings = [];
    this.villages = [];
    this.wanderers = [];
    this.projectiles = [];
    this.floaters = []; this.fx = [];   // fx: collapse/poof effects for the renderer (only queued when a UI is attached)
    this.byId = new Map();
    this.alertT = new Array(this.houses).fill(-99);
    this.winHold = { team: -1, t: 0 }; this.richHold = { team: -1, t: 0 };
    this.visT = 0;
    this.events.length = 0;

    const n = this.houses;
    this.players = Array.from({ length: n }, (_, i) => ({
      team: i, name: HOUSES[i].name, ...START_RES, ...(i === PLAYER ? Object.fromEntries(Object.entries(START_RES).map(([k, v]) => [k, Math.round(v * this.diff.playerMul)])) : {}), alive: true, ai: i !== PLAYER, think: 0.8 + i * 0.55, arms: 0, sci: 0, armsT: 0, sciT: 0, offerT: 60 + i * 20, tradeEarned: 0, trips: 0,
      acc: {}, inc: {}, spent: 0, wageRate: 0, wageDebt: 0, brokeT: 0, deserterT: 0, earnedTotal: 0,
    }));
    this.known = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    this.offers = []; // pending treaty offers { from, to, state, t }
    this.snub = Array.from({ length: n }, () => Array(n).fill(-999)); // when a house last turned another's offer down
    this.rel = Array.from({ length: n }, () => Array(n).fill(DEFAULT_RELATION));
    this.relSince = Array.from({ length: n }, () => Array(n).fill(0));
    this.seen = Array.from({ length: n }, () => new Uint8Array(this.W * this.H));
    this.vis = Array.from({ length: n }, () => new Uint8Array(this.W * this.H));
    this.walk = new Uint8Array(this.W * this.H);
    this.block = new Uint8Array(this.W * this.H);

    // path finder scratch
    const N = this.W * this.H;
    this._g = new Float32Array(N);
    this._came = new Int32Array(N);
    this._stamp = new Uint32Array(N);
    this._closed = new Uint32Array(N);
    this._run = 0;

    map.villages.forEach((spec) => this.addVillage(spec));
    map.starts.slice(0, n).forEach(([sx, sy], team) => {
      // no hall: a house begins in its home village of thirty folk, with three serfs already at work
      const names = FOUNDED[HOUSES[team].faction] || FOUNDED.british;
      const v = this.addVillage({ kind: 'hamlet', name: names[0], tx: sx, ty: sy });
      v.owner = team; v.lean = team; v.home = team; v.founded = true; v.loyalty = FOUND.loyalty + 10;
      v.pop = HOME_POP; v.popMax = FOUND.max; v.stores = { food: 140, wood: 10, gold: 10 };
      v.protection = v.maxProtection = 320; v.hp = v.maxHp = 320;
      this.addUnit('serf', team, sx + 1.2, sy + 3.6);
      this.addUnit('serf', team, sx + 2.0, sy + 3.6);
      this.addUnit('serf', team, sx + 2.8, sy + 3.6);
    });
    this.recomputeWalk();
    this.updateVisibility(true);
    this.log(PLAYER, `${this.biomeLabel}. Your home village of thirty folk, three serfs and a starting purse: draft more serfs, raise a mine, a market and a keep, then claim the villages around you.`, 'info');
  }

  nid() { return this.nextId++; }
  log(team, text, kind = 'info') {
    // the same line twice within a few seconds is one line (orders re-issued every tick would otherwise flood the feed)
    this._lastLog ||= new Map();
    const last = this._lastLog.get(text);
    if (last !== undefined && this.time - last < 6) return;
    this._lastLog.set(text, this.time);
    this.events.push({ t: this.time, team, text, kind });
  }

  addUnit(kind, team, x, y) {
    const u = makeUnit(this.nid(), kind, team, x, y);
    { const set = (this.named[team] ||= new Set()); u.name = pickName(HOUSES[team]?.faction, set, this.rnd); set.add(u.name); }
    if ((this.players?.[team]?.sci || 0) >= 3) { u.maxHp = Math.round(u.maxHp * 1.15); u.hp = u.maxHp; } // Drill
    this.units.push(u);
    this.byId.set(u.id, u);
    return u;
  }
  addBuilding(kind, team, tx, ty, built) {
    const b = makeBuilding(this.nid(), kind, team, tx, ty, built);
    if (kind !== 'village') { const tv = this.townOf(b); if (tv) b.town = tv.id; }   // raised beside a village: part of that town
    this.buildings.push(b);
    this.byId.set(b.id, b);
    return b;
  }
  addVillage(spec) {
    const v = makeVillage(this.nid(), spec);
    this.villages.push(v);
    this.byId.set(v.id, v);
    return v;
  }

  recomputeWalk() {
    const { W, H, terrain, block, walk } = this;
    block.fill(0);
    const mark = (e) => {
      for (let y = e.ty; y < e.ty + e.size; y++) for (let x = e.tx; x < e.tx + e.size; x++) if (x >= 0 && y >= 0 && x < W && y < H) block[y * W + x] = 1;
    };
    for (const b of this.buildings) if (b.hp > 0) mark(b);
    for (const v of this.villages) mark(v);
    for (let i = 0; i < W * H; i++) walk[i] = terrain[i] !== T_WATER && terrain[i] !== T_ROCK && !block[i] ? 1 : 0;
  }

  // ------------------------------------------------------------------ queries
  alive(team) { return this.players[team]?.alive; }
  isEnemy(a, b) { return a !== b && b >= 0 && this.rel[a][b] === 'war'; }
  hasBuilding(team, kind) { return this.buildings.some((b) => b.team === team && b.kind === kind && b.built >= 1 && b.hp > 0); }
  popUsed(team) {
    let n = 0;
    for (const u of this.units) if (u.team === team && u.hp > 0) n++;
    for (const b of this.buildings) if (b.team === team) n += b.queue.length;
    return n;
  }
  popCap(team) {
    let n = 0;
    for (const b of this.buildings) if (b.team === team && b.built >= 1 && b.hp > 0) n += BUILDINGS[b.kind].pop;
    for (const v of this.villages) if (v.owner === team) n += Math.floor(Math.max(v.pop, v.home >= 0 ? HOME_POP : 0.3 * (v.popMax || 50)) * POP_HOUSING);   // folk of held villages are housed there
    return n;
  }
  canAfford(team, cost) {
    const p = this.players[team];
    for (const k in cost) if (cost[k] && (p[k] || 0) < cost[k]) return false;
    return true;
  }
  pay(team, cost, sign = 1) {
    const p = this.players[team];
    for (const k in cost) if (cost[k]) p[k] -= cost[k] * sign;
  }
  // the seat of a house: its home village while it holds it, else a keep, else any village it holds
  seatOf(team) {
    return this.villages.find((v) => v.home === team && v.owner === team)
      || this.buildings.find((b) => b.team === team && b.kind === 'keep' && b.hp > 0)
      || this.villages.find((v) => v.owner === team);
  }
  villagesOf(team) { return this.villages.filter((v) => v.owner === team); }
  militaryOf(team) { return this.units.filter((u) => u.team === team && u.hp > 0 && u.kind !== 'serf' && u.kind !== 'scholar' && u.kind !== 'spy' && u.kind !== 'camel' && !u.inside); }
  canSee(team, x, y) {
    if (!this.fogOn) return true;
    const tx = Math.floor(x), ty = Math.floor(y);
    return tx >= 0 && ty >= 0 && tx < this.W && ty < this.H && this.vis[team][ty * this.W + tx] === 1;
  }
  wasSeen(team, x, y) {
    if (!this.fogOn) return true;
    const tx = Math.floor(x), ty = Math.floor(y);
    return tx >= 0 && ty >= 0 && tx < this.W && ty < this.H && this.seen[team][ty * this.W + tx] === 1;
  }

  unitAt(x, y, r = 0.7, team = null) {
    let best = null, bd = r;
    for (const u of this.units) {
      if (u.hp <= 0 || u.inside || (team !== null && u.team !== team)) continue;
      const d = Math.hypot(u.x - x, u.y - (y + 0.15));
      if (d < bd) { best = u; bd = d; }
    }
    return best;
  }
  buildingAt(x, y) {
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i];
      if (b.hp > 0 && x >= b.tx && x < b.tx + b.size && y >= b.ty && y < b.ty + b.size) return b;
    }
    return null;
  }
  villageAt(x, y) {
    return this.villages.find((v) => x >= v.tx && x < v.tx + v.size && y >= v.ty && y < v.ty + v.size) || null;
  }
  nodeAt(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    let best = null, bd = 1.3;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const xx = tx + i, yy = ty + j;
      if (xx < 0 || yy < 0 || xx >= this.W || yy >= this.H) continue;
      const k = this.resAt[yy * this.W + xx];
      if (k < 0) continue;
      const n = this.resources[k];
      if (n.amount <= 0) continue;
      const d = Math.hypot(n.x + 0.5 - x, n.y + 0.5 - y);
      if (d < bd) { best = n; bd = d; }
    }
    return best;
  }
  // is this ground ruled by the house? (near one of its finished buildings or a village it holds)
  ruled(team, x, y) {
    for (const b of this.buildings) {
      if (b.team !== team || b.hp <= 0 || b.built < 1) continue;
      if (Math.hypot(b.x - x, b.y - y) <= (RULE[b.kind] ?? RULE.default)) return true;
    }
    for (const v of this.villages) if (v.owner === team && Math.hypot(v.x - x, v.y - y) <= RULE.village) return true;
    return false;
  }
  nearestNode(x, y, res, maxDist = 1e9, team = null) {
    let best = null, bd = maxDist * maxDist;
    for (const n of this.resources) {
      if (n.amount <= 0 || n.covered || NODE_RES[n.kind] !== res) continue;
      if (team !== null && !this.ruled(team, n.x + 0.5, n.y + 0.5)) continue;
      const d = (n.x + 0.5 - x) ** 2 + (n.y + 0.5 - y) ** 2;
      if (d < bd) { best = n; bd = d; }
    }
    return best;
  }
  nearestDrop(u, res) {
    let best = null, bd = 1e9;
    for (const b of this.buildings) {
      if (b.team !== u.team || b.hp <= 0 || b.built < 1) continue;
      if (!DROP_OFF[b.kind] || !DROP_OFF[b.kind].includes(res)) continue;
      const d = distTo(u.x, u.y, b);
      if (d < bd) { best = b; bd = d; }
    }
    if (res === 'food' || res === 'wood' || res === 'gold') for (const v of this.villages) {   // a village you hold takes goods too
      if (v.owner !== u.team) continue;
      const d = distTo(u.x, u.y, v);
      if (d < bd) { best = v; bd = d; }
    }
    return best;
  }
  closestEnemy(from, range, team) {
    let best = null, bd = range;
    for (const u of this.units) {
      if (u.hp <= 0 || u.inside || !this.isEnemy(team, u.team)) continue;
      const d = Math.hypot(u.x - from.x, u.y - from.y);
      if (d < bd) { best = u; bd = d; }
    }
    for (const b of this.buildings) {
      if (b.hp <= 0 || !this.isEnemy(team, b.team)) continue;
      const d = distTo(from.x, from.y, b) + 1.5; // prefer people over walls
      if (d < bd) { best = b; bd = d; }
    }
    return best;
  }

  // ------------------------------------------------------------------ path finding (A*)
  nearestWalkable(tx, ty, maxR = 8, px = null, py = null) {
    const { W, H, walk } = this;
    if (tx >= 0 && ty >= 0 && tx < W && ty < H && walk[ty * W + tx]) return [tx, ty];
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = 1e9;
      for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
        if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r) continue;
        if (x < 0 || y < 0 || x >= W || y >= H || !walk[y * W + x]) continue;
        const d = px === null ? (x - tx) ** 2 + (y - ty) ** 2 : (x - px) ** 2 + (y - py) ** 2;
        if (d < bd) { best = [x, y]; bd = d; }
      }
      if (best) return best;
    }
    return null;
  }

  findPath(sx, sy, gx, gy) {
    const { W, H, walk } = this;
    sx = Math.max(0, Math.min(W - 1, sx)); sy = Math.max(0, Math.min(H - 1, sy));
    gx = Math.max(0, Math.min(W - 1, gx)); gy = Math.max(0, Math.min(H - 1, gy));
    if (!walk[sy * W + sx]) { const n = this.nearestWalkable(sx, sy, 6); if (!n) return null; [sx, sy] = n; }
    if (!walk[gy * W + gx]) { const n = this.nearestWalkable(gx, gy, 8, sx, sy); if (!n) return null; [gx, gy] = n; }
    if (sx === gx && sy === gy) return [];
    const run = ++this._run;
    const g = this._g, came = this._came, stamp = this._stamp, closed = this._closed;
    const terrain = this.terrain;
    const start = sy * W + sx, goal = gy * W + gx;
    const hx = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (dx + dy - 0.586 * Math.min(dx, dy)) * 0.85; };
    // binary heap of [f, node]
    const hf = [], hn = [];
    const push = (f, n) => {
      let i = hf.length; hf.push(f); hn.push(n);
      while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hn[i] = hn[p]; i = p; }
      hf[i] = f; hn[i] = n;
    };
    const pop = () => {
      const top = hn[0], lf = hf.pop(), ln = hn.pop();
      if (hf.length) {
        let i = 0; const n = hf.length;
        for (;;) {
          let c = i * 2 + 1; if (c >= n) break;
          if (c + 1 < n && hf[c + 1] < hf[c]) c++;
          if (hf[c] >= lf) break;
          hf[i] = hf[c]; hn[i] = hn[c]; i = c;
        }
        hf[i] = lf; hn[i] = ln;
      }
      return top;
    };
    g[start] = 0; stamp[start] = run; came[start] = -1;
    push(hx(sx, sy), start);
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
    while (hf.length) {
      const cur = pop();
      if (closed[cur] === run) continue;
      if (cur === goal) {
        const out = [];
        for (let c = cur; c !== -1; c = came[c]) out.push([(c % W) + 0.5, ((c / W) | 0) + 0.5]);
        out.reverse(); out.shift();
        return out;
      }
      closed[cur] = run;
      const cx = cur % W, cy = (cur / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], ny = cy + DY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (!walk[ni] || closed[ni] === run) continue;
        if (k >= 4 && (!walk[cy * W + nx] || !walk[ny * W + cx])) continue;
        const step = (k >= 4 ? 1.414 : 1) * GROUND_COST[terrain[ni]];
        const ng = g[cur] + step;
        if (stamp[ni] !== run || ng < g[ni]) {
          stamp[ni] = run; g[ni] = ng; came[ni] = cur;
          push(ng + hx(nx, ny), ni);
        }
      }
    }
    return null;
  }

  setPath(u, x, y) {
    const p = this.findPath(Math.floor(u.x), Math.floor(u.y), Math.floor(x), Math.floor(y));
    u.path = p ? (p.length ? p : [[x, y]]) : [];   // same tile: still walk to the exact point (edge-hugging units never arrive otherwise)
    u.pathGoal = [x, y];
    u.repathT = 0.9;
    return !!p;
  }
  // head toward the footprint of a building/village: goal is the free tile beside it, on the unit's side
  setPathToEntity(u, t) {
    if (!t.size) return this.setPath(u, t.x, t.y);
    // the free tiles around the footprint, nearest to the unit first; some may be sealed pockets, so take the first that can be reached
    const { W, H, walk } = this, cx = Math.floor(t.x), cy = Math.floor(t.y), R = Math.ceil(t.size / 2) + 3, ux = Math.floor(u.x), uy = Math.floor(u.y);
    const cands = [];
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || !walk[y * W + x]) continue;
      const edge = Math.max(Math.abs(x + 0.5 - t.x) - t.size / 2, Math.abs(y + 0.5 - t.y) - t.size / 2);
      cands.push([x, y, (distTo(x + 0.5, y + 0.5, t) > 1.2 ? 1e8 : 0) + Math.max(0, Math.ceil(edge - 0.01)) * 1e6 + (x - ux) ** 2 + (y - uy) ** 2]);   // tiles within working reach (1.35) come first
    }
    if (!cands.length) { const n = this.nearestWalkable(cx, cy, R, ux, uy); cands.push(n ? [n[0], n[1], 0] : null); if (!n) { u.path = []; return false; } }
    cands.sort((a, b) => a[2] - b[2]);
    for (let i = 0; i < Math.min(8, cands.length); i++) if (this.setPath(u, cands[i][0] + 0.5, cands[i][1] + 0.5)) return true;
    u.path = []; return false;
  }

  follow(u, dt) {
    if (!u.path.length) return false;
    let step = u.speed ?? UNITS[u.kind].speed;
    const tileIdx = Math.floor(u.y) * this.W + Math.floor(u.x);
    step *= (1 / GROUND_COST[this.terrain[tileIdx]]) * dt;
    while (step > 0 && u.path.length) {
      const [px, py] = u.path[0];
      const dx = px - u.x, dy = py - u.y, d = Math.hypot(dx, dy);
      if (d <= step) { u.x = px; u.y = py; u.path.shift(); step -= d; if (d > 0.001) u.face = dx >= 0 ? 1 : -1; }
      else { u.x += (dx / d) * step; u.y += (dy / d) * step; u.face = dx >= 0 ? 1 : -1; step = 0; }
    }
    return true;
  }

  // ------------------------------------------------------------------ intents (the network surface)
  applyIntent(it) {
    const team = it.team;
    if (this.outcome || !this.alive(team)) return null;
    const mine = () => (it.ids || []).map((id) => this.byId.get(id)).filter((u) => u && u.type === 'unit' && u.team === team && u.hp > 0);
    switch (it.type) {
      case 'move': return this.cmdMove(mine(), it.x, it.y);
      case 'stop': mine().forEach((u) => { u.route = null; u.task = { type: 'idle' }; u.path = []; }); return true;
      case 'route': return this.cmdRoute(mine(), this.byId.get(it.targetId), it.want);
      case 'stoproute': return this.stopRoute(mine());
      case 'draft': return this.draft(team, it.villageId, it.n || 1, it.role || 'serf') > 0;
      case 'sell': return this.sellGoods(team, it.marketId, it.good, it.amount) > 0;
      case 'attack':
      case 'pillage': return this.cmdAttack(mine(), this.byId.get(it.targetId));
      case 'infiltrate': return this.cmdInfiltrate(mine(), this.byId.get(it.villageId ?? it.targetId));
      case 'gather': return this.cmdGather(mine(), this.resources[it.nodeId]);
      case 'build': return this.cmdBuild(mine(), this.byId.get(it.buildingId), !!it.queue);
      case 'enter': return this.cmdEnter(mine(), this.byId.get(it.targetId));
      case 'leave': return this.leave(team, it.buildingId);
      case 'hire': return this.hire(team, it.buildingId, it.index);
      case 'levy': return this.setLevy(team, it.buildingId, it.villageId);
      case 'settle': return this.settle(team, it.villageId);
      case 'drill': return this.drill(team, it.buildingId, it.unitId, it.kind);
      case 'place': return this.place(team, it.kind, it.tx, it.ty, it.ids, it.nodeId ?? null);
      case 'mine': return this.cmdMine(mine(), this.byId.get(it.buildingId));
      case 'unmine': return this.unassignMine(team, it.buildingId);
      case 'respond': return this.respondOffer(team, it.from, !!it.accept);
      case 'train': return this.train(team, it.buildingId, it.kind);
      case 'cancel': return this.cancelTrain(team, it.buildingId, it.index);
      case 'rally': return this.setRally(team, it.buildingId, it.x, it.y, it.nodeId);
      case 'load': return this.load(team, it.unitId, it.good, it.amount);
      case 'unload': return this.unloadShelf(team, it.unitId);
      case 'role': return this.assignRole(team, it.ids, it.role);
      case 'relation': return this.proposeRelation(team, it.other, it.state);
      case 'context': return this.contextCommand(team, it.ids, it.x, it.y, !!it.queue, it.want);
      default: return null;
    }
  }

  // Right-click: decide what the point means for these units (as the owning player sees it)
  contextCommand(team, ids, x, y, queue = false, want = null) {
    const all = (ids || []).map((id) => this.byId.get(id)).filter((u) => u && u.type === 'unit' && u.team === team && u.hp > 0);
    if (!all.length) return false;
    // camels trade: right-click a market or village; anywhere else they just walk
    const camels = all.filter((u) => u.kind === 'camel'), units = all.filter((u) => u.kind !== 'camel');
    if (camels.length) {
      const tgt = this.tradeTargetAt(team, x, y);
      if (tgt) this.cmdRoute(camels, tgt, want); else { camels.forEach((c) => { c.route = null; }); this.cmdMove(camels, x, y); }
      if (!units.length) return true;
    }
    const eu = this.unitAt(x, y, 0.75);
    if (eu && eu.team !== team && this.canSee(team, eu.x, eu.y)) return this.cmdAttack(units, eu);
    const v = this.villageAt(x, y);
    if (v && v.owner === team) {
      const carriers = units.filter((u) => u.kind === 'serf' && u.carry && ['food', 'wood', 'gold'].includes(u.carry.kind));
      carriers.forEach((u) => { u.task = { type: 'return', resume: null }; this.setPathToEntity(u, v); });
      const rest = units.filter((u) => !carriers.includes(u));
      return rest.length ? this.cmdEnter(rest, v) : true;
    }
    if (v && v.owner !== team && this.wasSeen(team, v.x, v.y)) {
      const spies = units.filter((u) => u.kind === 'spy'), rest = units.filter((u) => u.kind !== 'spy' && u.kind !== 'serf' && u.kind !== 'scholar');
      if (spies.length) this.cmdInfiltrate(spies, v);
      if (rest.length) this.cmdAttack(rest, v);
      const others = units.filter((u) => u.kind === 'serf' || u.kind === 'scholar');
      if (others.length) this.cmdMove(others, x, y);
      return true;
    }
    const b = this.buildingAt(x, y);
    if (b && b.team !== team && this.wasSeen(team, b.x, b.y)) return this.cmdAttack(units, b);
    if (b && b.team === team && b.built < 1) {
      const serfs = units.filter((u) => BUILDERS[u.kind]);
      if (serfs.length) { this.cmdBuild(serfs, b, queue); const rest = units.filter((u) => !BUILDERS[u.kind]); if (rest.length) this.cmdMove(rest, x, y); return true; }
    }
    if (b && b.team === team && b.kind === 'mine') {
      const serfs = units.filter((u) => u.kind === 'serf');
      if (serfs.length) this.cmdMine(serfs, b);
      const rest = units.filter((u) => u.kind !== 'serf');
      if (rest.length) this.cmdMove(rest, x, y);
      return true;
    }
    if (b && b.team === team && b.built >= 1) {
      const carriers = units.filter((u) => u.kind === 'serf' && u.carry && DROP_OFF[b.kind]?.includes(u.carry.kind));
      if (carriers.length) carriers.forEach((u) => { u.task = { type: 'return', resume: null }; this.setPathToEntity(u, b); });
      const rest = units.filter((u) => !carriers.includes(u));
      if (rest.length && GARRISON[b.kind]) this.cmdEnter(rest, b);
      else if (rest.length) this.cmdMove(rest, x, y);
      return true;
    }
    const node = this.nodeAt(x, y);
    if (node && this.wasSeen(team, node.x, node.y)) {
      const serfs = units.filter((u) => u.kind === 'serf');
      if (serfs.length) this.cmdGather(serfs, node);
      const rest = units.filter((u) => u.kind !== 'serf');
      if (rest.length) this.cmdMove(rest, x, y);
      return true;
    }
    return this.cmdMove(units, x, y);
  }

  // ---- garrisons: right-click a friendly keep, tower, barracks or village to go inside --------------------
  garrisonCap(t) { return t.type === 'village' ? VILLAGE_GARRISON : (GARRISON[t.kind] || 0); }
  cmdEnter(units, t) {
    if (!t || t.hp <= 0 && t.type !== 'village') return false;
    const owner = t.type === 'village' ? t.owner : t.team;
    if (!units.length || units[0].team !== owner || (t.type === 'building' && t.built < 1) || !this.garrisonCap(t)) return false;
    let sent = 0;
    for (const u of units) {
      if (u.hp <= 0 || u.inside || u.kind === 'ram') continue;
      u.buildQ = [];
      u.task = { type: 'enter', targetId: t.id };
      this.setPathToEntity(u, t);
      sent++;
    }
    return sent > 0;
  }
  doEnter(u, dt) {
    const t = this.byId.get(u.task.targetId);
    if (!t || (t.type === 'building' && t.hp <= 0)) { u.task = { type: 'idle' }; return; }
    if (distTo(u.x, u.y, t) > 1.35) {
      if (!u.path.length || u.repathT <= 0) this.setPathToEntity(u, t);
      this.follow(u, dt);
      return;
    }
    if (t.garrison.length >= this.garrisonCap(t)) { u.task = { type: 'idle' }; u.path = []; if (u.team === PLAYER) this.log(PLAYER, `${t.type === 'village' ? t.name : BUILDINGS[t.kind].label} is full.`, 'warn'); return; }
    u.path = []; u.carry = null;
    u.inside = t.id; u.task = { type: 'idle' };
    t.garrison.push(u.id);
  }
  // inside a building: rest and heal, drills run in the keep's update
  tickInside(u, dt) {
    const t = this.byId.get(u.inside);
    if (!t || (t.type === 'building' && t.hp <= 0) || (t.type === 'village' && t.owner !== u.team)) { this.eject(u, t); return; }
    u.x = t.x; u.y = t.y;
    if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + 2 * dt);
  }
  eject(u, t) {
    u.inside = null; u.task = { type: 'idle' }; u.path = [];
    if (t) { t.garrison = t.garrison.filter((id) => id !== u.id); }
    const ref = t || u;
    const n = this.nearestWalkable(Math.floor(ref.x), Math.floor((ref.ty ?? ref.y) + (ref.size || 0) + 0.5), 8);
    if (n) { u.x = n[0] + 0.5 + (Math.random() - 0.5) * 0.4; u.y = n[1] + 0.5; }
  }
  leave(team, id) {
    const t = this.byId.get(id);
    if (!t || (t.type === 'building' ? t.team : t.owner) !== team) return false;
    const ids = t.garrison.slice();
    for (const uid of ids) { const u = this.byId.get(uid); if (u && !u.drilling) { this.eject(u, t); if (t.rally && t.type === 'building') this.cmdMove([u], t.rally.x, t.rally.y); } }
    return ids.length > 0;
  }
  ejectAll(t) { for (const uid of t.garrison.slice()) { const u = this.byId.get(uid); if (u) this.eject(u, t); } t.garrison = []; }

  // ---- tavern: random wanderers for hire; keep: levy villagers and drill soldiers ----------------------------
  rollWanderer() {
    const keys = Object.keys(TRAITS);
    const trait = keys[Math.floor(Math.random() * keys.length)], t = TRAITS[trait];
    const name = WANDERER_NAMES[Math.floor(Math.random() * WANDERER_NAMES.length)];
    return { name, trait, cost: { food: 15, wood: 0, gold: t.cost } };
  }
  newRoster() { return Array.from({ length: TAVERN_ROSTER }, () => this.rollWanderer()); }
  hire(team, buildingId, index) {
    const b = this.byId.get(buildingId), say = (m) => { if (team === PLAYER) this.log(team, m, 'warn'); return null; };
    if (!b || b.team !== team || b.kind !== 'tavern' || b.built < 1 || b.hp <= 0 || !b.roster?.[index]) return null;
    const w = b.roster[index];
    if (!this.canAfford(team, w.cost)) return say('Not enough goods to hire.');
    if (this.popUsed(team) + 1 > this.popCap(team)) return say('Population capped: raise cottages.');
    this.pay(team, w.cost);
    const u = this.addUnit('recruit', team, b.x + (Math.random() - 0.5) * 1.2, b.ty + b.size + 0.7);
    this.applyTrait(u, w.trait); u.name = w.name;
    b.roster[index] = this.rollWanderer();
    if (b.rally) this.cmdMove([u], b.rally.x, b.rally.y);
    if (team === PLAYER) this.log(team, `${w.name} the ${TRAITS[w.trait].label.toLowerCase()} joins your banner.`, 'good');
    return u;
  }
  applyTrait(u, trait) {
    const t = TRAITS[trait] || TRAITS.green, st = UNITS[u.kind];
    u.trait = trait; u.hpMul = t.hp; u.dmgAdd = t.dmg; u.spdAdd = t.spd;
    u.maxHp = Math.round(st.hp * t.hp); u.hp = u.maxHp; u.speed = st.speed + t.spd;
  }
  // a recruit may be sent out as a spy (for a fee); spies right-click villages to infiltrate and sway their loyalty
  assignRole(team, ids, role) {
    if (role !== 'spy') return false;
    let n = 0;
    for (const id of ids || []) {
      const u = this.byId.get(id);
      if (!u || u.team !== team || u.kind !== 'recruit' || u.hp <= 0) continue;
      const fee = { food: 0, wood: 0, gold: SPY_FEE };
      if (!this.canAfford(team, fee)) { if (team === PLAYER) this.log(team, `A spy costs ${SPY_FEE} coin.`, 'warn'); break; }
      this.pay(team, fee);
      const st = UNITS.spy, ratio = u.hp / u.maxHp;
      u.kind = 'spy'; u.maxHp = Math.round(st.hp * (u.hpMul || 1)); u.hp = Math.max(1, u.maxHp * ratio); u.speed = st.speed + (u.spdAdd || 0);
      if (u.inside) { const t = this.byId.get(u.inside); if (t) this.eject(u, t); }
      n++;
    }
    return n > 0;
  }
  // A family sets out for another village: they walk the roads, add their number on arrival and carry word of their lord.
  sendWanderers(v) {
    if (v.pop < WANDER.minPop && !(v.hunger && v.pop >= 3)) return;
    const cands = this.villages.filter((o) => o !== v && o.pop < o.popMax - 1 && Math.hypot(o.x - v.x, o.y - v.y) <= WANDER.range)
      .sort((a, b) => ((b.stores.food || 0) - Math.hypot(b.x - v.x, b.y - v.y) * 0.8) - ((a.stores.food || 0) - Math.hypot(a.x - v.x, a.y - v.y) * 0.8));
    const to = cands[Math.floor(Math.random() * Math.min(3, cands.length))];
    if (!to) return;
    const path = this.findPath(Math.floor(v.x), v.ty + v.size, Math.floor(to.x), to.ty + to.size);
    if (!path || !path.length) return;
    const n = v.pop >= 9 ? 2 : 1;
    v.pop -= n;
    this.wanderers.push({ id: this.nid(), from: v.id, to: to.id, n, team: v.owner, x: v.x, y: v.ty + v.size + 0.4, path, face: 1 });
  }
  updateWanderers(dt) {
    for (const w of this.wanderers) {
      let step = WANDER.speed * dt;
      while (step > 0 && w.path.length) {
        const [px, py] = w.path[0], dx = px - w.x, dy = py - w.y, d = Math.hypot(dx, dy);
        if (d <= step) { w.x = px; w.y = py; w.path.shift(); step -= d; if (d > 0.001) w.face = dx >= 0 ? 1 : -1; } else { w.x += (dx / d) * step; w.y += (dy / d) * step; w.face = dx >= 0 ? 1 : -1; step = 0; }
      }
      if (w.path.length) continue;
      w.done = true;
      const to = this.byId.get(w.to), from = this.byId.get(w.from);
      if (!to) continue;
      to.pop = Math.min(to.popMax, to.pop + w.n);
      if (w.team >= 0 && to.owner !== w.team && !this.isEnemy(w.team, to.owner)) {          // word of their lord spreads
        const old = (to.news || (to.news = [])).find((q) => q.team === w.team);
        if (old) old.t = WANDER.newsTime; else to.news.push({ team: w.team, amt: WANDER.newsPull, t: WANDER.newsTime });
      }
      if (to.owner >= 0 && w.team !== to.owner) to.loyalty = Math.max(0, to.loyalty - WANDER.unrest);   // strangers unsettle a held village
      const mine = [to.owner, w.team].includes(PLAYER);
      if (mine && from) this.log(PLAYER, `Folk of ${from.name} move to ${to.name}${w.team >= 0 && w.team !== to.owner ? `, speaking well of ${HOUSES[w.team].short}` : ''}.`, 'info');
    }
    this.wanderers = this.wanderers.filter((w) => !w.done);
  }

  // a village you hold sends one of its folk out as a serf (needs grain and a free place in your population)
  settle(team, villageId) {
    const v = this.byId.get(villageId), p = this.players[team], say = (m) => { if (team === PLAYER) this.log(team, m, 'warn'); return false; };
    if (!v || v.type !== 'village' || v.owner !== team) return say('Only a village you hold can send settlers.');
    if (v.pop < 4) return say(`${v.name} is too small to spare anyone.`);
    if (p.food < SETTLE_FOOD) return say(`Settlers need ${SETTLE_FOOD} grain for the road.`);
    if (this.popUsed(team) + 1 > this.popCap(team) + 0) return say('Population capped: raise cottages.');
    p.food -= SETTLE_FOOD; v.pop -= 1;
    const u = this.addUnit('serf', team, v.x - 0.5 + (Math.random() - 0.5), v.ty + v.size + 0.7);
    u.origin = v.name;
    if (team === PLAYER) this.log(team, `${shortName(u.name)} leaves ${v.name} as a settler (${Math.floor(v.pop)} folk remain).`, 'info');
    return true;
  }
  // a finished Village site turns into a living village of the house: a few settlers who grow to fifty
  foundVillage(b) {
    const team = b.team, list = FOUNDED[HOUSES[team].faction] || FOUNDED.british, used = new Set(this.villages.map((v) => v.name));
    const name = list.find((n) => !used.has(n)) || `${list[0]} ${this.villages.length}`;
    b.hp = 0; b.founded = true;
    const v = this.addVillage({ kind: 'hamlet', name, tx: b.tx, ty: b.ty });
    v.owner = team; v.lean = team; v.loyalty = FOUND.loyalty; v.founded = true;
    v.pop = FOUND.pop; v.popMax = FOUND.max; v.stores = { food: 70, wood: 10, gold: 10 };
    v.protection = v.maxProtection = 260; v.hp = v.maxHp = 260;
    if (team === PLAYER) this.log(PLAYER, `${name} is founded. Its folk will grow to ${FOUND.max}: draft them as serfs, miners or soldiers.`, 'good');
    return v;
  }
  // villagers leave a village you hold to work (serf), dig (mine) or fight (soldier)
  draft(team, villageId, n, role) {
    const v = this.byId.get(villageId), p = this.players[team], say = (m) => { if (team === PLAYER) this.log(team, m, 'warn'); return 0; };
    if (!v || v.type !== 'village' || v.owner !== team) return say('Only a village you hold can send its folk out.');
    n = Math.max(1, Math.min(n | 0 || 1, Math.floor(v.pop) - DRAFT.minLeft));
    if (Math.floor(v.pop) - DRAFT.minLeft < 1) return say(`${v.name} is too small to spare anyone.`);
    let mine = null;
    if (role === 'mine') {
      mine = this.buildings.filter((b) => b.team === team && b.kind === 'mine' && b.built >= 1 && b.hp > 0 && this.minersOf(b) < MINE_MAX_WORKERS)
        .sort((a, c) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(c.x - v.x, c.y - v.y))[0];
      if (!mine) return say('No mine of yours has a free place to dig.');
      n = Math.min(n, MINE_MAX_WORKERS - this.minersOf(mine));
    }
    const soldier = role === 'soldier', foodEach = soldier ? DRAFT.soldierFood : role === 'mine' ? DRAFT.mineFood : SETTLE_FOOD, goldEach = soldier && this.hasBuilding(team, 'barracks') ? UNITS.footman.cost.gold : 0;
    let made = 0;
    for (let i = 0; i < n; i++) {
      if (p.food < foodEach) { say(`The road needs ${foodEach} grain a head.`); break; }
      if (p.gold < goldEach) { say('Arms for a footman cost coin.'); break; }
      if (this.popUsed(team) + 1 > this.popCap(team) + 1) { say('Population capped: raise cottages.'); break; }
      p.food -= foodEach; p.gold -= goldEach; v.pop -= 1;
      const x = v.x - 1.2 + i * 0.7, y = v.ty + v.size + 0.7;
      const u = this.addUnit(soldier ? (goldEach ? 'footman' : 'recruit') : 'serf', team, x, y);
      u.origin = v.name; made++;
      if (mine) this.cmdMine([u], mine);
    }
    if (made && team === PLAYER) this.log(team, `${made} ${soldier ? 'men take up spears' : role === 'mine' ? 'miners leave' : 'settlers leave'} ${v.name} (${Math.floor(v.pop)} folk remain).`, 'info');
    return made;
  }
  // the spoils of a sack: most of the stores, and survivors who take service
  plunder(v, team) {
    const p = this.players[team], got = {};
    for (const k in v.stores) {
      const amt = Math.floor((v.stores[k] || 0) * SACK.stores);
      if (amt < 1) continue;
      v.stores[k] -= amt; got[k] = amt;
      if (k === 'gold') this.earn(team, 'loot', amt); else p[k] = (p[k] || 0) + amt;
    }
    const fort = v.kind === 'hillfort' || v.kind === 'inn';
    let ns = Math.floor(v.pop * (fort ? 0.4 : SACK.soldiers)), nw = Math.floor(v.pop * SACK.serfs);
    const room = Math.max(0, this.popCap(team) + 4 - this.popUsed(team));
    ns = Math.min(ns, room); nw = Math.min(nw, Math.max(0, room - ns));
    for (let i = 0; i < ns + nw; i++) {
      const u = this.addUnit(i < ns ? 'recruit' : 'serf', team, v.x - 1.5 + (i % 5) * 0.7, v.ty + v.size + 0.8 + Math.floor(i / 5) * 0.6);
      u.origin = v.name; v.pop -= 1;
    }
    const goods = Object.entries(got).filter(([, n]) => n >= 1).map(([k, n]) => `${n} ${GOOD_LABEL[k]?.toLowerCase() || k}`).join(', ');
    return { got, serfs: nw, soldiers: ns, text: `${goods ? `Spoils: ${goods}. ` : ''}${nw} serfs and ${ns} soldiers of ${v.name} take service.` };
  }
  setLevy(team, buildingId, villageId) {
    const b = this.byId.get(buildingId), v = this.byId.get(villageId);
    if (!b || b.team !== team || b.kind !== 'keep' || b.built < 1 || !v || v.type !== 'village' || v.owner !== team) {
      if (team === PLAYER) this.log(team, 'Only a keep can levy, and only from a village you hold.', 'warn');
      return false;
    }
    b.levy = v.id; b.levyT = 0;
    if (team === PLAYER) this.log(team, `${v.name} will send villagers to the keep.`, 'info');
    return true;
  }
  drill(team, buildingId, unitId, kind) {
    const b = this.byId.get(buildingId), u = this.byId.get(unitId), d = DRILL[kind], say = (m) => { if (team === PLAYER) this.log(team, m, 'warn'); return false; };
    if (!b || b.team !== team || b.kind !== 'keep' || b.built < 1 || !u || u.inside !== b.id || !d) return false;
    if (u.kind !== 'recruit' && u.kind !== 'serf') return say('Only recruits and serfs can be drilled.');
    if (u.drilling) return say('Already training.');
    if (b.drills.length >= 4) return say('The drill yard is full.');
    if (!this.canAfford(team, d.cost)) return say('Not enough goods to drill.');
    this.pay(team, d.cost);
    u.drilling = true; b.drills.push({ uid: u.id, kind, t: 0 });
    return true;
  }
  tickKeep(b, dt) {
    // drills
    if (b.drills.length) {
      const q = b.drills[0], u = this.byId.get(q.uid);
      if (!u || u.hp <= 0 || u.inside !== b.id) b.drills.shift();
      else {
        q.t += dt;
        if (q.t >= DRILL[q.kind].time) {
          b.drills.shift();
          const st = UNITS[q.kind], ratio = u.hp / u.maxHp, was = u.kind;
          u.kind = q.kind; u.drilling = false;
          u.maxHp = Math.round(st.hp * (u.hpMul || 1)); u.hp = Math.max(1, u.maxHp * ratio); u.speed = st.speed + (u.spdAdd || 0);
          if (b.team === PLAYER) this.log(PLAYER, `${u.name || (was === 'serf' ? 'A serf' : 'A recruit')} is drilled into a ${st.label.toLowerCase()}.`, 'good');
        }
      }
    }
    // levy: villagers walk in from the assigned village
    const v = b.levy != null ? this.byId.get(b.levy) : null;
    if (v && v.owner === b.team) {
      b.levyT = (b.levyT || 0) + dt;
      if (b.levyT >= LEVY.every) {
        const p = this.players[b.team];
        if (v.pop >= 1 && b.garrison.length < GARRISON.keep && p.food >= LEVY.food && this.popUsed(b.team) < this.popCap(b.team)) {
          b.levyT = 0; v.pop -= 1; p.food -= LEVY.food;
          const u = this.addUnit('recruit', b.team, b.x, b.y);
          u.origin = v.name; u.trait = 'green'; u.inside = b.id; b.garrison.push(u.id);
        } else if (v.pop < 1) b.levyT = LEVY.every; // wait for the village to regrow
      }
    } else if (b.levy != null) b.levy = null;
  }

  cmdMove(units, x, y) {
    units.forEach((u, i) => {
      const [ox, oy] = SPIRAL[Math.min(i, SPIRAL.length - 1)];
      u.task = { type: 'move' };
      this.setPath(u, x + ox * 0.9, y + oy * 0.9);
    });
    return true;
  }
  cmdAttack(units, target) {
    if (!target || !units.length) return false;
    const team = units[0].team;
    if (target.type === 'village') {
      if (target.owner === team) return false;
      if (target.owner >= 0 && this.rel[team][target.owner] !== 'war') this.setRelation(team, target.owner, 'war');
    } else if (target.team === team) return false;
    else if (this.rel[team][target.team] !== 'war') this.setRelation(team, target.team, 'war');
    for (const u of units) {
      if (u.kind === 'camel' || u.inside) continue;
      if (target.type === 'village' && (u.kind === 'serf' || u.kind === 'scholar')) continue;
      u.task = { type: 'attack', targetId: target.id };
      u.path = [];
      u.repathT = 0;
    }
    return true;
  }
  cmdInfiltrate(spies, v) {
    if (!v || v.type !== 'village') return false;
    for (const u of spies) {
      if (u.kind !== 'spy') continue;
      u.task = { type: 'infiltrate', targetId: v.id };
      this.setPathToEntity(u, v);
    }
    return true;
  }
  cmdGather(units, node) {
    if (!node || node.amount <= 0) return false;
    if (MINEABLE.includes(node.kind)) {
      const mine = this.buildings.find((b) => b.kind === 'mine' && b.hp > 0 && b.nodeIds?.includes(node.id));
      const t = units[0]?.team;
      if (mine) return mine.team === t ? this.cmdMine(units, mine) : false;
      if (node.kind !== 'gold') { // other ores need a mine; gold may also be gathered by hand
        if (t === PLAYER) this.log(t, `Raise a Mine on the ${GOOD_LABEL[node.kind].toLowerCase()} deposit, then assign serfs.`, 'warn');
        return false;
      }
    }
    const owner = units[0]?.team;
    if (owner !== undefined && !this.ruled(owner, node.x + 0.5, node.y + 0.5)) {
      if (owner === PLAYER) this.log(owner, 'Not your ground: raise a warehouse, keep or market beside it, or win a village near it, before serfs work there.', 'warn');
      return false;
    }
    for (const u of units) {
      if (u.kind !== 'serf') continue;
      const res = NODE_RES[node.kind];
      if (u.carry && u.carry.kind !== res) u.carry = null; // drop whatever else was in hand
      u.task = { type: 'gather', nodeId: node.id };
      this.setPath(u, node.x + 0.5, node.y + 0.5);
    }
    return true;
  }
  minersOf(b) {
    let n = 0;
    for (const u of this.units) if (u.hp > 0 && u.task.type === 'mine' && u.task.buildingId === b.id) n++;
    return n;
  }
  cmdMine(units, b) {
    if (!b || b.type !== 'building' || b.kind !== 'mine' || b.hp <= 0) return false;
    let free = MINE_MAX_WORKERS - this.minersOf(b), sent = 0;
    for (const u of units) {
      if (u.kind !== 'serf') continue;
      if (u.task.type === 'mine' && u.task.buildingId === b.id) continue;
      if (free <= 0) break;
      if (b.built < 1) { this.cmdBuild([u], b); u.afterBuild = { mineId: b.id }; free--; sent++; continue; }
      u.carry = null;
      u.task = { type: 'mine', buildingId: b.id };
      this.setPathToEntity(u, b);
      free--; sent++;
    }
    if (!sent && units[0]?.team === PLAYER) this.log(PLAYER, `That mine already has ${MINE_MAX_WORKERS} diggers.`, 'warn');
    return sent > 0;
  }
  unassignMine(team, buildingId) {
    const b = this.byId.get(buildingId);
    if (!b || b.team !== team) return false;
    for (const u of this.units) if (u.task.type === 'mine' && u.task.buildingId === b.id) { u.task = { type: 'idle' }; u.path = []; }
    return true;
  }
  doMine(u, dt) {
    const b = this.byId.get(u.task.buildingId);
    if (!b || b.hp <= 0 || b.built < 1) { u.task = { type: 'idle' }; return; }
    const node = b.nodeIds.map((id) => this.resources[id]).find((n) => n.amount > 0);
    if (!node) {
      u.path = [];
      // the seam is dry: walk on to another of the house's mines that still has ore and room, else stand idle
      const next = this.buildings.filter((m) => m !== b && m.team === u.team && m.kind === 'mine' && m.built >= 1 && m.hp > 0 && this.minersOf(m) < MINE_MAX_WORKERS && m.nodeIds.some((id) => this.resources[id].amount > 0))
        .sort((p, q) => Math.hypot(p.x - u.x, p.y - u.y) - Math.hypot(q.x - u.x, q.y - u.y))[0];
      if (next) { this.cmdMine([u], next); if (u.team === PLAYER) this.log(PLAYER, 'A seam is spent: its diggers move to another mine.', 'info'); return; }
      u.task = { type: 'idle' };
      if (u.team === PLAYER) this.log(PLAYER, 'The seam is spent. The diggers stand idle: raise a mine on a new deposit.', 'warn');
      return;
    }
    if (distTo(u.x, u.y, b) > 1.3) {
      if (!u.path.length || u.repathT <= 0) this.setPathToEntity(u, b);
      this.follow(u, dt);
      return;
    }
    u.path = [];
    const p = this.players[u.team];
    const take = Math.min(node.amount, MINE_RATE[node.kind] * dt * (p.sci >= 1 ? 1.1 : 1));
    node.amount -= take;
    if (node.kind === 'gold') this.earn(u.team, 'mining', take * this.haulOf(b)); else p[node.kind] += take * this.haulOf(b);
    u.dig = (u.dig || 0) + take;
    if (u.dig >= 5 && u.team === PLAYER) { u.dig = 0; this.floaters.push({ x: b.x, y: b.y - 0.8, text: '+5', res: node.kind, age: 0 }); } else if (u.dig >= 5) u.dig = 0;
    if (node.amount <= 0) this.resAt[node.y * this.W + node.x] = -1;
    u.face = b.x >= u.x ? 1 : -1;
  }
  // share of a mine's yield that reaches the stockpile: full near your stores, thinning with distance to the nearest one
  haulOf(b) {
    if (b._haulT === undefined || this.time - b._haulT > 5) {
      let d = 1e9;
      for (const o of this.buildings) if (o.team === b.team && o.hp > 0 && o.built >= 1 && STORES.includes(o.kind)) d = Math.min(d, Math.hypot(o.x - b.x, o.y - b.y));
      for (const v of this.villages) if (v.owner === b.team) d = Math.min(d, Math.hypot(v.x - b.x, v.y - b.y));
      const dist = this.districtAt(b.team, b.x, b.y);
      b._haul = (d <= HAUL.free ? 1 : Math.max(HAUL.min, 1 - (1 - HAUL.min) * (d - HAUL.free) / (HAUL.far - HAUL.free))) * (dist ? 1 + 0.08 * dist.score : 1);   // short haul to a market, and a community round it, speed the ore home
      b._haulT = this.time;
    }
    return b._haul;
  }
  cmdBuild(units, b, queue = false) {
    if (!b || b.type !== 'building' || b.built >= 1) return false;
    for (const u of units) {
      if (!BUILDERS[u.kind] || u.inside) continue;
      if (queue && u.task.type === 'build' && u.task.targetId !== b.id) {
        const cur = this.byId.get(u.task.targetId);
        if (cur && cur.hp > 0 && cur.built < 1) { if (!u.buildQ.includes(b.id)) u.buildQ.push(b.id); continue; }
      }
      u.buildQ = [];
      if (u.task.type === 'gather' || u.task.type === 'return') u.afterBuild = u.task.type === 'gather' ? { nodeId: u.task.nodeId } : { nodeId: u.task.resume };
      u.task = { type: 'build', targetId: b.id };
      this.setPathToEntity(u, b);
    }
    return true;
  }

  // ------------------------------------------------------------------ building, training, trade, relations
  canPlace(team, kind, tx, ty) {
    const s = BUILDINGS[kind];
    if (!s || !s.cost) return { ok: false, reason: 'Unknown building' };
    for (const req of s.requires) if (!this.hasBuilding(team, req)) return { ok: false, reason: `Needs a ${BUILDINGS[req].label}` };
    if (kind === 'village' && this.villages.filter((v) => v.owner === team && v.founded).length + this.buildings.filter((b) => b.team === team && b.kind === 'village' && b.hp > 0).length >= FOUND.limit) return { ok: false, reason: `A house may found only ${FOUND.limit} villages: win the rest` };
    if (!this.canAfford(team, s.cost)) return { ok: false, reason: 'Not enough goods' };
    const { W, H } = this;
    if (tx < 1 || ty < 1 || tx + s.size > W - 1 || ty + s.size > H - 1) return { ok: false, reason: 'Out of bounds' };
    for (let y = ty; y < ty + s.size; y++) for (let x = tx; x < tx + s.size; x++) {
      const i = y * W + x, t = this.terrain[i];
      if (t === T_WATER || t === T_FORD) return { ok: false, reason: 'Cannot build on water' };
      if (t === T_ROCK) return { ok: false, reason: 'Solid rock: nothing can be built here' };
      if (this.block[i]) return { ok: false, reason: 'Blocked' };
      if (this.resAt[i] >= 0 && this.resources[this.resAt[i]].amount > 0) {
        const n = this.resources[this.resAt[i]];
        if (!(s.onDeposit && MINEABLE.includes(n.kind))) return { ok: false, reason: 'Blocked by resources' };
      }
    }
    if (this.wallsOff(tx, ty, s.size)) return { ok: false, reason: 'Would wall off a pocket of ground' };
    if (s.onDeposit) {
      const nodes = this.depositsUnder(tx, ty, s.size);
      if (!nodes.length) return { ok: false, reason: 'A mine must stand on a mineral deposit' };
      if (nodes.some((n) => n.kind !== nodes[0].kind)) return { ok: false, reason: 'Mixed deposits: cover one kind of ore' };
    }
    // no territory: you may build wherever you have scouted (the person at the keyboard; rival houses see the whole valley)
    if (team === PLAYER && this.fogOn && !this.seen[team][Math.floor(ty + s.size / 2) * W + Math.floor(tx + s.size / 2)]) return { ok: false, reason: 'Unexplored: scout there first' };
    if (!this.units.some((u) => u.team === team && u.kind === 'serf' && u.hp > 0)) return { ok: false, reason: 'You need a serf to build' };
    return { ok: true };
  }

  // Would a footprint at (tx, ty) split the walkable ground around it into more separate pieces than before?
  // (rock, water and other buildings make pockets; units sealed inside one are stuck for good)
  wallsOff(tx, ty, size) {
    const { W, H, walk } = this;
    const ring = [];
    let inBounds = 0;
    for (let y = ty - 1; y <= ty + size; y++) for (let x = tx - 1; x <= tx + size; x++) {
      if (x > tx - 1 && x < tx + size && y > ty - 1 && y < ty + size) continue;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      inBounds++;
      if (walk[y * W + x]) ring.push(x + y * W);
    }
    if (ring.length === inBounds || ring.length < 2) return false; // a fully open ring cannot be split
    const x0 = Math.max(0, tx - 10), x1 = Math.min(W - 1, tx + size + 9), y0 = Math.max(0, ty - 10), y1 = Math.min(H - 1, ty + size + 9);
    const inFoot = (x, y) => x >= tx && x < tx + size && y >= ty && y < ty + size;
    const comps = (blockFoot) => {
      const seen = new Set(), want = new Set(ring);
      let n = 0;
      for (const r of ring) {
        if (seen.has(r)) continue;
        n++;
        const st = [r]; seen.add(r);
        while (st.length) {
          const c = st.pop(), cx = c % W, cy = (c / W) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
            const ni = ny * W + nx;
            if (seen.has(ni) || !walk[ni] || (blockFoot && inFoot(nx, ny))) continue;
            seen.add(ni); st.push(ni);
          }
        }
      }
      return n;
    };
    return comps(true) > comps(false);
  }

  depositsUnder(tx, ty, size) {
    const out = [];
    for (let y = ty; y < ty + size; y++) for (let x = tx; x < tx + size; x++) {
      const k = this.resAt[y * this.W + x];
      if (k >= 0 && MINEABLE.includes(this.resources[k].kind) && this.resources[k].amount > 0) out.push(this.resources[k]);
    }
    return out;
  }
  // best footprint for a mine that covers this deposit (try each way the 2x2 can sit over it)
  mineSpot(team, node) {
    const sz = BUILDINGS.mine.size;
    let best = null, bn = -1;
    for (let oy = 0; oy < sz; oy++) for (let ox = 0; ox < sz; ox++) {
      const tx = node.x - ox, ty = node.y - oy;
      if (!this.canPlace(team, 'mine', tx, ty).ok) continue;
      const n = this.depositsUnder(tx, ty, sz).length;
      if (n > bn) { bn = n; best = [tx, ty]; }
    }
    return best;
  }

  place(team, kind, tx, ty, ids = null, nodeId = null) {
    if (kind === 'mine' && nodeId != null) { const sp = this.resources[nodeId] ? this.mineSpot(team, this.resources[nodeId]) : null; if (sp) [tx, ty] = sp; }
    const chk = this.canPlace(team, kind, tx, ty);
    if (!chk.ok) { if (team === PLAYER) this.log(team, chk.reason, 'warn'); return null; }
    const s = BUILDINGS[kind];
    this.pay(team, s.cost);
    const b = this.addBuilding(kind, team, tx, ty, false);
    const pl = this.players[team];
    if (pl.sci >= 2) { b.maxHp *= 1.15; b.hp *= 1.15; } // Masonry
    if (s.onDeposit) { b.nodeIds = this.depositsUnder(tx, ty, s.size).map((n) => n.id); b.nodeIds.forEach((id) => { this.resources[id].covered = true; }); b.ore = this.resources[b.nodeIds[0]].kind; }
    this.recomputeWalk();
    // shove anyone standing in the footprint out of it, and re-route walkers whose route crosses it
    for (const u of this.units) {
      if (u.x >= tx && u.x < tx + s.size && u.y >= ty && u.y < ty + s.size) {
        const n = this.nearestWalkable(Math.floor(u.x), Math.floor(u.y), 8);
        if (n) { u.x = n[0] + 0.5; u.y = n[1] + 0.5; }
      }
      if (u.path.length && u.path.some(([px, py]) => px >= tx && px < tx + s.size && py >= ty && py < ty + s.size) && u.pathGoal) {
        this.setPath(u, u.pathGoal[0], u.pathGoal[1]);
      }
    }
    let builders = (ids || []).map((id) => this.byId.get(id)).filter((u) => u && u.team === team && BUILDERS[u.kind] && u.hp > 0);
    if (!builders.length) {
      builders = this.units.filter((u) => u.team === team && u.kind === 'serf' && u.hp > 0)
        .sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y)).slice(0, 2);
    }
    this.cmdBuild(builders, b, !!(ids && ids.length));
    if (s.onDeposit) builders.forEach((u) => { u.afterBuild = { mineId: b.id }; });
    return b;
  }

  train(team, buildingId, kind) {
    const b = this.byId.get(buildingId);
    const s = UNITS[kind];
    const say = (m) => { if (team === PLAYER) this.log(team, m, 'warn'); return null; };
    if (!b || b.type !== 'building' || b.team !== team || b.built < 1 || b.hp <= 0 || !s) return null;
    if (!s.from.includes(b.kind)) return say(`A ${BUILDINGS[b.kind].label} cannot train that.`);
    if (!this.canAfford(team, s.cost)) return say('Not enough goods.');
    if (this.popUsed(team) + 1 > this.popCap(team)) return say('Population capped: raise cottages.');
    if (b.queue.length >= 5) return say('Training queue is full.');
    this.pay(team, s.cost);
    b.queue.push({ kind, t: 0 });
    return true;
  }
  cancelTrain(team, buildingId, index) {
    const b = this.byId.get(buildingId);
    if (!b || b.team !== team || !b.queue[index]) return false;
    const [q] = b.queue.splice(index, 1);
    this.pay(team, UNITS[q.kind].cost, -1);
    return true;
  }
  setRally(team, buildingId, x, y, nodeId) {
    const b = this.byId.get(buildingId);
    if (!b || b.team !== team) return false;
    b.rally = { x, y, nodeId: nodeId ?? null };
    return true;
  }

  // ---- trade: markets keep shelves of goods, camels carry them -------------------------------------------------
  // A market is stocked automatically from the house stockpile when a supplier stands within MARKET_RADIUS: a mine for its
  // ore, a foundry for steel and fine ware, a farm for grain, a mill for timber, or a warehouse for anything.
  // Camels load from a shelf, walk to another market or village, swap goods there at a fee, and walk home to unload.
  marketsOf(team) { return this.buildings.filter((b) => b.team === team && b.kind === 'market' && b.built >= 1 && b.hp > 0); }
  nearestMarket(team, x, y, maxD = 1e9) {
    let best = null, bd = maxD;
    for (const m of this.marketsOf(team)) { const d = distTo(x, y, m); if (d < bd) { best = m; bd = d; } }
    return best;
  }
  // ---- districts: the community around a market (see LINKS in config). Cached for two seconds.
  linkOfBuilding(kind) { for (const k in LINKS) if (LINKS[k].blds.includes(kind)) return k; return null; }
  linkOfVillage(v) {
    if (v.founded) return 'homes';
    for (const k in LINKS) if (LINKS[k].towns.includes(v.kind)) return k;
    return null;
  }
  district(m) {
    if (m._d && this.time - m._dT < 2) return m._d;
    const r = DISTRICT.r, links = {}, names = {};
    for (const k in LINKS) { links[k] = 0; names[k] = []; }
    for (const o of this.buildings) {
      if (o.team !== m.team || o.built < 1 || o.hp <= 0 || o === m || Math.hypot(o.x - m.x, o.y - m.y) > r) continue;
      const k = this.linkOfBuilding(o.kind); if (k) { links[k]++; if (!names[k].includes(BUILDINGS[o.kind].label)) names[k].push(BUILDINGS[o.kind].label); }
    }
    for (const v of this.villages) {
      if (v.owner !== m.team || Math.hypot(v.x - m.x, v.y - m.y) > r) continue;
      const k = this.linkOfVillage(v); if (k) { links[k]++; names[k].push(v.name); }
    }
    const score = Object.values(links).filter((n) => n > 0).length;
    const thriving = score === 4;
    m._dT = this.time;
    return (m._d = { links, names, score, thriving, mult: 1 + DISTRICT.perLink * score + (thriving ? DISTRICT.thrive : 0) });
  }
  // every link a market has right now, with where it stands: used to draw the community on the map
  districtLinks(m) {
    const out = [], r = DISTRICT.r;
    for (const o of this.buildings) {
      if (o.team !== m.team || o.built < 1 || o.hp <= 0 || o === m || Math.hypot(o.x - m.x, o.y - m.y) > r) continue;
      const k = this.linkOfBuilding(o.kind); if (k) out.push({ x: o.x, y: o.y, link: k });
    }
    for (const v of this.villages) {
      if (v.owner !== m.team || Math.hypot(v.x - m.x, v.y - m.y) > r) continue;
      const k = this.linkOfVillage(v); if (k) out.push({ x: v.x, y: v.y, link: k });
    }
    return out;
  }
  // the district a building or village of this team works within: its nearest own market inside DISTRICT.r, or null if it stands alone
  districtAt(team, x, y) {
    const m = this.nearestMarket(team, x, y, DISTRICT.r);
    return m ? this.district(m) : null;
  }
  // the market's coin: cottages and villages of ours within reach are its customers
  consumerIncome(b) {
    let n = 0;
    for (const o of this.buildings) if (o.team === b.team && o.kind === 'cottage' && o.built >= 1 && o.hp > 0 && Math.hypot(o.x - b.x, o.y - b.y) <= MARKET_RADIUS) n++;
    for (const v of this.villages) if (v.owner === b.team && Math.hypot(v.x - b.x, v.y - b.y) <= MARKET_RADIUS) n += 2;
    return (CONSUMERS.base + CONSUMERS.each * Math.min(CONSUMERS.max, n)) * this.district(b).mult;   // a rounded community earns more than the same buildings scattered
  }
  near(b, kinds, r = MARKET_RADIUS) { return this.buildings.some((o) => o.team === b.team && o.built >= 1 && o.hp > 0 && kinds.includes(o.kind) && Math.hypot(o.x - b.x, o.y - b.y) <= r); }
  supplied(b, k) {
    if (this.near(b, ['warehouse'])) return true;
    if (MINEABLE.includes(k) && this.buildings.some((o) => o.team === b.team && o.kind === 'mine' && o.built >= 1 && o.hp > 0 && o.ore === k && Math.hypot(o.x - b.x, o.y - b.y) <= MARKET_RADIUS)) return true;
    if (PROCESSED.includes(k)) return this.near(b, ['foundry']);
    if (k === 'food') return this.near(b, ['farm']);
    if (k === 'wood') return this.near(b, ['mill']);
    return false;
  }
  supplyMarket(b, p, dt) {
    const shelf = b.stock || (b.stock = {}), cap = this.near(b, ['warehouse']) ? SHELF_CAP + 40 : SHELF_CAP;
    for (const k of ALL_GOODS) {
      const have = shelf[k] || 0;
      if (have >= cap || !this.supplied(b, k)) continue;
      const reserve = SHELF_RESERVE[k] ?? SHELF_RESERVE.other;
      const move = Math.min(2 * dt, cap - have, (p[k] || 0) - reserve);
      if (move > 0) { p[k] -= move; shelf[k] = have + move; }
    }
  }
  cargoTotal(u) { let n = 0; if (u.cargo) for (const k in u.cargo) n += u.cargo[k]; return n; }
  load(team, unitId, good, amount) {
    const u = this.byId.get(unitId), say = (m) => { if (team === PLAYER) this.log(team, m, 'warn'); return false; };
    if (!u || u.team !== team || u.kind !== 'camel' || u.hp <= 0 || !ALL_GOODS.includes(good)) return false;
    const m = this.nearestMarket(team, u.x, u.y, 4.5);
    if (!m) return say('Bring the camel next to one of your markets to load it.');
    const shelf = m.stock || (m.stock = {});
    const amt = Math.floor(Math.min(amount, CAMEL_CAP - this.cargoTotal(u), shelf[good] || 0));
    if (amt < 1) return say(CAMEL_CAP - this.cargoTotal(u) < 1 ? 'The camel is fully laden.' : `The market has no ${GOOD_LABEL[good].toLowerCase()} on its shelf.`);
    shelf[good] -= amt; u.cargo = u.cargo || {}; u.cargo[good] = (u.cargo[good] || 0) + amt; u.home = m.id;
    return true;
  }
  unloadShelf(team, unitId) {
    const u = this.byId.get(unitId);
    if (!u || u.team !== team || u.kind !== 'camel' || !u.cargo) return false;
    const m = this.nearestMarket(team, u.x, u.y, 4.5); if (!m) return false;
    const shelf = m.stock || (m.stock = {});
    for (const k in u.cargo) shelf[k] = (shelf[k] || 0) + u.cargo[k];
    u.cargo = {}; return true;
  }
  // may these people deal with that market or village? { ok, reason, own }
  canDeal(team, t) {
    if (!t) return { ok: false, reason: 'Nothing to trade with there.' };
    if (t.type === 'building') {
      if (t.kind !== 'market' || t.built < 1 || t.hp <= 0) return { ok: false, reason: 'Only markets and villages trade.' };
      if (t.team === team) return { ok: true, own: true };
      if (this.rel[team][t.team] === 'war') return { ok: false, reason: `At war with ${this.players[t.team].name}.` };
      if (this.rel[team][t.team] !== 'trade' || !this.known[team][t.team]) return { ok: false, reason: `You need a trade treaty with ${this.players[t.team].name}.` };
      return { ok: true };
    }
    if (t.type === 'village') {
      if (t.owner === team || t.owner === -1) return { ok: true, own: t.owner === team };
      if (this.rel[team][t.owner] === 'war') return { ok: false, reason: `${t.name} belongs to a house you are at war with.` };
      if (this.rel[team][t.owner] !== 'trade') return { ok: false, reason: `${t.name} trades only under a treaty with ${this.players[t.owner].name}.` };
      return { ok: true };
    }
    return { ok: false, reason: 'Nothing to trade with there.' };
  }
  stockOf(t, k) { return Math.floor(t.type === 'village' ? (t.stores[k] || 0) : (t.stock?.[k] || 0)); }
  feeFor(from, t) {
    const d = Math.hypot(from.x - t.x, from.y - t.y);
    if (t.type === 'village') return t.owner === -1 ? Math.max(0.1, Math.min(0.3, 0.1 + d / 700)) : Math.max(0.06, Math.min(0.22, 0.05 + d / 600));
    return Math.max(0.06, Math.min(0.22, 0.05 + d / 600));
  }
  // What a market or village will pay for a good, as a multiple of its base worth: scarce there = dear, plentiful = cheap.
  priceMul(t, k) {
    if (k === 'gold') return 1;
    const ref = t.type === 'village' ? (VILLAGE_KINDS[t.kind].stores[k] || 0) : SHELF_CAP * 0.5;
    const have = this.stockOf(t, k);
    const m = ref > 0 ? 1.75 - 1.1 * Math.min(1.6, have / ref) : 1.6 - 0.25 * Math.min(1, have / 40);
    return Math.max(0.6, Math.min(1.9, m));
  }
  priceAt(t, k) { return RES_VALUE[k] * this.priceMul(t, k); }
  quoteFor(from, t, give, want, amount) {
    if (!ALL_GOODS.includes(give) || !ALL_GOODS.includes(want) || give === want) return null;
    const fee = this.feeFor(from, t);
    return { fee, got: Math.floor((amount * this.priceAt(t, give) * (1 - fee)) / this.priceAt(t, want)) };
  }
  // what the far side can hand over of `want`: a village's store, a market's shelf, or (for coin) the house's treasury
  availFor(t, want) {
    if (t.type === 'building' && want === 'gold') return Math.floor(this.players[t.team].gold * 0.5);
    return this.stockOf(t, want);
  }
  // the best load for a route: goods on the home shelf that the target pays more than they are worth, most profit first
  routeQuote(home, t, cap = CAMEL_CAP) {
    const shelf = home?.stock || {}, fee = this.feeFor(home, t), items = {};
    const opts = [];
    for (const k of ALL_GOODS) {
      const have = Math.floor(shelf[k] || 0);
      if (k === 'gold' || have < 1) continue;
      const r = (this.priceAt(t, k) * (1 - fee)) / RES_VALUE[k];
      if (r > 1.02) opts.push({ k, have, r, per: (RES_VALUE[k] * (r - 1)) / RES_VALUE.gold });
    }
    opts.sort((a, b) => b.per - a.per);
    let room = cap, profit = 0;
    for (const o of opts) {
      const n = Math.min(o.have, room, 25);
      if (n < 1) continue;
      items[o.k] = n; room -= n; profit += n * o.per;
    }
    return { items, profit, fee, n: cap - room };
  }
  // the six measures a house is judged on: money, land influence, population, army, science, loyalty
  standings() {
    return this.players.map((p, i) => {
      const held = this.villages.filter((v) => v.owner === i);
      const goods = ALL_GOODS.reduce((a, k) => a + (k === 'gold' ? 0 : (p[k] || 0) * RES_VALUE[k]), 0);
      return {
        team: i, name: p.name, alive: this.alive(i),
        money: Math.floor(p.gold), wealth: Math.floor(p.gold + goods / RES_VALUE.gold), traded: Math.floor(p.tradeEarned || 0),
        land: held.length, landPop: Math.floor(held.reduce((a, v) => a + v.pop, 0)),
        pop: this.popUsed(i), army: this.militaryOf(i).length, arms: p.arms || 0, sci: p.sci || 0,
        loyalty: held.length ? Math.round(held.reduce((a, v) => a + v.loyalty, 0) / held.length) : 0,
      };
    });
  }
  tradeTargetAt(team, x, y) {
    const b = this.buildingAt(x, y); return b && b.kind === 'market' ? b : null;   // camels trade with markets only
  }
  doCaravan(u, dt) {
    const k = u.task;
    const t = this.byId.get(k.targetId);
    if (!t || (t.type === 'building' && t.hp <= 0)) { k.stage === 'out' ? this.caravanHome(u) : (u.task = { type: 'idle' }); return; }
    if (distTo(u.x, u.y, t) > 1.6) {
      if (!u.path.length || u.repathT <= 0) this.setPathToEntity(u, t);
      this.follow(u, dt); return;
    }
    u.path = [];
    if (k.stage === 'out') { this.exchange(u, t, k.want); this.caravanHome(u); return; }
    // home: unload what it carries into the stockpile
    const p = this.players[u.team];
    if (u.cargo) for (const g in u.cargo) { if (g === 'gold') this.earn(u.team, 'trade', u.cargo[g]); else p[g] = (p[g] || 0) + u.cargo[g]; if (u.team === PLAYER && u.cargo[g] >= 1) this.floaters.push({ x: t.x, y: t.y - 1, text: `+${Math.round(u.cargo[g])}`, res: g, age: 0 }); }
    u.cargo = {}; u.task = { type: 'idle' };
  }
  // ---- routes. A camel is given up to ROUTE_STOPS markets (other markets only: yours or a treaty partner's). It shuttles
  // home shelf -> stop -> home -> next stop -> home ... for ever until told to stop. At a partner's market it sells the shelf's best-paying goods
  // for coin; at one of your own it moves goods your home shelf has too many of.
  routeHome(u) {
    const alive = (b) => b && b.hp > 0 && b.team === u.team && b.built >= 1 && b.kind === 'market';
    return (alive(this.byId.get(u.home)) ? this.byId.get(u.home) : null) || this.nearestMarket(u.team, u.x, u.y);
  }
  // click a market to add it to the camel's route; click it again to take it off
  cmdRoute(units, t, want) {
    const camels = units.filter((u) => u.kind === 'camel' && u.hp > 0);
    if (!camels.length) return false;
    const team = camels[0].team, say = (m) => { if (team === PLAYER) this.log(team, m, 'warn'); this.diploNote = m; return false; };
    if (!t || t.type !== 'building' || t.kind !== 'market') return say('Camels trade only with markets. Click a market.');
    if (t.built < 1 || t.hp <= 0) return say('That market is not finished.');
    const chk = this.canDeal(team, t);
    if (!chk.ok) return say(chk.reason);
    let done = 0;
    for (const u of camels) {
      const home = this.routeHome(u);
      if (!home) return say('A route starts at one of your markets: raise a market first.');
      if (t.id === home.id) { say('That is this camel\'s home market. Choose another market for it to visit.'); continue; }
      u.inside = null; u.home = home.id;
      const r = u.route || (u.route = { stops: [], i: 0, want: ALL_GOODS.includes(want) ? want : 'gold', earned: 0, trips: 0 });
      const at = r.stops.indexOf(t.id);
      if (at >= 0) { r.stops.splice(at, 1); if (r.i >= r.stops.length) r.i = 0; if (!r.stops.length) { u.route = null; this.caravanHome(u); } done++; continue; }
      if (r.stops.length >= ROUTE_STOPS) { say(`A camel keeps at most ${ROUTE_STOPS} markets. Click one of its stops to remove it first.`); continue; }
      r.stops.push(t.id); done++;
      if (!(u.task.type === 'caravan' && u.task.route)) {
        if (this.cargoTotal(u) >= 1) { r.i = r.stops.length - 1; u.task = { type: 'caravan', route: true, stage: 'out', t: 0 }; this.setPathToEntity(u, t); }
        else { u.task = { type: 'caravan', route: true, stage: 'prep', t: 0 }; this.setPathToEntity(u, home); }
      }
    }
    if (done && team === PLAYER) { const u = camels[0], r = u.route; this.log(team, r ? `${camels.length > 1 ? `${camels.length} camels` : (u.name || 'The camel')} will trade at ${r.stops.length} market${r.stops.length > 1 ? 's' : ''}.` : 'The route is cleared.', 'good'); }
    return done > 0;
  }
  stopRoute(units) {
    for (const u of units) if (u.kind === 'camel' && u.route) { u.route = null; if (u.task.type === 'caravan' && u.task.route) { this.caravanHome(u); } }
    return true;
  }
  stopName(t) { return t.team === undefined ? t.name : `${this.players[t.team].short || HOUSES[t.team].short}'s market`; }
  // what to carry to one of my own markets: goods this shelf holds far more of than that one
  ownQuote(home, t, cap = CAMEL_CAP) {
    const a = home?.stock || {}, b = t?.stock || {}, opts = [];
    for (const k of ALL_GOODS) { if (k === 'gold') continue; const sur = Math.floor(a[k] || 0) - Math.floor(b[k] || 0); if (sur >= 10) opts.push([k, Math.floor(sur / 2)]); }
    opts.sort((x, y) => y[1] - x[1]);
    const items = {}; let room = cap;
    for (const [k, n] of opts) { const m = Math.min(n, room, 25); if (m >= 1) { items[k] = m; room -= m; } }
    return { items, profit: 0, n: cap - room, fee: 0 };
  }
  quoteStop(home, t) { return this.canDeal(home.team, t).own ? this.ownQuote(home, t) : this.routeQuote(home, t); }
  doRoute(u, dt) {
    const k = u.task, r = u.route;
    const cancel = (why) => { if (u.team === PLAYER) this.log(PLAYER, why, 'warn'); u.route = null; this.caravanHome(u); };
    if (!r || !r.stops?.length) { u.route = null; this.caravanHome(u); return; }
    const home = this.routeHome(u);
    if (!home) return cancel('A route ends: you have no market to start from.');
    // drop stops that are gone or can no longer be dealt with (war, treaty ended, market destroyed)
    for (let n = r.stops.length - 1; n >= 0; n--) {
      const m = this.byId.get(r.stops[n]);
      const why = !m || m.hp <= 0 || m.kind !== 'market' ? 'the market is gone' : (() => { const c = this.canDeal(u.team, m); return c.ok ? '' : c.reason; })();
      if (why) { if (u.team === PLAYER) this.log(PLAYER, `A camel drops a stop: ${why}`, 'warn'); r.stops.splice(n, 1); if (r.i > n) r.i--; }
    }
    if (!r.stops.length) return cancel('A route ends: no market is left to visit.');
    if (r.i >= r.stops.length) r.i = 0;
    const t = this.byId.get(r.stops[r.i]);
    const go = (dest) => { if (distTo(u.x, u.y, dest) > 1.6) { if (!u.path.length || u.repathT <= 0) this.setPathToEntity(u, dest); this.follow(u, dt); return false; } u.path = []; return true; };
    if (k.stage === 'prep' || k.stage === 'wait') {
      if (k.stage === 'prep' && !go(home)) return;
      u.home = home.id;
      if (k.stage === 'prep') {
        // back at the shelf: unsold goods go back on it, coin goes to the stockpile
        const p = this.players[u.team];
        for (const g in u.cargo || {}) { if (g === 'gold') this.earn(u.team, 'trade', u.cargo[g]); else p[g] = (p[g] || 0) + u.cargo[g]; if (u.team === PLAYER && u.cargo[g] >= 1) this.floaters.push({ x: home.x, y: home.y - 1, text: `+${Math.round(u.cargo[g])}`, res: g, age: 0 }); }
        u.cargo = {};
        k.stage = 'wait'; k.t = 99;
      }
      k.t = (k.t || 0) + dt;
      if (k.t < 6) return;
      k.t = 0;
      // choose the next stop that has something worth carrying, starting from where the cycle is
      let pick = -1;
      for (let n = 0; n < r.stops.length; n++) {
        const idx = (r.i + n) % r.stops.length, m = this.byId.get(r.stops[idx]);
        if (this.quoteStop(home, m).n >= 4) { pick = idx; break; }
      }
      if (pick < 0) { if (!r.noted && u.team === PLAYER) { r.noted = true; this.log(PLAYER, `${u.name || 'A camel'} waits at the market: nothing on its shelf is worth carrying to its stops yet.`, 'info'); } return; }
      r.noted = false; r.i = pick;
      const target = this.byId.get(r.stops[pick]), q = this.quoteStop(home, target), shelf = home.stock; u.cargo = {};
      for (const g in q.items) { shelf[g] -= q.items[g]; u.cargo[g] = q.items[g]; }
      k.stage = 'out'; this.setPathToEntity(u, target); return;
    }
    if (k.stage === 'out') {
      if (!go(t)) return;
      const gain = this.exchange(u, t, r.want) || 0;
      r.earned += gain; r.trips++; this.players[u.team].tradeEarned += gain;
      k.stage = 'back'; this.setPathToEntity(u, home); return;
    }
    if (k.stage === 'back') {
      if (!go(home)) return;
      this.players[u.team].trips++;
      r.i = (r.i + 1) % r.stops.length;   // next market round the circuit
      k.stage = 'prep';
    }
  }
  caravanHome(u) {
    const alive = (b) => b && b.hp > 0 && b.team === u.team && b.built >= 1;
    // back to the market it left from, else any market of ours, else the hall or keep: the goods always come home to the stockpile
    const m = (alive(this.byId.get(u.home)) ? this.byId.get(u.home) : null) || this.nearestMarket(u.team, u.x, u.y) || this.seatOf(u.team);
    if (!m) { u.task = { type: 'idle' }; return; }
    u.task = { type: 'caravan', targetId: m.id, stage: 'home' }; this.setPathToEntity(u, m);
  }
  // the swap at the far end: sell what the camel carries for the wanted good, limited by the partner's stock and the camel's load
  exchange(u, t, want) {
    const team = u.team, say = (m, kind = 'info') => { if (team === PLAYER) this.log(team, m, kind); };
    const chk = this.canDeal(team, t);
    if (!chk.ok) { say(chk.reason, 'warn'); return; }
    u.cargo = u.cargo || {};
    const name = t.type === 'village' ? t.name : `${this.players[t.team].short || HOUSES[t.team].short}'s market`;
    if (chk.own) {   // our own market: just stock its shelf
      const shelf = t.stock || (t.stock = {});
      for (const g in u.cargo) shelf[g] = (shelf[g] || 0) + u.cargo[g];
      u.cargo = {}; u.home = t.id; say(`The caravan stocks ${name}.`); return;
    }
    if (!want) { say(`The caravan reaches ${name} with nothing to buy.`, 'warn'); return; }
    const them = t.type === 'building' ? this.players[t.team] : null;
    let soldAny = false, profit = 0;
    for (const give of Object.keys(u.cargo)) {
      if (give === want || u.cargo[give] < 1) continue;
      const fee = this.feeFor(u, t), r = (this.priceAt(t, give) / this.priceAt(t, want)) * (1 - fee), avail = this.availFor(t, want);
      const total = this.cargoTotal(u);
      let s = Math.floor(u.cargo[give]);
      for (; s > 0; s--) { const got = Math.floor(s * r); if (got <= avail && (want === 'gold' || total - s + got <= CAMEL_CAP)) break; }   // coin is light: it never fills the saddlebags
      const got = Math.floor(s * r);
      if (s < 1 || got < 1) continue;
      if (t.type === 'village') { t.stores[want] -= got; t.stores[give] = (t.stores[give] || 0) + s; }
      else { if (want === 'gold') them.gold -= got; else t.stock[want] -= got; them[give] = (them[give] || 0) + s; }
      u.cargo[give] -= s; u.cargo[want] = (u.cargo[want] || 0) + got; soldAny = true;
      profit += (got * RES_VALUE[want] - s * RES_VALUE[give]) / RES_VALUE.gold;
      say(`Caravan: ${s} ${give} for ${got} ${want} at ${name} (fee ${Math.round(fee * 100)}%).`, 'good');
    }
    if (!soldAny) say(`${name} could not trade ${GOOD_LABEL[want].toLowerCase()} for what you carry (empty shelf, or nothing to sell).`, 'warn');
    for (const g of Object.keys(u.cargo)) if (u.cargo[g] < 0.01) delete u.cargo[g];
    return profit;
  }

  setRelation(a, b, state) {
    if (a === b || !RELATIONS.includes(state) || this.rel[a][b] === state) return;
    this.rel[a][b] = this.rel[b][a] = state;
    this.relSince[a][b] = this.relSince[b][a] = this.time;
    const A = this.players[a].name, B = this.players[b].name;
    const text = state === 'war' ? `${A} declares war on ${B}.` : state === 'trade' ? `${A} and ${B} open trade.` : `${A} and ${B} are at peace.`;
    this.log(a === PLAYER || b === PLAYER ? PLAYER : -1, text, state === 'war' ? 'war' : 'info');
    if (state !== 'war') {
      // units of both houses stand down
      for (const u of this.units) {
        if (u.task.type !== 'attack') continue;
        const t = this.byId.get(u.task.targetId);
        const owner = t ? (t.type === 'village' ? t.owner : t.team) : -1;
        if ((u.team === a && owner === b) || (u.team === b && owner === a)) { u.task = { type: 'idle' }; u.path = []; }
      }
    }
  }
  // Treaties. Peace/trade need a house you have met; the other side must grant it (AI houses answer at once, a human gets an offer to accept).
  meet(a, b) { this.known[a][b] = this.known[b][a] = 1; }
  // Why the last treaty request was refused, for the interface to show (cleared by whoever reads it).
  deny(a, text) { this.diploNote = text; if (a === PLAYER) this.log(PLAYER, text, 'warn'); return false; }
  // seconds before a house that went to war will hear of peace again
  parleyIn(a, b) { return this.rel[a][b] === 'war' ? Math.max(0, WAR_MIN - (this.time - this.relSince[a][b])) : 0; }
  // would an AI house b take peace from a? Yes once the war has cooled and it is not winning clearly.
  willMakePeace(b, a) {
    const mine = this.militaryOf(b).length, theirs = this.militaryOf(a).length;
    const heldB = this.villages.filter((v) => v.owner === b).length, heldA = this.villages.filter((v) => v.owner === a).length;
    if (this.time - this.relSince[a][b] > 300) return true;                  // a long war wears everyone out
    return mine <= theirs * 1.25 || heldB < heldA * 0.7;                       // outgunned, or being outgrown
  }
  proposeRelation(a, b, state) {
    this.diploNote = '';
    if (!this.alive(b) || a === b) return false;
    const B = this.players[b].name;
    if (state === 'war') { if (this.rel[a][b] !== 'war') this.setRelation(a, b, 'war'); return true; }
    if (this.rel[a][b] === state) return true;
    if (state === 'peace' && this.rel[a][b] === 'trade') { this.setRelation(a, b, 'peace'); return true; } // either side may cancel a treaty
    if (!this.known[a][b]) return this.deny(a, `You have not met ${B} yet. Scout toward them.`);
    if (this.rel[a][b] === 'war') {
      const wait = this.parleyIn(a, b);
      if (wait > 0) return this.deny(a, `${B} will not parley for ${Math.ceil(wait)} more seconds.`);
      if (state === 'trade') return this.deny(a, `Make peace with ${B} first, then propose trade.`);
      if (state === 'peace' && this.players[b].ai && !this.willMakePeace(b, a)) { this.snub[b][a] = this.time; return this.deny(a, `${B} refuses peace: they think they are winning. Beat their army or wait.`); }
    }
    // a pending offer from them to us is simply accepted
    const back = this.offers.findIndex((o) => o.from === b && o.to === a && o.state === state);
    if (back >= 0) return this.respondOffer(a, b, true);
    if (this.players[b].ai) {
      if (a === PLAYER && this.time - this.snub[b][a] < 45 && state === 'trade') return this.deny(a, `${B} is still sulking over your last offer (${Math.ceil(45 - (this.time - this.snub[b][a]))}s).`);
      this.setRelation(a, b, state);
      return true;
    }
    if (this.offers.some((o) => o.from === a && o.to === b && o.state === state)) return this.deny(a, `Your offer to ${B} is still waiting.`);
    this.offers.push({ from: a, to: b, state, t: this.time });
    this.log(b === PLAYER ? PLAYER : -1, `${this.players[a].name} offers a ${state === 'trade' ? 'trade treaty' : 'peace'}.`, 'info');
    return 'pending';
  }
  respondOffer(team, from, accept) {
    const i = this.offers.findIndex((o) => o.to === team && o.from === from);
    if (i < 0) return false;
    const [o] = this.offers.splice(i, 1);
    if (!accept) { this.snub[team][from] = this.time; if (team === PLAYER) this.log(PLAYER, `You decline ${this.players[from].name}.`, 'info'); return false; }
    if (!this.alive(from)) return false;
    this.setRelation(o.from, o.to, o.state);
    return true;
  }

  // ---- stockpile economy: smelting, arms, science, contented villages ----------------------
  smelt(b, p, dt) {
    if (!b.job) {
      const opts = Object.entries(SMELT).filter(([, r]) => Object.entries(r.in).every(([k, n]) => p[k] >= n)).sort((x, y) => p[x[0]] - p[y[0]]);
      if (!opts.length) { b.working = false; return; }
      const [kind, r] = opts[0];
      for (const [k, n] of Object.entries(r.in)) p[k] -= n;
      b.job = { kind, t: 0 };
    }
    b.working = true;
    const dist = this.districtAt(b.team, b.x, b.y);
    b.job.t += dt * (dist ? 0.8 + 0.15 * dist.score + (dist.links.supply > 0 ? 0.3 : 0) : DISTRICT.lone);   // ore on the doorstep and a market to sell to: a foundry in a community works fastest; alone it crawls
    if (b.job.t >= SMELT[b.job.kind].time) {
      p[b.job.kind] += 1;
      if (b.team === PLAYER) this.floaters.push({ x: b.x, y: b.y - 1, text: `+1`, res: b.job.kind, age: 0 });
      b.job = null;
    }
  }
  // every coin that comes in is booked by source, so the treasury strip can show where the money comes from
  earn(team, src, amt) {
    const p = this.players[team];
    if (!(amt > 0)) return;
    if (p.ai) amt *= this.diff.aiMul;
    p.gold += amt; p.earnedTotal += amt; p.acc[src] = (p.acc[src] || 0) + amt;
    if (team === PLAYER && amt >= 3 && (src === 'trade' || src === 'sales' || src === 'loot')) { const m = this.seatOf(PLAYER); if (m) this.sfx('coin', m.x, m.y); }
  }
  // the army's pay: due every second, taken from the purse; an empty purse breeds trouble
  payWages(p, dt) {
    let rate = 0, n = 0, list = [];
    for (const u of this.units) if (u.team === p.team && u.hp > 0 && WAGE[u.kind]) { n++; list.push(u); }
    if (n > WAGE_FREE) { list.sort((a, b) => WAGE[b.kind] - WAGE[a.kind]); for (let i = WAGE_FREE; i < n; i++) rate += WAGE[list[i].kind]; }
    p.wageRate = rate;
    p.wageDebt += rate * dt;
    if (p.wageDebt >= 1) {
      const pay = Math.min(Math.floor(p.wageDebt), Math.floor(p.gold));
      if (pay > 0) { p.gold -= pay; p.wageDebt -= pay; p.spent += pay; }
      if (p.wageDebt >= 3) { p.brokeT += dt; } else p.brokeT = Math.max(0, p.brokeT - dt);
    } else p.brokeT = Math.max(0, p.brokeT - dt);
    p.broke = p.brokeT > BROKE.grace;
    if (p.broke && list.length > WAGE_FREE) {
      p.deserterT += dt;
      if (p.deserterT >= BROKE.desertEvery) {
        p.deserterT = 0;
        const d = list.filter((u) => WAGE[u.kind]).sort((a, b) => a.hp - b.hp)[0];
        if (d) { d.hp = 0; this.log(p.team === PLAYER ? PLAYER : -1, `${d.name || 'A soldier'} deserts for want of pay.`, 'bad'); p.wageDebt = Math.max(0, p.wageDebt - 3); }
      }
    } else p.deserterT = 0;
  }
  // a market buys from the stockpile at a fraction of worth that sags as you sell and recovers with time
  sellPrice(b, k) { const glut = b.glut?.[k] || 0; return Math.max(SELL.floor, 1 / (1 + glut / SELL.glut)) * SELL.rate * RES_VALUE[k] / RES_VALUE.gold; }
  sellGoods(team, marketId, good, amount) {
    const b = this.byId.get(marketId), p = this.players[team], say = (m) => { if (team === PLAYER) this.log(team, m, 'warn'); return 0; };
    if (!b || b.team !== team || b.kind !== 'market' || b.built < 1 || b.hp <= 0) return say('Goods are sold at one of your markets.');
    if (!ALL_GOODS.includes(good) || good === 'gold') return say('Nothing to sell there.');
    b.glut ||= {};
    let n = Math.min(Math.floor(p[good] || 0), Math.floor(amount || 20)), got = 0;
    if (n < 1) return say(`You have no ${GOOD_LABEL[good].toLowerCase()} to sell.`);
    for (let i = 0; i < n; i++) { got += this.sellPrice(b, good); b.glut[good] = (b.glut[good] || 0) + 1; }
    p[good] -= n; this.earn(team, 'sales', got);
    if (team === PLAYER) { this.floaters.push({ x: b.x, y: b.y - 1, text: `+${Math.round(got)}`, res: 'gold', age: 0 }); this.log(team, `Sold ${n} ${GOOD_LABEL[good].toLowerCase()} for ${Math.round(got)} coin.`, 'good'); }
    return Math.round(got);
  }

  updateEconomy(dt) {
    for (const p of this.players) {
      if (!p.alive) continue;
      this.payWages(p, dt);
      p.rateT = (p.rateT || 0) + dt;
      if (p.rateT >= 1) {   // smoothed income by source, per second
        for (const k of INCOME_SOURCES) { p.inc[k] = (p.inc[k] || 0) * 0.92 + ((p.acc[k] || 0) / p.rateT) * 0.08; p.acc[k] = 0; }
        p.rateT = 0;
      }
      // forge: steel -> arms levels
      if (p.arms < 3 && p.steel >= ARMS_STEEL && this.hasBuilding(p.team, 'forge')) {
        p.armsT += dt;
        if (p.armsT >= 14) { p.armsT = 0; p.steel -= ARMS_STEEL; p.arms++; this.log(p.team === PLAYER ? PLAYER : -1, `${p.name}'s forges turn out better arms (level ${p.arms}).`, p.team === PLAYER ? 'good' : 'info'); }
      } else p.armsT = 0;
      // academy: silver -> science
      if (p.sci < 3 && p.silver >= SCI_SILVER && this.hasBuilding(p.team, 'academy')) {
        p.sciT += dt;
        if (p.sciT >= 16) { p.sciT = 0; p.silver -= SCI_SILVER; p.sci++; this.log(p.team === PLAYER ? PLAYER : -1, `${p.name}'s academy masters ${SCIENCE[p.sci - 1]}.`, p.team === PLAYER ? 'good' : 'info'); }
      } else p.sciT = 0;
    }
    // villages: a ware from the stockpile keeps a village content while a market, tavern or temple stands near it
    for (const v of this.villages) {
      if (v.joyT > 0) v.joyT -= dt;
      if (v.owner < 0) { v.joyT = 0; continue; }
      if (!(v.joyT > 0)) {
        const p = this.players[v.owner];
        if (p.ware >= 1 && this.buildings.some((b) => b.team === v.owner && b.built >= 1 && b.hp > 0 && (b.kind === 'market' || b.kind === 'tavern' || b.kind === 'temple') && Math.hypot(b.x - v.x, b.y - v.y) <= 20)) {
          p.ware -= 1; v.joyT = WARE_JOY.secs;
          if (v.owner === PLAYER) this.log(PLAYER, `${v.name} rejoices over fine ware.`, 'good');
        }
      }
    }
  }

  // ------------------------------------------------------------------ main tick
  tick(dt) {
    if (this.outcome) return;
    this.time += dt;
    this.visT -= dt;
    if (this.visT <= 0) { this.updateVisibility(); this.visT = 0.25; }
    this.updateBuildings(dt);
    this.updateEconomy(dt);
    this.updateVillages(dt);
    this.updateWanderers(dt);
    this.updateUnits(dt);
    this.updateProjectiles(dt);
    if (this.aiOn) updateAI(this, dt);
    this.cleanup();
    this.checkForfeit(dt);
    this.checkEnd(dt);
  }

  updateBuildings(dt) {
    for (const b of this.buildings) {
      if (b.hp <= 0) continue;
      b.flash = Math.max(0, b.flash - dt);
      if (b.built < 1) continue;
      const p = this.players[b.team];
      switch (b.kind) {
        case 'farm': p.food += 0.8 * dt * (FARM_SOIL[this.terrain[Math.floor(b.y) * this.W + Math.floor(b.x)]] || 0.9) * (this.nearBuilding(b, 'mill', 8) ? 1.25 : 1) * (p.sci >= 1 ? 1.15 : 1); break;
        case 'foundry': this.smelt(b, p, dt); break;
        case 'keep': this.tickKeep(b, dt); break;
        case 'tavern': if (!b.roster) { b.roster = this.newRoster(); b.rosterT = TAVERN_REFRESH; } else if ((b.rosterT -= dt) <= 0) { b.roster = this.newRoster(); b.rosterT = TAVERN_REFRESH; }
          this.earn(b.team, 'tavern', 0.35 * dt); break;
        case 'market': this.earn(b.team, 'market', this.consumerIncome(b) * dt); this.supplyMarket(b, p, dt); if (b.glut) for (const k in b.glut) b.glut[k] = Math.max(0, b.glut[k] - SELL.decay * dt); break;
        case 'temple': if (this.hasBuilding(b.team, 'academy')) this.earn(b.team, 'temple', 0.3 * dt); break;
        case 'academy': {
          let n = 0;
          for (const u of this.units) if (u.team === b.team && u.kind === 'scholar' && u.hp > 0 && Math.hypot(u.x - b.x, u.y - b.y) < 8) n++;
          b.scholars = Math.min(4, n);
          break;
        }
        case 'tower': this.towerFire(b, dt); break;
        default: break;
      }
      if (b.queue.length) {
        const q = b.queue[0];
        q.t += dt;
        if (q.t >= UNITS[q.kind].time) {
          b.queue.shift();
          const u = this.addUnit(q.kind, b.team, b.x + (Math.random() - 0.5) * 1.2, b.ty + b.size + 0.7);
          if (b.rally) {
            const node = b.rally.nodeId != null ? this.resources[b.rally.nodeId] : null;
            if (node && node.amount > 0 && u.kind === 'serf') this.cmdGather([u], node);
            else this.cmdMove([u], b.rally.x, b.rally.y);
          }
          if (b.team === PLAYER) { this.log(PLAYER, `${UNITS[q.kind].label} trained.`, 'info'); this.sfx('ready', b.x, b.y); }
        }
      }
    }
  }
  nearBuilding(b, kind, r) {
    return this.buildings.some((o) => o.team === b.team && o.kind === kind && o.built >= 1 && o.hp > 0 && Math.hypot(o.x - b.x, o.y - b.y) <= r);
  }

  towerFire(b, dt) {
    b.cooldown -= dt;
    if (b.cooldown > 0) return;
    const s = BUILDINGS.tower;
    let best = null, bd = s.range;
    for (const u of this.units) {
      if (u.hp <= 0 || u.inside || !this.isEnemy(b.team, u.team)) continue;
      const d = Math.hypot(u.x - b.x, u.y - b.y);
      if (d < bd) { best = u; bd = d; }
    }
    if (!best) return;
    b.cooldown = s.cd;
    this.projectiles.push({ x: b.x, y: b.y - 0.5, targetId: best.id, dmg: s.dmg, team: b.team }); this.sfx('arrow', b.x, b.y);
  }

  // idle soldiers of the lord standing around a village (an occupation force)
  watchersOf(v) {
    let n = 0;
    for (const u of this.units) if (u.team === v.owner && u.hp > 0 && !u.inside && SOLDIER.has(u.kind) && u.task.type === 'idle' && Math.hypot(u.x - v.x, u.y - v.y) <= 7) n++;
    return n;
  }
  // soldiers keeping a castle: those garrisoned inside plus idle ones standing watch nearby
  guardOf(b) {
    let n = 0;
    for (const id of b.garrison || []) { const u = this.byId.get(id); if (u && u.hp > 0 && SOLDIER.has(u.kind)) n++; }
    for (const u of this.units) if (u.team === b.team && u.hp > 0 && !u.inside && SOLDIER.has(u.kind) && u.task.type === 'idle' && Math.hypot(u.x - b.x, u.y - b.y) <= GUARD.watch + b.size / 2) n++;
    return n;
  }
  // influence of each house on a village: sum over its seats, falling off linearly with distance
  pullsFor(v) {
    const pulls = new Array(this.houses).fill(0);
    for (const b of this.buildings) {
      const inf = INFLUENCE[b.kind];
      if (!inf || b.hp <= 0 || b.built < 1) continue;
      const d = Math.hypot(v.x - b.x, v.y - b.y);
      if (d >= inf.r) continue;
      let p = (1 - d / inf.r) * inf.w;
      if (inf.guard) p *= GUARD.floor + (1 - GUARD.floor) * Math.min(1, this.guardOf(b) / GUARD.full);
      if (b.kind === 'academy') p *= 1 + 0.3 * (b.scholars || 0);
      pulls[b.team] += p;
    }
    for (const o of this.villages) {   // villages you hold lean on the ones around them, steadier with soldiers inside
      if (o === v || o.owner < 0) continue;
      const d = Math.hypot(v.x - o.x, v.y - o.y), inf = INFLUENCE_HOME;
      if (d >= inf.r) continue;
      pulls[o.owner] += (1 - d / inf.r) * inf.w * (GUARD.floor + (1 - GUARD.floor) * Math.min(1, o.garrison.length / GUARD.full));
    }
    for (const w of v.news || []) pulls[w.team] += w.amt;   // word brought by wanderers from a village that team holds
    return pulls;
  }

  updateVillages(dt) {
    for (const v of this.villages) {
      v.flash = Math.max(0, v.flash - dt);
      { // villages restock slowly: mining camps dig more ore than they started with
        const base = VILLAGE_KINDS[v.kind].stores;
        // the village purse refills from its folk's trade: bigger villages pay out more coin
        if (base.gold) v.stores.gold = Math.min(base.gold * 1.5, (v.stores.gold || 0) + (0.04 + v.pop * 0.012) * dt);
        for (const k in base) { if (k === 'gold') continue; const cap = v.kind === 'mine' && MATS.includes(k) ? base[k] * 1.5 : base[k]; if ((v.stores[k] || 0) < cap) v.stores[k] = Math.min(cap, (v.stores[k] || 0) + (v.kind === 'mine' && MATS.includes(k) ? 0.12 : 0.05) * dt); }
      }
      { // the folk eat from the village store: fed villages grow, dry ones shrink
        const food = v.stores.food || 0;
        v.stores.food = Math.max(0, food - v.pop * POP_FOOD * dt);
        v.hunger = food < 2 ? 1 : 0;
        if (v.founded && v.owner >= 0) v.stores.food = Math.min(90, (v.stores.food || 0) + (0.08 + v.pop * 0.0045) * dt);   // their own fields
        if (food > 10 && v.pop < v.popMax) v.pop = Math.min(v.popMax, v.pop + dt / (v.founded ? FOUND.grow : POP_GROW));
        else if (food < 2 && v.pop > 2) v.pop = Math.max(2, v.pop - dt / 90);
      }
      { // a quarter of the folk muster at the walls while the village is under attack, and go back in afterwards
        const want = v.hitT > 0 ? Math.floor(v.pop * MILITIA.share) : 0;
        v.mT = (v.mT || 0) + dt; v.militia = v.militia || 0;
        if (v.mT >= MILITIA.rampEvery) { v.mT = 0; if (v.militia < want) v.militia++; else if (v.militia > want) v.militia--; }
        if (v.news?.length) { for (const w of v.news) w.t -= dt; v.news = v.news.filter((w) => w.t > 0); }
        v.wanderT = (v.wanderT ?? (WANDER.every[0] + Math.random() * (WANDER.every[1] - WANDER.every[0]))) - dt * (v.hunger ? 3 : 1);
        if (v.wanderT <= 0) { v.wanderT = WANDER.every[0] + Math.random() * (WANDER.every[1] - WANDER.every[0]); this.sendWanderers(v); }
      }
      if (v.hitT > 0) v.hitT -= dt;
      else if (v.protection < v.maxProtection) v.protection = Math.min(v.maxProtection, v.protection + 1.5 * dt);
      // who leans on this village is worked out twice a second, not every tick (there are hundreds of villages on the big board)
      if (v._pt === undefined || (v._pt -= dt) <= 0) { v._pulls = this.pullsFor(v); v._pt = 0.4 + (v.id % 5) * 0.08; }
      const pulls = v._pulls;
      let best = -1, bp = 0;
      pulls.forEach((p, t) => { if (t !== v.owner && p > bp) { bp = p; best = t; } });
      if (v.owner < 0) {
        if (best >= 0 && bp > 0.02) {
          v.lean = best;
          v.loyalty = Math.min(100, v.loyalty + bp * LOYALTY_RATE * FREE_RATE * (v.spyFlip === best ? 2.5 : 1) * dt);
        } else {
          const base = VILLAGE_KINDS[v.kind].loyalty;
          v.loyalty += (base - v.loyalty) * 0.03 * dt;
        }
        if (v.loyalty >= SUBMIT_LOYALTY && v.lean >= 0 && this.alive(v.lean)) this.submit(v, v.lean, v.spyFlip === v.lean ? 'spy' : 'castle');
      } else {
        const vd = this.districtAt(v.owner, v.x, v.y), own = pulls[v.owner] + 0.12 * Math.min(6, v.garrison.length + this.watchersOf(v)) + (vd ? 0.06 * vd.score : 0);   // soldiers billeted in or standing watch over the village steady it
        const net = own - bp;
        if (own === 0 && bp === 0) v.loyalty = Math.max(0, v.loyalty - 0.06 * dt); // a lord far away is slowly forgotten
        else v.loyalty = Math.max(0, Math.min(100, v.loyalty + net * LOYALTY_RATE * dt));
        if (v.loyalty <= 8) {
          const lost = v.owner;
          this.ejectAll(v);
          v.owner = -1; v.lean = best; v.loyalty = 18; v.spyFlip = -1;
          this.log(lost, `${v.name} slips from its lord.`, 'warn');
        } else {
          const spec = VILLAGE_KINDS[v.kind].tribute, rate = (0.4 + (0.8 * v.loyalty) / 100) * (0.5 + 0.7 * (v.pop / v.popMax)), p = this.players[v.owner];
          const joy = (v.joyT > 0 ? 1.3 : 1) * (vd ? 1 + 0.12 * vd.score : 1); p.food += spec.food * rate * joy * dt; p.wood += spec.wood * rate * joy * dt; this.earn(v.owner, 'tribute', spec.gold * rate * joy * dt); this.earn(v.owner, 'tax', v.pop * TAX * (v.loyalty / 100) * dt);
          if (v.joyT > 0) v.loyalty = Math.min(100, v.loyalty + 0.5 * dt);
        }
      }
    }
  }

  // the village a building belongs to: the nearest one whose walls are within TOWN_RANGE tiles of it
  townOf(b) {
    let best = null, bd = TOWN_RANGE + 0.01;
    for (const v of this.villages) {
      const dx = Math.max(v.tx - (b.tx + b.size), b.tx - (v.tx + VILLAGE_SIZE), 0), dy = Math.max(v.ty - (b.ty + b.size), b.ty - (v.ty + VILLAGE_SIZE), 0), d = Math.max(dx, dy);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  // when a village changes hands, the buildings of the old lord that stand in its town go with it
  claimTown(v, team, prev) {
    let n = 0;
    for (const b of this.buildings) {
      if (b.hp <= 0 || b.kind === 'village' || b.team === team || b.team !== prev || prev < 0) continue;
      if (this.townOf(b) !== v) continue;
      this.ejectAll(b); b.queue = []; b.rally = null; b.team = team; b.town = v.id; b.flash = 1; n++;
      for (const u of this.units) if (u.team !== team && u.task?.buildingId === b.id) { u.task = { type: 'idle' }; u.path = []; }
    }
    if (n) { this.recomputeWalk?.(); this.updateVisibility?.(true); }
    return n;
  }

  submit(v, team, how) {
    if (v.owner === team) return;
    const prev = v.owner;
    this.ejectAll(v);
    v.owner = team; v.lean = team; v.spyFlip = -1; if (team === PLAYER) this.sfx('fanfare', v.x, v.y);
    const taken = this.claimTown(v, team, prev);
    let spoils = null;
    if (how === 'pillage') { v.pop = Math.max(2, v.pop * (1 - SACK.killed)); spoils = this.plunder(v, team); }   // the sack costs lives
    v.loyalty = how === 'pillage' ? 48 : 62;
    v.protection = v.maxProtection * 0.4;
    v.hitT = 0; v.flash = 1;
    const who = HOUSES[team].short;
    const text = { pillage: `${v.name} falls to ${who} after the sack.`, castle: `${v.name} bows to ${who}'s influence.`, spy: `${v.name} is turned by ${who}'s spy.` }[how] || `${v.name} submits to ${who}.`;
    this.log(team === PLAYER || prev === PLAYER ? PLAYER : -1, text + (taken ? ` ${taken} building${taken > 1 ? 's' : ''} in the town change hands.` : '') + (spoils ? ' ' + spoils.text : ''), team === PLAYER ? 'good' : 'warn');
  }

  updateUnits(dt) {
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      if (u.inside) { this.tickInside(u, dt); continue; }
      const s = UNITS[u.kind];
      u.cooldown = Math.max(0, u.cooldown - dt);
      u.flash = Math.max(0, (u.flash || 0) - dt);
      u.repathT -= dt;
      u.anim += dt * (u.path.length ? 8 : 2);
      switch (u.task.type) {
        case 'move': if (!this.follow(u, dt)) u.task = { type: 'idle' }; break;
        case 'attack': this.doAttack(u, s, dt); break;
        case 'gather': this.doGather(u, dt); break;
        case 'mine': this.doMine(u, dt); break;
        case 'return': this.doReturn(u, dt); break;
        case 'build': this.doBuild(u, dt); break;
        case 'infiltrate': this.doInfiltrate(u, dt); break;
        case 'enter': this.doEnter(u, dt); break;
        case 'caravan': if (u.task.route) this.doRoute(u, dt); else this.doCaravan(u, dt); break;
        default: this.doIdle(u, s, dt);
      }
      if (u.kind === 'scholar' && u.task.type === 'idle') {
        for (const o of this.units) if (o.team === u.team && o.hp > 0 && o.hp < o.maxHp && Math.hypot(o.x - u.x, o.y - u.y) < 3.5) o.hp = Math.min(o.maxHp, o.hp + 1.6 * dt);
      }
    }
  }

  doIdle(u, s, dt) {
    if (u.kind === 'serf' || u.kind === 'scholar' || u.kind === 'spy' || u.kind === 'camel') return;
    u.aggroT -= dt;
    if (u.aggroT > 0) return;
    u.aggroT = 0.45;
    const t = this.closestEnemy(u, Math.max(6.5, s.range + 2), u.team);
    if (t) { u.task = { type: 'attack', targetId: t.id }; u.repathT = 0; }
  }

  doAttack(u, s, dt) {
    const t = this.byId.get(u.task.targetId);
    const gone = !t || t.hp <= 0 && t.type !== 'village';
    if (gone) { u.task = { type: 'idle' }; u.path = []; return; }
    if (t.type === 'village') { if (t.owner === u.team || (t.owner >= 0 && !this.isEnemy(u.team, t.owner))) { u.task = { type: 'idle' }; u.path = []; return; } }
    else if (!this.isEnemy(u.team, t.team)) { u.task = { type: 'idle' }; u.path = []; return; }
    const d = distTo(u.x, u.y, t);
    if (d > s.range + 0.15) {
      if (!u.path.length || u.repathT <= 0) this.setPathToEntity(u, t);
      if (!this.follow(u, dt) && !u.path.length) u.repathT = Math.min(u.repathT, 0.3);
      return;
    }
    u.path = [];
    u.face = t.x >= u.x ? 1 : -1;
    if (u.cooldown > 0) return;
    u.cooldown = s.cd;
    let dmg = s.dmg;
    const arms = this.players[u.team].arms || 0;
    dmg += u.dmgAdd || 0;
    if (this.players[u.team].broke) dmg *= BROKE.fight;
    if ((u.kind === 'footman' || u.kind === 'knight') && this.hasBuilding(u.team, 'forge')) dmg += 3 + arms * 1.5;
    if (u.kind === 'bowman' && this.hasBuilding(u.team, 'forge')) dmg += 2 + arms;
    if (t.type === 'village') return this.hitVillage(u, t, dmg * s.vil, s);
    if (t.type === 'building') dmg *= s.bld;
    if (s.range > 1.6) { this.projectiles.push({ x: u.x, y: u.y - 0.3, targetId: t.id, dmg, team: u.team }); this.sfx('arrow', u.x, u.y); }
    else this.damage(t, dmg, u.team);
  }

  hitVillage(u, v, dmg, s) {
    const m = v.militia || 0;
    v.protection -= dmg / (1 + 0.2 * v.garrison.length + 0.06 * m); v.hitT = 6; v.flash = 0.2;
    if (m > 0) v.pop = Math.max(2, v.pop - MILITIA.loss * Math.min(m, 4));   // militia fall as they fight
    v.loyalty = Math.max(0, v.loyalty - 1.5);
    const loot = Math.min(2, v.stores.gold || 0);
    if (loot) { v.stores.gold -= loot; this.earn(u.team, 'loot', loot * 0.6); }
    // the folk fight back: the sturdier the village, the harder it bites
    u.hp -= (v.maxProtection / 32) * s.cd * (1 + MILITIA.bite * m);
    if (u.hp <= 0) u.hp = 0;
    if (v.protection <= 0) this.submit(v, u.team, 'pillage');
  }

  sfx(name, x, y) { if (this.sfxOn && this.sfxQ.length < 40) this.sfxQ.push({ name, x, y }); }
  damage(t, amt, byTeam) {
    if (t.hp <= 0) return;
    t.hp -= amt; t.flash = 0.15; this.sfx('hit', t.x, t.y);
    if (t.hp <= 0) {
      t.hp = 0; this.sfx(t.type === 'building' ? 'crumble' : 'death', t.x, t.y);
      if (this.sfxOn && this.fx.length < 30) this.fx.push({ x: t.x, y: t.y, kind: t.type === 'building' ? 'collapse' : 'poof', size: t.size || 1, born: this.time });
      if (t.type === 'building') {
        if (t.team === PLAYER) this.log(PLAYER, `Your ${BUILDINGS[t.kind].label} is destroyed!`, 'bad');
        else if (byTeam === PLAYER) this.log(PLAYER, `${HOUSES[t.team].short} ${BUILDINGS[t.kind].label} destroyed.`, 'good');
      }
      return;
    }
    if (t.team === PLAYER && this.time - this.alertT[PLAYER] > 8 && byTeam !== PLAYER) {
      this.alertT[PLAYER] = this.time;
      this.log(PLAYER, `Your ${t.type === 'unit' ? UNITS[t.kind].label : BUILDINGS[t.kind].label} is under attack!`, 'bad'); this.sfx('alarm', t.x, t.y);
    }
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      const t = this.byId.get(p.targetId);
      if (!t || t.hp <= 0) { p.dead = true; continue; }
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy), step = 13 * dt;
      p.ang = Math.atan2(dy, dx);
      if (d <= step + 0.2) { p.dead = true; this.damage(t, p.dmg, p.team); } else { p.x += (dx / d) * step; p.y += (dy / d) * step; }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < 1.3);
  }

  doGather(u, dt) {
    let node = this.resources[u.task.nodeId];
    if (!node || node.amount <= 0) {
      const res = node ? NODE_RES[node.kind] : u.carry?.kind;
      const next = res ? this.nearestNode(u.x, u.y, res, 14, u.team) : null;
      if (next) { u.task = { type: 'gather', nodeId: next.id }; this.setPath(u, next.x + 0.5, next.y + 0.5); }
      else if (u.carry && u.carry.amount > 0) { u.task = { type: 'return', resume: null }; u.path = []; }
      else u.task = { type: 'idle' };
      return;
    }
    if ((u.ruleT = (u.ruleT ?? 0) - dt) <= 0) {   // the ground may have slipped from our rule (a building fell, a village left)
      u.ruleT = 3;
      if (!this.ruled(u.team, node.x + 0.5, node.y + 0.5)) { if (u.carry && u.carry.amount > 0) { u.task = { type: 'return', resume: null }; u.path = []; } else u.task = { type: 'idle' }; return; }
    }
    const res = NODE_RES[node.kind];
    if (u.carry && (u.carry.kind !== res)) { u.task = { type: 'return', resume: node.id }; u.path = []; return; }
    if (u.carry && u.carry.amount >= CARRY_CAP) { u.task = { type: 'return', resume: node.id }; u.path = []; return; }
    const d = Math.hypot(u.x - (node.x + 0.5), u.y - (node.y + 0.5));
    if (d > 0.95) {
      if (!u.path.length || u.repathT <= 0) { if (!this.setPath(u, node.x + 0.5, node.y + 0.5) && d > 3) { u.task = { type: 'idle' }; return; } }
      this.follow(u, dt);
      return;
    }
    u.path = [];
    const take = Math.min(GATHER_RATE[res] * dt * (this.players[u.team].sci >= 1 ? 1.1 : 1), node.amount, CARRY_CAP - (u.carry?.amount || 0));
    node.amount -= take;
    if (!u.carry) u.carry = { kind: res, amount: 0 };
    u.carry.amount += take;
    if (node.amount <= 0) this.resAt[node.y * this.W + node.x] = -1;
  }

  doReturn(u, dt) {
    if (!u.carry || u.carry.amount <= 0) { this.resumeOrIdle(u); return; }
    const drop = this.nearestDrop(u, u.carry.kind);
    if (!drop) { u.task = { type: 'idle' }; return; }
    if (distTo(u.x, u.y, drop) > 1.35) {
      if (!u.path.length || u.repathT <= 0) this.setPathToEntity(u, drop);
      this.follow(u, dt);
      return;
    }
    u.path = [];
    const bonus = DROP_BONUS[drop.kind]?.[u.carry.kind] || 1;
    const amt = u.carry.amount * bonus;
    if (u.carry.kind === 'gold') this.earn(u.team, 'panning', amt); else this.players[u.team][u.carry.kind] += amt;
    if (u.team === PLAYER) this.floaters.push({ x: u.x, y: u.y - 0.6, text: `+${Math.round(amt)}`, res: u.carry.kind, age: 0 });
    u.carry = null;
    this.resumeOrIdle(u);
  }
  resumeOrIdle(u) {
    const node = u.task.resume != null ? this.resources[u.task.resume] : null;
    if (node && node.amount > 0) { u.task = { type: 'gather', nodeId: node.id }; this.setPath(u, node.x + 0.5, node.y + 0.5); }
    else u.task = { type: 'idle' };
  }

  // a serf with nothing left to do pitches in: grain or timber, whichever the house is short of, on ground it rules
  serfFallback(u) {
    u.task = { type: 'idle' };
    if (u.kind !== 'serf') return;
    const p = this.players[u.team], seat = this.seatOf(u.team);
    if (!seat) return;
    const node = this.nearestNode(u.x, u.y, p.wood < p.food ? 'wood' : 'food') || this.nearestNode(u.x, u.y, 'wood');
    if (node && Math.hypot(node.x - seat.x, node.y - seat.y) < 24) this.cmdGather([u], node);
  }

  doBuild(u, dt) {
    const b = this.byId.get(u.task.targetId);
    if (!b || b.hp <= 0 || b.built >= 1) {
      // queued sites first (Shift-placed or Shift-right-clicked), then anything unfinished close by
      while (u.buildQ.length) {
        const q = this.byId.get(u.buildQ.shift());
        if (q && q.hp > 0 && q.built < 1 && q.team === u.team) { u.task = { type: 'build', targetId: q.id }; this.setPathToEntity(u, q); return; }
      }
      // look for another unfinished building of ours close by before going idle
      const next = b ? null : this.buildings.find((o) => o.team === u.team && o.built < 1 && o.hp > 0 && Math.hypot(o.x - u.x, o.y - u.y) < 6);
      let nxt = next;
      if (!nxt && b && b.built >= 1 && b.team === u.team) nxt = this.buildings.find((o) => o.team === u.team && o.built < 1 && o.hp > 0 && Math.hypot(o.x - u.x, o.y - u.y) < 6);
      if (nxt) { u.task = { type: 'build', targetId: nxt.id }; this.setPathToEntity(u, nxt); return; }
      if (u.afterBuild?.mineId != null) {
        const m = this.byId.get(u.afterBuild.mineId); u.afterBuild = null;
        if (m && m.hp > 0 && m.built >= 1 && this.cmdMine([u], m)) return;
        this.serfFallback(u); return;
      }
      const back = u.afterBuild != null ? this.resources[u.afterBuild.nodeId] : null;
      u.afterBuild = null;
      if (back && back.amount > 0) { u.task = { type: 'gather', nodeId: back.id }; this.setPath(u, back.x + 0.5, back.y + 0.5); } else this.serfFallback(u);
      return;
    }
    if (distTo(u.x, u.y, b) > 1.25) {
      if (!u.path.length || u.repathT <= 0) this.setPathToEntity(u, b);
      this.follow(u, dt);
      return;
    }
    u.path = [];
    const time = BUILDINGS[b.kind].time;
    const rate = BUILDERS[u.kind] || 1;
    b.built = Math.min(1, b.built + (dt * rate) / time);
    b.hp = Math.min(b.maxHp, b.hp + (b.maxHp * 0.88 * dt * rate) / time);
    if (b.built >= 1) {
      b.hp = b.maxHp;
      if (b.kind === 'village') { this.foundVillage(b); return; }
      if (b.team === PLAYER) { this.log(PLAYER, `${BUILDINGS[b.kind].label} complete.`, 'good'); this.sfx('built', b.x, b.y); }
    }
  }

  doInfiltrate(u, dt) {
    const v = this.byId.get(u.task.targetId);
    if (!v) { u.task = { type: 'idle' }; return; }
    if (distTo(u.x, u.y, v) > 1.6) {
      if (!u.path.length || u.repathT <= 0) this.setPathToEntity(u, v);
      this.follow(u, dt);
      return;
    }
    u.path = [];
    u.hidden = true;
    if (v.owner === u.team) { v.loyalty = Math.min(100, v.loyalty + SPY_RATE * 0.4 * dt); return; }
    // Spies can be caught: sturdier villages watch harder
    if (Math.random() < (SPY_CATCH + v.protection / 16000) * dt) {
      u.hp = 0;
      this.log(u.team === PLAYER || v.owner === PLAYER ? PLAYER : -1, u.team === PLAYER ? `Your spy was caught in ${v.name}!` : `A spy of ${HOUSES[u.team].short} was caught in ${v.name}.`, u.team === PLAYER ? 'bad' : 'good');
      return;
    }
    if (v.owner < 0) {
      if (v.lean !== u.team && v.loyalty > 25) v.loyalty = Math.max(25, v.loyalty - SPY_RATE * dt * 0.5); // turning a village someone else leans on is slower
      v.lean = u.team; v.spyFlip = u.team;
      v.loyalty = Math.min(100, v.loyalty + SPY_RATE * dt);
      v.protection = Math.max(v.maxProtection * 0.5, v.protection - 0.5 * dt);
    } else {
      v.loyalty = Math.max(0, v.loyalty - SPY_RATE * dt);
      v.spyFlip = u.team;
      v.lean = u.team;
    }
  }

  // ------------------------------------------------------------------ fog of war
  setFog(on) {
    this.fogOn = on;
    if (on) this.seen.forEach((a) => a.fill(0));
    this.updateVisibility(true);
  }

  updateVisibility(force = false) {
    const { W, H } = this;
    for (let t = 0; t < this.houses; t++) {
      const vis = this.vis[t], seen = this.seen[t];
      if (!this.fogOn) { vis.fill(1); seen.fill(1); continue; }
      vis.fill(0);
      const mark = (x, y, r0) => {
        const r = Math.round(r0 * VISION_MUL), cx = Math.floor(x), cy = Math.floor(y), r2 = r * r;   // sight reaches VISION_MUL times further: eight times the ground is revealed
        for (let j = Math.max(0, cy - r); j <= Math.min(H - 1, cy + r); j++) {
          for (let i = Math.max(0, cx - r); i <= Math.min(W - 1, cx + r); i++) {
            if ((i - cx) ** 2 + (j - cy) ** 2 <= r2) { vis[j * W + i] = 1; seen[j * W + i] = 1; }
          }
        }
      };
      for (const u of this.units) if (u.team === t && u.hp > 0) mark(u.x, u.y, UNITS[u.kind].sight);
      for (const b of this.buildings) if (b.team === t && b.hp > 0) mark(b.x, b.y, BUILDINGS[b.kind].sight);
      for (const v of this.villages) if (v.owner === t) mark(v.x, v.y, v.home === t ? 13 : 8);
    }
    // meeting: a house is "known" once any of its people or buildings has been in sight (mutual: they have seen you too)
    for (let a = 0; a < this.houses; a++) for (let b = 0; b < this.houses; b++) {
      if (a === b || this.known[a][b]) continue;
      if (!this.fogOn) { this.meet(a, b); continue; }
      const va = this.vis[a];
      const hit = this.units.some((u) => u.team === b && u.hp > 0 && va[Math.floor(u.y) * W + Math.floor(u.x)] === 1)
        || this.buildings.some((o) => o.team === b && o.hp > 0 && va[Math.floor(o.y) * W + Math.floor(o.x)] === 1);
      if (hit) {
        this.meet(a, b);
        if (a === PLAYER || b === PLAYER) this.log(PLAYER, `You have met ${this.players[a === PLAYER ? b : a].name}. Treaties are now possible.`, 'good');
      }
    }
  }

  // ------------------------------------------------------------------ cleanup, elimination, victory
  cleanup() {
    let rebuilt = false;
    if (this.units.some((u) => u.hp <= 0)) {
      for (const u of this.units) if (u.hp <= 0) this.byId.delete(u.id);
      this.units = this.units.filter((u) => u.hp > 0);
    }
    if (this.buildings.some((b) => b.hp <= 0)) {
      for (const b of this.buildings) if (b.hp <= 0) { this.ejectAll(b); this.byId.delete(b.id); }
      this.buildings = this.buildings.filter((b) => b.hp > 0);
      rebuilt = true;
    }
    if (rebuilt) this.recomputeWalk();
    for (const p of this.players) {
      if (!p.alive) continue;
      if (!this.seatOf(p.team)) this.eliminate(p.team);
    }
  }

  eliminate(team) {
    const p = this.players[team];
    p.alive = false;
    for (const u of this.units) if (u.team === team) u.hp = 0;
    for (const b of this.buildings) if (b.team === team) b.hp = 0;
    for (const v of this.villages) if (v.owner === team) { v.owner = -1; v.loyalty = 25; v.lean = -1; }
    this.log(PLAYER, team === PLAYER ? 'Your house has fallen.' : `${p.name} has fallen.`, team === PLAYER ? 'bad' : 'good');
    this.cleanup();
  }

  // a house's fortune: coin plus the market value of its stockpile, counted in coin (grain and timber are bulk, not wealth)
  wealthOf(team) {
    const p = this.players[team];
    let w = p.gold;
    for (const k of ALL_GOODS) if (k !== 'gold' && k !== 'food' && k !== 'wood') w += ((p[k] || 0) * RES_VALUE[k]) / RES_VALUE.gold;
    return w;
  }
  // Victory is conquest only: every rival house must fall or forfeit. Wealth and village share no longer win the game (they still count in the standings).
  checkEnd(dt) {
    const living = this.players.filter((p) => p.alive).map((p) => p.team);
    if (!this.players[PLAYER].alive) { this.outcome = { result: 'defeat', kind: 'fallen', reason: 'Your villages and castles are gone.' }; return; }
    this.rivalsLeft = living.length - 1;
    if (living.length === 1) this.outcome = { result: 'victory', kind: 'conquest', reason: this.forfeits ? 'Every rival house has fallen or forfeited.' : 'Every rival house has fallen.' };
  }
  // A house that has lost its home village and has no soldiers left cannot fight on: after FORFEIT_AFTER seconds it forfeits and its holdings go free.
  checkForfeit(dt) {
    for (const p of this.players) {
      if (!p.alive || p.team === PLAYER) continue;
      const crippled = !this.villages.some((v) => v.home === p.team && v.owner === p.team) && this.militaryOf(p.team).length === 0;
      p.crippledT = crippled ? (p.crippledT || 0) + dt : 0;
      if (p.crippledT >= FORFEIT_AFTER) { this.forfeits = (this.forfeits || 0) + 1; this.log(PLAYER, `${p.name} has lost its home and its army, and forfeits.`, 'good'); this.eliminate(p.team); }
    }
  }

  // ------------------------------------------------------------------ save / load
  // A save keeps the seed (the map is regenerated, identically) plus everything that changes during play. Entities hold ids, never
  // references to each other, so plain JSON round-trips them. Fields starting with "_" are caches and are rebuilt.
  serialize() {
    const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k[0] === '_' ? undefined : v)));
    const rle = (a) => { const out = []; let v = a[0], n = 0; for (let i = 0; i < a.length; i++) { if (a[i] === v && n < 65535) n++; else { out.push(v, n); v = a[i]; n = 1; } } out.push(v, n); return out; };
    return {
      v: 1, size: this.W, seed: this.seed, houses: this.houses, fog: this.fogOn, ai: this.aiOn, diff: this.diffKey, saved: Date.now(),
      time: this.time, nextId: this.nextId, outcome: this.outcome, forfeits: this.forfeits || 0,
      units: clean(this.units), buildings: clean(this.buildings), villages: clean(this.villages), wanderers: clean(this.wanderers), projectiles: clean(this.projectiles),
      players: clean(this.players), known: this.known, offers: clean(this.offers), snub: this.snub, rel: this.rel, relSince: this.relSince,
      alertT: this.alertT, winHold: this.winHold, richHold: this.richHold, named: this.named.map((x) => (x ? [...x] : [])),
      resAmt: this.resources.map((r) => r.amount), seen: this.seen.map(rle),
    };
  }
  restore(d) {
    if (!d || d.v !== 1) throw new Error('This save is from a different version.');
    if ((d.size || 320) !== this.W) throw new Error(`That save is for a ${d.size || 320}-tile board; this one is ${this.W}. Change Board size in Options to match.`);
    this.reset({ seed: d.seed, houses: d.houses, fog: d.fog, ai: d.ai, diff: d.diff });
    this.time = d.time; this.nextId = d.nextId; this.outcome = d.outcome; this.forfeits = d.forfeits || 0;
    this.units = d.units; this.buildings = d.buildings; this.villages = d.villages; this.wanderers = d.wanderers; this.projectiles = d.projectiles;
    this.players = d.players; this.known = d.known; this.offers = d.offers; this.snub = d.snub; this.rel = d.rel; this.relSince = d.relSince;
    this.alertT = d.alertT; this.winHold = d.winHold; this.richHold = d.richHold; this.named = d.named.map((x) => new Set(x));
    { let a = ((this.seed ^ 0x9e3779b9) + Math.floor(this.time * 1000)) >>> 0; this.rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    d.resAmt.forEach((a, i) => { if (this.resources[i]) this.resources[i].amount = a; });
    this.seen = d.seen.map((r) => { const a = new Uint8Array(this.W * this.H); let p = 0; for (let i = 0; i < r.length; i += 2) { a.fill(r[i], p, p + r[i + 1]); p += r[i + 1]; } return a; });
    this.byId = new Map(); for (const e of [...this.units, ...this.buildings, ...this.villages]) this.byId.set(e.id, e);
    this.floaters = []; this.fx = []; this.events.length = 0;
    this.recomputeWalk(); this.visT = 0; this.updateVisibility(true);
    return this;
  }

  // ------------------------------------------------------------------ snapshot for a future network client
  snapshot() {
    return {
      time: this.time, seed: this.seed, outcome: this.outcome, rel: this.rel,
      players: this.players.map((p) => { const o = { team: p.team, name: p.name, alive: p.alive, arms: p.arms, sci: p.sci }; for (const k of ALL_GOODS) o[k] = (p[k] || 0) | 0; return o; }),
      known: this.known, offers: this.offers,
      units: this.units.map((u) => ({ id: u.id, k: u.kind, t: u.team, x: +u.x.toFixed(2), y: +u.y.toFixed(2), hp: u.hp | 0 })),
      buildings: this.buildings.map((b) => ({ id: b.id, k: b.kind, t: b.team, tx: b.tx, ty: b.ty, hp: b.hp | 0, built: +b.built.toFixed(2), nodeIds: b.nodeIds })),
      villages: this.villages.map((v) => ({ id: v.id, o: v.owner, loy: v.loyalty | 0, pro: v.protection | 0, pop: v.pop | 0 })),
    };
  }
}
