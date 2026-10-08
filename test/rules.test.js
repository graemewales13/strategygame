// Tests for ratings, kings and diplomacy. Fast: `node test/rules.test.js` (part of `npm test`).
import assert from 'node:assert/strict';
import { HOUSES } from '../js/config.js';
import { Game } from '../js/game.js';
import { deliberate as dip_deliberate, intel } from '../js/diplomacy.js';
import { PLAYER, RANKS, RANK_BONUS, UNITS } from '../js/config.js';

let _s = 777;
Math.random = () => { _s = (_s + 0x6d2b79f5) >>> 0; let t = _s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const run = (g, secs, dt = 0.1) => { for (let t = 0; t < secs; t += dt) g.tick(dt); };
const mk = (opts = {}) => new Game({ seed: 8, houses: 3, ai: false, ...opts });

test('ratings: a soldier earns experience from damage and kills, is promoted, and then hits harder and is tougher', () => {
  const g = mk(); g.rel[0][1] = g.rel[1][0] = 'war';
  const h = g.seatOf(PLAYER), e = g.seatOf(1);
  const a = g.addUnit('footman', PLAYER, h.x, h.y + 6), hp0 = a.maxHp;
  assert.equal(a.rank, 0);
  g.award(a, RANKS[1].xp);
  assert.equal(a.rank, 1); assert.ok(a.maxHp > hp0, 'promotion raises health');
  const foe = g.addUnit('recruit', 1, h.x + 2, h.y + 6); foe.hp = 5;
  g.damage(foe, 50, PLAYER, a);
  assert.ok(a.xp > RANKS[1].xp, 'a kill earns experience');
  // damage scales with rank
  const dmgOf = (rank) => { const u = g.addUnit('footman', PLAYER, h.x, h.y + 9); u.rank = rank; const t = g.addUnit('knight', 1, h.x + 1, h.y + 9); t.hp = t.maxHp = 9999; u.task = { type: 'attack', targetId: t.id }; u.cooldown = 0; g.doAttack(u, UNITS.footman, 0.1); return 9999 - t.hp; };
  assert.ok(dmgOf(3) > dmgOf(0) * (1 + RANK_BONUS.dmg * 2.5), 'a rank-3 footman hits clearly harder');
  assert.ok(g.powerOf(Object.assign(g.addUnit('footman', PLAYER, 5, 5), { rank: 4 })) > g.powerOf(g.addUnit('footman', PLAYER, 5, 5)) * 1.4, 'power counts rank');
});

test('ratings: rated soldiers on guard sway a village more than rookies', () => {
  const g = mk(); const v = g.villages.find((x) => x.owner < 0);
  const k = g.addBuilding('keep', PLAYER, Math.round(v.x - 9), Math.round(v.y), true); g.recomputeWalk();
  const us = [0, 1, 2, 3].map((i) => g.addUnit('footman', PLAYER, k.x + i * 0.3, k.y + 2));
  const rookie = g.guardOf(k); us.forEach((u) => { u.rank = 4; });
  const champ = g.guardOf(k);
  assert.ok(champ > rookie * 1.8, `guard ${rookie} -> ${champ}`);
});

test('king: every house starts with a named ruler who is not counted as soldier or population', () => {
  const g = mk();
  for (const p of g.players) { const k = g.kingOf(p.team); assert.ok(k && k.name && k.title, 'a titled, named king'); assert.ok(p.persona.temper, 'a temper'); }
  assert.equal(g.militaryOf(PLAYER).length, 0, 'the king is not in the army count');
  assert.equal(g.popUsed(PLAYER), 3, 'only the three serfs use population');
});

test('king: soldiers near him hit harder; his fall leaves the house leaderless until an heir rises', () => {
  const g = mk(); const h = g.seatOf(PLAYER), k = g.kingOf(PLAYER);
  const px = k.x, py = k.y, hit = () => { const u = g.addUnit('footman', PLAYER, px + 1, py); const t = g.addUnit('knight', 1, px + 2, py); g.rel[0][1] = g.rel[1][0] = 'war'; t.hp = t.maxHp = 9999; u.task = { type: 'attack', targetId: t.id }; u.cooldown = 0; g.updateKings(0); g.doAttack(u, UNITS.footman, 0.1); return 9999 - t.hp; };
  const near = hit(); k.x += 30; const far = hit(); k.x -= 30;
  assert.ok(near > far * 1.05, `aura ${far} -> ${near}`);
  const killer = g.addUnit('footman', 1, k.x, k.y); g.damage(k, 99999, 1, killer);
  assert.ok(g.players[PLAYER].leaderless === true); assert.ok(killer.xp >= 80, 'the slayer is famed');
  g.updateKings(0); assert.equal(g.kingOf(PLAYER), null);
  run(g, 4);
  const heir = g.kingOf(PLAYER); assert.ok(heir && heir.id !== k.id && heir.rank === 0, 'an heir rises'); assert.equal(g.players[PLAYER].leaderless, false);
});

test('king: a throne is never left empty - an heir is named within moments', () => {
  const g = mk(); const k = g.kingOf(PLAYER); const killer = g.addUnit('footman', 1, k.x, k.y); g.damage(k, 99999, 1, killer);
  run(g, 4); assert.ok(g.kingOf(PLAYER) && g.kingOf(PLAYER).id !== k.id, 'a new king stands within seconds');
  g.players[1].kingId = -1; g.players[1].heirAt = null; run(g, 4); assert.ok(g.kingOf(1), 'even a house whose king vanished without a record is given one');
});

test('defence: idle soldiers within 5 squares of a building under attack turn on the attacker; those farther off do not', () => {
  const g = mk(); const h = g.seatOf(PLAYER);
  const b = g.addBuilding('cottage', PLAYER, h.tx + 8, h.ty, true);
  const near = g.addUnit('footman', PLAYER, b.x + 3, b.y), far = g.addUnit('footman', PLAYER, b.x + 9, b.y), busy = g.addUnit('footman', PLAYER, b.x - 3, b.y);
  busy.task = { type: 'move' };
  g.rel[0][1] = g.rel[1][0] = 'war';
  const foe = g.addUnit('bowman', 1, b.x, b.y + 8); foe.hp = foe.maxHp = 9999;
  near.aggroT = far.aggroT = 99;   // not their own eyes: the alarm alone must move them
  g.damage(b, 5, 1, foe);
  assert.equal(near.task.type, 'attack', 'the near soldier answers'); assert.equal(near.task.targetId, foe.id);
  assert.equal(far.task.type, 'idle', 'the far one does not'); assert.equal(busy.task.type, 'move', 'one on an order keeps it');
});

test('crowding: a group sent to one spot ends up spread out, never stacked into one body', () => {
  const g = mk(); const h = g.seatOf(PLAYER), us = [];
  for (let i = 0; i < 8; i++) us.push(g.addUnit('footman', PLAYER, h.x + 4, h.y + 4));   // all spawned on one point
  g.cmdMove(us, h.x + 14, h.y + 4); run(g, 20);
  let min = 9; for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) min = Math.min(min, Math.hypot(us[i].x - us[j].x, us[i].y - us[j].y));
  assert.ok(min > 0.9, 'nobody overlaps: closest pair ' + min.toFixed(2));
  assert.ok(us.every((u) => Math.hypot(u.x - (h.x + 14), u.y - (h.y + 4)) < 5), 'and they all arrived');
});

test('peoples: names fit the nation; the player can pick or be dealt any people; the seating is deterministic and survives a save', () => {
  const g0 = mk(); assert.equal(HOUSES[0].faction, 'egyptians'); assert.match(HOUSES[0].short, /Khemet/);
  const NAT = { egyptians: /Khemet/, romans: /Aurelius/, scottish: /MacAlpin/, british: /Wessex/, mongols: /Borjigin/ };
  for (const f of Object.keys(NAT)) {
    const g = new Game({ seed: 11, houses: 4, ai: false, people: f });
    assert.equal(HOUSES[0].faction, f, 'the player is ' + f); assert.match(HOUSES[0].name, NAT[f], 'and the house name fits: ' + HOUSES[0].name);
    assert.equal(g.players[0].name, HOUSES[0].name);
    assert.equal(new Set(HOUSES.map((h) => h.faction)).size, 5, 'every people sits once');
    assert.ok(HOUSES.every((h) => NAT[h.faction].test(h.name)), 'every house name fits its people');
  }
  const a = new Game({ seed: 5, houses: 3, ai: false, people: 'random' }).peopleOrder.join(), b = new Game({ seed: 5, houses: 3, ai: false, people: 'random' }).peopleOrder.join();
  assert.equal(a, b, 'the same seed seats the same peoples');
  const seen = new Set(); for (let s = 1; s <= 40; s++) seen.add(new Game({ seed: s, houses: 3, ai: false, people: 'random' }).peopleOrder[0]);
  assert.ok(seen.size >= 4, 'random deals the player different peoples: ' + [...seen]);
  const g = new Game({ seed: 8, houses: 3, ai: false, people: 'mongols' }), data = JSON.parse(JSON.stringify(g.serialize()));
  new Game({ seed: 99, houses: 3, ai: false });   // another game reseats the world...
  new Game({ seed: 8, houses: 3, ai: false }).restore(data);
  assert.equal(HOUSES[0].faction, 'mongols', '...but loading the save restores the seating');
  new Game({ seed: 1, houses: 3, ai: false });
});

test('building: a lane of at least one tile is kept between buildings', () => {
  const g = mk(); const h = g.seatOf(PLAYER); g.players[PLAYER].wood = 999; g.players[PLAYER].stone = 999; g.seen[PLAYER].fill(1);
  const b = g.addBuilding('market', PLAYER, h.tx + 7, h.ty + 7, true);
  assert.equal(g.canPlace(PLAYER, 'market', b.tx + b.size, b.ty).ok, false, 'touching is refused');
  assert.match(g.canPlace(PLAYER, 'market', b.tx + b.size, b.ty).reason, /gap/);
  assert.equal(g.canPlace(PLAYER, 'market', b.tx + b.size + 1, b.ty).ok, true, 'one tile of lane is allowed');
});

test('title view: the fog-free backdrop never leaks into the match (loading or toggling fog from the title screen keeps fog)', () => {
  const g = new Game({ seed: 3, houses: 3, ai: false, fog: true }); const data = JSON.parse(JSON.stringify(g.serialize()));
  g.titleView = true; assert.equal(g.fogOn, false, 'the view is lifted'); g.restore(data);
  assert.equal(g.fogOn, true, 'a loaded game has fog'); assert.ok(g.seen[PLAYER].some((v) => v === 0), 'and the map is not revealed');
  g.titleView = true; g.setFog(true); assert.equal(g.fogOn, true); assert.ok(g.seen[PLAYER].some((v) => v === 0));
});

test('king: his presence sways a nearby free village', () => {
  const g = mk(); const v = g.villages.find((x) => x.owner < 0), k = g.kingOf(PLAYER);
  g.updateKings(0);
  const far = g.pullsFor(v)[PLAYER]; k.x = v.x - 3; k.y = v.y; const near = g.pullsFor(v)[PLAYER];
  assert.ok(near > far + 0.3, `pull ${far} -> ${near}`);
});

// ---- diplomacy ---------------------------------------------------------------------------------------
const meet = (g) => { for (let i = 0; i < g.houses; i++) for (let j = 0; j < g.houses; j++) g.known[i][j] = 1; };
const boost = (g, team, n) => { for (let i = 0; i < n; i++) { const u = g.addUnit('knight', team, 5 + i * 0.1, 5); u.hp = u.maxHp; } };
const nice = (g, a, b, v = 50) => { g.opinion[a][b] = v; g.players[a].persona.temper = 'honourable'; };

test('diplomacy: a gift warms a rival, and a cold house refuses an alliance until it warms', () => {
  const g = mk(); meet(g); g.time = 200; g.players[PLAYER].gold = 500;
  assert.equal(g.proposeRelation(PLAYER, 1, 'alliance'), false, 'strangers do not ally'); assert.match(g.diploNote, /friend/);
  const before = g.opinion[1][PLAYER];
  assert.equal(g.giveGift(PLAYER, 1, 120), true);
  assert.ok(g.opinion[1][PLAYER] > before + 8, 'the gift warms him');
  g.opinion[1][PLAYER] = 40; g.players[1].persona.temper = 'honourable';
  assert.equal(g.proposeRelation(PLAYER, 1, 'alliance'), true); assert.equal(g.rel[PLAYER][1], 'alliance');
  assert.equal(g.isEnemy(PLAYER, 1), false, 'allies are not enemies');
  const m = g.addBuilding('market', 1, 30, 30, true); assert.equal(g.canDeal(PLAYER, m).ok, true, 'allies trade');
});

test('diplomacy: breaking an alliance is remembered; striking a house angers its friends', () => {
  const g = mk(); meet(g); g.time = 200; g.opinion[1][PLAYER] = 50; g.opinion[2][PLAYER] = 0;
  g.setRelation(PLAYER, 1, 'alliance'); g.setRelation(PLAYER, 1, 'peace');
  assert.ok(g.opinion[1][PLAYER] < 50 - 30, 'the betrayed leader is furious: ' + g.opinion[1][PLAYER]);
  assert.ok(g.opinion[2][PLAYER] < 0, 'others hear of it');
  g.setRelation(1, 2, 'alliance'); const o = g.opinion[1][PLAYER]; g.setRelation(PLAYER, 2, 'war');
  assert.ok(g.opinion[1][PLAYER] < o - 20, 'he was the ally of the one you struck');
});

test('diplomacy: a friendly leader writes to propose an alliance; accepting it makes allies', () => {
  const g = mk(); meet(g); g.time = 300; nice(g, 1, PLAYER, 45);
  g.setRelation(1, 2, 'war');   // a shared enemy makes it sensible
  g.setRelation(PLAYER, 2, 'war');
  dip_deliberate(g, 1);
  const o = g.offers.find((x) => x.to === PLAYER && x.from === 1 && x.kind === 'treaty' && x.state === 'alliance');
  assert.ok(o, 'a letter arrived'); assert.ok(o.text.length > 20 && /Calder|Varr|Cael|Thorn|Ash|[A-Z]/.test(o.text));
  assert.equal(g.respondOffer(PLAYER, 1, true, o.id), true); assert.equal(g.rel[PLAYER][1], 'alliance');
  assert.equal(g.letters.find((l) => l.id === o.id).state, 'accepted');
});

test('diplomacy: an ally asks you to join its war; accept and you are at war, decline and it remembers', () => {
  const g = mk(); meet(g); g.time = 300; nice(g, 1, PLAYER, 40); g.setRelation(1, PLAYER, 'alliance'); g.setRelation(1, 2, 'war');
  dip_deliberate(g, 1);
  const o = g.offers.find((x) => x.kind === 'joinwar'); assert.ok(o && o.target === 2, 'a call to arms');
  const op0 = g.opinion[1][PLAYER];
  g.respondOffer(PLAYER, 1, false, o.id);
  assert.ok(g.opinion[1][PLAYER] < op0 - 10, 'refusing an ally stings'); assert.equal(g.rel[PLAYER][2], 'peace');
  g.cool = {}; g.players[1].lastLetter = -999; g.opinion[1][PLAYER] = 40;
  dip_deliberate(g, 1); const o2 = g.offers.find((x) => x.kind === 'joinwar'); assert.ok(o2);
  g.respondOffer(PLAYER, 1, true, o2.id); assert.equal(g.rel[PLAYER][2], 'war');
});

test('diplomacy: your ally fights your enemy without being asked', () => {
  const g = mk(); meet(g); g.time = 300; nice(g, 1, PLAYER, 45); g.setRelation(1, PLAYER, 'alliance'); boost(g, 1, 3); boost(g, PLAYER, 3);
  g.setRelation(PLAYER, 2, 'war');
  dip_deliberate(g, 1);
  assert.equal(g.rel[1][2], 'war', 'he stands with you');
});

test('diplomacy: a far stronger, greedy neighbour demands tribute; defying it costs goodwill, paying it costs coin', () => {
  const g = mk(); meet(g); g.time = 600; const p1 = g.players[1]; p1.persona.aggr = 0.9; p1.persona.temper = 'warlike'; g.opinion[1][PLAYER] = 0;
  boost(g, 1, 25); g.players[PLAYER].gold = 400;
  dip_deliberate(g, 1);
  const o = g.offers.find((x) => x.kind === 'tribute'); assert.ok(o && o.amount >= 40, 'a demand');
  const gold = g.players[PLAYER].gold;
  assert.equal(g.respondOffer(PLAYER, 1, true, o.id), true); assert.equal(g.players[PLAYER].gold, gold - o.amount);
  // another time: defy it
  g.cool = {}; p1.lastLetter = -999; dip_deliberate(g, 1); const o2 = g.offers.find((x) => x.kind === 'tribute'); assert.ok(o2);
  const op0 = g.opinion[1][PLAYER]; g.respondOffer(PLAYER, 1, false, o2.id);
  assert.ok(g.opinion[1][PLAYER] < op0 - 10); assert.ok(p1.defied[PLAYER] != null);
});

test('diplomacy: unanswered letters lapse (and a snubbed call to arms is remembered)', () => {
  const g = mk(); meet(g); g.time = 300; nice(g, 1, PLAYER, 40); g.setRelation(1, PLAYER, 'alliance'); g.setRelation(1, 2, 'war');
  dip_deliberate(g, 1); assert.ok(g.offers.some((x) => x.kind === 'joinwar'));
  const op0 = g.opinion[1][PLAYER]; g.time += 200; g.tick(0.1);
  assert.equal(g.offers.length, 0); assert.ok(g.opinion[1][PLAYER] < op0, 'ignoring it counts as refusing');
  assert.ok(g.letters.some((l) => l.state === 'ignored'));
});

test('diplomacy: the player may demand, ask for a war, and ask for aid; houses answer by opinion and strength', () => {
  const g = mk(); meet(g); g.time = 400; boost(g, PLAYER, 25); g.players[1].persona.wary = 0.2; g.players[1].persona.honor = 0.2;
  const gold1 = g.players[1].gold;
  assert.equal(g.askOf(PLAYER, 1, 'demand', { amount: 40 }), true, 'a weak house pays the strong');
  assert.equal(g.players[1].gold, gold1 - 40);
  g.opinion[2][PLAYER] = 40; g.players[2].gold = 900; g.players[2].persona.temper = 'honourable';
  assert.equal(g.askOf(PLAYER, 2, 'askaid', { amount: 80 }), true);
  g.opinion[2][PLAYER] = 40; g.setRelation(PLAYER, 1, 'war'); boost(g, 2, 8);
  assert.equal(g.askOf(PLAYER, 2, 'askwar', { target: 1 }), true); assert.equal(g.rel[2][1], 'war');
  assert.equal(g.askOf(PLAYER, 1, 'demand', { amount: 40 }), false, 'cooling off'); 
});

test('diplomacy: sacking a house\'s village costs its goodwill; a save keeps opinions and letters', () => {
  const g = mk(); meet(g); g.time = 300;
  const v = g.villages.find((x) => x.owner < 0); v.owner = 1; g.opinion[1][PLAYER] = 10;
  g.submit(v, PLAYER, 'pillage'); assert.ok(g.opinion[1][PLAYER] <= -9);
  g.opinion[2][PLAYER] = 33; g.players[2].persona.temper = 'honourable'; g.setRelation(2, PLAYER, 'alliance');
  const d = JSON.parse(JSON.stringify(g.serialize())); const h = mk(); h.restore(d);
  assert.equal(h.opinion[2][PLAYER], g.opinion[2][PLAYER]); assert.equal(h.rel[2][PLAYER], 'alliance'); assert.ok(h.letters.length >= 0);
});

test('council: intel for a house lists leader, size, power, influence, money (fuzzed unless a partner) and attitude', () => {
  const g = mk(); meet(g); g.time = 100; g.players[1].gold = 437; boost(g, 1, 2);
  const i = intel(g, 1);
  assert.ok(i.leader.name && i.leader.title && i.leader.temper); assert.equal(i.land, 1); assert.ok(i.power > 8, 'power ' + i.power);
  assert.ok(i.rank >= 1 && i.rank <= 3); assert.equal(i.moneyExact, false); assert.equal(i.moneyShown % 10, 0); assert.notEqual(i.moneyShown, 437);
  g.setRelation(PLAYER, 1, 'trade'); assert.equal(intel(g, 1).moneyShown, g.standings()[1].money, 'a partner shows its books');
  assert.ok(typeof i.influence === 'number' && Array.isArray(i.why));
});

test('fighting: a fighter in melee cannot run away until the foe is dead; workers still can', () => {
  const g = mk(); g.rel[0][1] = g.rel[1][0] = 'war'; const h = g.seatOf(PLAYER);
  const a = g.addUnit('footman', PLAYER, h.x + 6, h.y + 6), b = g.addUnit('footman', 1, h.x + 7, h.y + 6); b.hp = b.maxHp = 400;
  g.damage(a, 5, 1, b);
  g.cmdMove([a], h.x, h.y);
  assert.equal(a.task.type, 'attack', 'ordered to flee, he fights on'); assert.equal(a.task.targetId, b.id);
  g.cmdEnter([a], h); assert.equal(a.task.type, 'attack', 'and cannot hide in the keep either');
  const s = g.addUnit('serf', PLAYER, h.x + 6.5, h.y + 6); s.engagedT = g.time; g.cmdMove([s], h.x, h.y); assert.equal(s.task.type, 'move', 'serfs run');
  b.hp = 0; g.cleanup(); g.cmdMove([a], h.x, h.y); assert.equal(a.task.type, 'move', 'free once the foe is dead');
  // a moving soldier caught by a foe turns and fights
  const c = g.addUnit('footman', PLAYER, h.x + 9, h.y + 9), d = g.addUnit('footman', 1, h.x + 9.5, h.y + 9); g.cmdMove([c], h.x, h.y); g.damage(c, 3, 1, d); g.tick(0.1);
  assert.equal(c.task.type, 'attack');
});

test('fighting: garrisoned soldiers march out when foes come near, then return when it is quiet', () => {
  const g = mk(); g.rel[0][1] = g.rel[1][0] = 'war'; const h = g.seatOf(PLAYER);
  const keep = g.addBuilding('keep', PLAYER, Math.round(h.x + 6), Math.round(h.y), true); g.recomputeWalk();
  const men = [0, 1, 2].map((i) => { const u = g.addUnit('footman', PLAYER, keep.x, keep.y); u.inside = keep.id; keep.garrison.push(u.id); return u; });
  const serf = g.addUnit('serf', PLAYER, keep.x, keep.y); serf.inside = keep.id; keep.garrison.push(serf.id);
  g.tick(0.6); assert.ok(men.every((u) => u.inside === keep.id), 'quiet: they stay in');
  const foe = g.addUnit('footman', 1, keep.x + 8, keep.y + 2); foe.hp = foe.maxHp = 60;
  g.tick(0.6);
  assert.ok(men.every((u) => !u.inside && u.task.type === 'attack' && u.sally === keep.id), 'they sally'); assert.equal(serf.inside, keep.id, 'serfs stay hidden');
  run(g, 40);
  assert.ok(foe.hp <= 0, 'the intruder is dead');
  run(g, 25);
  assert.ok(men.every((u) => u.inside === keep.id), 'and they go back inside: ' + men.map((u) => u.inside + '/' + u.task.type));
  // a second wave while they are out: they assess and fight on instead of going in
  const f2 = g.addUnit('footman', 1, keep.x + 7, keep.y); f2.hp = f2.maxHp = 60; g.tick(0.6);
  assert.ok(men.every((u) => !u.inside));
});

test('crowding: twelve people idling on one spot each get their own room', () => {
  const g = mk(); const h = g.seatOf(PLAYER), us = [];
  for (let i = 0; i < 12; i++) us.push(g.addUnit('footman', PLAYER, h.x + 4, h.y + 4));
  run(g, 4);
  let min = 9; for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) min = Math.min(min, Math.hypot(us[i].x - us[j].x, us[i].y - us[j].y));
  assert.ok(min > 0.9, 'closest pair ' + min.toFixed(2));
});

test('camels: an idle camel goes back to work by itself; only one the player stopped stays put', () => {
  const g = mk(); const h = g.seatOf(PLAYER);
  const m1 = g.addBuilding('market', PLAYER, h.tx + 7, h.ty + 7, true), m2 = g.addBuilding('market', PLAYER, h.tx + 7, h.ty - 9, true);
  const c = g.addUnit('camel', PLAYER, m1.x + 2, m1.y + 3), d = g.addUnit('camel', PLAYER, m1.x + 3, m1.y + 3);
  g.applyIntent({ team: PLAYER, type: 'stop', ids: [d.id] });
  run(g, 6);
  assert.ok(c.route && c.route.stops.length, 'the camel took a route round the markets');
  assert.equal(c.task.type, 'caravan', 'and is walking it');
  assert.equal(d.task.type, 'idle', 'a stopped camel stays');
  c.route = null; c.task = { type: 'idle' }; c.path = []; run(g, 6);
  assert.equal(c.task.type, 'caravan', 'after its route is lost it picks another');
  g.applyIntent({ team: PLAYER, type: 'routeauto', ids: [d.id], mode: 'own' }); run(g, 1);
  assert.equal(d.task.type, 'caravan', 'giving the stopped camel a route sends it off again');
});

console.log(`${passed} passed`);
