// Seven Holds - rival houses. They run on the host and play through the same game methods a player's intents reach.
// They start with a home village of thirty folk and three serfs: no keep, no army. They train serfs, gather, build in a fixed order,
// raise a keep toward the nearest free village, contest villages, send a spy, then eventually go to war.

import { BUILDINGS, UNITS, NODE_RES, PLAYER, MATS, MINE_MAX_WORKERS, WAGE_FREE, ALL_GOODS, RES_VALUE } from './config.js';

const WAR_AFTER = 600;   // seconds of peace before any house marches on another: time to build an economy and an army first
const PLAN = [
  ['mine', 1], ['market', 1], ['barracks', 1], ['cottage', 1], ['tavern', 1], ['keep', 1], ['farm', 1], ['cottage', 2], ['mine', 2], ['warehouse', 1], ['foundry', 1], ['mill', 1],
  ['archery', 1], ['cottage', 3], ['forge', 1], ['mine', 3], ['stable', 1], ['temple', 1], ['academy', 1], ['village', 1], ['cottage', 4], ['farm', 2],
  ['tower', 1], ['workshop', 1], ['cottage', 5], ['cottage', 6], ['cottage', 7],
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

  // 1. serfs first: drafted from the home village (or trained at a keep)
  const serfWant = 5 + Math.min(11, Math.floor(t / 55));
  if (serfs.length + queued(game, team, 'serf') < serfWant) {
    const keepT = game.buildings.find((b) => b.team === team && b.built >= 1 && b.hp > 0 && UNITS.serf.from.includes(b.kind) && b.queue.length < 2);
    if (keepT) game.train(team, keepT.id, 'serf');
    else if (seat.type === 'village') game.draft(team, seat.id, Math.min(2, serfWant - serfs.length), 'serf');
  }

  // 2. build in order; make room for population when it is about to cap
  const building = game.buildings.filter((b) => b.team === team && b.built < 1 && b.hp > 0).length;
  const needCottage = game.hasBuilding(team, 'market') && game.popUsed(team) + 2 >= game.popCap(team) && !game.buildings.some((b) => b.team === team && b.kind === 'cottage' && b.built < 1);
  if (building < 2 || needCottage && building < 4) {
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
      const hi = m.ore === 'stone' ? 160 : 260, lo = m.ore === 'stone' ? 100 : 180;   // hysteresis: stand down above hi, resume below lo (no flapping)
      p.glut = p.glut || {};
      if (p[m.ore] > hi) p.glut[m.ore] = true; else if (p[m.ore] < lo) p.glut[m.ore] = false;
      const glut = !!p.glut[m.ore] && m.ore !== 'gold';
      if (glut) { for (const u of serfs) if (u.task.type === 'mine' && u.task.buildingId === m.id) { u.task = { type: 'idle' }; u.path = []; } continue; }
      const want = m.ore === 'gold' ? MINE_MAX_WORKERS : Math.min(MINE_MAX_WORKERS, t > 240 ? 3 : 2);
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
  }
  treasury(game, team, p, seat, serfs);

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
      if (p[r] > 450) deficit -= 0.45; // piles of it already: turn to what is short
      if (deficit > worst) { worst = deficit; res = r; }
    }
    const near = game.nearestNode(seat.x, seat.y, res, 28, team) || game.nearestNode(u.x, u.y, res, 1e9, team) || game.nearestNode(u.x, u.y, 'wood', 1e9, team);
    if (near) { game.cmdGather([u], near); working[NODE_RES[near.kind]]++; }
  }

  // 4. army
  const army = game.militaryOf(team);
  const incTot = Object.values(p.inc || {}).reduce((a, v) => a + v, 0);
  const payable = WAGE_FREE + Math.max(0, Math.floor((incTot - 0.1) / 0.06));   // soldiers the income can keep paid
  const rich = Math.max(0, Math.floor((p.gold - 250) / 45));   // a full purse buys men; a thin one holds the line it can pay for
  const armyCap = Math.min(30, Math.min(3 + Math.floor(t / 65), payable) + rich);
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
  if (t > WAR_AFTER && army.length >= 9) {
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
          .sort((a, c) => (c.kind === 'keep' ? 1 : 0) - (a.kind === 'keep' ? 1 : 0) || Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(c.x - seat.x, c.y - seat.y))[0];
        if (foe) game.cmdAttack(ready, foe);
      }
    }
  } else {
    // return stragglers home
    for (const u of army) if (u.task.type === 'idle' && Math.hypot(u.x - seat.x, u.y - seat.y) > 12) game.cmdMove([u], seat.x + (Math.random() - 0.5) * 4, seat.y + 4);
  }
}

// nearest unmined deposit inside our territory, preferring ores we do not already dig
function pickDeposit(game, team, seat) {
  const order = ['gold', 'stone', 'iron', 'coal', 'copper', 'silver'];
  const have = new Set(game.buildings.filter((b) => b.team === team && b.kind === 'mine').map((b) => b.ore));
  for (const ore of order) {
    if (have.has(ore)) continue;
    const cands = game.resources.filter((n) => n.kind === ore && n.amount > 0 && !n.covered && Math.hypot(n.x - seat.x, n.y - seat.y) < (ore === 'stone' ? 16 : ore === 'gold' ? 36 : 30)).sort((a, c) => Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(c.x - seat.x, c.y - seat.y));
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
      const k = Math.max(0, d - 9) / d;   // no territory limit: plant the keep close to the village (about 9 tiles short)
      ax = seat.x + (v.x - seat.x) * k; ay = seat.y + (v.y - seat.y) * k; rmin = 0; rmax = 6;
    }
  } else if (kind === 'warehouse') {   // beside the timber stand the serfs walk furthest to
    const trees = game.resources.filter((n) => NODE_RES[n.kind] === 'wood' && n.amount > 0 && Math.hypot(n.x - seat.x, n.y - seat.y) > 7 && Math.hypot(n.x - seat.x, n.y - seat.y) < 24).sort((a, c) => Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(c.x - seat.x, c.y - seat.y));
    if (trees[0]) { ax = trees[0].x; ay = trees[0].y; rmin = 2; rmax = 5; }
  } else if (['barracks', 'archery', 'stable', 'tower', 'workshop'].includes(kind)) { rmin = 5; rmax = 12; }
  const tried = [];
  if (kind === 'cottage' || kind === 'farm' || kind === 'warehouse') rmax += 8;   // a crowded hall pushes homes outward rather than stalling
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

// ---- the treasurer: dig gold, sell what the stockpile does not need, run camels to the best buyer, draft villagers, found villages
const KEEP = { stone: 120, iron: 70, coal: 70, copper: 35, silver: 30, steel: 24, ware: 3, food: 220, wood: 260 };
function treasury(game, team, p, seat, serfs) {
  const markets = game.marketsOf(team);
  const mk = markets[0];
  p.sellT = (p.sellT ?? 10) - 1.5; p.routeT = (p.routeT ?? 30) - 1.5; p.draftT = (p.draftT ?? 20) - 1.5; p.foundT = (p.foundT ?? 150) - 1.5;
  // sell the surplus: anything above what we keep for building, smelting and arms
  if (mk && p.sellT <= 0) {
    p.sellT = 6;
    for (const k of ALL_GOODS) {
      if (k === 'gold') continue;
      const spare = Math.floor((p[k] || 0) - (KEEP[k] ?? 40));
      if (spare >= 15 && game.sellPrice(mk, k) >= RES_VALUE[k] / RES_VALUE.gold * 0.34) game.sellGoods(team, mk.id, k, Math.min(40, spare));
    }
  }
  // camels on routes: one per two mines, to the village or partner market that pays best for the shelf
  if (mk) {
    const camels = game.units.filter((u) => u.team === team && u.kind === 'camel' && u.hp > 0);
    const mines = game.buildings.filter((b) => b.team === team && b.kind === 'mine' && b.built >= 1 && b.hp > 0).length;
    const want = Math.min(3, Math.ceil(mines / 2));
    const q = game.buildings.filter((b) => b.team === team).reduce((n, b) => n + b.queue.filter((x) => x.kind === 'camel').length, 0);
    if (camels.length + q < want && p.gold > 90 && game.popUsed(team) < game.popCap(team)) game.train(team, mk.id, 'camel');
    if (p.routeT <= 0) {
      p.routeT = 25;
      const idle = camels.filter((c) => !c.route && c.task.type === 'idle');
      if (idle.length) {
        let best = null, bs = 0;
        const cands = [...game.villages, ...game.buildings.filter((b) => b.kind === 'market' && b.team !== team && b.built >= 1)];
        for (const t of cands) {
          if (!game.canDeal(team, t).ok || game.canDeal(team, t).own) continue;
          const d = Math.hypot(t.x - mk.x, t.y - mk.y); if (d > 70) continue;
          const qq = game.routeQuote(mk, t), score = qq.profit * Math.min(1, game.availFor(t, 'gold') / 40) / (1 + d / 25);
          if (qq.n >= 4 && score > bs) { bs = score; best = t; }
        }
        if (best) game.cmdRoute([idle[0]], best, 'gold');
      }
    }
  }
  // villagers: draft serfs when short; found a village once the economy stands; draft soldiers for the army
  const held = game.villages.filter((v) => v.owner === team);
  if (p.draftT <= 0 && held.length) {
    p.draftT = 20;
    const want = 5 + Math.min(11, Math.floor(game.time / 55));
    const v = held.slice().sort((a, b) => b.pop - a.pop)[0];
    if (serfs.length < want + 4 && v && v.pop >= 6 && p.food > 90) game.draft(team, v.id, 2, 'serf');
  }
  if (p.foundT <= 0 && game.time > 240 && held.length < 2 && !game.buildings.some((b) => b.team === team && b.kind === 'village' && b.built < 1) && game.canAfford(team, BUILDINGS.village.cost) && p.wood > 260) {
    p.foundT = 120;
    const spot = findSpot(game, team, seat, 'village');
    if (spot) game.place(team, 'village', spot[0], spot[1]);
  }
}
