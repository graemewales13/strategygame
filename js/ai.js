// Auld World - rival houses. They run on the host and play through the same game methods a player's intents reach.
// They start with a home village of thirty folk and three serfs: no keep, no army. They train serfs, gather, build in a fixed order,
// raise a keep toward the nearest free village, contest villages, send a spy, then eventually go to war.

import { deliberate, DIPLO, stance, pressWar, STANCE } from './diplomacy.js';
import { curveAt, blendPlan, lerp, clamp } from './learn.js';
import { BUILDINGS, UNITS, NODE_RES, PLAYER, MATS, MINE_MAX_WORKERS, KING, WAGE_FREE, ALL_GOODS, RES_VALUE, CAPTAIN, FOUND, DOCTRINE, HOUSES, GEAR, GEAR_KEYS, GUARD, GARRISON, SPY_COVER, SIEGE, SIEGE_STORE, BELL, PATROL } from './config.js';

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
    const foe = game.closestEnemy(king, 10, team), keep = foe && game.buildings.filter((b) => b.team === team && b.kind === 'keep' && b.built >= 1 && b.hp > 0 && (b.garrison.length < 8 || b.garrison.some((id) => game.byId.get(id)?.kind === 'recruit'))).sort((a, c) => Math.hypot(a.x - king.x, a.y - king.y) - Math.hypot(c.x - king.x, c.y - king.y))[0];
    const foes = foe ? game.units.filter((u) => u.hp > 0 && !u.inside && game.isEnemy(team, u.team) && game.powerOf(u) > 0 && Math.hypot(u.x - king.x, u.y - king.y) < 10).length : 0;
    const guards = foe ? game.units.filter((u) => u.team === team && u.hp > 0 && !u.inside && u !== king && game.powerOf(u) > 0 && Math.hypot(u.x - king.x, u.y - king.y) < 10).length : 0;
    if (keep && (lastOfLine || king.hp < king.maxHp * 0.6 || foes > guards + 1) && king.task.type !== 'enter') {
      if (keep.garrison.length >= 8) { const r = keep.garrison.map((id) => game.byId.get(id)).find((u) => u && u.kind === 'recruit' && !u.drilling) || keep.garrison.map((id) => game.byId.get(id)).find((u) => u && u.kind === 'recruit'); if (r) { if (r.drilling) { keep.drills = keep.drills.filter((q) => q.uid !== r.id); r.drilling = false; } game.eject(r, keep); } }   // a full keep makes room for its king
      game.cmdEnter([king], keep);
    }
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
  const raised = army.length + game.soldiersOf(team).filter((u) => u.inside && u.kind !== 'recruit' && !u.drilling).length;   // (soldiers sheltering in keeps and barracks are still the house's army)
  const incTot = Object.values(p.inc || {}).reduce((a, v) => a + v, 0);
  const payable = WAGE_FREE + Math.max(0, Math.floor((incTot - 0.1) / 0.06));   // soldiers the income can keep paid
  const rich = Math.max(0, Math.floor((p.gold - 250) / 45));   // a full purse buys men; a thin one holds the line it can pay for
  let base = 3 + Math.floor(t / 65);
  if (pb?.army?.length) base = Math.max(3, Math.round(lerp(base, curveAt(pb.army, pb.step, t), wb)));
  const armyCap = Math.round(Math.min(game.diff.armyCap, Math.min(base, payable) + rich) * (doc.armyMul || 1));
  const queuedMil = game.buildings.filter((b) => b.team === team).reduce((n, b) => n + b.queue.filter((q) => q.kind !== 'serf').length, 0);
  if (raised + queuedMil < armyCap) {
    const picks = [];
    if (pb?.mix && wb >= 0.35) {   // train toward the player's mix of footmen, bowmen and knights
      const have = (k) => army.filter((u) => u.kind === k).length + queued(game, team, k);
      const total = Math.max(1, raised + queuedMil), order = Object.keys(pb.mix).filter((k) => !SIEGE.has(k) && UNITS[k]).sort((x, y) => (pb.mix[y] - have(y) / total) - (pb.mix[x] - have(x) / total));
      for (const k of order) picks.push(k);
      if (!picks.includes('footman')) picks.push('footman');
    } else {
      const have = (k) => army.filter((u) => u.kind === k).length + queued(game, team, k);
      const total = Math.max(1, raised + queuedMil);
      const mix = doc.mix || { footman: 0.6, bowman: 0.25, knight: 0.15 };
      const order = ['knight', 'bowman', 'footman'].filter((k) => mix[k]).sort((a, b) => (mix[b] - have(b) / total) - (mix[a] - have(a) / total));
      for (const k of order) {
        if (k === 'knight' && !game.hasBuilding(team, 'stable')) continue;
        if (k === 'bowman' && !game.hasBuilding(team, 'archery')) continue;
        picks.push(k);
      }
      if (!picks.includes('footman')) picks.push('footman');
    }
    for (const kind of picks) {
      const b = game.buildings.filter((x) => x.team === team && UNITS[kind].from.includes(x.kind) && x.built >= 1 && x.hp > 0).sort((a, c) => a.queue.length - c.queue.length)[0];
      if (b && b.queue.length < 3 && game.train(team, b.id, kind)) break;
    }
  }
  // siege engines: their own allowance beside the army (one for every dozen soldiers, up to three), the best it has the research for
  { const best = ['trebuchet', 'onager', 'ram'].find((k) => game.hasTech(team, UNITS[k].tech)), ws = game.buildings.find((b) => b.team === team && b.kind === 'workshop' && b.built >= 1 && b.hp > 0);
    const have = game.units.filter((u) => u.team === team && SIEGE.has(u.kind) && u.hp > 0).length + ['ram', 'onager', 'trebuchet'].reduce((n, k) => n + queued(game, team, k), 0);
    if (best && ws && raised >= 8 && have < Math.min(3, Math.floor(raised / 12) + 1) && ws.queue.length === 0) game.train(team, ws.id, best);
    // the siege research is done but the build plan never reached a workshop: raise one
    if (best && !game.buildings.some((b) => b.team === team && b.kind === 'workshop' && b.hp > 0) && !game.missingFor(team, 'workshop').length && game.canAfford(team, BUILDINGS.workshop.cost)) { const spot = findSpot(game, team, seat, 'workshop'); if (spot) game.place(team, 'workshop', spot[0], spot[1]); } }
  // spies: trained at a tavern or an academy. One keeps watch where a rival's spy has lately been at work in a village of ours; the rest
  // work on our neighbours' villages near our land and on the villages of houses we are at war with or dislike, or else on free villages
  const spiedOn = Object.entries(p.spied || {}).filter(([id, at]) => { const x = game.byId.get(+id); return game.time - at < 90 && x && (x.owner === team || (x.type === 'building' && x.team === team && x.hp > 0)); }).map(([id]) => game.byId.get(+id));
  const spyWant = (doc.spies || 1) + (spiedOn.length ? 1 : 0);
  if (game.units.filter((u) => u.team === team && u.kind === 'spy' && u.hp > 0).length + queued(game, team, 'spy') < spyWant) {
    const sch = game.buildings.find((b) => b.team === team && (b.kind === 'tavern' || b.kind === 'academy') && b.built >= 1 && b.hp > 0);
    if (sch) game.train(team, sch.id, 'spy');
  }
  const spy = game.units.find((u) => u.team === team && u.kind === 'spy' && u.hp > 0 && u.task.type === 'idle');
  if (spy) {
    const watched = (v) => game.units.some((w) => w.team === team && w.kind === 'spy' && w.hp > 0 && (w.task.type === 'infiltrate' || w.task.type === 'infiltrateB') && w.task.targetId === v.id);
    const guard = spiedOn.find((v) => !watched(v));
    const hostile = (o) => o >= 0 && o !== team && game.alive(o) && game.known[team][o] && game.rel[team][o] !== 'alliance' && (game.rel[team][o] === 'war' || (game.opinion[team][o] || 0) < 0);
    const rival = nearestVillage(game, seat, (x) => x.owner >= 0 && x.owner !== team && game.rel[team][x.owner] !== 'alliance' && game.known[team][x.owner] && (hostile(x.owner) || Math.hypot(x.x - seat.x, x.y - seat.y) < 32), 60);
    const free = nearestFromFrontier(game, team, seat, (x) => x.owner < 0 && x.loyalty < 70, 18, 50);
    // or, in a hated or warring house's colours, into one of its keeps, barracks, markets or academies
    const bld = game.buildings.filter((b) => b.built >= 1 && b.hp > 0 && hostile(b.team) && SPY_COVER.kinds.includes(b.kind) && Math.hypot(b.x - seat.x, b.y - seat.y) < 70).sort((a, c) => Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(c.x - seat.x, c.y - seat.y))[0];
    if (guard) { spy.disguise = null; if (guard.type === 'building') game.cmdInfiltrateB([spy], guard); else game.cmdInfiltrate([spy], guard); }
    else if (bld && game.roll() < 0.4) { spy.disguise = bld.team; game.cmdInfiltrateB([spy], bld); }
    else { const v = rival && (!free || game.roll() < 0.6) ? rival : free; if (v) { spy.disguise = null; game.cmdInfiltrate([spy], v); } }
  }

  // 4b. tavern wanderers and castle drill: hire when flush, send recruits into the keep, drill them into soldiers
  const keepB = game.buildings.find((b) => b.team === team && b.kind === 'keep' && b.built >= 1 && b.hp > 0);
  const tav2 = game.buildings.find((b) => b.team === team && b.kind === 'tavern' && b.built >= 1 && b.hp > 0 && b.roster);
  if (tav2 && keepB && p.gold > 170 && raised < armyCap) {
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
      const want = Math.min(8, Math.ceil(raised / 2) + 1);
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
  // every keep the house holds drills; an idle recruit walks to the nearest one with room
  const drillAt = game.buildings.filter((b) => b.team === team && b.kind === 'keep' && b.built >= 1 && b.hp > 0);
  const bound = new Map(drillAt.map((k) => [k.id, k.garrison.length + game.units.filter((u) => u.team === team && u.task.type === 'enter' && u.task.targetId === k.id).length]));
  for (const u of game.units) {
    if (u.team !== team || u.kind !== 'recruit' || u.inside || u.task.type !== 'idle') continue;
    const k = drillAt.filter((b) => bound.get(b.id) < game.garrisonCap(b) - 1).sort((a, c) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(c.x - u.x, c.y - u.y))[0];   // (one place left for the king)
    if (k) { game.cmdEnter([u], k); bound.set(k.id, bound.get(k.id) + 1); }
  }
  for (const k of drillAt) {
    for (const id of k.garrison) {
      const u = game.byId.get(id);
      if (!u || u.kind !== 'recruit' || u.drilling) continue;
      const kind = army.filter((x) => x.kind === 'bowman').length < army.filter((x) => x.kind === 'footman').length / 2 ? 'bowman' : 'footman';
      if (game.drill(team, k.id, u.id, kind)) break;
    }
    for (const id of k.garrison.slice()) { const u = game.byId.get(id); if (u && u.drilledAt != null && u.kind !== 'recruit' && !u.drilling) { u.drilledAt = null; game.eject(u, k); } }   // the newly drilled step out (soldiers posted to guard stay in); recruits wait their turn inside
  }

  // 5. contest villages
  const readyArmy = army.filter(onCall);
  let need = army.some((u) => SIEGE.has(u.kind)) ? 4 : 5, firstAt = 90;
  if (pb?.attack) { need = Math.round(clamp(lerp(need, pb.attack.size, wb), 3, 14)); firstAt = clamp(lerp(90, pb.attack.first * 0.85, wb), 60, 1200); }
  if (readyArmy.length >= need && t > firstAt) {
    const strength = readyArmy.reduce((n, u) => n + UNITS[u.kind].hp, 0);
    const v = nearestFromFrontier(game, team, seat, (x) => x.owner !== team && (x.owner < 0 || game.rel[team][x.owner] === 'war') && x.maxProtection * 2.2 < strength + (army.some((u) => SIEGE.has(u.kind)) ? 400 : 0), 18);   // (from our frontier, not only home: a growing house keeps growing)
    if (v) { const go = readyArmy.filter((u) => u.kind !== 'spy'); game.setStance(go, 'aggressive'); game.setFormation(go, 'line'); game.cmdAttack(go, v); p.planVillage = v.id; }
  }
  { const hurt = game.buildings.find((b) => b.team === team && b.built >= 1 && b.hp > 0 && b.hp < b.maxHp * 0.75 && (b.hitT ?? 0) <= 0 && !game.units.some((o) => o.hp > 0 && game.isEnemy(team, o.team) && Math.hypot(o.x - b.x, o.y - b.y) < 12));   // mend what is damaged, once the foe has gone
    if (hurt && !game.units.some((u) => u.team === team && u.task.type === 'repair')) game.repairWith(team, hurt, 2); }
  townBell(game, team, p, seat, t);
  courtVillages(game, team, p, seat, army, need, t);
  scoutAbroad(game, team, p, seat, army, t);

  // 6. war is chosen, not scheduled: a house fights the one it is at war with, or the one its stance says it means war on (threat, temptation,
  // grudge, less ties: see stance() in diplomacy.js). The difficulty's warAfter (x0.6) is only the earliest a house will start a war of its own.
  const warAfter = pb?.warAt ? clamp(lerp(game.diff.warAfter, pb.warAt, wb), 240, 1800) : game.diff.warAfter;
  const earliest = warAfter * 0.6;
  p.warIn = Math.max(0, Math.round(earliest - t));
  const atWar = game.players.some((q) => q.alive && q.team !== team && game.rel[team][q.team] === 'war');
  if (atWar || (t > earliest && raised >= 7)) {
    let target = null, bd = -1e9;
    for (const q of game.players) {
      if (!q.alive || q.team === team || !game.known[team][q.team] || !game.seatOf(q.team)) continue;
      if (game.rel[team][q.team] === 'alliance') continue;   // oaths are kept (until a leader's temper breaks them)
      const st = stance(game, team, q.team), war = game.rel[team][q.team] === 'war';
      if (!war && (st.war < game.diff.warBar + (doc.war || 0) || t <= earliest || raised < 7 || game.time - game.relSince[team][q.team] < 240)) continue;   // a peace just made is kept a while
      const score = (war ? 1 : 0) + st.war + st.temptation * 0.5;
      if (score > bd) { bd = score; target = q; }
    }
    p.planWar = target ? target.team : null;
    if (target && !pressWar(game, team, target.team)) target = null;   // an ultimatum first; the war comes if it is not answered
    if (target) {
      const ready = army.filter(onCall);
      // march only with the bulk of the army (a band of seven at a time is beaten one band at a time); not while a beaten band regroups
      const fighters = army.filter((u) => game.fighter(u)).length + game.soldiersOf(team).filter((u) => u.inside && !u.drilling && u.kind !== 'recruit').length;
      if (ready.length >= Math.max(7, Math.ceil(fighters * (game.diff.mass || 0))) && t >= (p.regroupUntil || 0)) {
        const goal = huntGoal(game, team, target.team, seat, ready);
        if (goal) { game.setStance(ready, 'aggressive'); game.setFormation(ready, 'line'); game.cmdAttack(ready, goal); }
      }
    }
    regroup(game, team, p, seat, army, t);
  } else {
    // return stragglers home; at peace the home guard stands defensive, so a raider cannot draw it far from the seat
    for (const u of army) if (u.task.type === 'idle' && Math.hypot(u.x - seat.x, u.y - seat.y) > 12) game.cmdMove([u], seat.x + (game.roll() - 0.5) * 4, seat.y + 4);
    const guard = army.filter((u) => u.stance !== 'defensive' && u.task.type === 'idle' && Math.hypot(u.x - seat.x, u.y - seat.y) <= 12);
    if (guard.length) game.setStance(guard, 'defensive');
    patrolBounds(game, team, p, seat, army, t);
  }
}

// soldiers free for a march: standing idle, or walking a patrol (T39), which any new order ends
const onCall = (u) => u.task.type === 'idle' || (u.task.type === 'amove' && !!u.task.patrol);
// At peace a house with a home guard to spare sends a pair walking a round (T39) between its seat and its nearest held village (or,
// with none, toward the middle of the valley), so a raider or spy is met on the road rather than at the keep. Never more than PATROL.pair.
export function patrolBounds(game, team, p, seat, army, t) {
  if (t < (p.patrolT || 0)) return;
  p.patrolT = t + PATROL.every;
  const walking = army.filter((u) => !u.inside && game.patrolOf(u)).length;
  if (walking >= PATROL.pair) return;
  const home = army.filter((u) => game.fighter(u) && !SIEGE.has(u.kind) && u.kind !== 'spy' && !u.inside && u.task.type === 'idle' && Math.hypot(u.x - seat.x, u.y - seat.y) <= 12);
  if (home.length < PATROL.spare) return;
  const v = nearestVillage(game, seat, (x) => x.owner === team && x.home !== team && Math.hypot(x.x - seat.x, x.y - seat.y) >= 6, PATROL.reach);
  let to = v ? [v.x, v.y + 2] : null;
  if (!to) { const cx = game.W / 2 - seat.x, cy = game.H / 2 - seat.y, d = Math.hypot(cx, cy) || 1; to = [seat.x + (cx / d) * PATROL.out, seat.y + (cy / d) * PATROL.out]; }
  const go = home.slice(0, PATROL.pair - walking);
  game.cmdPatrol(go, to[0], to[1]);
}

// The town bell (T38), the player's button: raiders at the seat who clearly outnumber the guard there send the serfs inside;
// the all-clear sounds once the seat has been quiet for BELL.quiet seconds.
export function townBell(game, team, p, seat, t) {
  const near = (u) => u.hp > 0 && !u.inside && Math.hypot(u.x - seat.x, u.y - seat.y) < BELL.raidR && game.powerOf(u) > 0;
  const foes = game.units.filter((u) => near(u) && game.isEnemy(team, u.team) && game.fighter(u)).length;
  if (p.bell == null) {
    const guard = game.units.filter((u) => u.team === team && near(u) && game.fighter(u)).length;
    if (foes >= BELL.foes && foes > guard * BELL.odds) game.ringBell(team);
    return;
  }
  if (foes) { p.bellQuiet = null; return; }
  if (p.bellQuiet == null) p.bellQuiet = t;
  else if (t - p.bellQuiet >= BELL.quiet) game.allClear(team);
}

// A war band that is losing falls back to its seat to join the rest and heal, instead of dying to the last man: the foes' fighting power
// around the band (their soldiers and towers within reach) against its own. Then it waits a little before marching again.
export function regroup(game, team, p, seat, army, t) {
  const ratio = game.diff.regroup; if (!ratio) return;
  const band = army.filter((u) => !u.inside && (u.task.type === 'attack' || u.task.type === 'amove') && Math.hypot(u.x - seat.x, u.y - seat.y) > 14);
  if (band.length < 3) return;
  const cx = band.reduce((a, u) => a + u.x, 0) / band.length, cy = band.reduce((a, u) => a + u.y, 0) / band.length;
  const foe = (o) => o !== team && o >= 0 && game.rel[team][o] === 'war';
  const pow = (u) => game.powerOf(u) * (u.hp / Math.max(1, u.maxHp));
  let ours = 0, theirs = 0;
  for (const u of game.units) {
    if (u.hp <= 0 || u.inside || Math.hypot(u.x - cx, u.y - cy) > 11) continue;
    if (u.team === team) ours += pow(u); else if (foe(u.team)) theirs += pow(u);
  }
  for (const b of game.buildings) if (foe(b.team) && b.hp > 0 && b.built >= 1 && (b.kind === 'tower' || b.kind === 'keep') && b.garrison?.length && Math.hypot(b.x - cx, b.y - cy) < 11) theirs += 1.2 * b.garrison.length;   // (a man shooting from a tower is worth about a bowman in the field)
  if (theirs <= ours * ratio) return;
  game.cmdRetreat(band); game.setStance(band, 'defensive');   // (a retreat out of a fight is a rout, with its cost: RETREAT)
  p.regroupUntil = t + 45;
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
const AI_STUDY = ['drill', 'masonry', 'siegecraft', 'husbandry', 'metallurgy', 'fletching', 'torsion', 'steelcraft', 'medicine', 'counterweight', 'mechanics', 'engineering'];
// The house courts villages as a player does: a keep beside each village it wants (one more every few minutes, up to four), and soldiers
// sitting inside to sway it (a keep's pull is full with GUARD.full guards in). At war they come out to march, leaving two on guard.
export function courtVillages(game, team, p, seat, army, need, t) {
  const keeps = game.buildings.filter((b) => b.team === team && b.kind === 'keep' && b.hp > 0);
  const front = frontierOf(game, team, seat).slice(1), fd = (v) => Math.min(Math.hypot(v.x - seat.x, v.y - seat.y) * (18 / 46), ...front.map((a) => Math.hypot(v.x - a.x, v.y - a.y)));   // (the seat reaches 46 as before, each holding 18 more)   // measured from everything we hold, so the reach grows as we do
  const wanted = game.villages.filter((v) => v.owner !== team && (v.owner < 0 || game.rel[team][v.owner] === 'war') && fd(v) < 18)
    .sort((a, c) => fd(a) - fd(c)).slice(0, 3);
  const outposts = game.villages.filter((v) => v.owner === team && v.founded && Math.hypot(v.x - seat.x, v.y - seat.y) > 40);   // our camps out in the open ground
  p.courtT = (p.courtT ?? 20) - 1;
  if (p.courtT <= 0 && t > 300 && keeps.length < Math.min(10, 2 + Math.floor(t / 400)) && !keeps.some((k) => k.built < 1)
      && game.canAfford(team, BUILDINGS.keep.cost) && p.wood > BUILDINGS.keep.cost.wood + 120) {
    p.courtT = 20;
    const v = [...outposts, ...wanted].find((x) => !keeps.some((k) => Math.hypot(k.x - x.x, k.y - x.y) < 16));   // a far camp is held by a keep first
    const spot = v && findSpot(game, team, seat, 'keep', { x: v.x, y: v.y, rmin: 6, rmax: 12 });
    if (spot) game.place(team, 'keep', spot[0], spot[1]);
  }
  const fighter = (u) => u && u.hp > 0 && (u.kind === 'footman' || u.kind === 'bowman' || u.kind === 'knight');
  const atWar = game.players.some((q) => q.alive && q.team !== team && game.rel[team][q.team] === 'war');
  if (atWar) {   // the army is needed: posted soldiers come out, two stay on guard; the engines roll out of the sheds
    for (const k of keeps) for (const id of (k.engines || []).slice()) { const e = game.byId.get(id); if (e) game.eject(e, k); }
    const ready = army.filter((u) => u.task.type === 'idle' && !u.inside).length;
    if (ready < 7) for (const k of game.buildings.filter((b) => b.team === team && GARRISON[b.kind] && b.garrison.length)) {
      const sol = k.garrison.map((id) => game.byId.get(id)).filter((u) => fighter(u) && !u.drilling);
      for (const u of sol.slice(k.kind === 'keep' ? 2 : 0)) game.eject(u, k);
    }
    return;
  }
  // engines wait in the keeps' sheds in peace (out of harm's way, kept in repair)
  for (const e of game.units.filter((u) => u.team === team && SIEGE.has(u.kind) && u.hp > 0 && !u.inside && u.task.type === 'idle')) {
    const k = keeps.filter((x) => x.built >= 1 && (x.engines || []).length < SIEGE_STORE).sort((a, c) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(c.x - e.x, c.y - e.y))[0];
    if (k) game.cmdEnter([e], k);
  }
  const posts = keeps.filter((k) => k.built >= 1 && (wanted.some((v) => Math.hypot(k.x - v.x, k.y - v.y) < 20) || outposts.some((v) => Math.hypot(k.x - v.x, k.y - v.y) < 16)));
  let free = army.filter((u) => fighter(u) && u.task.type === 'idle' && !u.inside && u.id !== p.scoutId);
  free = free.slice(0, Math.max(0, free.length - need));   // keep a field force ready to march
  for (const k of posts) {
    const sitting = k.garrison.filter((id) => fighter(game.byId.get(id))).length + game.units.filter((u) => u.team === team && u.task.type === 'enter' && u.task.targetId === k.id).length;
    const room = Math.min(GUARD.full - sitting, game.garrisonCap(k) - 2 - k.garrison.length);   // (room left for the king to shelter)
    if (room <= 0 || !free.length) continue;
    const go = free.sort((a, c) => Math.hypot(a.x - k.x, a.y - k.y) - Math.hypot(c.x - k.x, c.y - k.y)).splice(0, room);
    game.cmdEnter(go, k);
  }
  // the rest of the surplus waits under a roof (barracks and towers; keeps stay free for guards, recruits at drill and the king) rather than standing about in the fields
  for (const b of game.buildings.filter((x) => x.team === team && x.built >= 1 && x.hp > 0 && GARRISON[x.kind] && x.kind !== 'keep')) {
    if (!free.length) break;
    const coming = game.units.filter((u) => u.team === team && u.task.type === 'enter' && u.task.targetId === b.id).length;
    const room = game.garrisonCap(b) - (b.kind === 'keep' ? 2 : 0) - b.garrison.length - coming;
    if (room <= 0) continue;
    game.cmdEnter(free.sort((x, y) => Math.hypot(x.x - b.x, x.y - b.y) - Math.hypot(y.x - b.x, y.y - b.y)).splice(0, room), b);
  }
}
// A house that has not met every rival sends one rider out to look. He tours the places a hall can stand (the corners, the edge midpoints
// and the middle: see createMap), nearest first, until every living house is met; then he rejoins the army. Without him a quiet house on
// a large map is never found, and so is never treated with or fought.
export function scoutAbroad(game, team, p, seat, army, t) {
  const unmet = game.players.some((q) => q.alive && q.team !== team && !game.known[team][q.team]);
  let sc = p.scoutId != null ? game.byId.get(p.scoutId) : null;
  if (sc && (sc.hp <= 0 || sc.team !== team)) sc = null;
  if (!unmet || t < 150) { if (sc) { if (sc.task.type === 'move') sc.task = { type: 'idle' }; game.setStance([sc], 'aggressive'); } p.scoutId = null; return; }
  if (!sc) {
    const pick = (k) => army.filter((u) => u.kind === k && !u.inside && u.task.type === 'idle').sort((a, b) => UNITS[b.kind].speed - UNITS[a.kind].speed)[0];
    sc = pick('knight') || pick('bowman') || pick('footman'); if (!sc) return;
    p.scoutId = sc.id; p.scoutAt = null;
  }
  if (sc.inside || sc.task.type === 'attack') return;   // (busy: fighting or sheltering; he goes on afterwards)
  const W = game.W, H = game.H, F = [[0.14, 0.14], [0.84, 0.84], [0.84, 0.14], [0.14, 0.84], [0.49, 0.12], [0.49, 0.86], [0.12, 0.49], [0.86, 0.49], [0.5, 0.5]];
  p.scoutSeen ||= [];
  const at = p.scoutAt != null ? F[p.scoutAt] : null;
  if (at && sc.task.type === 'move' && Math.hypot(sc.x - at[0] * W, sc.y - at[1] * H) > 6) return;   // still riding there
  if (p.scoutAt != null) p.scoutSeen.push(p.scoutAt);
  let left = F.map((f, i) => i).filter((i) => !p.scoutSeen.includes(i) && Math.hypot(F[i][0] * W - seat.x, F[i][1] * H - seat.y) > 24);
  if (!left.length) { p.scoutSeen = []; left = F.map((f, i) => i).filter((i) => Math.hypot(F[i][0] * W - seat.x, F[i][1] * H - seat.y) > 24); }
  const next = left.sort((a, b) => Math.hypot(F[a][0] * W - sc.x, F[a][1] * H - sc.y) - Math.hypot(F[b][0] * W - sc.x, F[b][1] * H - sc.y))[0];
  if (next == null) return;
  p.scoutAt = next; game.setStance([sc], 'passive'); game.cmdMove([sc], Math.round(F[next][0] * W), Math.round(F[next][1] * H));
}
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

// where a house reaches from: its seat, its keeps and every village it holds firmly (a shaky one does not carry it further: growth stays steady)
function frontierOf(game, team, seat) {
  return [seat, ...game.buildings.filter((b) => b.team === team && b.kind === 'keep' && b.hp > 0), ...game.villages.filter((v) => v.owner === team && v.loyalty >= 50)];
}
// the village nearest to any part of the house's frontier (not just its seat) that `pred` accepts, within maxD of it
// The seat reaches `seatR` tiles as it always did; each firmly held village or keep reaches `maxD` beyond itself, so a house grows outward
// steadily (from its first villages a full-seat reach made it snowball). Nearest first, the seat's distance scaled to the frontier's.
function nearestFromFrontier(game, team, seat, pred, maxD, seatR = 42) {
  const front = frontierOf(game, team, seat).slice(1); let best = null, bd = maxD;
  for (const v of game.villages) {
    if (!pred(v)) continue;
    let d = Math.hypot(v.x - seat.x, v.y - seat.y) * (maxD / seatR);
    for (const a of front) d = Math.min(d, Math.hypot(v.x - a.x, v.y - a.y));
    if (d < bd) { best = v; bd = d; }
  }
  return best;
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
  for (const q of game.players) { if (!q.alive || q.team === team) continue; const o = game.seatOf(q.team); if (!o) continue; const d = Math.hypot(o.x - seat.x, o.y - seat.y); if (d < fd) { fd = d; foe = o; } }   // (houses have no hall: their seat is a home village or keep)
  const fa = foe ? Math.atan2(foe.y - seat.y, foe.x - seat.x) : 0;
  const near = [];   // everything a new footprint could crowd
  for (const b of game.buildings) if (b.hp > 0 && Math.abs(b.x - ax) < rmax + 14 && Math.abs(b.y - ay) < rmax + 14) near.push(b);
  for (const v of game.villages) if (Math.abs(v.x - ax) < rmax + 14 && Math.abs(v.y - ay) < rmax + 14) near.push(v);
  const own = near.filter((b) => b.team === team);
  const cands = [];
  for (let r = rmin; r <= rmax; r += 1) {
    const steps = Math.max(10, Math.floor(r * 3.5)), off = game.roll() * Math.PI * 2;
    for (let a = 0; a < steps; a++) {
      const ang = off + (a / steps) * Math.PI * 2, rr = r + (game.roll() - 0.5) * 1.4;
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
    let sc = game.roll() * 1.8;
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
    if (camels.length + q < want && p.gold > 90 && (UNITS.camel.nopop || game.popUsed(team) < game.popCap(team))) game.train(team, mk.id, 'camel');   // (pack animals need no room, as for the player: T-063)
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
  { const dead = game.buildings.find((b) => b.team === team && b.kind === 'mine' && b.built >= 1 && b.hp > 0 && (b.idleT || 0) > 180);   // three minutes with nobody to dig and no camp to be had: pull it down and take a third back
    if (dead) game.demolish(team, dead.id); }
  p.campT = (p.campT ?? 240) - 1.5;
  if (p.campT <= 0 && game.time > 300 && !game.missingFor(team, 'village').length && !game.buildings.some((b) => b.team === team && b.kind === 'village' && b.built < 1) && game.canAfford(team, BUILDINGS.village.cost) && p.wood > 220) {
    p.campT = 150;
    const have = new Set(game.buildings.filter((b) => b.team === team && b.kind === 'mine' && b.hp > 0).map((b) => b.ore));
    // metal is regional, so what we lack lies out in the open ground: go as far as the difficulty's reach; and now and then, with everything
    // at home, stake out a rich seam out there anyway (owner, 2026-10-15: rivals kept to their own patch). Not beside another house's works.
    const reach = game.diff.reach || 70, theirs = (n) => game.buildings.some((b) => b.team !== team && b.hp > 0 && Math.hypot(b.x - n.x, b.y - n.y) < 12);
    const byDist = (a, c) => Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(c.x - seat.x, c.y - seat.y);
    const open = (n) => ['iron', 'coal', 'copper', 'silver'].includes(n.kind) && n.amount > 40 && !n.covered && Math.hypot(n.x - seat.x, n.y - seat.y) < reach && !(game.minePower(team, n.x, n.y) > 0) && !theirs(n);
    const ore = game.resources.filter((n) => open(n) && !have.has(n.kind)).sort(byDist)[0]
      || (game.roll() < 0.35 ? game.resources.filter((n) => open(n) && n.amount > 300 && Math.hypot(n.x - seat.x, n.y - seat.y) > 40).sort(byDist)[0] : null);
    // a mine of ours that has stood a minute with nobody to dig (its villages' folk are all at other mines) needs a camp of its own first
    const idleMine = game.buildings.find((b) => b.team === team && b.kind === 'mine' && b.built >= 1 && b.hp > 0 && (b.idleT || 0) > 60 && !game.villages.some((v) => v.owner === team && v.founded && Math.hypot(v.x - b.x, v.y - b.y) <= FOUND.campR + 2));
    const at = idleMine ? { x: idleMine.x, y: idleMine.y } : ore ? { x: ore.x + 0.5, y: ore.y + 0.5 } : null;
    const spot = at && findSpot(game, team, seat, 'village', { x: at.x, y: at.y, rmin: 3, rmax: FOUND.campR - 3 });
    if (spot && game.place(team, 'village', spot[0], spot[1])) return;
  }
  if (p.foundT <= 0 && game.time > 240 && held.length < 2 && !game.buildings.some((b) => b.team === team && b.kind === 'village' && b.built < 1) && game.canAfford(team, BUILDINGS.village.cost) && p.wood > 260) {
    p.foundT = 120;
    const spot = findSpot(game, team, seat, 'village');
    if (spot) game.place(team, 'village', spot[0], spot[1]);
  }
}
