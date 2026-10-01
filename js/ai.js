// Seven Holds - rival houses. They run on the host and play through the same game methods a player's intents reach.
// They start with a hall and two serfs only: no keep, no army. They train serfs, gather, build in a fixed order,
// raise a keep toward the nearest free village, contest villages, send a spy, then eventually go to war.

import { BUILDINGS, UNITS, NODE_RES, PLAYER, MATS, MINE_MAX_WORKERS } from './config.js';

const PLAN = [
  ['cottage', 1], ['farm', 1], ['barracks', 1], ['mine', 1], ['cottage', 2], ['mill', 1], ['keep', 1], ['cottage', 3], ['archery', 1],
  ['farm', 2], ['mine', 2], ['forge', 1], ['market', 1], ['tavern', 1], ['mine', 3], ['foundry', 1], ['cottage', 4], ['stable', 1], ['temple', 1], ['academy', 1], ['cottage', 5],
  ['tower', 1], ['workshop', 1], ['farm', 3], ['cottage', 6], ['cottage', 7],
];

export function updateAI(game, dt) {
  for (const p of game.players) {
    if (!p.ai || !p.alive) continue;
    p.think -= dt;
    if (p.think > 0) continue;
    p.think = 1.5;
    think(game, p.team, p);
  }
}

const count = (game, team, kind) => game.buildings.filter((b) => b.team === team && b.kind === kind && b.hp > 0).length;

function think(game, team, p) {
  const seat = game.seatOf(team);
  if (!seat) return;
  const serfs = game.units.filter((u) => u.team === team && u.kind === 'serf' && u.hp > 0);
  const t = game.time;

  // 1. serfs first: from the hall (or keep)
  const serfWant = 5 + Math.min(11, Math.floor(t / 55));
  if (serfs.length + queued(game, team, 'serf') < serfWant) {
    const trainer = game.buildings.find((b) => b.team === team && b.built >= 1 && b.hp > 0 && UNITS.serf.from.includes(b.kind) && b.queue.length < 2);
    if (trainer) game.train(team, trainer.id, 'serf');
  }

  // 2. build in order; make room for population when it is about to cap
  const building = game.buildings.filter((b) => b.team === team && b.built < 1 && b.hp > 0).length;
  if (building < 2) {
    const needCottage = game.popUsed(team) + 2 >= game.popCap(team) && !game.buildings.some((b) => b.team === team && b.kind === 'cottage' && b.built < 1);
    let next = null;
    if (needCottage && serfs.length) next = 'cottage';
    else {
      for (const [kind, n] of PLAN) {
        if (kind === 'mine' && p.noMine) continue;
        if (count(game, team, kind) >= n) continue;
        if (BUILDINGS[kind].requires.some((r) => !game.hasBuilding(team, r))) continue;
        next = kind;
        break;
      }
    }
    if (next === 'keep' && p.noMine && p.stone < 40) p.stone += 40; // no seam within reach: a stone caravan arrives
    if (next === 'mine') {
      if (game.canAfford(team, BUILDINGS.mine.cost)) {
        const node = pickDeposit(game, team, seat);
        if (!node) p.noMine = true; else game.place(team, 'mine', 0, 0, null, node.id);
      }
    } else if (next && game.canAfford(team, BUILDINGS[next].cost)) {
      const spot = findSpot(game, team, seat, next);
      if (spot) game.place(team, next, spot[0], spot[1]);
    }

    // 2b. diggers for every finished mine
    for (const m of game.buildings) {
      if (m.team !== team || m.kind !== 'mine' || m.built < 1 || m.hp <= 0) continue;
      const glut = p[m.ore] > (m.ore === 'stone' ? 120 : 220);
      if (glut) { for (const u of serfs) if (u.task.type === 'mine' && u.task.buildingId === m.id) { u.task = { type: 'idle' }; u.path = []; } continue; }
      const want = Math.min(MINE_MAX_WORKERS, t > 240 ? 3 : 2);
      if (game.minersOf(m) >= want || serfs.length < 6) continue;
      const free = serfs.filter((u) => u.task.type === 'gather' || u.task.type === 'idle').sort((a, c) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(c.x - m.x, c.y - m.y))[0];
      if (free) game.cmdMine([free], m);
    }
  }

  // 2c. treaties and caravans: offer a trade treaty to houses we know; ship surplus ore to other rival houses' markets by camel
  p.offerT -= 1.5; p.tradeT = (p.tradeT ?? 40) - 1.5;
  const mk = game.marketsOf(team)[0];
  if (mk) {
    if (p.offerT <= 0) {
      p.offerT = 90;
      for (const q of game.players) if (q.alive && q.team !== team && game.known[team][q.team] && game.rel[team][q.team] === 'peace' && !(q.team === PLAYER && game.offers.some((o) => o.from === team && o.to === PLAYER))) { game.proposeRelation(team, q.team, 'trade'); break; }
    }
    const camels = game.units.filter((u) => u.team === team && u.kind === 'camel' && u.hp > 0);
    const partners = game.players.filter((q) => q.alive && q.team !== team && q.team !== PLAYER && game.rel[team][q.team] === 'trade' && game.known[team][q.team]).map((q) => game.marketsOf(q.team)[0]).filter(Boolean);
    if (partners.length && !camels.length && queued(game, team, 'camel') === 0 && p.gold > 120) game.train(team, mk.id, 'camel');
    const camel = camels.find((c) => c.task.type === 'idle' && Math.hypot(c.x - mk.x, c.y - mk.y) < 6);
    if (camel && partners.length && p.tradeT <= 0) {
      p.tradeT = 40;
      const shelf = mk.stock || {};
      const surplus = MATS.filter((g) => (shelf[g] || 0) >= 25).sort((a, c) => shelf[c] - shelf[a])[0];
      const need = ['iron', 'coal', 'silver', 'stone', 'copper'].find((g) => g !== surplus && p[g] < 15 && (g !== 'iron' && g !== 'coal' || game.hasBuilding(team, 'foundry')) && (g !== 'silver' || game.hasBuilding(team, 'academy')));
      const dest = need && partners.find((m) => (m.stock?.[need] || 0) >= 10);
      if (surplus && dest && game.load(team, camel.id, surplus, 30)) game.cmdCaravan([camel], dest, need);
    }
  }

  // 3. idle serfs go to work, spread by share: timber 45%, grain 35%, coin 20% (coin only once barracks stand)
  const share = { wood: 0.45, food: 0.35, gold: game.hasBuilding(team, 'barracks') ? 0.2 : 0 };
  const working = { wood: 0, food: 0, gold: 0 };
  for (const u of serfs) if (u.task.type === 'gather' || u.task.type === 'return') {
    const node = u.task.nodeId != null ? game.resources[u.task.nodeId] : null;
    const r = node ? NODE_RES[node.kind] : u.carry?.kind;
    if (r) working[r]++;
  }
  const idle = serfs.filter((u) => u.task.type === 'idle');
  for (const u of idle) {
    const total = Math.max(1, serfs.length - idle.length + 1);
    let res = 'wood', worst = -9;
    for (const r of ['wood', 'food', 'gold']) {
      let deficit = share[r] - working[r] / total;
      if (p[r] < 60 && r !== 'gold') deficit += 0.25; // running dry
      if (deficit > worst) { worst = deficit; res = r; }
    }
    const near = game.nearestNode(seat.x, seat.y, res, 28) || game.nearestNode(u.x, u.y, res) || game.nearestNode(u.x, u.y, 'wood');
    if (near) { game.cmdGather([u], near); working[NODE_RES[near.kind]]++; }
  }

  // 4. army
  const army = game.militaryOf(team);
  const armyCap = Math.min(26, 3 + Math.floor(t / 65));
  const queuedMil = game.buildings.filter((b) => b.team === team).reduce((n, b) => n + b.queue.filter((q) => q.kind !== 'serf').length, 0);
  if (army.length + queuedMil < armyCap) {
    const picks = [];
    if (game.hasBuilding(team, 'stable') && army.length % 4 === 3) picks.push('knight');
    if (game.hasBuilding(team, 'archery') && army.length % 3 === 2) picks.push('bowman');
    picks.push('footman');
    if (game.hasBuilding(team, 'workshop') && army.filter((u) => u.kind === 'ram').length < 2 && army.length >= 6) picks.unshift('ram');
    for (const kind of picks) {
      const b = game.buildings.filter((x) => x.team === team && UNITS[kind].from.includes(x.kind) && x.built >= 1 && x.hp > 0).sort((a, c) => a.queue.length - c.queue.length)[0];
      if (b && b.queue.length < 3 && game.train(team, b.id, kind)) break;
    }
  }
  if (game.hasBuilding(team, 'tavern') && !game.units.some((u) => u.team === team && u.kind === 'spy' && u.hp > 0) && queued(game, team, 'spy') === 0) {
    const tav = game.buildings.find((b) => b.team === team && b.kind === 'tavern' && b.built >= 1 && b.hp > 0);
    if (tav) game.train(team, tav.id, 'spy');
  }
  const spy = game.units.find((u) => u.team === team && u.kind === 'spy' && u.hp > 0 && u.task.type === 'idle');
  if (spy) {
    const v = nearestVillage(game, seat, (x) => x.owner < 0 && x.loyalty < 70, 50);
    if (v) game.cmdInfiltrate([spy], v);
  }

  // 4b. tavern wanderers and castle drill: hire when flush, send recruits into the keep, drill them into soldiers
  const keepB = game.buildings.find((b) => b.team === team && b.kind === 'keep' && b.built >= 1 && b.hp > 0);
  const tav2 = game.buildings.find((b) => b.team === team && b.kind === 'tavern' && b.built >= 1 && b.hp > 0 && b.roster);
  if (tav2 && keepB && p.gold > 170 && army.length < armyCap) {
    const i = tav2.roster.findIndex((w) => game.canAfford(team, w.cost));
    if (i >= 0) game.hire(team, tav2.id, i);
  }
  if (keepB) {
    for (const u of game.units) if (u.team === team && u.kind === 'recruit' && !u.inside && u.task.type === 'idle' && keepB.garrison.length < 12) game.cmdEnter([u], keepB);
    for (const id of keepB.garrison) {
      const u = game.byId.get(id);
      if (!u || u.kind !== 'recruit' || u.drilling) continue;
      const kind = army.filter((x) => x.kind === 'bowman').length < army.filter((x) => x.kind === 'footman').length / 2 ? 'bowman' : 'footman';
      if (game.drill(team, keepB.id, u.id, kind)) break;
    }
    if (keepB.garrison.length && !keepB.drills.length) game.leave(team, keepB.id);
  }

  // 5. contest villages
  const readyArmy = army.filter((u) => u.task.type === 'idle');
  const need = army.some((u) => u.kind === 'ram') ? 4 : 5;
  if (readyArmy.length >= need && t > 90) {
    const strength = readyArmy.reduce((n, u) => n + UNITS[u.kind].hp, 0);
    const v = nearestVillage(game, seat, (x) => x.owner !== team && (x.owner < 0 || game.rel[team][x.owner] === 'war') && x.maxProtection * 2.2 < strength + (army.some((u) => u.kind === 'ram') ? 400 : 0), 42);
    if (v) game.cmdAttack(readyArmy.filter((u) => u.kind !== 'spy'), v);
  }

  // 6. war: late, and only with a real army
  if (t > 340 && army.length >= 9) {
    let target = null, bd = 1e9;
    for (const q of game.players) {
      if (!q.alive || q.team === team) continue;
      const s = game.seatOf(q.team);
      if (!s) continue;
      const d = Math.hypot(s.x - seat.x, s.y - seat.y) + (game.rel[team][q.team] === 'trade' ? 500 : 0); // trade partners are the last to be attacked
      if (d < bd) { bd = d; target = q; }
    }
    if (target) {
      if (game.rel[team][target.team] !== 'war') game.setRelation(team, target.team, 'war');
      const ready = army.filter((u) => u.task.type === 'idle');
      if (ready.length >= 7) {
        const foe = game.buildings.filter((b) => b.team === target.team && b.hp > 0)
          .sort((a, c) => (c.kind === 'keep' || c.kind === 'hall' ? 1 : 0) - (a.kind === 'keep' || a.kind === 'hall' ? 1 : 0) || Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(c.x - seat.x, c.y - seat.y))[0];
        if (foe) game.cmdAttack(ready, foe);
      }
    }
  } else {
    // return stragglers to the hall
    for (const u of army) if (u.task.type === 'idle' && Math.hypot(u.x - seat.x, u.y - seat.y) > 12) game.cmdMove([u], seat.x + (Math.random() - 0.5) * 4, seat.y + 4);
  }
}

// nearest unmined deposit inside our territory, preferring ores we do not already dig
function pickDeposit(game, team, seat) {
  const order = ['stone', 'iron', 'coal', 'silver', 'copper'];
  const have = new Set(game.buildings.filter((b) => b.team === team && b.kind === 'mine').map((b) => b.ore));
  for (const ore of order) {
    if (have.has(ore)) continue;
    const cands = game.resources.filter((n) => n.kind === ore && n.amount > 0 && !n.covered && Math.hypot(n.x - seat.x, n.y - seat.y) < 16).sort((a, c) => Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(c.x - seat.x, c.y - seat.y));
    for (const n of cands) if (game.mineSpot(team, n)) return n;
  }
  return null;
}

function queued(game, team, kind) {
  let n = 0;
  for (const b of game.buildings) if (b.team === team) for (const q of b.queue) if (q.kind === kind) n++;
  return n;
}

function nearestVillage(game, seat, pred, maxD) {
  let best = null, bd = maxD;
  for (const v of game.villages) {
    if (!pred(v)) continue;
    const d = Math.hypot(v.x - seat.x, v.y - seat.y);
    if (d < bd) { best = v; bd = d; }
  }
  return best;
}

// Find a legal footprint with a one-tile lane around it. Keeps lean toward the nearest free village.
function findSpot(game, team, seat, kind) {
  const s = BUILDINGS[kind].size;
  let ax = seat.x, ay = seat.y, rmin = 4, rmax = 13;
  if (kind === 'keep') {
    const v = nearestVillage(game, seat, (x) => x.owner !== team, 60);
    if (v) {
      const d = Math.hypot(v.x - seat.x, v.y - seat.y) || 1;
      const k = Math.min(12, d * 0.45) / d;
      ax = seat.x + (v.x - seat.x) * k; ay = seat.y + (v.y - seat.y) * k; rmin = 0; rmax = 5;
    }
  } else if (['barracks', 'archery', 'stable', 'tower', 'workshop'].includes(kind)) { rmin = 5; rmax = 12; }
  const tried = [];
  for (let r = rmin; r <= rmax; r += 1) {
    const steps = Math.max(8, Math.floor(r * 4));
    const off = Math.random() * Math.PI * 2;
    for (let a = 0; a < steps; a++) {
      const ang = off + (a / steps) * Math.PI * 2;
      const tx = Math.round(ax + Math.cos(ang) * r - s / 2), ty = Math.round(ay + Math.sin(ang) * r - s / 2);
      if (!game.canPlace(team, kind, tx, ty).ok) continue;
      let lane = true;
      for (let y = ty - 1; y <= ty + s && lane; y++) for (let x = tx - 1; x <= tx + s; x++) {
        if (x < 0 || y < 0 || x >= game.W || y >= game.H) continue;
        if (game.block[y * game.W + x]) { lane = false; break; }
      }
      if (lane) return [tx, ty];
      tried.push([tx, ty]);
    }
  }
  return tried[0] || null;
}
