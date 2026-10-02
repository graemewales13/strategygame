// Seven Holds - the host-authoritative simulation. One Game object owns ALL state and ticks on dt.
// Clients never mutate it directly: they send intents through applyIntent() (see net.js) and read state to draw.
// No DOM access in this file, so it runs unchanged under Node for tests.

import {
  MAP_W, MAP_H, PLAYER, MIN_HOUSES, MAX_HOUSES, DEFAULT_HOUSES, HOUSES, T_DIRT, T_WATER, T_GRASS, T_FORD, T_ROCK, GROUND_COST, FARM_SOIL, POP_FOOD, POP_GROW, POP_HOUSING, SETTLE_FOOD,
  RES_VALUE, NODE_RES, GATHER_RATE, CARRY_CAP, START_RES, UNITS, BUILDINGS, DROP_OFF, DROP_BONUS, HAUL, STORES, CONSUMERS, GUARD, RULE,
  INFLUENCE, LOYALTY_RATE, SUBMIT_LOYALTY, SPY_RATE, SPY_CATCH, VILLAGE_WIN_SHARE, VILLAGE_WIN_HOLD,
  VILLAGE_KINDS, RELATIONS, DEFAULT_RELATION, RES, MATS, ALL_GOODS, MINE_RATE, MINE_MAX_WORKERS, SMELT, ARMS_STEEL, SCI_SILVER, SCIENCE, WARE_JOY, GOOD_LABEL,
  MINEABLE, CAMEL_CAP, MARKET_RADIUS, SHELF_CAP, SHELF_RESERVE, SPY_FEE, PROCESSED,
  GARRISON, VILLAGE_GARRISON, DRILL, LEVY, TAVERN_ROSTER, TAVERN_REFRESH, WANDERER_NAMES, TRAITS,
} from './config.js';
import { createMap } from './map.js';
import { makeUnit, makeBuilding, makeVillage, distTo, dist } from './entities.js';
import { updateAI } from './ai.js';

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
    this.reset(opts);
  }

  // ------------------------------------------------------------------ setup
  reset({ seed, houses = DEFAULT_HOUSES, fog = true, ai = true } = {}) {
    this.houses = Math.max(MIN_HOUSES, Math.min(MAX_HOUSES, houses));
    this.fogOn = fog;
    this.aiOn = ai;
    this.seed = seed ?? Math.floor(Math.random() * 1e9) + 1;
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
    this.projectiles = [];
    this.floaters = [];
    this.byId = new Map();
    this.alertT = new Array(this.houses).fill(-99);
    this.winHold = { team: -1, t: 0 };
    this.visT = 0;
    this.events.length = 0;

    const n = this.houses;
    this.players = Array.from({ length: n }, (_, i) => ({
      team: i, name: HOUSES[i].name, ...START_RES, alive: true, ai: i !== PLAYER, think: 0.8 + i * 0.55, arms: 0, sci: 0, armsT: 0, sciT: 0, offerT: 60 + i * 20,
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
      this.addBuilding('hall', team, sx, sy, true);
      this.addUnit('serf', team, sx + 1.2, sy + 3.6);
      this.addUnit('serf', team, sx + 2.0, sy + 3.6);
    });
    this.recomputeWalk();
    this.updateVisibility(true);
    this.log(PLAYER, `${this.biomeLabel}. A hall, two serfs and a starting purse: train serfs, raise cottages, a farm and a mine, then claim villages.`, 'info');
  }

  nid() { return this.nextId++; }
  log(team, text, kind = 'info') { this.events.push({ t: this.time, team, text, kind }); }

  addUnit(kind, team, x, y) {
    const u = makeUnit(this.nid(), kind, team, x, y);
    if ((this.players?.[team]?.sci || 0) >= 3) { u.maxHp = Math.round(u.maxHp * 1.15); u.hp = u.maxHp; } // Drill
    this.units.push(u);
    this.byId.set(u.id, u);
    return u;
  }
  addBuilding(kind, team, tx, ty, built) {
    const b = makeBuilding(this.nid(), kind, team, tx, ty, built);
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
  // a keep stands in for a lost hall (it is the other seat of the house), so a house that loses its hall can still raise buildings
  hasBuilding(team, kind) { return this.buildings.some((b) => b.team === team && (b.kind === kind || (kind === 'hall' && b.kind === 'keep')) && b.built >= 1 && b.hp > 0); }
  popUsed(team) {
    let n = 0;
    for (const u of this.units) if (u.team === team && u.hp > 0) n++;
    for (const b of this.buildings) if (b.team === team) n += b.queue.length;
    return n;
  }
  popCap(team) {
    let n = 0;
    for (const b of this.buildings) if (b.team === team && b.built >= 1 && b.hp > 0) n += BUILDINGS[b.kind].pop;
    for (const v of this.villages) if (v.owner === team) n += Math.floor(v.pop * POP_HOUSING);   // folk of held villages are housed there
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
  seatOf(team) {
    return this.buildings.find((b) => b.team === team && b.kind === 'keep' && b.hp > 0) || this.buildings.find((b) => b.team === team && b.kind === 'hall' && b.hp > 0);
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
      case 'stop': mine().forEach((u) => { u.task = { type: 'idle' }; u.path = []; }); return true;
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
      if (tgt) this.cmdCaravan(camels, tgt, want); else this.cmdMove(camels, x, y);
      if (!units.length) return true;
    }
    const eu = this.unitAt(x, y, 0.75);
    if (eu && eu.team !== team && this.canSee(team, eu.x, eu.y)) return this.cmdAttack(units, eu);
    const v = this.villageAt(x, y);
    if (v && v.owner === team) return this.cmdEnter(units, v);
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
      const serfs = units.filter((u) => u.kind === 'serf');
      if (serfs.length) { this.cmdBuild(serfs, b, queue); return true; }
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

  // ---- garrisons: right-click a friendly hall, keep, tower, barracks or village to go inside --------------------
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
  // a village you hold sends one of its folk out as a serf (needs grain and a free place in your population)
  settle(team, villageId) {
    const v = this.byId.get(villageId), p = this.players[team], say = (m) => { if (team === PLAYER) this.log(team, m, 'warn'); return false; };
    if (!v || v.type !== 'village' || v.owner !== team) return say('Only a village you hold can send settlers.');
    if (v.pop < 4) return say(`${v.name} is too small to spare anyone.`);
    if (p.food < SETTLE_FOOD) return say(`Settlers need ${SETTLE_FOOD} grain for the road.`);
    if (this.popUsed(team) + 1 > this.popCap(team) + 0) return say('Population capped: raise cottages.');
    p.food -= SETTLE_FOOD; v.pop -= 1;
    const u = this.addUnit('serf', team, v.x - 0.5 + (Math.random() - 0.5), v.ty + v.size + 0.7);
    u.name = `Settler of ${v.name}`;
    if (team === PLAYER) this.log(team, `A settler leaves ${v.name} (${Math.floor(v.pop)} folk remain).`, 'info');
    return true;
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
          u.name = `Villager of ${v.name}`; u.trait = 'green'; u.inside = b.id; b.garrison.push(u.id);
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
    if (!node) { u.task = { type: 'idle' }; u.path = []; if (u.team === PLAYER) this.log(PLAYER, 'The seam is spent. The diggers stand idle.', 'warn'); return; }
    if (distTo(u.x, u.y, b) > 1.3) {
      if (!u.path.length || u.repathT <= 0) this.setPathToEntity(u, b);
      this.follow(u, dt);
      return;
    }
    u.path = [];
    const p = this.players[u.team];
    const take = Math.min(node.amount, MINE_RATE[node.kind] * dt * (p.sci >= 1 ? 1.1 : 1));
    node.amount -= take;
    p[node.kind] += take * this.haulOf(b);
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
      b._haul = d <= HAUL.free ? 1 : Math.max(HAUL.min, 1 - (1 - HAUL.min) * (d - HAUL.free) / (HAUL.far - HAUL.free));
      b._haulT = this.time;
    }
    return b._haul;
  }
  cmdBuild(units, b, queue = false) {
    if (!b || b.type !== 'building' || b.built >= 1) return false;
    for (const u of units) {
      if (u.kind !== 'serf' || u.inside) continue;
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
    let builders = (ids || []).map((id) => this.byId.get(id)).filter((u) => u && u.team === team && u.kind === 'serf' && u.hp > 0);
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
  // the market's coin: cottages and villages of ours within reach are its customers
  consumerIncome(b) {
    let n = 0;
    for (const o of this.buildings) if (o.team === b.team && o.kind === 'cottage' && o.built >= 1 && o.hp > 0 && Math.hypot(o.x - b.x, o.y - b.y) <= MARKET_RADIUS) n++;
    for (const v of this.villages) if (v.owner === b.team && Math.hypot(v.x - b.x, v.y - b.y) <= MARKET_RADIUS) n += 2;
    return CONSUMERS.base + CONSUMERS.each * Math.min(CONSUMERS.max, n);
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
    if (t.type === 'village') return t.owner === -1 ? Math.max(0.15, Math.min(0.45, 0.2 + d / 400)) : Math.max(0.08, Math.min(0.3, 0.06 + d / 500));
    return Math.max(0.08, Math.min(0.3, 0.06 + d / 500));
  }
  quoteFor(from, t, give, want, amount) {
    if (!ALL_GOODS.includes(give) || !ALL_GOODS.includes(want) || give === want) return null;
    const fee = this.feeFor(from, t);
    return { fee, got: Math.floor((amount * RES_VALUE[give] / RES_VALUE[want]) * (1 - fee)) };
  }
  tradeTargetAt(team, x, y) {
    const v = this.villageAt(x, y); if (v) return v;
    const b = this.buildingAt(x, y); return b && b.kind === 'market' ? b : null;
  }
  cmdCaravan(units, t, want) {
    const camels = units.filter((u) => u.kind === 'camel' && u.hp > 0);
    if (!camels.length) return false;
    const team = camels[0].team, chk = this.canDeal(team, t);
    if (!chk.ok) { if (team === PLAYER) this.log(team, chk.reason, 'warn'); return false; }
    for (const u of camels) { u.inside = null; u.task = { type: 'caravan', targetId: t.id, want: ALL_GOODS.includes(want) ? want : null, stage: 'out' }; this.setPathToEntity(u, t); }
    return true;
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
    if (u.cargo) for (const g in u.cargo) { p[g] = (p[g] || 0) + u.cargo[g]; if (u.team === PLAYER && u.cargo[g] >= 1) this.floaters.push({ x: t.x, y: t.y - 1, text: `+${Math.round(u.cargo[g])}`, res: g, age: 0 }); }
    u.cargo = {}; u.task = { type: 'idle' };
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
    let soldAny = false;
    for (const give of Object.keys(u.cargo)) {
      if (give === want || u.cargo[give] < 1) continue;
      const fee = this.feeFor(u, t), r = (RES_VALUE[give] / RES_VALUE[want]) * (1 - fee), avail = this.stockOf(t, want);
      const total = this.cargoTotal(u);
      let s = Math.floor(u.cargo[give]);
      for (; s > 0; s--) { const got = Math.floor(s * r); if (got <= avail && total - s + got <= CAMEL_CAP) break; }
      const got = Math.floor(s * r);
      if (s < 1 || got < 1) continue;
      if (t.type === 'village') { t.stores[want] -= got; t.stores[give] = (t.stores[give] || 0) + s; }
      else { t.stock[want] -= got; them[give] = (them[give] || 0) + s; }
      u.cargo[give] -= s; u.cargo[want] = (u.cargo[want] || 0) + got; soldAny = true;
      say(`Caravan: ${s} ${give} for ${got} ${want} at ${name} (fee ${Math.round(fee * 100)}%).`, 'good');
    }
    if (!soldAny) say(`${name} could not trade ${GOOD_LABEL[want].toLowerCase()} for what you carry (empty shelf, or nothing to sell).`, 'warn');
    for (const g of Object.keys(u.cargo)) if (u.cargo[g] < 0.01) delete u.cargo[g];
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
  proposeRelation(a, b, state) {
    if (!this.alive(b) || a === b) return false;
    if (state === 'war') { this.setRelation(a, b, 'war'); return true; }
    if (this.rel[a][b] === state) return true;
    if (state === 'peace' && this.rel[a][b] === 'trade') { this.setRelation(a, b, 'peace'); return true; } // either side may cancel a treaty
    if (!this.known[a][b]) { if (a === PLAYER) this.log(PLAYER, 'You have not met that house yet. Scout toward them.', 'warn'); return false; }
    if (this.rel[a][b] === 'war' && this.time - this.relSince[a][b] < 60) {
      if (a === PLAYER) this.log(PLAYER, `${this.players[b].name} will not parley yet.`, 'warn');
      return false;
    }
    // a pending offer from them to us is simply accepted
    const back = this.offers.findIndex((o) => o.from === b && o.to === a && o.state === state);
    if (back >= 0) return this.respondOffer(a, b, true);
    if (this.players[b].ai) {
      if (a === PLAYER && this.time - this.snub[b][a] < 45 && state === 'trade') { this.log(PLAYER, `${this.players[b].name} is still sulking over your last offer.`, 'warn'); return false; }
      this.setRelation(a, b, state);
      return true;
    }
    if (this.offers.some((o) => o.from === a && o.to === b && o.state === state)) return false;
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
    b.job.t += dt;
    if (b.job.t >= SMELT[b.job.kind].time) {
      p[b.job.kind] += 1;
      if (b.team === PLAYER) this.floaters.push({ x: b.x, y: b.y - 1, text: `+1`, res: b.job.kind, age: 0 });
      b.job = null;
    }
  }
  updateEconomy(dt) {
    for (const p of this.players) {
      if (!p.alive) continue;
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
    this.updateUnits(dt);
    this.updateProjectiles(dt);
    if (this.aiOn) updateAI(this, dt);
    this.cleanup();
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
          p.gold += 0.35 * dt; break;
        case 'market': p.gold += this.consumerIncome(b) * dt; this.supplyMarket(b, p, dt); break;
        case 'temple': if (this.hasBuilding(b.team, 'academy')) p.gold += 0.3 * dt; break;
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
          if (b.team === PLAYER) this.log(PLAYER, `${UNITS[q.kind].label} trained.`, 'info');
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
    this.projectiles.push({ x: b.x, y: b.y - 0.5, targetId: best.id, dmg: s.dmg, team: b.team });
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
    return pulls;
  }

  updateVillages(dt) {
    for (const v of this.villages) {
      v.flash = Math.max(0, v.flash - dt);
      { // villages restock slowly: mining camps dig more ore than they started with
        const base = VILLAGE_KINDS[v.kind].stores;
        for (const k in base) { const cap = v.kind === 'mine' && MATS.includes(k) ? base[k] * 1.5 : base[k]; if ((v.stores[k] || 0) < cap) v.stores[k] = Math.min(cap, (v.stores[k] || 0) + (v.kind === 'mine' && MATS.includes(k) ? 0.12 : 0.05) * dt); }
      }
      { // the folk eat from the village store: fed villages grow, dry ones shrink
        const food = v.stores.food || 0;
        v.stores.food = Math.max(0, food - v.pop * POP_FOOD * dt);
        v.hunger = food < 2 ? 1 : 0;
        if (food > 10 && v.pop < v.popMax) v.pop = Math.min(v.popMax, v.pop + dt / POP_GROW);
        else if (food < 2 && v.pop > 2) v.pop = Math.max(2, v.pop - dt / 90);
      }
      if (v.hitT > 0) v.hitT -= dt;
      else if (v.protection < v.maxProtection) v.protection = Math.min(v.maxProtection, v.protection + 1.5 * dt);
      const pulls = this.pullsFor(v);
      let best = -1, bp = 0;
      pulls.forEach((p, t) => { if (t !== v.owner && p > bp) { bp = p; best = t; } });
      if (v.owner < 0) {
        if (best >= 0 && bp > 0.02) {
          v.lean = best;
          v.loyalty = Math.min(100, v.loyalty + bp * LOYALTY_RATE * dt);
        } else {
          const base = VILLAGE_KINDS[v.kind].loyalty;
          v.loyalty += (base - v.loyalty) * 0.03 * dt;
        }
        if (v.loyalty >= SUBMIT_LOYALTY && v.lean >= 0 && this.alive(v.lean)) this.submit(v, v.lean, v.spyFlip === v.lean ? 'spy' : 'castle');
      } else {
        const own = pulls[v.owner] + 0.12 * Math.min(6, v.garrison.length + this.watchersOf(v));   // soldiers billeted in or standing watch over the village steady it
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
          const joy = v.joyT > 0 ? 1.3 : 1; p.food += spec.food * rate * joy * dt; p.wood += spec.wood * rate * joy * dt; p.gold += spec.gold * rate * joy * dt;
          if (v.joyT > 0) v.loyalty = Math.min(100, v.loyalty + 0.5 * dt);
        }
      }
    }
  }

  submit(v, team, how) {
    if (v.owner === team) return;
    const prev = v.owner;
    this.ejectAll(v);
    v.owner = team; v.lean = team; v.spyFlip = -1;
    if (how === 'pillage') v.pop = Math.max(2, v.pop * 0.75);   // the sack costs lives
    v.loyalty = how === 'pillage' ? 48 : 62;
    v.protection = v.maxProtection * 0.4;
    v.hitT = 0; v.flash = 1;
    const who = HOUSES[team].short;
    const text = { pillage: `${v.name} falls to ${who} after the sack.`, castle: `${v.name} bows to ${who}'s influence.`, spy: `${v.name} is turned by ${who}'s spy.` }[how] || `${v.name} submits to ${who}.`;
    this.log(team === PLAYER || prev === PLAYER ? PLAYER : -1, text, team === PLAYER ? 'good' : 'warn');
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
        case 'caravan': this.doCaravan(u, dt); break;
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
    if ((u.kind === 'footman' || u.kind === 'knight') && this.hasBuilding(u.team, 'forge')) dmg += 3 + arms * 1.5;
    if (u.kind === 'bowman' && this.hasBuilding(u.team, 'forge')) dmg += 2 + arms;
    if (t.type === 'village') return this.hitVillage(u, t, dmg * s.vil, s);
    if (t.type === 'building') dmg *= s.bld;
    if (s.range > 1.6) this.projectiles.push({ x: u.x, y: u.y - 0.3, targetId: t.id, dmg, team: u.team });
    else this.damage(t, dmg, u.team);
  }

  hitVillage(u, v, dmg, s) {
    v.protection -= dmg / (1 + 0.2 * v.garrison.length); v.hitT = 6; v.flash = 0.2;
    v.loyalty = Math.max(0, v.loyalty - 1.5);
    const loot = Math.min(2, v.stores.gold || 0);
    if (loot) { v.stores.gold -= loot; this.players[u.team].gold += loot * 0.6; }
    // the folk fight back: the sturdier the village, the harder it bites
    u.hp -= (v.maxProtection / 32) * s.cd;
    if (u.hp <= 0) u.hp = 0;
    if (v.protection <= 0) this.submit(v, u.team, 'pillage');
  }

  damage(t, amt, byTeam) {
    if (t.hp <= 0) return;
    t.hp -= amt; t.flash = 0.15;
    if (t.hp <= 0) {
      t.hp = 0;
      if (t.type === 'building') {
        if (t.team === PLAYER) this.log(PLAYER, `Your ${BUILDINGS[t.kind].label} is destroyed!`, 'bad');
        else if (byTeam === PLAYER) this.log(PLAYER, `${HOUSES[t.team].short} ${BUILDINGS[t.kind].label} destroyed.`, 'good');
      }
      return;
    }
    if (t.team === PLAYER && this.time - this.alertT[PLAYER] > 8 && byTeam !== PLAYER) {
      this.alertT[PLAYER] = this.time;
      this.log(PLAYER, `Your ${t.type === 'unit' ? UNITS[t.kind].label : BUILDINGS[t.kind].label} is under attack!`, 'bad');
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
    this.players[u.team][u.carry.kind] += amt;
    if (u.team === PLAYER) this.floaters.push({ x: u.x, y: u.y - 0.6, text: `+${Math.round(amt)}`, res: u.carry.kind, age: 0 });
    u.carry = null;
    this.resumeOrIdle(u);
  }
  resumeOrIdle(u) {
    const node = u.task.resume != null ? this.resources[u.task.resume] : null;
    if (node && node.amount > 0) { u.task = { type: 'gather', nodeId: node.id }; this.setPath(u, node.x + 0.5, node.y + 0.5); }
    else u.task = { type: 'idle' };
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
        u.task = { type: 'idle' }; return;
      }
      const back = u.afterBuild != null ? this.resources[u.afterBuild.nodeId] : null;
      u.afterBuild = null;
      if (back && back.amount > 0) { u.task = { type: 'gather', nodeId: back.id }; this.setPath(u, back.x + 0.5, back.y + 0.5); } else u.task = { type: 'idle' };
      return;
    }
    if (distTo(u.x, u.y, b) > 1.25) {
      if (!u.path.length || u.repathT <= 0) this.setPathToEntity(u, b);
      this.follow(u, dt);
      return;
    }
    u.path = [];
    const time = BUILDINGS[b.kind].time;
    b.built = Math.min(1, b.built + dt / time);
    b.hp = Math.min(b.maxHp, b.hp + (b.maxHp * 0.88 * dt) / time);
    if (b.built >= 1) {
      b.hp = b.maxHp;
      if (b.team === PLAYER) this.log(PLAYER, `${BUILDINGS[b.kind].label} complete.`, 'good');
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
      const mark = (x, y, r) => {
        const cx = Math.floor(x), cy = Math.floor(y), r2 = r * r;
        for (let j = Math.max(0, cy - r); j <= Math.min(H - 1, cy + r); j++) {
          for (let i = Math.max(0, cx - r); i <= Math.min(W - 1, cx + r); i++) {
            if ((i - cx) ** 2 + (j - cy) ** 2 <= r2) { vis[j * W + i] = 1; seen[j * W + i] = 1; }
          }
        }
      };
      for (const u of this.units) if (u.team === t && u.hp > 0) mark(u.x, u.y, UNITS[u.kind].sight);
      for (const b of this.buildings) if (b.team === t && b.hp > 0) mark(b.x, b.y, BUILDINGS[b.kind].sight);
      for (const v of this.villages) if (v.owner === t) mark(v.x, v.y, 6);
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
      const seat = this.buildings.some((b) => b.team === p.team && (b.kind === 'hall' || b.kind === 'keep') && b.hp > 0);
      if (!seat) this.eliminate(p.team);
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

  checkEnd(dt) {
    const living = this.players.filter((p) => p.alive).map((p) => p.team);
    if (!this.players[PLAYER].alive) { this.outcome = { result: 'defeat', reason: 'Your hall and keep are gone.' }; return; }
    if (living.length === 1) { this.outcome = { result: 'victory', reason: 'Every rival house has fallen.' }; return; }
    // village share victory: hold VILLAGE_WIN_SHARE of all villages for VILLAGE_WIN_HOLD seconds
    const need = Math.ceil(this.villages.length * VILLAGE_WIN_SHARE);
    const counts = new Array(this.houses).fill(0);
    for (const v of this.villages) if (v.owner >= 0) counts[v.owner]++;
    const lead = counts.indexOf(Math.max(...counts));
    if (counts[lead] >= need) {
      if (this.winHold.team !== lead) this.winHold = { team: lead, t: 0 };
      this.winHold.t += dt;
      if (this.winHold.t >= VILLAGE_WIN_HOLD) {
        this.outcome = lead === PLAYER
          ? { result: 'victory', reason: `You hold ${counts[lead]} of ${this.villages.length} villages. The valley is yours.` }
          : { result: 'defeat', reason: `${this.players[lead].name} holds ${counts[lead]} of ${this.villages.length} villages.` };
      }
    } else this.winHold = { team: -1, t: 0 };
    this.villageNeed = need;
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
