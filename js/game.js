// Seven Holds - the host-authoritative simulation. One Game object owns ALL state and ticks on dt.
// Clients never mutate it directly: they send intents through applyIntent() (see net.js) and read state to draw.
// No DOM access in this file, so it runs unchanged under Node for tests.

import {
  MAP_W, MAP_H, PLAYER, MIN_HOUSES, MAX_HOUSES, DEFAULT_HOUSES, HOUSES, T_DIRT, T_WATER, T_GRASS, T_FORD,
  RES_VALUE, NODE_RES, GATHER_RATE, CARRY_CAP, START_RES, UNITS, BUILDINGS, DROP_OFF, DROP_BONUS, TERRITORY,
  INFLUENCE, LOYALTY_RATE, SUBMIT_LOYALTY, SPY_RATE, SPY_CATCH, VILLAGE_WIN_SHARE, VILLAGE_WIN_HOLD,
  VILLAGE_KINDS, RELATIONS, DEFAULT_RELATION, RES,
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
      team: i, name: HOUSES[i].name, ...START_RES, alive: true, ai: i !== PLAYER, think: 0.8 + i * 0.55,
    }));
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
    this.log(PLAYER, `A small hall and two serfs. Expand, claim villages, raise a keep.`, 'info');
  }

  nid() { return this.nextId++; }
  log(team, text, kind = 'info') { this.events.push({ t: this.time, team, text, kind }); }

  addUnit(kind, team, x, y) {
    const u = makeUnit(this.nid(), kind, team, x, y);
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
    for (let i = 0; i < W * H; i++) walk[i] = terrain[i] !== T_WATER && !block[i] ? 1 : 0;
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
    return n;
  }
  canAfford(team, cost) {
    const p = this.players[team];
    return p.food >= cost.food && p.wood >= cost.wood && p.gold >= cost.gold;
  }
  pay(team, cost, sign = 1) {
    const p = this.players[team];
    p.food -= cost.food * sign; p.wood -= cost.wood * sign; p.gold -= cost.gold * sign;
  }
  seatOf(team) {
    return this.buildings.find((b) => b.team === team && b.kind === 'keep' && b.hp > 0) || this.buildings.find((b) => b.team === team && b.kind === 'hall' && b.hp > 0);
  }
  villagesOf(team) { return this.villages.filter((v) => v.owner === team); }
  militaryOf(team) { return this.units.filter((u) => u.team === team && u.hp > 0 && u.kind !== 'serf' && u.kind !== 'scholar' && u.kind !== 'spy'); }
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
      if (u.hp <= 0 || (team !== null && u.team !== team)) continue;
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
  nearestNode(x, y, res, maxDist = 1e9) {
    let best = null, bd = maxDist * maxDist;
    for (const n of this.resources) {
      if (n.amount <= 0 || NODE_RES[n.kind] !== res) continue;
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
      if (u.hp <= 0 || !this.isEnemy(team, u.team)) continue;
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
        const step = (k >= 4 ? 1.414 : 1) * (terrain[ni] === T_DIRT ? 0.85 : 1);
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
    u.path = p || [];
    u.pathGoal = [x, y];
    u.repathT = 0.9;
    return !!p;
  }
  // head toward the footprint of a building/village: goal is the free tile beside it, on the unit's side
  setPathToEntity(u, t) {
    if (!t.size) return this.setPath(u, t.x, t.y);
    const n = this.nearestWalkable(Math.floor(t.x), Math.floor(t.y), Math.ceil(t.size / 2) + 3, Math.floor(u.x), Math.floor(u.y));
    if (!n) { u.path = []; return false; }
    return this.setPath(u, n[0] + 0.5, n[1] + 0.5);
  }

  follow(u, dt) {
    if (!u.path.length) return false;
    let step = u.speed ?? UNITS[u.kind].speed;
    const tileIdx = Math.floor(u.y) * this.W + Math.floor(u.x);
    step *= (this.terrain[tileIdx] === T_DIRT ? 1.18 : 1) * dt;
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
      case 'build': return this.cmdBuild(mine(), this.byId.get(it.buildingId));
      case 'place': return this.place(team, it.kind, it.tx, it.ty, it.ids);
      case 'train': return this.train(team, it.buildingId, it.kind);
      case 'cancel': return this.cancelTrain(team, it.buildingId, it.index);
      case 'rally': return this.setRally(team, it.buildingId, it.x, it.y, it.nodeId);
      case 'trade': return this.trade(team, it.partner, it.give, it.get, it.amount);
      case 'relation': return this.proposeRelation(team, it.other, it.state);
      case 'context': return this.contextCommand(team, it.ids, it.x, it.y);
      default: return null;
    }
  }

  // Right-click: decide what the point means for these units (as the owning player sees it)
  contextCommand(team, ids, x, y) {
    const units = (ids || []).map((id) => this.byId.get(id)).filter((u) => u && u.type === 'unit' && u.team === team && u.hp > 0);
    if (!units.length) return false;
    const eu = this.unitAt(x, y, 0.75);
    if (eu && eu.team !== team && this.canSee(team, eu.x, eu.y)) return this.cmdAttack(units, eu);
    const v = this.villageAt(x, y);
    if (v && v.owner !== team && this.wasSeen(team, v.x, v.y)) {
      const spies = units.filter((u) => u.kind === 'spy'), rest = units.filter((u) => u.kind !== 'spy' && u.kind !== 'serf' && u.kind !== 'scholar');
      if (spies.length) this.cmdInfiltrate(spies, v);
      if (rest.length) this.cmdAttack(rest, v);
      const others = units.filter((u) => u.kind === 'serf' || u.kind === 'scholar');
      if (others.length) this.cmdMove(others, x, y);
      return true;
    }
    const b = this.buildingAt(x, y);
    if (b && b.team !== team && this.wasSeen(team, b.x, b.y)) return this.cmdAttack(units.filter((u) => u.kind !== 'serf' || units.length === 1), b);
    if (b && b.team === team && b.built < 1) {
      const serfs = units.filter((u) => u.kind === 'serf');
      if (serfs.length) { this.cmdBuild(serfs, b); return true; }
    }
    if (b && b.team === team && b.built >= 1) {
      const carriers = units.filter((u) => u.kind === 'serf' && u.carry && DROP_OFF[b.kind]?.includes(u.carry.kind));
      if (carriers.length) carriers.forEach((u) => { u.task = { type: 'return', resume: null }; this.setPathToEntity(u, b); });
      const rest = units.filter((u) => !carriers.includes(u));
      if (rest.length) this.cmdMove(rest, x, y);
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
    for (const u of units) {
      if (u.kind !== 'serf') continue;
      const res = NODE_RES[node.kind];
      if (u.carry && u.carry.kind !== res) u.carry = null; // drop whatever else was in hand
      u.task = { type: 'gather', nodeId: node.id };
      this.setPath(u, node.x + 0.5, node.y + 0.5);
    }
    return true;
  }
  cmdBuild(units, b) {
    if (!b || b.type !== 'building' || b.built >= 1) return false;
    for (const u of units) {
      if (u.kind !== 'serf') continue;
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
      if (this.block[i]) return { ok: false, reason: 'Blocked' };
      if (this.resAt[i] >= 0 && this.resources[this.resAt[i]].amount > 0) return { ok: false, reason: 'Blocked by resources' };
    }
    const cx = tx + s.size / 2, cy = ty + s.size / 2;
    const inRange = this.buildings.some((b) => b.team === team && b.hp > 0 && b.built >= 1 && TERRITORY[b.kind] && Math.hypot(b.x - cx, b.y - cy) <= TERRITORY[b.kind]);
    if (!inRange) return { ok: false, reason: 'Outside your territory (a keep extends it)' };
    if (!this.units.some((u) => u.team === team && u.kind === 'serf' && u.hp > 0)) return { ok: false, reason: 'You need a serf to build' };
    return { ok: true };
  }

  place(team, kind, tx, ty, ids = null) {
    const chk = this.canPlace(team, kind, tx, ty);
    if (!chk.ok) { if (team === PLAYER) this.log(team, chk.reason, 'warn'); return null; }
    const s = BUILDINGS[kind];
    this.pay(team, s.cost);
    const b = this.addBuilding(kind, team, tx, ty, false);
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
    this.cmdBuild(builders, b);
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

  tradePartners(team) {
    const out = [];
    this.players.forEach((p, t) => { if (t !== team && p.alive && this.rel[team][t] === 'trade') out.push({ type: 'house', id: t, name: p.name, seat: this.seatOf(t) }); });
    for (const v of this.villages) {
      const ok = v.owner === team || (v.owner === -1 && v.loyalty >= 40) || (v.owner >= 0 && v.owner !== team && this.rel[team][v.owner] === 'trade');
      if (ok) out.push({ type: 'village', id: v.id, name: v.name, seat: v });
    }
    return out;
  }
  tradeQuote(team, partner, give, get, amount) {
    const mk = this.buildings.find((b) => b.team === team && b.kind === 'market' && b.built >= 1 && b.hp > 0);
    if (!mk || !partner?.seat || give === get) return null;
    const d = Math.hypot(mk.x - partner.seat.x, mk.y - partner.seat.y);
    const rel = partner.type === 'house' ? 0.08 : 0.04;
    const fee = Math.max(0.1, Math.min(0.55, 0.3 - rel + d / 320));
    const got = Math.floor((amount * RES_VALUE[give] / RES_VALUE[get]) * (1 - fee));
    return { got, fee, dist: d };
  }
  trade(team, partnerRef, give, get, amount) {
    const say = (m) => { if (team === PLAYER) this.log(team, m, 'warn'); return null; };
    if (!RES.includes(give) || !RES.includes(get) || give === get || !(amount > 0)) return null;
    const partner = this.tradePartners(team).find((p) => p.type === partnerRef?.type && p.id === partnerRef?.id);
    if (!partner) return say('No trade partner there (needs relation: trade).');
    const quote = this.tradeQuote(team, partner, give, get, amount);
    if (!quote) return say('Build a Market to trade.');
    const me = this.players[team];
    if (me[give] < amount) return say('Not enough to give.');
    if (quote.got < 1) return say('Too little to trade.');
    if (partner.type === 'house') {
      const them = this.players[partner.id];
      if (them[get] < quote.got) return say(`${them.name} cannot cover that.`);
      them[get] -= quote.got; them[give] += amount;
    } else {
      const v = this.byId.get(partner.id);
      if ((v.stores[get] || 0) < quote.got) return say(`${v.name} cannot cover that.`);
      v.stores[get] -= quote.got; v.stores[give] = (v.stores[give] || 0) + amount;
    }
    me[give] -= amount; me[get] += quote.got;
    if (team === PLAYER) this.log(team, `Traded ${amount} ${give} for ${quote.got} ${get} with ${partner.name}.`, 'info');
    return quote;
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
  // player-facing: peace/trade must be accepted by the AI house; war needs nobody's consent
  proposeRelation(a, b, state) {
    if (!this.alive(b) || a === b) return false;
    if (state === 'war') { this.setRelation(a, b, 'war'); return true; }
    if (this.rel[a][b] === state) return true;
    if (this.players[b].ai && this.rel[a][b] === 'war' && this.time - this.relSince[a][b] < 60) {
      if (a === PLAYER) this.log(PLAYER, `${this.players[b].name} will not parley yet.`, 'warn');
      return false;
    }
    this.setRelation(a, b, state);
    return true;
  }

  // ------------------------------------------------------------------ main tick
  tick(dt) {
    if (this.outcome) return;
    this.time += dt;
    this.visT -= dt;
    if (this.visT <= 0) { this.updateVisibility(); this.visT = 0.25; }
    this.updateBuildings(dt);
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
        case 'farm': p.food += 0.8 * dt * (this.nearBuilding(b, 'mill', 8) ? 1.25 : 1); break;
        case 'tavern': p.gold += 0.35 * dt; break;
        case 'market': p.gold += 0.4 * dt; break;
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
      if (u.hp <= 0 || !this.isEnemy(b.team, u.team)) continue;
      const d = Math.hypot(u.x - b.x, u.y - b.y);
      if (d < bd) { best = u; bd = d; }
    }
    if (!best) return;
    b.cooldown = s.cd;
    this.projectiles.push({ x: b.x, y: b.y - 0.5, targetId: best.id, dmg: s.dmg, team: b.team });
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
      if (b.kind === 'academy') p *= 1 + 0.3 * (b.scholars || 0);
      pulls[b.team] += p;
    }
    return pulls;
  }

  updateVillages(dt) {
    for (const v of this.villages) {
      v.flash = Math.max(0, v.flash - dt);
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
        const own = pulls[v.owner];
        const net = own - bp;
        if (own === 0 && bp === 0) v.loyalty = Math.max(0, v.loyalty - 0.22 * dt); // a lord far away is soon forgotten
        else v.loyalty = Math.max(0, Math.min(100, v.loyalty + net * LOYALTY_RATE * dt));
        if (v.loyalty <= 8) {
          const lost = v.owner;
          v.owner = -1; v.lean = best; v.loyalty = 18; v.spyFlip = -1;
          this.log(lost, `${v.name} slips from its lord.`, 'warn');
        } else {
          const spec = VILLAGE_KINDS[v.kind].tribute, rate = 0.4 + (0.8 * v.loyalty) / 100, p = this.players[v.owner];
          p.food += spec.food * rate * dt; p.wood += spec.wood * rate * dt; p.gold += spec.gold * rate * dt;
        }
      }
    }
  }

  submit(v, team, how) {
    if (v.owner === team) return;
    const prev = v.owner;
    v.owner = team; v.lean = team; v.spyFlip = -1;
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
      const s = UNITS[u.kind];
      u.cooldown = Math.max(0, u.cooldown - dt);
      u.repathT -= dt;
      u.anim += dt * (u.path.length ? 8 : 2);
      switch (u.task.type) {
        case 'move': if (!this.follow(u, dt)) u.task = { type: 'idle' }; break;
        case 'attack': this.doAttack(u, s, dt); break;
        case 'gather': this.doGather(u, dt); break;
        case 'return': this.doReturn(u, dt); break;
        case 'build': this.doBuild(u, dt); break;
        case 'infiltrate': this.doInfiltrate(u, dt); break;
        default: this.doIdle(u, s, dt);
      }
      if (u.kind === 'scholar' && u.task.type === 'idle') {
        for (const o of this.units) if (o.team === u.team && o.hp > 0 && o.hp < o.maxHp && Math.hypot(o.x - u.x, o.y - u.y) < 3.5) o.hp = Math.min(o.maxHp, o.hp + 1.6 * dt);
      }
    }
  }

  doIdle(u, s, dt) {
    if (u.kind === 'serf' || u.kind === 'scholar' || u.kind === 'spy') return;
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
    if ((u.kind === 'footman' || u.kind === 'knight') && this.hasBuilding(u.team, 'forge')) dmg += 3;
    if (u.kind === 'bowman' && this.hasBuilding(u.team, 'forge')) dmg += 2;
    if (t.type === 'village') return this.hitVillage(u, t, dmg * s.vil, s);
    if (t.type === 'building') dmg *= s.bld;
    if (s.range > 1.6) this.projectiles.push({ x: u.x, y: u.y - 0.3, targetId: t.id, dmg, team: u.team });
    else this.damage(t, dmg, u.team);
  }

  hitVillage(u, v, dmg, s) {
    v.protection -= dmg; v.hitT = 6; v.flash = 0.2;
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
      const next = res ? this.nearestNode(u.x, u.y, res, 14) : null;
      if (next) { u.task = { type: 'gather', nodeId: next.id }; this.setPath(u, next.x + 0.5, next.y + 0.5); }
      else if (u.carry && u.carry.amount > 0) { u.task = { type: 'return', resume: null }; u.path = []; }
      else u.task = { type: 'idle' };
      return;
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
    const take = Math.min(GATHER_RATE[res] * dt, node.amount, CARRY_CAP - (u.carry?.amount || 0));
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
      // look for another unfinished building of ours close by before going idle
      const next = b ? null : this.buildings.find((o) => o.team === u.team && o.built < 1 && o.hp > 0 && Math.hypot(o.x - u.x, o.y - u.y) < 6);
      if (next) { u.task = { type: 'build', targetId: next.id }; this.setPathToEntity(u, next); } else u.task = { type: 'idle' };
      if (b && b.built >= 1 && b.team === u.team) {
        const nxt = this.buildings.find((o) => o.team === u.team && o.built < 1 && o.hp > 0 && Math.hypot(o.x - u.x, o.y - u.y) < 6);
        if (nxt) { u.task = { type: 'build', targetId: nxt.id }; this.setPathToEntity(u, nxt); }
      }
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
  }

  // ------------------------------------------------------------------ cleanup, elimination, victory
  cleanup() {
    let rebuilt = false;
    if (this.units.some((u) => u.hp <= 0)) {
      for (const u of this.units) if (u.hp <= 0) this.byId.delete(u.id);
      this.units = this.units.filter((u) => u.hp > 0);
    }
    if (this.buildings.some((b) => b.hp <= 0)) {
      for (const b of this.buildings) if (b.hp <= 0) this.byId.delete(b.id);
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
      players: this.players.map((p) => ({ team: p.team, name: p.name, food: p.food | 0, wood: p.wood | 0, gold: p.gold | 0, alive: p.alive })),
      units: this.units.map((u) => ({ id: u.id, k: u.kind, t: u.team, x: +u.x.toFixed(2), y: +u.y.toFixed(2), hp: u.hp | 0 })),
      buildings: this.buildings.map((b) => ({ id: b.id, k: b.kind, t: b.team, tx: b.tx, ty: b.ty, hp: b.hp | 0, built: +b.built.toFixed(2) })),
      villages: this.villages.map((v) => ({ id: v.id, o: v.owner, loy: v.loyalty | 0, pro: v.protection | 0 })),
    };
  }
}
