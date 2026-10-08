// Auld World - rival houses. They run on the host and play through the same game methods a player's intents reach.
// They start with a home village of thirty folk and three serfs: no keep, no army. They train serfs, gather, build in a fixed order,
// raise a keep toward the nearest free village, contest villages, send a spy, then eventually go to war.

import { deliberate, DIPLO, stance, pressWar, STANCE } from './diplomacy.js';
import { curveAt, blendPlan, lerp, clamp } from './learn.js';
import { BUILDINGS, UNITS, NODE_RES, PLAYER, MATS, MINE_MAX_WORKERS, KING, WAGE_FREE, ALL_GOODS, RES_VALUE, CAPTAIN, FOUND, DOCTRINE, HOUSES, GEAR, GEAR_KEYS } from './config.js';

const WAR_AFTER_DEFAULT = 600;   // seconds of peace before any house marches on another: time to build an economy and an army first
const PLAN = [
  ['mine', 1], ['market', 1], ['barracks', 1], ['cottage', 1], ['tavern', 1], ['keep', 1], ['farm', 1], ['cottage', 2], ['mine', 2], ['warehouse', 1], ['foundry', 1], ['mill', 1],
  ['archery', 1], ['cottage', 3], ['forge', 1], ['academy', 1], ['mine', 3], ['stable', 1], ['armoury', 1], ['temple', 1], ['village', 1], ['cottage', 4], ['farm', 2],
  ['tower', 1], ['workshop', 1], ['cottage', 5], ['cottage', 6], ['cottage', 7],
];

export function updateAI(game, dt) {
  for (const p of game.players) {
    if (!p.ai || !p.alive) continue;
    p.think -= dt;
    if (p.think > 0) continue;
    p.think = 1.5 * game.diff.think;
    think(game, p.team, p);
  }
}

// the playbook a house plays by: its own (set per player, e.g. in the arena) or the game's, learned from the human player
export const pbOf = (game, p) => (p.playbook !== undefined ? p.playbook : game.playbook || null);
const count = (game, team, kind) => game.buildings.filter((b) => b.team === team && b.kind === kind && b.hp > 0).length;

function think(game, team, p) {
  const seat = game.seatOf(team);
  if (!seat) {   // the seat is lost: the king is a fugitive and makes for whatever his house still holds, keeping his men about him
    const k = game.kingOf(team), at = game.thronePlace(team);
    if (k && !k.inside && at && k.task.type === 'idle' && Math.hypot(k.x - at.x, k.y - at.y) > 5) game.cmdMove([k], at.x, at.y);
    return;
  }
  const serfs = game.units.filter((u) => u.team === team && u.kind === 'serf' && u.hp > 0);
  const t = game.time;

  // 0. the king keeps to his own hearth: he fights what comes to him and walks home after. His line is the house: when foes come near and he
  // is hurt, outnumbered or the last of the line, he shelters in the nearest keep, and steps out again once it is quiet and he is whole.
  const king = game.kingOf(team), lastOfLine = (p.heirs ?? KING.heirs) <= 0;
  if (king && !king.inside) {
    const foe = game.closestEnemy(king, 10, team), keep = foe && game.buildings.filter((b) => b.team === team && b.kind === 'keep' && b.built >= 1 && b.hp > 0 && b.garrison.length < 8).sort((a, c) => Math.hypot(a.x - king.x, a.y - king.y) - Math.hypot(c.x - king.x, c.y - king.y))[0];
    const foes = foe ? game.units.filter((u) => u.hp > 0 && !u.inside && game.isEnemy(team, u.team) && game.powerOf(u) > 0 && Math.hypot(u.x - king.x, u.y - king.y) < 10).length : 0;
    const guards = foe ? game.units.filter((u) => u.team === team && u.hp > 0 && !u.inside && u !== king && game.powerOf(u) > 0 && Math.hypot(u.x - king.x, u.y - king.y) < 10).length : 0;
    if (keep && (lastOfLine || king.hp < king.maxHp * 0.6 || foes > guards + 1) && king.task.type !== 'enter') game.cmdEnter([king], keep);
  } else if (king && king.inside) {
    const home = game.byId.get(king.inside);
    if (home && home.type === 'building' && king.hp >= king.maxHp * 0.95 && !game.closestEnemy(home, 14, team) && !lastOfLine) game.eject(king, home);
  }
  if (king && !king.inside && king.task.type !== 'enter') {
    const dh = Math.hypot(king.x - seat.x, king.y - seat.y);
    if ((king.task.type === 'idle' && dh > 7) || (king.task.type === 'attack' && dh > KING.leash) || (king.hp < king.maxHp * 0.4 && dh > 4)) game.cmdMove([king], seat.x + 0.4, seat.y + 4.2);
  }

  // 1. serfs first: drafted from the home village (or trained at a keep)
  const pb = pbOf(game, p), wb = pb ? pb.conf : 0;   // what the recorded player did, and how far we trust it
  const doc = DOCTRINE[HOUSES[team]?.faction] || DOCTRINE.british;
  let serfWant = 5 + Math.min(11, Math.floor(t / 55)) + (doc.serf || 0);
  if (pb?.serf?.length) serfWant = Math.round(clamp(lerp(serfWant, curveAt(pb.serf, pb.step, t), wb), 4, 18));
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
      for (const [kind, n] of blendPlan(PLAN, pb)) {
        if (kind === 'mine' && p.noMine) continue;
        if (count(game, team, kind) >= n) continue;
        if (game.missingFor(team, kind).length) continue;
        next = kind;
        break;
      }
      // a people's own buildings come a few slots early, never ahead of the first mine or keep they still lack
      if (next && next !== 'mine' && next !== 'keep') {
        const nextAt = PLAN.findIndex(([k]) => k === next);
        const early = (doc.bias || []).find((kind) => count(game, team, kind) < 1 && !game.missingFor(team, kind).length);
        const earlyAt = early ? PLAN.findIndex(([k]) => k === early) : -1;
        if (early && earlyAt > nextAt && earlyAt - nextAt <= 6) next = early;
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

    // (mines are worked by the folk of nearby villages: nothing to assign)
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
  p.dipT = (p.dipT ?? 18) - 1.5;
  if (p.dipT <= 0) { p.dipT = DIPLO.every; deliberate(game, team); }
  treasury(game, team, p, seat, serfs);

  // 3. idle serfs go to work, spread by share: timber 45%, grain 35%, coin 20% (coin only once barracks stand)
  const share = { wood: 0.45, food: 0.35, gold: game.hasBuilding(team, 'barracks') ? 0.2 : 0 };
  if (pb?.share) for (const r of ['wood', 'food', 'gold']) if (r !== 'gold' || share.gold) share[r] = lerp(share[r], pb.share[r], wb);
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
  let base = 3 + Math.floor(t / 65);
  if (pb?.army?.length) base = Math.max(3, Math.round(lerp(base, curveAt(pb.army, pb.step, t), wb)));
  const armyCap = Math.round(Math.min(game.diff.armyCap, Math.min(base, payable) + rich) * (doc.armyMul || 1));
  const queuedMil = game.buildings.filter((b) => b.team === team).reduce((n, b) => n + b.queue.filter((q) => q.kind !== 'serf').length, 0);
  if (army.length + queuedMil < armyCap) {
    const picks = [];
    if (pb?.mix && wb >= 0.35) {   // train toward the player's mix of footmen, bowmen and knights
      const have = (k) => army.filter((u) => u.kind === k).length + queued(game, team, k);
      const total = Math.max(1, army.length + queuedMil), order = Object.keys(pb.mix).filter((k) => k !== 'ram' && UNITS[k]).sort((x, y) => (pb.mix[y] - have(y) / total) - (pb.mix[x] - have(x) / total));
      for (const k of order) picks.push(k);
      if (!picks.includes('footman')) picks.push('footman');
    } else {
      const have = (k) => army.filter((u) => u.kind === k).length + queued(game, team, k);
      const total = Math.max(1, army.length + queuedMil);
      const mix = doc.mix || { footman: 0.6, bowman: 0.25, knight: 0.15 };
      const order = ['knight', 'bowman', 'footman'].filter((k) => mix[k]).sort((a, b) => (mix[b] - have(b) / total) - (mix[a] - have(a) / total));
      for (const k of order) {
        if (k === 'knight' && !game.hasBuilding(team, 'stable')) continue;
        if (k === 'bowman' && !game.hasBuilding(team, 'archery')) continue;
        picks.push(k);
      }
      if (!picks.includes('footman')) picks.push('footman');
    }
    if (game.hasBuilding(team, 'workshop') && army.filter((u) => u.kind === 'ram').length < 2 && army.length >= 6) picks.unshift('ram');
    for (const kind of picks) {
      const b = game.buildings.filter((x) => x.team === team && UNITS[kind].from.includes(x.kind) && x.built >= 1 && x.hp > 0).sort((a, c) => a.queue.length - c.queue.length)[0];
      if (b && b.queue.length < 3 && game.train(team, b.id, kind)) break;
    }
  }
  if (game.hasBuilding(team, 'tavern') && game.units.filter((u) => u.team === team && u.kind === 'spy' && u.hp > 0).length + queued(game, team, 'spy') < (doc.spies || 1)) {
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
    let i = -1, best = 0;   // the most fighter for the coin: a far-lander's gift is worth the most, a green lad the least
    tav2.roster.forEach((w, k) => { if (!w || !game.canAfford(team, w.cost)) return; const v = (w.far ? 3 : HIRE_WORTH[w.trait] || 1) / (w.cost.gold + 15); if (v > best) { best = v; i = k; } });
    if (i >= 0) game.hire(team, tav2.id, i);
  }
  // the science division: always studying something; the order favours the arms the house fights with. Two scholars keep each academy busy.
  { const ac = game.buildings.find((b) => b.team === team && b.kind === 'academy' && b.built >= 1 && b.hp > 0);
    if (ac && p.gold > 140 && game.units.filter((u) => u.team === team && u.kind === 'scholar' && u.hp > 0).length + queued(game, team, 'scholar') < 2) game.train(team, ac.id, 'scholar'); }
  if (!p.research && game.hasBuilding(team, 'academy')) {
    const next = AI_STUDY.find((k) => !game.researchBlock(team, k));
    if (next) game.startResearch(team, next);
  }
  // the armoury keeps a stock of the best kit it can make, about one set for every two soldiers
  { const arm = game.buildings.find((b) => b.team === team && b.kind === 'armoury' && b.built >= 1 && b.hp > 0);
    if (arm && (arm.craft || []).length < 2) {
      const want = Math.min(8, Math.ceil(army.length / 2) + 1);
      const item = GEAR_KEYS.filter((k) => game.hasTech(team, GEAR[k].tech) && (p.gear?.[k] || 0) < want && army.some((u) => GEAR[k].for.includes(u.kind)))
        .sort((a, c) => GEAR[c].tier - GEAR[a].tier)[0];
      if (item && game.canAfford(team, GEAR[item].cost) && p.gold > 60) game.craft(team, arm.id, item);
    }
    if (arm && (p.refitT = (p.refitT ?? 0) - 1) <= 0) {   // idle soldiers at home who could carry better kit walk over to the armoury
      p.refitT = 8;
      const better = (u) => GEAR_KEYS.some((k) => (p.gear?.[k] || 0) > 0 && GEAR[k].for.includes(u.kind) && GEAR[k].tier > ((u.gear?.[GEAR[k].slot] && GEAR[u.gear[GEAR[k].slot]].tier) || 0));
      const go = army.filter((u) => u.task.type === 'idle' && !u.inside && Math.hypot(u.x - arm.x, u.y - arm.y) > 6 && Math.hypot(u.x - seat.x, u.y - seat.y) < 40 && better(u)).slice(0, 8);
      if (go.length) game.cmdMove(go, arm.x + 1, arm.y + arm.size / 2 + 2);
    }
  }
  // an Elite soldier with coin to spare behind him is given command
  if (p.gold > 150) { const c = game.units.find((u) => u.team === team && u.hp > 0 && !u.captain && (u.rank || 0) >= CAPTAIN.minRank && (u.kind === 'footman' || u.kind === 'bowman' || u.kind === 'knight')); if (c) game.appoint(team, c.id); }
  if (keepB) {
    for (const u of game.units) if (u.team === team && u.kind === 'recruit' && !u.inside && u.task.type === 'idle' && keepB.garrison.length < 12) game.cmdEnter([u], keepB);
    for (const id of keepB.garrison) {
      const u = game.byId.get(id);
      if (!u || u.kind !== 'recruit' || u.drilling) continue;
      const kind = army.filter((x) => x.kind === 'bowman').length < army.filter((x) => x.kind === 'footman').length / 2 ? 'bowman' : 'footman';
      if (game.drill(team, keepB.id, u.id, kind)) break;
    }
    for (const id of keepB.garrison.slice()) { const u = game.byId.get(id); if (u && u.kind !== 'recruit' && u.kind !== 'king' && !u.drilling) game.eject(u, keepB); }   // drilled soldiers step out; recruits wait their turn inside
  }

  // 5. contest villages
  const readyArmy = army.filter((u) => u.task.type === 'idle');
  let need = army.some((u) => u.kind === 'ram') ? 4 : 5, firstAt = 90;
  if (pb?.attack) { need = Math.round(clamp(lerp(need, pb.attack.size, wb), 3, 14)); firstAt = clamp(lerp(90, pb.attack.first * 0.85, wb), 60, 1200); }
  if (readyArmy.length >= need && t > firstAt) {
    const strength = readyArmy.reduce((n, u) => n + UNITS[u.kind].hp, 0);
    const v = nearestVillage(game, seat, (x) => x.owner !== team && (x.owner < 0 || game.rel[team][x.owner] === 'war') && x.maxProtection * 2.2 < strength + (army.some((u) => u.kind === 'ram') ? 400 : 0), 42);
    if (v) { game.cmdAttack(readyArmy.filter((u) => u.kind !== 'spy'), v); p.planVillage = v.id; }
  }

  // 6. war is chosen, not scheduled: a house fights the one it is at war with, or the one its stance says it means war on (threat, temptation,
  // grudge, less ties: see stance() in diplomacy.js). The difficulty's warAfter (x0.6) is only the earliest a house will start a war of its own.
  const warAfter = pb?.warAt ? clamp(lerp(game.diff.warAfter, pb.warAt, wb), 240, 1800) : game.diff.warAfter;
  const earliest = warAfter * 0.6;
  p.warIn = Math.max(0, Math.round(earliest - t));
  const atWar = game.players.some((q) => q.alive && q.team !== team && game.rel[team][q.team] === 'war');
  if (atWar || (t > earliest && army.length >= 7)) {
    let target = null, bd = -1e9;
    for (const q of game.players) {
      if (!q.alive || q.team === team || !game.known[team][q.team] || !game.seatOf(q.team)) continue;
      if (game.rel[team][q.team] === 'alliance') continue;   // oaths are kept (until a leader's temper breaks them)
      const st = stance(game, team, q.team), war = game.rel[team][q.team] === 'war';
      if (!war && (st.war < game.diff.warBar + (doc.war || 0) || t <= earliest || army.length < 7 || game.time - game.relSince[team][q.team] < 240)) continue;   // a peace just made is kept a while
      const score = (war ? 1 : 0) + st.war + st.temptation * 0.5;
      if (score > bd) { bd = score; target = q; }
    }
    p.planWar = target ? target.team : null;
    if (target && !pressWar(game, team, target.team)) target = null;   // an ultimatum first; the war comes if it is not answered
    if (target) {
      const ready = army.filter((u) => u.task.type === 'idle');
      if (ready.length >= 7) {
        const goal = huntGoal(game, team, target.team, seat, ready);
        if (goal) game.cmdAttack(ready, goal);
      }
    }
  } else {
    // return stragglers home
    for (const u of army) if (u.task.type === 'idle' && Math.hypot(u.x - seat.x, u.y - seat.y) > 12) game.cmdMove([u], seat.x + (Math.random() - 0.5) * 4, seat.y + 4);
  }
}

// Where a war is won: at the enemy's crown. An exposed king (seen, outside walls, within reach of our army) is the first target; a king behind
// walls makes his keep the target; then their keeps and nearest buildings, then their seat; a house with none of those is ended by running
// its fugitive king down (he is seen by all), or failing that by its last fighters.
export function huntGoal(game, team, foeTeam, seat, ready) {
  const k = game.kingOf(foeTeam), cx = ready.reduce((a, u) => a + u.x, 0) / Math.max(1, ready.length), cy = ready.reduce((a, u) => a + u.y, 0) / Math.max(1, ready.length);
  if (k && !k.inside && game.canSee(team, k.x, k.y) && (Math.hypot(k.x - cx, k.y - cy) < 45 || !game.seatOf(foeTeam))) return k;
  if (k && k.inside) { const h = game.byId.get(k.inside); if (h && h.hp > 0) return h; }
  const foe = game.buildings.filter((b) => b.team === foeTeam && b.hp > 0)
    .sort((a, c) => (c.kind === 'keep' ? 1 : 0) - (a.kind === 'keep' ? 1 : 0) || Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(c.x - seat.x, c.y - seat.y))[0];
  if (foe) return foe;
  const s = game.seatOf(foeTeam); if (s) return s;   // a house with only a village left is finished there
  if (k && !k.inside) return k;
  return game.units.find((u) => u.team === foeTeam && u.hp > 0 && !u.inside && game.powerOf(u) > 0) || null;
}
const AI_STUDY = ['drill', 'masonry', 'husbandry', 'metallurgy', 'fletching', 'steelcraft', 'medicine', 'mechanics', 'engineering'];
const HIRE_WORTH = { veteran: 2, keen: 1.6, brawny: 1.5, fleet: 1, green: 0.6 };
// nearest unmined deposit inside our territory (or beside a village of ours), preferring ores we do not already dig
export function pickDeposit(game, team, seat) {
  const order = ['gold', 'stone', 'iron', 'coal', 'copper', 'silver'];
  const have = new Set(game.buildings.filter((b) => b.team === team && b.kind === 'mine').map((b) => b.ore));
  for (const ore of order) {
    if (have.has(ore)) continue;
    const cands = game.resources.filter((n) => n.kind === ore && n.amount > 0 && !n.covered && (Math.hypot(n.x - seat.x, n.y - seat.y) < (ore === 'stone' ? 16 : ore === 'gold' ? 36 : 30) || game.villages.some((v) => v.owner === team && v.founded && Math.hypot(v.x - n.x, v.y - n.y) <= FOUND.campR + 2)) && game.minePower(team, n.x, n.y) > 0).sort((a, c) => Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(c.x - seat.x, c.y - seat.y));
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

// Where to build. A real player does not stamp buildings on a ring with identical one-tile lanes: homes sit in loose neighbourhoods, farms
// beside the mill, barracks and towers toward the enemy with room to muster, a market or temple with space around it. So: gather every legal
// spot, drop those too tight for the kind (relaxing only if nothing fits), and pick the best by taste plus a little chance.
const MIN_GAP = { keep: 3, barracks: 3, archery: 3, stable: 3, market: 3, temple: 3, academy: 3, tower: 2, workshop: 2, forge: 2, foundry: 2, tavern: 2, mill: 2, warehouse: 2, cottage: 2, farm: 1, mine: 1 };
const MIL = ['barracks', 'archery', 'stable', 'tower', 'workshop'];
const rectGap = (tx, ty, s, o) => Math.max(0, Math.max(tx - (o.tx + o.size), o.tx - (tx + s), ty - (o.ty + o.size), o.ty - (ty + s)));
export function findSpot(game, team, seat, kind, at = null) {
  const s = BUILDINGS[kind].size;
  let ax = seat.x, ay = seat.y, rmin = 4, rmax = 13;
  if (at) { ax = at.x; ay = at.y; rmin = at.rmin ?? 2; rmax = at.rmax ?? 7; }
  else if (kind === 'keep') {
    const v = nearestVillage(game, seat, (x) => x.owner !== team, 60);
    if (v) {
      const d = Math.hypot(v.x - seat.x, v.y - seat.y) || 1;
      const k = Math.max(0, d - 9) / d;   // no territory limit: plant the keep close to the village (about 9 tiles short)
      ax = seat.x + (v.x - seat.x) * k; ay = seat.y + (v.y - seat.y) * k; rmin = 0; rmax = 6;
    }
  } else if (kind === 'warehouse') {   // beside the timber stand the serfs walk furthest to
    const trees = game.resources.filter((n) => NODE_RES[n.kind] === 'wood' && n.amount > 0 && Math.hypot(n.x - seat.x, n.y - seat.y) > 7 && Math.hypot(n.x - seat.x, n.y - seat.y) < 24).sort((a, c) => Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(c.x - seat.x, c.y - seat.y));
    if (trees[0]) { ax = trees[0].x; ay = trees[0].y; rmin = 2; rmax = 5; }
  } else if (MIL.includes(kind)) { rmin = 5; rmax = 12; }
  if (kind === 'cottage' || kind === 'farm' || kind === 'warehouse') rmax += 8;   // a crowded hall pushes homes outward rather than stalling
  // the nearest rival seat: soldiers' buildings face it
  let foe = null, fd = 1e9;
  for (const o of game.buildings) if (o.team !== team && o.kind === 'hall' && o.hp > 0) { const d = Math.hypot(o.x - seat.x, o.y - seat.y); if (d < fd) { fd = d; foe = o; } }
  const fa = foe ? Math.atan2(foe.y - seat.y, foe.x - seat.x) : 0;
  const near = [];   // everything a new footprint could crowd
  for (const b of game.buildings) if (b.hp > 0 && Math.abs(b.x - ax) < rmax + 14 && Math.abs(b.y - ay) < rmax + 14) near.push(b);
  for (const v of game.villages) if (Math.abs(v.x - ax) < rmax + 14 && Math.abs(v.y - ay) < rmax + 14) near.push(v);
  const own = near.filter((b) => b.team === team);
  const cands = [];
  for (let r = rmin; r <= rmax; r += 1) {
    const steps = Math.max(10, Math.floor(r * 3.5)), off = Math.random() * Math.PI * 2;
    for (let a = 0; a < steps; a++) {
      const ang = off + (a / steps) * Math.PI * 2, rr = r + (Math.random() - 0.5) * 1.4;
      const tx = Math.round(ax + Math.cos(ang) * rr - s / 2), ty = Math.round(ay + Math.sin(ang) * rr - s / 2);
      if (!game.canPlace(team, kind, tx, ty).ok) continue;
      let gap = 99;
      for (const o of near) { const g = rectGap(tx, ty, s, o); if (g < gap) gap = g; }
      let ring = 0, blocked = 0;   // terrain hemming the footprint in (trees, water, rock)
      for (let y = ty - 1; y <= ty + s; y++) for (let x = tx - 1; x <= tx + s; x++) {
        if (x >= tx && x < tx + s && y >= ty && y < ty + s) continue;
        ring++; if (x < 0 || y < 0 || x >= game.W || y >= game.H || game.block[y * game.W + x]) blocked++;
      }
      cands.push({ tx, ty, gap, hem: blocked / ring, r: Math.hypot(tx + s / 2 - seat.x, ty + s / 2 - seat.y), ang: Math.atan2(ty + s / 2 - seat.y, tx + s / 2 - seat.x) });
    }
  }
  if (!cands.length) return null;
  const want = MIN_GAP[kind] ?? 2;
  let pool = [];
  for (const g of [want, want - 1, 1, 0]) { if (g < 0) continue; pool = cands.filter((c) => c.gap >= g); if (pool.length) break; }
  const pref = MIL.includes(kind) ? 8.5 : kind === 'cottage' || kind === 'farm' ? 8 : 6;
  let best = null, bs = -1e9;
  for (const c of pool) {
    let sc = Math.random() * 1.8;
    if (c.gap > want + 3 && c.gap < 90) sc -= (c.gap - want - 3) * 0.4;   // not stranded in the open
    sc -= Math.abs(c.r - pref) * 0.1;
    if (c.hem > 0.55) sc -= 1.5;   // hemmed in by trees or water
    if (MIL.includes(kind) && foe) sc += 1.4 * Math.cos(c.ang - fa);   // face the enemy, leave the back door free
    if (kind === 'farm' || kind === 'mill') { for (const o of own) if ((o.kind === 'farm' || o.kind === 'mill') && Math.hypot(o.x - (c.tx + s / 2), o.y - (c.ty + s / 2)) < 6) { sc += 0.9; break; } }
    if (kind === 'cottage') { for (const o of own) if ((o.kind === 'cottage' || o.kind === 'tavern' || o.kind === 'market') && Math.hypot(o.x - (c.tx + s / 2), o.y - (c.ty + s / 2)) < 7) { sc += 0.8; break; } }
    if (sc > bs) { bs = sc; best = c; }
  }
  return best ? [best.tx, best.ty] : null;
}

// ---- the treasurer: dig gold, sell what the stockpile does not need, run camels to the best buyer, draft villagers, found villages
const KEEP = { stone: 120, iron: 70, coal: 70, copper: 35, silver: 30, steel: 24, ware: 3, food: 220, wood: 260 };
export function treasury(game, team, p, seat, serfs) {
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
  // camels on routes: one per two mines, to the partner market that pays best for the shelf
  if (mk) {
    const camels = game.units.filter((u) => u.team === team && u.kind === 'camel' && u.hp > 0);
    const mines = game.buildings.filter((b) => b.team === team && b.kind === 'mine' && b.built >= 1 && b.hp > 0).length;
    let want = Math.min(3, Math.ceil(mines / 2));
    const pbk = pbOf(game, p), pbc = pbk?.camels; if (pbc) want = Math.round(clamp(lerp(want, Math.min(4, mines * pbc.perMine), pbk.conf), 0, 4));
    const q = game.buildings.filter((b) => b.team === team).reduce((n, b) => n + b.queue.filter((x) => x.kind === 'camel').length, 0);
    if (camels.length + q < want && p.gold > 90 && game.popUsed(team) < game.popCap(team)) game.train(team, mk.id, 'camel');
    if (p.routeT <= 0) {
      p.routeT = 25;
      const idle = camels.filter((c) => !c.route && c.task.type === 'idle');
      if (idle.length && pbc && pbc.routeUse >= 0.4 && markets.length >= 2 && game.cmdRouteAuto([idle[0]], 'own')) { /* the player ran camel loops between their own markets: so do we */ }
      else if (idle.length) {
        let best = null, bs = 0;
        const cands = game.buildings.filter((b) => b.kind === 'market' && b.team !== team && b.built >= 1);   // camels trade with markets only
        for (const t of cands) {
          if (!game.canDeal(team, t).ok || game.canDeal(team, t).own) continue;
          const d = Math.hypot(t.x - mk.x, t.y - mk.y); if (d > 200) continue;
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
  // ore we lack lies where no village can lend miners: found a mining camp beside it, then the mine follows
  { const have = new Set(game.buildings.filter((b) => b.team === team && b.kind === 'mine' && b.hp > 0).map((b) => b.ore));   // a camp of ours stands by ore we do not dig yet: raise its mine (beyond the build order's three)
    for (const v of game.villages) {
      if (v.owner !== team || !v.founded || v.kind !== 'mine' || !game.canAfford(team, BUILDINGS.mine.cost)) continue;
      const n = game.depositsNear(v.x, v.y, FOUND.campR + 2).find((x) => !have.has(x.kind) && !x.covered && game.minePower(team, x.x, x.y) > 0 && game.mineSpot(team, x));
      if (n && game.place(team, 'mine', 0, 0, null, n.id)) { have.add(n.kind); break; }
    }
  }
  p.campT = (p.campT ?? 240) - 1.5;
  if (p.campT <= 0 && game.time > 300 && !game.missingFor(team, 'village').length && !game.buildings.some((b) => b.team === team && b.kind === 'village' && b.built < 1) && game.canAfford(team, BUILDINGS.village.cost) && p.wood > 220) {
    p.campT = 150;
    const have = new Set(game.buildings.filter((b) => b.team === team && b.kind === 'mine' && b.hp > 0).map((b) => b.ore));
    const ore = game.resources.filter((n) => ['iron', 'coal', 'copper', 'silver'].includes(n.kind) && !have.has(n.kind) && n.amount > 40 && !n.covered && Math.hypot(n.x - seat.x, n.y - seat.y) < 70 && !(game.minePower(team, n.x, n.y) > 0))
      .sort((a, c) => Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(c.x - seat.x, c.y - seat.y))[0];
    const spot = ore && findSpot(game, team, seat, 'village', { x: ore.x + 0.5, y: ore.y + 0.5, rmin: 3, rmax: FOUND.campR - 3 });
    if (spot && game.place(team, 'village', spot[0], spot[1])) return;
  }
  if (p.foundT <= 0 && game.time > 240 && held.length < 2 && !game.buildings.some((b) => b.team === team && b.kind === 'village' && b.built < 1) && game.canAfford(team, BUILDINGS.village.cost) && p.wood > 260) {
    p.foundT = 120;
    const spot = findSpot(game, team, seat, 'village');
    if (spot) game.place(team, 'village', spot[0], spot[1]);
  }
}
