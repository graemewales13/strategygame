// Tests for ratings, kings and diplomacy. Fast: `node test/rules.test.js` (part of `npm test`).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { HOUSES } from '../js/config.js';
import { Game } from '../js/game.js';
import { treasury, huntGoal, updateAI, findSpot } from '../js/ai.js';
import { Renderer } from '../js/render.js';
import { OBJECTIVES } from '../js/objectives.js';
import { deliberate as dip_deliberate, intel, stance, pressWar } from '../js/diplomacy.js';
import { PLAYER, RANKS, RANK_BONUS, UNITS, KING, STANCE, SPY_COVER, BUILDINGS, packWords, packOf } from '../js/config.js';

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
  run(g, KING.heir + 1);
  const heir = g.kingOf(PLAYER); assert.ok(heir && heir.id !== k.id && heir.rank === 0, 'an heir rises'); assert.equal(g.players[PLAYER].leaderless, false);
});

test('king: a throne is never left empty - an heir is named within moments', () => {
  const g = mk(); const k = g.kingOf(PLAYER); const killer = g.addUnit('footman', 1, k.x, k.y); g.damage(k, 99999, 1, killer);
  run(g, KING.heir + 1); assert.ok(g.kingOf(PLAYER) && g.kingOf(PLAYER).id !== k.id, 'a new king stands once the heir is crowned');
  g.players[1].kingId = -1; g.players[1].heirAt = null; run(g, KING.heir + 1); assert.ok(g.kingOf(1), 'even a house whose king vanished without a record is given one');
});

test('defence: idle soldiers within DEFEND_R (14) squares of a building under attack turn on the attacker; those farther off do not', () => {
  const g = mk(); const h = g.seatOf(PLAYER);
  const b = g.addBuilding('cottage', PLAYER, h.tx + 8, h.ty, true);
  const near = g.addUnit('footman', PLAYER, b.x + 11, b.y), far = g.addUnit('footman', PLAYER, b.x + 20, b.y), busy = g.addUnit('footman', PLAYER, b.x - 3, b.y);   // (owner, 2026-10-16: the call reaches the town, not just the doorstep)
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
  const NAT = { egyptians: /Khemet/, romans: /Aurelius/, scottish: /MacAlpin/, british: /Wessex/, mongols: /Borjigin/, vikings: /Ynglings/, byzantines: /Komnenos/, persians: /Sassan/ };
  for (const f of Object.keys(NAT)) {
    const g = new Game({ seed: 11, houses: 4, ai: false, people: f });
    assert.equal(HOUSES[0].faction, f, 'the player is ' + f); assert.match(HOUSES[0].name, NAT[f], 'and the house name fits: ' + HOUSES[0].name);
    assert.equal(g.players[0].name, HOUSES[0].name);
    assert.equal(new Set(HOUSES.map((h) => h.faction)).size, 8, 'every people sits once');
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

test('peoples: colour and crest go with the people; eight houses seat well apart; an older five-people save still loads its seating', () => {
  const g = new Game({ seed: 7, houses: 8, ai: false, people: 'scottish' });
  assert.equal(g.players.length, 8);
  assert.equal(HOUSES[0].faction, 'scottish'); assert.equal(HOUSES[0].color, 'blue', 'the Scots are blue in any seat'); assert.equal(HOUSES[0].device, 'waves');
  assert.equal(new Set(HOUSES.map((h) => h.color)).size, 8, 'eight colours'); assert.equal(new Set(HOUSES.map((h) => h.device)).size, 8, 'eight devices');
  for (const f of ['vikings', 'byzantines', 'persians']) assert.ok(HOUSES.some((h) => h.faction === f), f + ' sit at the table');
  let near = 1e9; for (let a = 0; a < 8; a++) for (let b = 0; b < a; b++) near = Math.min(near, Math.hypot(g.seatOf(a).x - g.seatOf(b).x, g.seatOf(a).y - g.seatOf(b).y));
  assert.ok(near > 60, `the closest two halls are ${near.toFixed(0)} tiles apart`);
  const h = new Game({ seed: 7, houses: 4, ai: false }); h.restore({ ...JSON.parse(JSON.stringify(h.serialize())), peopleOrder: [4, 3, 2, 1, 0] });
  assert.equal(HOUSES[0].faction, 'mongols'); assert.equal(HOUSES[0].color, 'violet'); assert.ok(HOUSES[7]?.faction, 'the newer peoples fill the seats after');
});

test('envoy: a treaty offered to an AI house is answered by letter a few seconds later, not at once', () => {
  const g = mk(); meet(g); g.time = 200; g.players[1].ai = true; nice(g, 1, PLAYER, 60);
  assert.equal(g.proposeRelation(PLAYER, 1, 'trade'), true, 'the envoy sets out');
  assert.notEqual(g.rel[PLAYER][1], 'trade', 'no treaty yet'); assert.equal(g.asks.length, 1);
  assert.equal(g.proposeRelation(PLAYER, 1, 'trade'), false, 'one envoy at a time'); assert.match(g.diploNote, /already on the road/);
  const saved = JSON.parse(JSON.stringify(g.serialize())); const h = mk(); h.restore(saved); assert.equal(h.asks.length, 1, 'the envoy survives a save');
  for (let i = 0; i < 100 && g.asks.length; i++) { g.time += 0.1; g.updateDiplomacy(0.1); }
  assert.equal(g.asks.length, 0, 'the answer came'); assert.equal(g.rel[PLAYER][1], 'trade', 'and it was yes');
  assert.ok(g.time >= 204, 'after the ride');
});

test('diplomacy: a gift warms a rival, and a cold house refuses an alliance until it warms', () => {
  const g = mk(); meet(g); g.time = 200; g.players[PLAYER].gold = 500;
  assert.equal(g.proposeRelation(PLAYER, 1, 'alliance', true), false, 'strangers do not ally'); assert.match(g.diploNote, /friend/);
  const before = g.opinion[1][PLAYER];
  assert.equal(g.giveGift(PLAYER, 1, 120), true);
  assert.ok(g.opinion[1][PLAYER] > before + 8, 'the gift warms him');
  g.opinion[1][PLAYER] = 40; g.players[1].persona.temper = 'honourable';
  assert.equal(g.proposeRelation(PLAYER, 1, 'alliance', true), true); assert.equal(g.rel[PLAYER][1], 'alliance');
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

test('characters: a far-lander hired at a tavern keeps the gift of their homeland, also once drilled', () => {
  const g = mk(); const h = g.seatOf(PLAYER); g.players[PLAYER].gold = 2000;
  const tav = g.addBuilding('tavern', PLAYER, h.tx + 8, h.ty + 8, true); run(g, 0.2);
  tav.roster[0] = { name: 'Dobrynya Bear-Spear', trait: 'veteran', far: 'rus', cost: { food: 20, wood: 0, gold: 80 } };
  const u = g.hire(PLAYER, tav.id, 0);
  assert.equal(u.far, 'rus'); assert.equal(u.rank, 1, 'far-landers start Trained'); assert.ok(/Rus/.test(u.origin));
  const knight = g.addUnit('knight', 1, u.x + 1, u.y), foot = g.addUnit('footman', 1, u.x + 1, u.y);
  assert.ok(g.charMul(u, knight) > g.charMul(u, foot) + 0.7, 'the bear-hunter breaks horsemen');
  u.kind = 'footman'; assert.ok(g.charMul(u, knight) > 1.7, 'and still does as a footman');
  const rolls = []; for (let i = 0; i < 400; i++) rolls.push(g.rollWanderer([]));
  assert.ok(rolls.some((w) => w.far) && rolls.some((w) => !w.far), 'taverns offer both folk and far-landers');
  for (let i = 0; i < 50; i++) assert.ok(g.newRoster().filter((w) => w.far).length <= 1, 'never two far-landers at once');
});

test('characters: berserker, physician and envoy gifts work', () => {
  const g = mk(); const h = g.seatOf(PLAYER);
  const n = g.addUnit('footman', PLAYER, h.x, h.y + 8); n.far = 'norse';
  const full = g.charMul(n, null); n.hp = n.maxHp * 0.1; assert.ok(g.charMul(n, null) > full + 0.4, 'the wounded berserker hits harder');
  const doc = g.addUnit('recruit', PLAYER, h.x + 4, h.y + 8); doc.far = 'greek';
  const hurt = g.addUnit('footman', PLAYER, h.x + 5, h.y + 8); hurt.hp = 20;
  run(g, 3); assert.ok(hurt.hp > 24, `the physician heals (${hurt.hp})`);
  const v = g.villages.find((x) => x.owner < 0);
  const p0 = g.pullsFor(v)[PLAYER];
  const e = g.addUnit('recruit', PLAYER, v.x + 2, v.y + 2); e.far = 'aksum'; g.updateAuras();
  assert.ok(g.pullsFor(v)[PLAYER] > p0 + 0.1, 'an envoy leans on the village');
});

test('characters: deeds and the service record come from what a soldier does', () => {
  const g = mk(); g.rel[0][1] = g.rel[1][0] = 'war';
  const h = g.seatOf(PLAYER), a = g.addUnit('footman', PLAYER, h.x, h.y + 6);
  for (let i = 0; i < 10; i++) { const f = g.addUnit('recruit', 1, h.x + 1, h.y + 6); g.damage(f, 9999, PLAYER, a); }
  assert.equal(a.kills, 10); assert.ok(a.deeds.includes('blooded') && a.deeds.includes('slayer'));
  const k = g.kingOf(1); g.damage(k, 99999, PLAYER, a); assert.ok(a.deeds.includes('kingslayer'));
  const b = g.addUnit('footman', PLAYER, h.x, h.y + 7), hp0 = b.maxHp;
  g.damage(b, b.maxHp * 0.95, 1, null); b.hp = b.maxHp; run(g, 0.2);
  assert.ok(b.deeds?.includes('survivor') && b.maxHp > hp0, 'cheating death makes them tougher');
});

test('characters: only an Elite can be made captain; captains lift the soldiers near them', () => {
  const g = mk(); const h = g.seatOf(PLAYER); g.players[PLAYER].gold = 1000;
  const c = g.addUnit('footman', PLAYER, h.x, h.y + 6), s = g.addUnit('footman', PLAYER, h.x + 2, h.y + 6), far = g.addUnit('footman', PLAYER, h.x + 30, h.y + 6);
  assert.equal(g.appoint(PLAYER, c.id), false, 'a rookie cannot lead');
  c.rank = 3; assert.equal(g.appoint(PLAYER, c.id), true); g.updateAuras();
  assert.ok(g.charMul(s, null) > g.charMul(far, null), 'the soldier beside the captain hits harder');
  const xp0 = s.xp || 0, xpf = far.xp || 0; g.award(s, 10); g.award(far, 10);
  assert.ok(s.xp - xp0 > far.xp - xpf, 'and learns faster');
  for (let i = 0; i < 4; i++) { const x = g.addUnit('knight', PLAYER, h.x, h.y + 9); x.rank = 4; g.appoint(PLAYER, x.id); }
  assert.equal(g.units.filter((u) => u.team === PLAYER && u.captain).length, 3, 'at most three captains');
});

test('characters: a unit trained in a building is on that building\'s muster roll', () => {
  const g = mk(); const h = g.seatOf(PLAYER); Object.assign(g.players[PLAYER], { food: 999, wood: 999, gold: 999 });
  const b = g.addBuilding('barracks', PLAYER, h.tx + 9, h.ty - 9, true);
  g.train(PLAYER, b.id, 'footman'); run(g, 16);
  assert.ok(g.units.some((u) => u.from === b.id && u.kind === 'footman'), 'the footman remembers his barracks');
});

test('villages: serfs may found a village with only a mine; founded beside ore it is a mining camp that works the mine at once', () => {
  const g = mk(); const h = g.seatOf(PLAYER); Object.assign(g.players[PLAYER], { food: 999, wood: 999, gold: 999 });
  const ore = g.resources.filter((n) => ['iron', 'copper', 'coal', 'silver', 'stone'].includes(n.kind)).sort((a, b) => Math.hypot(b.x - h.x, b.y - h.y) - Math.hypot(a.x - h.x, a.y - h.y))[0];
  assert.ok(g.missingFor(PLAYER, 'village').length, 'no keep and no mine: locked');
  const mine = g.addBuilding('mine', PLAYER, ore.x - 1, ore.y - 1, true);
  if (mine.nodeIds === undefined) mine.nodeIds = [ore.id];
  assert.deepEqual(g.missingFor(PLAYER, 'village'), [], 'a mine is enough to found a village');
  const site = g.addBuilding('village', PLAYER, Math.round(ore.x + 4), Math.round(ore.y + 2), true);
  const v = g.foundVillage(site);
  assert.equal(v.kind, 'mine', 'founded beside ore it is a mining camp'); assert.ok(v.pop >= 8);
  const far = g.foundVillage(g.addBuilding('village', PLAYER, 3, 3, true));
  assert.ok(far.kind === 'mine' || g.depositsNear(far.x, far.y, 10).length === 0, 'away from ore it is an ordinary village');
  run(g, 3);
  assert.ok((mine._crew?.n || 0) >= 1, `the camp's folk dig at once (${mine._crew?.n})`);
});

test('ai: a rival lacking an ore that no village can dig founds a mining camp beside it', () => {
  const g = mk(); const t = 1, seat = g.seatOf(t), p = g.players[t];
  Object.assign(p, { food: 2000, wood: 2000, gold: 2000, stone: 300 });
  g.addBuilding('keep', t, Math.round(seat.x) + 6, Math.round(seat.y) + 6, true); g.recomputeWalk();
  const lone = g.resources.filter((n) => ['iron', 'coal', 'copper', 'silver'].includes(n.kind) && n.amount > 40 && !(g.minePower(t, n.x, n.y) > 0) && Math.hypot(n.x - seat.x, n.y - seat.y) < g.diff.reach);   // (how far a house goes for ore it lacks)
  assert.ok(lone.length, 'the test valley has out-of-reach ore');
  g.time = 400; p.campT = 0; p.foundT = 999;
  treasury(g, t, p, seat, []);
  const site = g.buildings.find((b) => b.team === t && b.kind === 'village');
  assert.ok(site, 'a village site is placed');
  assert.ok(g.depositsNear(site.x, site.y, 10).some((n) => lone.includes(n)), 'beside the ore it lacked');
  const v = g.foundVillage(site);
  assert.equal(v.kind, 'mine', 'and becomes a mining camp');
});

test('espionage: a spy inside a rival village reports their army, captains, far-landers and plans; a caught spy angers their lord', () => {
  const g = mk(); const v = g.villages.find((x) => x.owner === 1); assert.ok(v, 'house 1 holds its home village');
  g.known[PLAYER][1] = g.known[1][PLAYER] = true;
  assert.equal(intel(g, 1).secrets, null, 'no spy, no report');
  const c = g.addUnit('footman', 1, v.x + 3, v.y + 3); c.rank = 3; c.captain = true;
  const f = g.addUnit('footman', 1, v.x + 4, v.y + 3); f.far = 'norse'; f.name = 'Hallvard Wave-Reader';
  g.players[1].planWar = PLAYER;
  const spy = g.addUnit('spy', PLAYER, v.x + 1, v.y + 1);
  g.cmdInfiltrate([spy], v);
  g.roll = () => 0.99;   // the spy is not caught while he settles in (the sim's chance is the game's own seeded roll)
  run(g, 4); delete g.roll;
  const i = intel(g, 1);
  assert.ok(i.secrets, 'the spy reports'); assert.ok(i.moneyExact, 'and their purse is known exactly');
  assert.ok(i.secrets.mix.footman >= 2); assert.ok(i.secrets.captains.includes(c.name)); assert.ok(i.secrets.far.some((x) => /Hallvard/.test(x)));
  assert.equal(i.secrets.war, PLAYER, 'their plan of war is known');
  const op0 = g.opinion[1][PLAYER];
  g.roll = () => 0; g.doInfiltrate(spy, 0.5); delete g.roll;
  assert.equal(spy.hp, 0, 'caught'); assert.ok(g.opinion[1][PLAYER] < op0, 'their lord thinks less of us');
  g.time += 60; assert.equal(intel(g, 1).secrets, null, 'the report fades once the spy is gone');
});

test('villagers: serfs and armed villagers fight at 10-30% of a footman, and serfs fight back when struck', () => {
  const pw = (k) => (UNITS[k].hp * UNITS[k].dmg) / UNITS[k].cd, foot = pw('footman');
  for (const k of ['serf', 'recruit']) { const r = pw(k) / foot; assert.ok(r >= 0.1 && r <= 0.3, `${k} fights at ${Math.round(r * 100)}% of a footman`); }
  const g = mk(); g.rel[0][1] = g.rel[1][0] = 'war';
  const h = g.seatOf(PLAYER), s = g.addUnit('serf', PLAYER, h.x + 5, h.y + 5), by = g.addUnit('serf', PLAYER, h.x + 6, h.y + 5), far = g.addUnit('serf', PLAYER, h.x + 15, h.y + 5);
  const raider = g.addUnit('scout', 1, h.x + 5.8, h.y + 5);
  g.damage(s, 3, 1, raider);
  assert.equal(s.task.type, 'attack', 'the struck serf fights back'); assert.equal(by.task.type, 'attack', 'and the idle serf beside him');
  assert.equal(far.task.type, 'idle', 'serfs further off keep out of it');
});

test('the royal line: each fallen king is followed by an heir; when the last of the line dies the house falls, whatever else it holds', () => {
  const g = mk(); const t = 1, p = g.players[t];
  assert.equal(p.heirs ?? KING.heirs, KING.heirs);
  for (let i = 0; i < KING.heirs; i++) {
    const k = g.kingOf(t); assert.ok(k, `king ${i + 1} stands`); const by = g.addUnit('footman', PLAYER, k.x, k.y);
    g.damage(k, 99999, PLAYER, by); run(g, KING.heir + 1);
    assert.ok(p.alive, 'an heir takes the crown');
  }
  assert.equal(p.heirs, 0); assert.ok(g.seatOf(t), 'the house still has its seat');
  const last = g.kingOf(t), by = g.addUnit('footman', PLAYER, last.x, last.y);
  g.damage(last, 99999, PLAYER, by); run(g, 1);
  assert.equal(p.alive, false, 'the last of the line is dead: the house falls');
  assert.ok(!g.villages.some((v) => v.owner === t), 'its villages go free');
});

test('the royal line: a house that loses its seat lives on while its king lives, and its fugitive king is seen by all', () => {
  const g = mk(); const t = 1, home = g.seatOf(t);
  for (const v of g.villagesOf(t)) { v.owner = -1; v.lean = -1; v.loyalty = 0; } void home; for (const b of g.buildings) if (b.team === t && b.kind === 'keep') b.hp = 0;
  g.cleanup?.(); run(g, 1);
  assert.ok(g.players[t].alive, 'losing the seat no longer ends a house');
  const k = g.kingOf(t); g.fogOn = true; g.updateVisibility();
  assert.ok(g.canSee(PLAYER, k.x, k.y), 'the fugitive king can be hunted');
});

test('stance: a keep over a rival village, soldiers in its land and weakness make a neighbour mean war; distance and trade calm it', () => {
  const g = mk(); const a = 1, b = PLAYER; g.known[a][b] = g.known[b][a] = true; g.time = 600;
  const calm = stance(g, a, b);
  const v = g.villagesOf(a)[0];
  g.addBuilding('keep', b, Math.round(v.x) + 5, Math.round(v.y) - 2, true); g.recomputeWalk();
  for (let i = 0; i < 6; i++) g.addUnit('knight', b, v.x + 3 + i * 0.5, v.y + 4);
  g.time += 10; g._stance = {};
  const hot = stance(g, a, b);
  assert.ok(hot.threat > calm.threat + 0.3, `threat ${calm.threat.toFixed(2)} -> ${hot.threat.toFixed(2)}`);
  assert.ok(hot.reasons.some((r) => r.kind === 'threat' && /soldiers stand in our land/.test(r.text)), 'and it says why');
  g.rel[a][b] = g.rel[b][a] = 'trade'; g.relSince[a][b] = g.relSince[b][a] = g.time - 1000; g.time += 10; g._stance = {};
  assert.ok(stance(g, a, b).ties > hot.ties, 'trade is a tie');
  const st = stance(g, a, b); assert.ok(['means war', 'wary', 'friendly', 'at ease'].includes(st.mood));
});

test('ai: a war is won at the crown - exposed kings first, then the keep he hides in, and a fugitive king is run down', () => {
  const g = mk(); g.fogOn = false; g.rel[1][PLAYER] = g.rel[PLAYER][1] = 'war';
  const seat = g.seatOf(1), k = g.kingOf(PLAYER);
  const army = [0, 1, 2].map((i) => g.addUnit('footman', 1, k.x + 6 + i, k.y));
  assert.equal(huntGoal(g, 1, PLAYER, seat, army), k, 'the exposed king is the target');
  const keep = g.addBuilding('keep', PLAYER, Math.round(k.x) + 2, Math.round(k.y) + 2, true); g.recomputeWalk();
  k.inside = keep.id; keep.garrison.push(k.id);
  assert.equal(huntGoal(g, 1, PLAYER, seat, army), keep, 'a king behind walls makes his keep the target');
  k.inside = null; keep.garrison = []; keep.hp = 0; g.cleanup();
  for (const v of g.villagesOf(PLAYER)) { v.owner = -1; v.lean = -1; v.loyalty = 0; }
  for (const b of g.buildings) if (b.team === PLAYER) b.hp = 0; g.cleanup();
  k.x += 80;   // far from the army: still hunted, he has no seat
  assert.equal(huntGoal(g, 1, PLAYER, seat, army), k, 'a house without a seat is ended by running its king down');
});

test('ai: a king shelters in his keep when foes come near, always when he is the last of his line', () => {
  const g = new Game({ seed: 8, houses: 3, ai: true }); const t = 1, p = g.players[t], seat = g.seatOf(t), k = g.kingOf(t);
  g.rel[0][1] = g.rel[1][0] = 'war'; p.heirs = 0;
  const keep = g.addBuilding('keep', t, Math.round(k.x) + 3, Math.round(k.y) - 1, true); g.recomputeWalk();
  g.addUnit('scout', PLAYER, k.x + 4, k.y + 2);
  for (let i = 0; i < 40 && !k.inside; i++) g.tick(0.25);
  assert.equal(k.inside, keep.id, 'the last of the line is safe behind walls');
  void seat; void updateAI;
});

test('gaps: a new match forgets the last one\'s war losses and spy reports; a save keeps them', () => {
  const g = mk(); g.losses['0>1'] = 9; g.spyIntel['0>1'] = g.time;
  const data = JSON.parse(JSON.stringify(g.serialize()));
  g.reset({ seed: 9, houses: 3, ai: false });
  assert.deepEqual(g.losses, {}); assert.deepEqual(g.spyIntel, {});
  g.restore(data); assert.equal(g.losses['0>1'], 9, 'restored with the save');
});

test('gaps: an ultimatum is a letter - pay and the peace holds; refuse and it is war', () => {
  const fake = (g) => { g._stance['1>0'] = { at: g.time, war: 0.9, peace: 0, threat: 0.8, temptation: 0.5, ties: 0, reasons: [{ kind: 'threat', w: 0.8, text: 'x', you: '6 of your soldiers stand in our land' }] }; };
  const g = mk(); g.known[0][1] = g.known[1][0] = true; g.players[PLAYER].gold = 500;
  fake(g); assert.equal(pressWar(g, 1, PLAYER), false, 'no war yet: an ultimatum first');
  const o = g.offers.find((x) => x.from === 1 && x.to === PLAYER && x.kind === 'tribute');
  assert.ok(o && /Your|your/.test(o.text) && !/You sways/.test(o.text), 'a letter that speaks to you: ' + (o && o.text));
  assert.ok(g.respondOffer(PLAYER, 1, true, o.id), 'paid'); fake(g);
  assert.equal(pressWar(g, 1, PLAYER), false); assert.notEqual(g.rel[1][0], 'war', 'paying keeps the peace');
  g.time += 400; g.players[1].appeased = {}; g.players[1].ultimatum = null; fake(g);
  pressWar(g, 1, PLAYER); const o2 = g.offers.find((x) => x.from === 1 && x.kind === 'tribute');
  g.respondOffer(PLAYER, 1, false, o2.id); fake(g);
  assert.equal(pressWar(g, 1, PLAYER), true); assert.equal(g.rel[1][0], 'war', 'refusing is war');
});

test('gaps: you can pull down a building of your own (a third back) or cancel a site (four fifths back)', () => {
  const g = mk(); const h = g.seatOf(PLAYER), p = g.players[PLAYER];
  const b = g.addBuilding('barracks', PLAYER, h.tx + 9, h.ty - 9, true), u = g.addUnit('footman', PLAYER, b.x, b.y);
  g.cmdEnter([u], b); u.inside = b.id; b.garrison.push(u.id);
  const w0 = p.wood; assert.ok(g.applyIntent({ team: PLAYER, type: 'demolish', buildingId: b.id }));
  assert.ok(!g.buildings.includes(b), 'gone'); assert.equal(p.wood - w0, Math.floor(140 * 0.3)); assert.equal(u.inside, null, 'those inside step out');
  const site = g.addBuilding('market', PLAYER, h.tx - 9, h.ty + 9, false); site.built = 0.2;
  const w1 = p.wood; g.demolish(PLAYER, site.id); assert.equal(p.wood - w1, Math.floor(120 * 0.8));
  const foe = g.buildings.find((x) => x.team === 1) || g.addBuilding('barracks', 1, 5, 5, true);
  assert.equal(g.demolish(PLAYER, foe.id), false, 'not someone else\'s');
});

test('science: academies make learning; research follows the tree, and silver pays for the deeper arts', () => {
  const g = mk(); const h = g.seatOf(PLAYER), p = g.players[PLAYER];
  assert.ok(g.researchBlock(PLAYER, 'husbandry'), 'no academy, no research');
  const ac = g.addBuilding('academy', PLAYER, h.tx + 9, h.ty - 9, true); g.recomputeWalk();
  assert.ok(/Masonry/.test(g.researchBlock(PLAYER, 'metallurgy')), 'Metallurgy needs Masonry first');
  assert.ok(g.applyIntent({ team: PLAYER, type: 'research', tech: 'masonry' }));
  run(g, 3); assert.ok(p.learning > 0 && p.learnRate >= 0.2, 'the academy makes learning');
  g.addUnit('scholar', PLAYER, ac.x + 1, ac.y + 2); g.addUnit('scholar', PLAYER, ac.x - 1, ac.y + 2); run(g, 3);
  assert.ok(p.learnRate > 0.35, 'scholars beside it study faster: ' + p.learnRate);
  p.learning = 39.9; run(g, 1); assert.ok(g.hasTech(PLAYER, 'masonry') && p.research === null && p.sci === 1);
  p.silver = 0; assert.ok(/silver/.test(g.researchBlock(PLAYER, 'metallurgy')), 'the deeper arts cost silver');
  p.silver = 10; assert.ok(g.startResearch(PLAYER, 'metallurgy')); assert.equal(p.silver, 6, 'paid up front');
  assert.ok(g.startResearch(PLAYER, 'husbandry')); assert.equal(p.silver, 10, 'refunded when changed');
});

test('weapons: the Armoury needs Metallurgy; it makes kit that soldiers take up, and the kit tells in a fight', () => {
  const g = mk(); g.rel[0][1] = g.rel[1][0] = 'war'; const h = g.seatOf(PLAYER), p = g.players[PLAYER];
  Object.assign(p, { food: 2000, wood: 2000, gold: 2000, stone: 300, iron: 50, steel: 50, silver: 50 });
  g.addBuilding('barracks', PLAYER, h.tx + 9, h.ty - 9, true); g.addBuilding('foundry', PLAYER, h.tx - 9, h.ty - 9, true); g.addBuilding('forge', PLAYER, h.tx + 9, h.ty + 6, true); g.recomputeWalk();
  assert.ok(g.missingFor(PLAYER, 'armoury').some((m) => /Metallurgy/.test(m)), 'locked behind research');
  p.tech.masonry = p.tech.metallurgy = true;
  assert.deepEqual(g.missingFor(PLAYER, 'armoury'), []);
  const arm = g.addBuilding('armoury', PLAYER, h.tx - 9, h.ty + 6, true); g.recomputeWalk();
  assert.ok(/Steelcraft/.test(g.craftBlock(PLAYER, arm, 'sword')), 'swords need Steelcraft');
  assert.ok(g.applyIntent({ team: PLAYER, type: 'craft', buildingId: arm.id, item: 'spear' })); g.craft(PLAYER, arm.id, 'mail');
  run(g, 20); assert.equal(p.gear.spear, 1); assert.equal(p.gear.mail, 1);
  const plain = g.addUnit('footman', PLAYER, arm.x + 30, arm.y), kit = g.addUnit('footman', PLAYER, arm.x + 2, arm.y + 3);
  run(g, 3); assert.equal(kit.gear?.weapon, 'spear', 'an idle soldier near the armoury takes up spears'); assert.equal(kit.gear?.armour, 'mail');
  assert.ok(kit.maxHp > plain.maxHp * 1.2, 'mail adds health'); assert.ok(g.shownDamage(kit) > g.shownDamage(plain) + 1.5, 'spears add damage');
  assert.equal(p.gear.spear, 0, 'taken from the store');
  p.tech.steelcraft = true; g.craft(PLAYER, arm.id, 'sword'); run(g, 12); run(g, 3);
  assert.equal(kit.gear.weapon, 'sword', 'swaps up to a sword'); assert.equal(p.gear.spear, 1, 'and hands the spears back');
  p.tech.fletching = true; g.craft(PLAYER, arm.id, 'longbow'); run(g, 10);
  const bow = g.addUnit('bowman', PLAYER, arm.x + 2, arm.y - 3), r0 = g.rangeOf(bow); run(g, 3);
  assert.ok(g.rangeOf(bow) > r0 + 1, 'longbows shoot further');
});

test('science: Medicine mends idle soldiers', () => {
  const g = mk(); const h = g.seatOf(PLAYER), p = g.players[PLAYER];
  const u = g.addUnit('footman', PLAYER, h.x + 6, h.y + 6); u.hp = 30; run(g, 5); const hp0 = u.hp;
  p.tech.husbandry = p.tech.medicine = true; run(g, 5);
  assert.ok(u.hp > hp0 + 2, `mends with Medicine ${hp0} -> ${u.hp}`);
});

test('gaps: pulling down an armoury gives back the goods for kit not yet made; spies learn a rival\'s research and kit', () => {
  const g = mk(); const h = g.seatOf(PLAYER), p = g.players[PLAYER];
  Object.assign(p, { wood: 500, iron: 20, gold: 500, stone: 100 }); p.tech.masonry = p.tech.metallurgy = true;
  const arm = g.addBuilding('armoury', PLAYER, h.tx - 9, h.ty + 6, true);
  g.craft(PLAYER, arm.id, 'mail'); g.craft(PLAYER, arm.id, 'mail');
  const iron = p.iron; g.demolish(PLAYER, arm.id);
  assert.equal(p.iron - iron, 8, 'both mail orders refunded');
  const q = g.players[1]; q.research = 'fletching'; q.gear = { spear: 3 };
  g.known[0][1] = g.known[1][0] = true; g.spyIntel[PLAYER + '>1'] = g.time;
  const s = intel(g, 1).secrets;
  assert.equal(s.research, 'Fletching'); assert.ok(s.kit.some((k) => /3 spears/.test(k)));
  assert.ok(intel(g, 1).techs, 'a spied house\'s techs are known');
});

test('gaps: with an armoury standing, the forge leaves steel for kit', () => {
  const g = mk(); const h = g.seatOf(PLAYER), p = g.players[PLAYER];
  g.addBuilding('forge', PLAYER, h.tx + 9, h.ty + 6, true); g.addBuilding('armoury', PLAYER, h.tx - 9, h.ty + 6, true);
  p.steel = 10; run(g, 20);
  assert.equal(p.arms, 0, 'the forge does not eat the armoury\'s steel'); assert.equal(p.steel, 10);
  p.steel = 14; run(g, 20); assert.equal(p.arms, 1, 'above the reserve it still makes arms'); assert.equal(p.steel, 8);
});

test('gaps: a rival house shows the doctrine its people play by', () => {
  const g = mk(); g.known[0][1] = g.known[1][0] = true;
  assert.ok(['granary', 'legion', 'hold', 'hearth', 'raid'].includes(intel(g, 1).doctrine), 'doctrine: ' + intel(g, 1).doctrine);
  assert.equal(intel(g, PLAYER).doctrine, null, 'not shown for your own house');
});

test('placement: a small building cannot sit flush against a big one, nor any building against a village', () => {
  const g = mk(); const h = g.seatOf(PLAYER); Object.assign(g.players[PLAYER], { food: 9999, wood: 9999, gold: 9999, stone: 999 }); g.fogOn = false;
  const keep = g.addBuilding('keep', PLAYER, h.tx + 10, h.ty - 12, true); g.recomputeWalk();
  assert.equal(g.canPlace(PLAYER, 'cottage', keep.tx + keep.size, keep.ty + 1).ok, false, 'flush against the keep\'s east side');
  assert.equal(g.canPlace(PLAYER, 'cottage', keep.tx + 1, keep.ty + keep.size).ok, false, 'flush against its south side');
  const v = g.villages.find((x) => x.owner < 0);
  const r = g.canPlace(PLAYER, 'cottage', v.tx + v.size, v.ty);
  assert.equal(r.ok, false); 
});

test('movement: nobody is left inside a footprint or pushed onto water; people leaving a building spread out', () => {
  const g = mk(); const h = g.seatOf(PLAYER); g.fogOn = false;
  const u = g.addUnit('footman', PLAYER, h.x + 12.5, h.y - 9.5);
  const b = g.addBuilding('barracks', PLAYER, Math.floor(u.x) - 1, Math.floor(u.y) - 1, true); g.recomputeWalk();
  run(g, 0.5); assert.equal(g.walk[Math.floor(u.y) * g.W + Math.floor(u.x)], 1, 'a building raised over him: he steps off');
  let wt = -1; for (let i = 0; i < g.W * g.H && wt < 0; i++) if (g.terrain[i] === 2 && g.walk[i + 1] && g.walk[i + 2]) wt = i;
  if (wt >= 0) {
    const wx = wt % g.W, wy = Math.floor(wt / g.W), crowd = [0, 1, 2, 3, 4, 5].map(() => g.addUnit('serf', PLAYER, wx + 1.15, wy + 0.5));
    run(g, 3); assert.ok(crowd.every((c) => g.walk[Math.floor(c.y) * g.W + Math.floor(c.x)] === 1), 'the crowd never shoves anyone into the water');
  }
  const k = g.addBuilding('keep', PLAYER, h.tx + 14, h.ty + 10, true); g.recomputeWalk();
  const men = [0, 1, 2, 3, 4, 5].map(() => g.addUnit('footman', PLAYER, k.x, k.y)); men.forEach((m) => { m.inside = k.id; k.garrison.push(m.id); });
  g.leave(PLAYER, k.id);
  let close = 0; for (let i = 0; i < men.length; i++) for (let j = i + 1; j < men.length; j++) if (Math.hypot(men[i].x - men[j].x, men[i].y - men[j].y) < 0.3) close++;
  assert.ok(close <= 1, `six step out of a keep without piling up (${close} pairs on top of each other)`); void b;
});

test('placement: bushes and deposits under a village are part of it, not gathered', () => {
  const g = mk(); const v = g.villages[0];
  const n = g.resources.find((r) => r.kind === 'berry') || g.resources[0]; const ox = n.x, oy = n.y; n.x = v.tx + 1; n.y = v.ty + 1; g.resAt[n.y * g.W + n.x] = g.resources.indexOf(n);
  g.recomputeWalk(); assert.equal(n.covered, true); assert.equal(g.cmdGather([g.addUnit('serf', PLAYER, v.x, v.y + 3)], n), false); void ox; void oy;
});

test('draw order: someone beside a building\'s east or south side is drawn in front of it, someone behind it behind', () => {
  const b = { tx: 10, ty: 10, size: 3 }, bz = b.tx + b.ty + b.size * 2 - 1;
  const east = { o: { x: 13.4, y: 10.4 }, k: 3, z: 13.4 + 10.4 + 0.2 }, behind = { o: { x: 11.5, y: 9.3 }, k: 3, z: 0 }, tree = { o: { x: 10, y: 13 }, k: 0, z: 10 + 13 + 1 };
  behind.z = bz + 3;   // even if its own key would put it in front
  const items = [{ o: b, k: 2, z: bz }, east, behind, tree];
  Renderer.prototype.orderAround.call({}, items);
  assert.ok(east.z > bz, 'east of the back corner: in front'); assert.ok(behind.z < bz, 'north of it: behind'); assert.ok(tree.z > bz, 'a tree off its south side: in front');
});

test('gaps: an ultimatum never asks more than you hold, so it can always be answered', () => {
  const fake = (g) => { g._stance['1>0'] = { at: g.time, war: 0.9, peace: 0, threat: 0.8, temptation: 0.5, ties: 0, reasons: [{ kind: 'threat', w: 0.8, text: 'x', you: 'your army gathers too close' }] }; };
  for (const purse of [0, 25, 1000]) {
    const g = mk(); g.known[0][1] = g.known[1][0] = true; g.players[PLAYER].gold = purse; fake(g);
    pressWar(g, 1, PLAYER); const o = g.offers.find((x) => x.from === 1 && x.kind === 'tribute');
    assert.ok(o.amount <= purse, `asks ${o.amount} of a purse of ${purse}`);
    assert.ok(g.respondOffer(PLAYER, 1, true, o.id), 'and paying it works'); fake(g);
    assert.equal(pressWar(g, 1, PLAYER), false); assert.notEqual(g.rel[1][0], 'war');
  }
});

test('gaps: a ranked recruit drilled into a soldier keeps the health his rank, deeds and the Drill research give', () => {
  const g = mk(); const h = g.seatOf(PLAYER), p = g.players[PLAYER];
  Object.assign(p, { food: 999, wood: 999, gold: 999 }); p.tech.drill = true;
  const k = g.addBuilding('keep', PLAYER, h.tx + 10, h.ty - 12, true); g.recomputeWalk();
  const u = g.addUnit('recruit', PLAYER, k.x, k.y + 3); u.rank = 2; g.earnDeed(u, 'survivor');
  const fresh = g.addUnit('footman', PLAYER, k.x + 3, k.y + 3);
  u.inside = k.id; k.garrison.push(u.id); g.drill(PLAYER, k.id, u.id, 'footman'); run(g, 20);
  assert.equal(u.kind, 'footman'); assert.ok(u.maxHp > fresh.maxHp * 1.25, `a veteran footman ${u.maxHp} vs a fresh one ${fresh.maxHp}`);
});

test('gaps: a rival king finds room in a keep full of recruits', () => {
  const g = new Game({ seed: 8, houses: 3, ai: true }); const t = 1, p = g.players[t], k = g.kingOf(t);
  g.rel[0][1] = g.rel[1][0] = 'war'; p.heirs = 0;
  const keep = g.addBuilding('keep', t, Math.round(k.x) + 3, Math.round(k.y) - 1, true); g.recomputeWalk();
  for (let i = 0; i < 8; i++) { const r = g.addUnit('recruit', t, keep.x, keep.y); r.inside = keep.id; keep.garrison.push(r.id); }
  g.addUnit('scout', PLAYER, k.x + 4, k.y + 2);
  for (let i = 0; i < 40 && !k.inside; i++) g.tick(0.25);
  assert.equal(k.inside, keep.id, 'a recruit steps out and the last of the line goes in');
});

test('gaps: panels count garrisoned soldiers; a march re-plans round a new site; rival barracks face the nearest rival seat', () => {
  const g = mk(); const h = g.seatOf(PLAYER); g.fogOn = false; Object.assign(g.players[PLAYER], { food: 9999, wood: 9999, gold: 9999, stone: 999 });
  const k = g.addBuilding('keep', PLAYER, h.tx + 12, h.ty - 12, true); g.recomputeWalk();
  const a = g.addUnit('footman', PLAYER, k.x, k.y + 4), b = g.addUnit('footman', PLAYER, k.x + 1, k.y + 4); b.inside = k.id; k.garrison.push(b.id);
  assert.equal(g.standings().find((s) => s.team === PLAYER).army, 2, 'the soldier in the keep is counted');
  const m = g.addUnit('footman', PLAYER, h.x + 20, h.y + 4); g.cmdMove([m], h.x + 34, h.y + 4); run(g, 0.2);
  const mid = m.path[Math.floor(m.path.length / 2)];
  g.place(PLAYER, 'cottage', mid[0] - 1, mid[1] - 1, null);
  assert.ok(!m.path.some(([px, py]) => g.block[Math.floor(py) * g.W + Math.floor(px)]), 'the march no longer runs through the site'); void a;
  const seat = g.seatOf(1), foe = g.seatOf(PLAYER), angs = [];
  for (let i = 0; i < 12; i++) { const sp = findSpot(g, 1, seat, 'barracks'); if (sp) angs.push(Math.cos(Math.atan2(sp[1] + 1.5 - seat.y, sp[0] + 1.5 - seat.x) - Math.atan2(foe.y - seat.y, foe.x - seat.x))); }
  assert.ok(angs.reduce((x, y) => x + y, 0) / angs.length > 0, 'barracks lean toward the nearest rival');
});

test('gaps: a rival does not leave a mine standing that nobody can dig', () => {
  const g = mk(); const t = 1, seat = g.seatOf(t), p = g.players[t];
  const ore = g.resources.filter((n) => ['iron', 'coal', 'copper', 'silver'].includes(n.kind) && !(g.minePower(t, n.x, n.y) > 0)).sort((a, b) => Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(b.x - seat.x, b.y - seat.y))[0];
  const m = g.addBuilding('mine', t, ore.x - 1, ore.y - 1, true); m.nodeIds = [ore.id]; m.ore = ore.kind; g.recomputeWalk();
  g.refreshCrews(); assert.equal(m._crew.n, 0, 'no village in reach');
  m.idleT = 200; p.campT = 999; g.time = 400; treasury(g, t, p, seat, []);
  assert.ok(!g.buildings.includes(m), 'pulled down');
});

// ---- T01: stances and attack-move -----------------------------------------------------------------------
// an open stretch of ground: a w x 3 band of walkable tiles near the player's seat
const openBand = (g, w) => {
  const h = g.seatOf(PLAYER);
  for (let r = 10; r < 60; r++) for (let a = 0; a < 16; a++) {
    const x0 = Math.round(h.x + Math.cos(a * Math.PI / 8) * r), y0 = Math.round(h.y + Math.sin(a * Math.PI / 8) * r);
    let ok = true;
    for (let dx = 0; dx < w && ok; dx++) for (let dy = -1; dy <= 1 && ok; dy++) { const x = x0 + dx, y = y0 + dy; if (x < 1 || y < 1 || x >= g.W - 1 || y >= g.H - 1 || !g.walk[y * g.W + x] || g.buildingAt(x + 0.5, y + 0.5) || g.villageAt(x + 0.5, y + 0.5)) ok = false; }
    if (ok) return [x0 + 0.5, y0 + 0.5];
  }
  throw new Error('no open ground');
};
const quiet = (g) => { for (const u of g.units) if (u.team !== PLAYER) u.stance = 'passive'; for (const u of g.units) if (u.team === PLAYER && u.kind !== 'serf') u.stance = 'passive'; };

test('stances: hold ground strikes only what is in reach; no attack never starts a fight; bad stances are refused', () => {
  const g = mk(); g.rel[0][1] = g.rel[1][0] = 'war'; quiet(g);
  const [x, y] = openBand(g, 12);
  const a = g.addUnit('footman', PLAYER, x, y), foe = g.addUnit('recruit', 1, x + 4, y); foe.stance = 'passive';
  assert.equal(g.applyIntent({ type: 'stance', team: PLAYER, ids: [a.id], stance: 'hold' }), true);
  assert.equal(g.applyIntent({ type: 'stance', team: PLAYER, ids: [a.id], stance: 'berserk' }), false);
  run(g, 3);
  assert.equal(a.task.type, 'idle', 'a foe four tiles off is left alone');
  assert.ok(Math.hypot(a.x - x, a.y - y) < 0.6, 'and he did not step off his spot');
  g.applyIntent({ type: 'stance', team: PLAYER, ids: [a.id], stance: 'passive' });
  foe.x = x + 0.9; run(g, 2);
  assert.notEqual(a.task.type, 'attack', 'no attack: even a foe at his elbow is not struck');
  g.applyIntent({ type: 'stance', team: PLAYER, ids: [a.id], stance: 'hold' }); run(g, 3);
  assert.ok(foe.hp < foe.maxHp, 'hold ground: a foe in reach is struck');
  const serf = g.units.find((u) => u.team === PLAYER && u.kind === 'serf');
  assert.equal(g.applyIntent({ type: 'stance', team: PLAYER, ids: [serf.id], stance: 'hold' }), false, 'serfs have no stance');
  assert.equal(g.applyIntent({ type: 'attack', team: PLAYER, ids: [a.id], targetId: foe.id }) !== false, true);
  assert.equal(a.task.type, 'attack', "the player's own order overrides the stance");
});

test('stances: a defensive soldier breaks off a long chase and comes back; an aggressive one keeps on', () => {
  const chase = (stance) => {
    const g = mk(); g.rel[0][1] = g.rel[1][0] = 'war'; quiet(g);
    const [x, y] = openBand(g, 30);
    const a = g.addUnit('footman', PLAYER, x, y); a.stance = stance;
    const foe = g.addUnit('knight', 1, x + 4, y); foe.stance = 'passive';
    g.cmdMove([foe], x + 28, y);   // the foe rides off before blows are traded, so nothing locks him in the fight
    run(g, 0.6);
    assert.equal(a.task.type, 'attack', `${stance}: he takes up the fight`);
    run(g, 14);
    return Math.hypot(a.x - x, a.y - y);
  };
  const def = chase('defensive'), agg = chase('aggressive');
  assert.ok(def <= STANCE.leash + 1.5, `defensive came back (${def.toFixed(1)} tiles out)`);
  assert.ok(agg > STANCE.leash + 4, `aggressive kept chasing (${agg.toFixed(1)} tiles out)`);
});

test('attack-move: fights every foe met on the way, then walks on to the spot; a plain march does not', () => {
  const go = (type) => {
    const g = mk(); g.rel[0][1] = g.rel[1][0] = 'war'; quiet(g);
    const [x, y] = openBand(g, 26);
    const us = [g.addUnit('footman', PLAYER, x, y), g.addUnit('footman', PLAYER, x, y + 0.9)];
    us.forEach((u) => { u.stance = 'passive'; });   // the order, not the stance, picks the fights
    const foe = g.addUnit('recruit', 1, x + 10, y + 1); foe.stance = 'passive';
    assert.equal(g.applyIntent({ type, team: PLAYER, ids: us.map((u) => u.id), x: x + 22, y }), true);
    if (type === 'amove') assert.equal(us[0].task.type, 'amove');
    run(g, 25);
    return { foe, us, g, x, y };
  };
  const am = go('amove');
  assert.ok(am.foe.hp <= 0, 'the foe on the way was cut down');
  assert.ok(am.us.every((u) => u.hp > 0 && Math.hypot(u.x - (am.x + 22), u.y - am.y) < 3), 'and they went on to the spot');
  assert.ok(am.us.every((u) => u.task.type === 'idle'));
  const mv = go('move');
  assert.ok(mv.foe.hp > 0, 'a plain march walks past');
  // the order and the stance survive a save
  const g = am.g, u = am.us[0]; u.stance = 'defensive'; u.task = { type: 'amove', x: am.x, y: am.y }; g.setPath(u, am.x, am.y);
  const g2 = new Game({ seed: 8, houses: 3, ai: false }).restore(JSON.parse(JSON.stringify(g.serialize())));
  const u2 = g2.byId.get(u.id);
  assert.equal(u2.stance, 'defensive'); assert.equal(u2.task.type, 'amove');
  assert.equal(g.applyIntent({ type: 'amove', team: PLAYER, ids: [u.id], x: NaN, y: 3 }), false, 'a bad spot is refused');
  // T-048: a minimap right-click once sent no spot at all and threw inside nodeAt
  assert.equal(g.applyIntent({ type: 'context', team: PLAYER, ids: [u.id], x: undefined, y: undefined }), false);
  assert.equal(g.applyIntent({ type: 'move', team: PLAYER, ids: [u.id], x: undefined, y: 4 }), false);
});

test('waypoints (T02): Shift-queued legs are walked in turn, attack-move legs fight on the way, and the queue survives a save', () => {
  const g = mk(); g.rel[0][1] = g.rel[1][0] = 'war'; quiet(g);
  const [x, y] = openBand(g, 26);
  const u = g.addUnit('footman', PLAYER, x, y); u.stance = 'passive';
  assert.equal(g.applyIntent({ type: 'context', team: PLAYER, ids: [u.id], x: x + 8, y }), true);
  assert.equal(g.applyIntent({ type: 'context', team: PLAYER, ids: [u.id], x: x + 20, y, queue: true }), true);
  assert.equal(g.applyIntent({ type: 'move', team: PLAYER, ids: [u.id], x: x + 4, y, queue: true }), true);
  assert.equal(u.task.type, 'move'); assert.equal(u.task.next.length, 2, 'two legs wait');
  // a save keeps the legs still to walk
  const g2 = new Game({ seed: 8, houses: 3, ai: false }).restore(JSON.parse(JSON.stringify(g.serialize())));
  assert.equal(g2.byId.get(u.id).task.next.length, 2);
  let far = 0; for (let t = 0; t < 30; t += 0.1) { g.tick(0.1); far = Math.max(far, u.x - x); }
  assert.ok(far > 18, `he went out to the second leg (${far.toFixed(1)} tiles)`);
  assert.ok(Math.abs(u.x - (x + 4)) < 1.5 && u.task.type === 'idle', `and came back to the third (${(u.x - x).toFixed(1)})`);
  // a plain order (no Shift) clears the queue
  g.applyIntent({ type: 'move', team: PLAYER, ids: [u.id], x: x + 12, y }); g.applyIntent({ type: 'move', team: PLAYER, ids: [u.id], x: x + 20, y, queue: true });
  g.applyIntent({ type: 'move', team: PLAYER, ids: [u.id], x: x + 6, y }); assert.ok(!u.task.next?.length, 'a fresh order starts a fresh march');
  // an attack-move leg queued after a plain march fights the foe met on it, then walks on
  const h = mk(); h.rel[0][1] = h.rel[1][0] = 'war'; quiet(h);
  const a = h.addUnit('footman', PLAYER, x, y); a.stance = 'passive';
  const foe = h.addUnit('recruit', 1, x + 15, y); foe.stance = 'passive';
  h.applyIntent({ type: 'move', team: PLAYER, ids: [a.id], x: x + 8, y });
  h.applyIntent({ type: 'amove', team: PLAYER, ids: [a.id], x: x + 22, y, queue: true });
  for (let t = 0; t < 2; t += 0.1) h.tick(0.1);
  assert.ok(foe.hp > 0 && a.task.type === 'move', 'the first leg is a plain march');
  for (let t = 0; t < 30; t += 0.1) h.tick(0.1);
  assert.ok(foe.hp <= 0, 'the attack-move leg cut the foe down');
  assert.ok(Math.hypot(a.x - (x + 22), a.y - y) < 2.5, 'and he walked on to its end');
});

test('marching together (T02): a mixed group keeps to its slowest member; a lone rider or a group of one kind does not wait', () => {
  const g = mk(); quiet(g);
  const [x, y] = openBand(g, 26);
  const f = g.addUnit('footman', PLAYER, x, y), k = g.addUnit('knight', PLAYER, x, y + 0.9);
  g.applyIntent({ type: 'move', team: PLAYER, ids: [f.id, k.id], x: x + 22, y });
  assert.equal(k.task.pace, UNITS.footman.speed);
  for (let t = 0; t < 4; t += 0.1) g.tick(0.1);
  assert.ok(Math.abs((k.x - x) - (f.x - x)) < 1.2, `they keep together (footman ${(f.x - x).toFixed(1)}, knight ${(k.x - x).toFixed(1)})`);
  const lone = g.addUnit('knight', PLAYER, x, y - 0.9);
  g.applyIntent({ type: 'move', team: PLAYER, ids: [lone.id], x: x + 22, y: y - 1 });
  assert.ok(!lone.task.pace, 'a lone rider rides at his own speed');
  const two = [g.addUnit('knight', PLAYER, x, y), g.addUnit('knight', PLAYER, x, y)];
  g.applyIntent({ type: 'amove', team: PLAYER, ids: two.map((u) => u.id), x: x + 22, y });
  assert.ok(two.every((u) => !u.task.pace), 'riders together need no pace');
});

test('formations (T02): a line puts fighters in front across the march and faces it; a box rings the bowmen; loose spreads out; saved', () => {
  const g = mk(); quiet(g);
  const [x, y] = openBand(g, 26);
  const foot = [0, 1, 2, 3].map((i) => g.addUnit('footman', PLAYER, x, y + i * 0.9)), bows = [0, 1, 2, 3].map((i) => g.addUnit('bowman', PLAYER, x + 1, y + i * 0.9));
  const all = [...bows, ...foot], ids = all.map((u) => u.id);   // bowmen listed first: the formation still puts the footmen in front
  assert.equal(g.formOf(all), 'mass', 'a group starts in a mass');
  assert.equal(g.applyIntent({ type: 'formation', team: PLAYER, ids, form: 'line' }), true);
  assert.equal(g.applyIntent({ type: 'formation', team: PLAYER, ids, form: 'wedge' }), false, 'an unknown formation is refused');
  assert.ok(all.every((u) => u.form === 'line'));
  g.applyIntent({ type: 'move', team: PLAYER, ids, x: x + 18, y: y + 1 });
  run(g, 20);
  const fx = Math.min(...foot.map((u) => u.x)), bx = Math.max(...bows.map((u) => u.x));
  assert.ok(fx > bx + 0.5, `footmen stand ahead of the bowmen (front ${fx.toFixed(1)}, back ${bx.toFixed(1)})`);
  const ys = foot.map((u) => u.y); assert.ok(Math.max(...ys) - Math.min(...ys) > 2.5, 'the front rank stretches across the march');
  assert.ok(all.every((u) => u.task.type === 'idle' && u.task.face && u.task.face[0] > 0.9), 'and they face the way they marched');
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) > 0.5, 'nobody stacks');
  // box: the bowmen inside, the footmen on the edge (nine: one cell in the middle)
  const box = [g.addUnit('bowman', PLAYER, x, y + 5), ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => g.addUnit('footman', PLAYER, x + (i % 4), y + 6 + Math.floor(i / 4)))];
  g.setFormation(box, 'box'); const s = g.formSlots(box, x + 10, y + 6), [cx, cy] = s.at.get(box[0]);
  assert.ok(Math.hypot(cx - (x + 10 - 1.1), cy - (y + 6)) < 0.2, `the bowman takes the middle cell (${cx.toFixed(2)}, ${cy.toFixed(2)})`);
  // loose spreads wider than mass
  const spread = (form) => { g.setFormation(foot, form); const at = [...g.formSlots(foot, x + 10, y).at.values()]; return Math.max(...at.map(([a, b]) => Math.hypot(a - x - 10, b - y))); };
  assert.ok(spread('loose') > spread('mass') * 1.8, 'loose stands wider apart');
  // kept by a save
  const g2 = new Game({ seed: 8, houses: 3, ai: false }).restore(JSON.parse(JSON.stringify(g.serialize())));
  assert.equal(g2.byId.get(bows[0].id).form, 'line'); assert.ok(g2.byId.get(bows[0].id).task.face, 'the facing is saved');
  // idle soldiers form up where they stand when the formation is picked
  const h = mk(); quiet(h); const loose = [0, 1, 2].map((i) => h.addUnit('footman', PLAYER, x + i * 0.3, y + i * 3));
  h.applyIntent({ type: 'formation', team: PLAYER, ids: loose.map((u) => u.id), form: 'line' });
  assert.ok(loose.every((u) => u.task.type === 'move'), 'idle soldiers step into the line');
});

test('stances: rival houses stand their home guard defensive at peace and send their attacks aggressive', () => {
  const g = new Game({ seed: 8, houses: 3, ai: true }); const t = 1, seat = g.seatOf(t);
  const guard = [0, 1, 2].map((i) => g.addUnit('footman', t, seat.x + i, seat.y + 4));
  g.time = 30; g.players[t].think = 0; updateAI(g, 0.01);
  assert.ok(guard.every((u) => u.stance === 'defensive'), guard.map((u) => u.stance).join());
  const army = [0, 1, 2, 3, 4, 5, 6].map((i) => g.addUnit('footman', t, seat.x + i * 0.8, seat.y + 5));
  g.rel[1][0] = g.rel[0][1] = 'war'; g.known[t][0] = true; g.time = 900; g.players[t].think = 0; updateAI(g, 0.01);
  assert.ok(army.some((u) => u.stance === 'aggressive' && u.task.type === 'attack'), 'the war host goes out aggressive');
});

test('combat feedback (T06): a struck village warns its owner; alerts and damage numbers only with a UI; a load clears them', () => {
  const g = mk(); g.rel[0][1] = g.rel[1][0] = 'war';
  const home = g.seatOf(PLAYER); assert.equal(home.type, 'village', 'the player starts in a home village');
  const foe = g.addUnit('footman', 1, home.x + 2, home.y + 2); foe.hp = foe.maxHp = 9999;
  g.events.length = 0; g.hitVillage(foe, home, 5, UNITS.footman);
  assert.ok(g.events.some((e) => e.team === PLAYER && /village of .* is under attack/.test(e.text)), 'the owner hears the village is attacked');
  assert.equal(g.alerts.length, 0, 'no alert spots without a UI (headless sim)');
  const u = g.addUnit('footman', PLAYER, home.x + 4, home.y + 4);
  g.dmgNums = true; g.damage(u, 7, 1, foe);
  assert.equal(g.floaters.filter((f) => f.res === 'hurt').length, 0, 'no damage numbers without a UI');
  g.sfxOn = true; g.damage(u, 7, 1, foe); g.damage(u, 3, 1, foe);
  assert.equal(g.alerts.length, 1, 'blows near each other share one alert spot');
  assert.ok(g.floaters.some((f) => f.res === 'hurt' && f.text === '-7'), 'a damage number when chosen');
  g.dmgNums = false; const n = g.floaters.length; g.damage(u, 2, 1, foe); assert.equal(g.floaters.length, n, 'off by default');
  const far = g.addUnit('footman', PLAYER, home.x + 40, home.y + 40); g.damage(far, 1, 1, foe);
  assert.equal(g.alerts.length, 2, 'a blow far away is a second alert');
  g.damage(foe, 5, PLAYER, u); assert.equal(g.alerts.length, 2, 'our own blows raise no alert');
  g.rel[0][1] = g.rel[1][0] = 'peace'; run(g, 11); assert.equal(g.alerts.length, 0, 'alerts fade after ten seconds');
  g.damage(u, 1, 1, foe); const save = g.serialize(); assert.ok(!('alerts' in save));
  const h = new Game({ seed: 8, houses: 3, ai: false }).restore(JSON.parse(JSON.stringify(save))); assert.deepEqual(h.alerts, []);
});

test('gaps: the "Raise an army" step counts soldiers garrisoned in a keep (T-050)', () => {
  const g = mk(), step = OBJECTIVES.find((o) => o.id === 'army'), h = g.seatOf(PLAYER);
  const k = g.addBuilding('keep', PLAYER, Math.round(h.x - 9), Math.round(h.y), true);
  const us = Array.from({ length: 8 }, (_, i) => g.addUnit('footman', PLAYER, k.x + (i % 4), k.y + 3 + (i >> 2)));
  assert.equal(step.done(g), true);
  for (const u of us) u.inside = k.id;
  assert.equal(step.done(g), true, 'still an army when inside the keep');
});

test('the build stamp (T-055): index.html carries an import map that versions every module in js/', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8'), m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(m, 'index.html has an import map (run node tools/stamp.js)');
  const imports = JSON.parse(m[1]).imports, build = html.match(/window\.__BUILD = '([^']*)'/)?.[1];
  for (const f of readdirSync(new URL('../js/', import.meta.url)).filter((f) => f.endsWith('.js'))) assert.equal(imports[`./js/${f}`], `./js/${f}?v=${build}`, `js/${f} is stamped with the build`);
});

test('playtest 2026-10-14: "not enough goods" names what is missing', () => {
  const g = mk(), p = g.players[PLAYER]; Object.assign(p, { food: 999, wood: 300, gold: 100, stone: 35 });
  const r = g.canPlace(PLAYER, 'keep', g.seatOf(PLAYER).tx + 12, g.seatOf(PLAYER).ty + 12);
  assert.equal(r.ok, false); assert.match(r.reason, /50 coin and 5 stone/);
  assert.equal(g.lacking(PLAYER, { wood: 10 }), '', 'nothing lacking, nothing said');
});

test('playtest 2026-10-14: an order to serfs sheltering in a village brings them out to obey (they used to sit inside for ever)', () => {
  const g = mk(), v = g.seatOf(PLAYER), serfs = g.units.filter((u) => u.team === PLAYER && u.kind === 'serf');
  for (const u of serfs) { u.inside = v.id; v.garrison.push(u.id); u.task = { type: 'idle' }; }
  const tree = g.resources.filter((n) => n.kind === 'tree' && n.amount > 0).sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y))[0];
  g.applyIntent({ team: PLAYER, type: 'gather', ids: [serfs[0].id], nodeId: tree.id });
  assert.equal(serfs[0].inside, null, 'out of the village'); assert.equal(serfs[0].task.type, 'gather'); assert.ok(!v.garrison.includes(serfs[0].id));
  g.applyIntent({ team: PLAYER, type: 'move', ids: [serfs[1].id], x: v.x + 6, y: v.y + 6 });
  assert.equal(serfs[1].inside, null); assert.equal(serfs[1].task.type, 'move');
  assert.equal(serfs[2].inside, v.id, 'those not ordered stay inside');
  g.cmdGather([serfs[2]], tree); assert.equal(serfs[2].task.type, 'idle', 'a direct gather call never gives someone inside a task he cannot do');
});

test('playtest 2026-10-14: an heir is crowned where no raider stands; with nowhere safe, at the seat as before', () => {
  const g = mk(); g.rel[0][1] = g.rel[1][0] = 'war';
  const seat = g.seatOf(PLAYER), far = g.villages.filter((v) => v.owner == null || v.owner < 0).sort((a, b) => Math.hypot(a.x - seat.x, a.y - seat.y) - Math.hypot(b.x - seat.x, b.y - seat.y))[0];
  far.owner = PLAYER;
  const at0 = g.thronePlace(PLAYER); assert.ok(Math.hypot(at0.x - seat.x, at0.y - seat.y) < 6, 'in peace, the seat');
  for (let i = 0; i < 3; i++) g.addUnit('footman', 1, seat.x + i, seat.y + 4);
  const at1 = g.thronePlace(PLAYER); assert.ok(Math.hypot(at1.x - far.x, at1.y - far.y) < 6, 'raiders at the seat: crowned at the other village');
  for (let i = 0; i < 3; i++) g.addUnit('footman', 1, far.x + i, far.y + 4);
  const at2 = g.thronePlace(PLAYER); assert.ok(Math.hypot(at2.x - seat.x, at2.y - seat.y) < 6, 'raiders everywhere: the seat');
});

test('playtest 2026-10-14: a struck king always raises his own alarm, saying how many heirs are left', () => {
  const g = mk(), k = g.kingOf(PLAYER), h = g.seatOf(PLAYER);
  g.alertPlayer(g.addBuilding('barracks', PLAYER, Math.round(h.x + 8), Math.round(h.y), true), 1);   // a building's alarm first...
  g.alertPlayer(k, 1);   // ...does not swallow the king's a moment later
  const last = g.events[g.events.length - 1].text; assert.match(last, /under attack!.*2 heirs left/);
  g.players[PLAYER].heirs = 0; g.time += 9; g.alertPlayer(k, 1);
  assert.match(g.events[g.events.length - 1].text, /last of your line/);
});


// ---- espionage: academy spies, rival spies on your villages, watchmen -------------------------------------
const spyIn = (g, team, v) => { const s = g.addUnit('spy', team, v.x + 0.2, v.y + 0.2); g.cmdInfiltrate([s], v); return s; };
// an outlying village of the house (far from its castle, where its pull is weak and a spy can make headway)
const ownVillage = (g, team) => { const h = g.seatOf(team); const v = g.villages.filter((x) => x.owner < 0 && !x.home).sort((a, b) => Math.hypot(b.x - h.x, b.y - h.y) - Math.hypot(a.x - h.x, a.y - h.y))[0]; v.owner = team; v.loyalty = 90; return v; };

test('spies: an academy trains spies as well as a tavern', () => {
  const g = mk(); const h = g.seatOf(PLAYER); g.players[PLAYER].gold = g.players[PLAYER].food = g.players[PLAYER].wood = 999;
  const ac = g.addBuilding('academy', PLAYER, h.tx + 12, h.ty + 2); ac.built = 1;
  assert.equal(g.train(PLAYER, ac.id, 'spy'), true, 'the academy takes the order');
});

test('spies: a rival spy in your village lowers its loyalty and warns you; a watchman of yours catches spies far sooner', () => {
  const caughtAfter = (watch, seed) => {
    const g = mk({ seed }); g.meet(0, 1); const v = ownVillage(g, PLAYER); v.protection = 0;
    if (watch) spyIn(g, PLAYER, v);
    const s = spyIn(g, 1, v); let t = 0;
    while (s.hp > 0 && t < 400) { g.tick(0.25); t += 0.25; }
    return { t, g, v };
  };
  const a = caughtAfter(false, 8);
  assert.ok(a.g.events.length >= 0 && a.t > 0);
  const plain = [8, 9, 10, 11].map((sd) => caughtAfter(false, sd).t), watched = [8, 9, 10, 11].map((sd) => caughtAfter(true, sd).t);
  const avg = (xs) => xs.reduce((p, x) => p + x, 0) / xs.length;
  assert.ok(avg(watched) * 3 < avg(plain), `watched ${avg(watched).toFixed(0)}s vs unwatched ${avg(plain).toFixed(0)}s`);
  // the warning and the falling loyalty
  const g = mk(); g.meet(0, 1); const v = ownVillage(g, PLAYER); v.protection = 0; const l0 = v.loyalty; const seen = [];
  let low = l0; spyIn(g, 1, v); for (let i = 0; i < 80; i++) { g.tick(0.25); low = Math.min(low, v.loyalty); seen.push(...g.events.splice(0).map((e) => e.text)); }
  assert.ok(low < l0 - 3, `loyalty fell while the spy worked (${l0} -> ${low.toFixed(1)})`);
  assert.ok(seen.some((x) => /turning the folk of .* against you/.test(x)), 'the player was warned: ' + seen.slice(-3).join(' | '));
});

test('spies: right-clicking your own village with a spy posts him there as a watchman', () => {
  const g = mk(); const v = ownVillage(g, PLAYER); const s = g.addUnit('spy', PLAYER, v.x + 3, v.y + 3);
  g.contextCommand(PLAYER, [s.id], v.x, v.y);
  assert.equal(s.task.type, 'infiltrate'); assert.equal(s.task.targetId, v.id);
  for (let i = 0; i < 60; i++) g.tick(0.25);
  assert.equal(g.watchmenIn(v), 1, 'he is on watch inside');
});

// ---- trade needs partners: metal is regional ------------------------------------------------------------------
test('ore: the land round each hall holds only its own two metals; the others lie in the open ground or with other houses', () => {
  const metals = ['copper', 'iron', 'coal', 'silver'];
  for (const seed of [3, 7]) {
    const g = new Game({ seed, houses: 4, ai: false }), home = g.W * 0.22;
    let ok = 0, n = 0;
    for (const r of g.resources) {
      if (!metals.includes(r.kind)) continue;
      let best = -1, bd = home; for (let i = 0; i < 4; i++) { const s = g.seatOf(i), d = Math.hypot(r.x - s.x, r.y - s.y); if (d < bd) { bd = d; best = i; } }
      if (best < 0) continue;   // open ground: anything goes
      n++; if ([metals[best % 4], metals[(best + 1) % 4]].includes(r.kind)) ok++;
    }
    assert.ok(n > 0 && ok / n >= 0.9, `seed ${seed}: ${ok} of ${n} metal deposits in a house's land are its own metals`);
    assert.ok(g.resources.some((r) => metals.includes(r.kind) && [0, 1, 2, 3].every((i) => Math.hypot(r.x - g.seatOf(i).x, r.y - g.seatOf(i).y) >= home)), 'and there is metal out in the open ground');
  }
});

// ---- T31 selection, T-058 reset ------------------------------------------------------------------
test('selection: idle soldiers are those standing with no order, queued leg or drill; serfs, spies and the garrisoned are not', () => {
  const g = mk(); const s = g.seatOf(PLAYER);
  const a = g.addUnit('footman', PLAYER, s.x, s.y + 6), b = g.addUnit('bowman', PLAYER, s.x + 2, s.y + 6), c = g.addUnit('knight', PLAYER, s.x + 4, s.y + 6);
  g.addUnit('serf', PLAYER, s.x, s.y + 8); g.addUnit('spy', PLAYER, s.x + 1, s.y + 8);
  b.task = { type: 'move' }; c.task = { type: 'idle', next: [{ x: 1, y: 1 }] };
  const ids = g.idleArmyOf(PLAYER).map((u) => u.id);
  assert.ok(ids.includes(a.id), 'a standing footman is idle');
  assert.ok(!ids.includes(b.id) && !ids.includes(c.id), 'a marching bowman and a knight with a queued leg are not');
  assert.ok(g.idleArmyOf(PLAYER).every((u) => g.militaryOf(PLAYER).includes(u)), 'only soldiers');
});

test('reset: a reused Game plays a seed exactly like a fresh one, and old timers do not silence the new match (T-058)', () => {
  const opts = { seed: 21, houses: 3, ai: true };
  const fresh = new Game(opts); run(fresh, 40, 0.2);
  const used = new Game({ seed: 5, houses: 4, ai: true }); run(used, 90, 0.2);
  used._spyWarn[999] = used.time; used._kingAlertT = used.time; used.log(PLAYER, 'old line');
  used.reset(opts);
  assert.deepEqual(used._spyWarn, {}); assert.equal(used._kingAlertT, -99);
  used.log(PLAYER, 'old line'); assert.ok(used.events.some((e) => e.text === 'old line'), 'a line logged last match is not muted in this one');
  used.events.length = 0; run(used, 40, 0.2);
  const strip = (d) => { delete d.saved; return JSON.stringify(d); };
  assert.equal(strip(used.serialize()), strip(fresh.serialize()), 'same seed, same play');
});

test('garrison: a soldier who dies inside (deserting for want of pay) leaves the keep\'s roll (T-058)', () => {
  const g = mk(); const s = g.seatOf(PLAYER);
  const k = g.addBuilding('keep', PLAYER, Math.round(s.x + 8), Math.round(s.y), true); g.recomputeWalk();
  const a = g.addUnit('footman', PLAYER, k.x, k.y + 2), b = g.addUnit('footman', PLAYER, k.x + 1, k.y + 2);
  g.cmdEnter([a, b], k); run(g, 8);
  assert.equal(k.garrison.length, 2, 'both went in');
  a.hp = 0; run(g, 0.2);
  assert.deepEqual(k.garrison, [b.id], 'only the living stay on the roll');
});

// ---- attack and retreat: a rout costs faith and invites war -------------------------------------------------------
const brawl = (g) => {   // three of ours trading blows with three of theirs, a little way out from our seat
  g.meet(0, 1); g.setRelation(0, 1, 'war'); const h = g.seatOf(PLAYER), x = h.x + 14, y = h.y + 10;
  const ours = [0, 1, 2].map((i) => g.addUnit('footman', PLAYER, x + i * 0.6, y)), theirs = [0, 1, 2].map((i) => g.addUnit('footman', 1, x + i * 0.6, y + 1.2));
  for (const u of [...ours, ...theirs]) { u.hp = u.maxHp = 900; }
  g.cmdAttack(ours, theirs[0]); for (const u of theirs) g.cmdAttack([u], ours[0]);
  for (let i = 0; i < 30; i++) g.tick(0.1);
  return { ours, theirs };
};

test('retreat: a band ordered off the field breaks out of a fight and heads for home', () => {
  const g = mk(); const { ours } = brawl(g);
  assert.ok(ours.some((u) => g.locked(u)), 'they are locked in combat');
  g.applyIntent({ type: 'retreat', team: PLAYER, ids: ours.map((u) => u.id) });
  assert.ok(ours.every((u) => u.task.type === 'move' && u.task.retreat), 'every one of them turns for home');
  for (let i = 0; i < 40; i++) g.tick(0.1);   // struck again as they go, they keep going (a retreat takes the blows)
  assert.ok(ours.filter((u) => u.hp > 0).every((u) => u.task.type === 'move' && u.task.retreat), 'nobody turned back: ' + ours.map((u) => u.task.type).join(','));
});

test('retreat: leaving a fight is a rout - villages lose a fifth of their loyalty, regain it slowly, and other kings smell weakness', () => {
  const g = mk(); const vs = g.villages.filter((v) => v.owner === PLAYER); vs.forEach((v) => { v.loyalty = 80; });
  const { ours } = brawl(g);
  const before = vs.map((v) => v.loyalty);
  g.applyIntent({ type: 'retreat', team: PLAYER, ids: ours.map((u) => u.id) });
  vs.forEach((v, i) => assert.ok(Math.abs(v.loyalty - before[i] * 0.8) < 0.01, `${v.name}: ${before[i].toFixed(1)} -> ${v.loyalty.toFixed(1)}`));
  assert.ok(g.events.some((e) => /fled the field/.test(e.text)), 'the player is told');
  g._stance = {}; const st = stance(g, 1, PLAYER);   // (readings are cached a few seconds; the next one sees the rout)
  assert.ok(st.reasons.some((r) => /fled the field/.test(r.text)), 'a rival counts it as weakness: ' + st.reasons.map((r) => r.text).join('; '));
  // a second retreat at once is the same rout, not another
  const l1 = vs[0].loyalty; g.applyIntent({ type: 'retreat', team: PLAYER, ids: ours.map((u) => u.id) }); assert.equal(vs[0].loyalty, l1);
});

test('retreat: walking home when nobody is fighting costs nothing; Attack falls on the nearest foe in sight', () => {
  const g = mk(); const v = g.villages.find((x) => x.owner === PLAYER), l0 = v.loyalty, h = g.seatOf(PLAYER);
  const band = [0, 1, 2].map((i) => g.addUnit('footman', PLAYER, h.x + 10 + i, h.y + 8));
  g.applyIntent({ type: 'retreat', team: PLAYER, ids: band.map((u) => u.id) });
  assert.equal(v.loyalty, l0, 'no rout without a fight'); assert.ok(!(g.players[PLAYER].routT > -1e9), 'no rout recorded');
  g.meet(0, 1); g.setRelation(0, 1, 'war'); const foe = g.addUnit('bowman', 1, h.x + 13, h.y + 9); g.updateVisibility(true);
  assert.equal(g.applyIntent({ type: 'charge', team: PLAYER, ids: band.map((u) => u.id) }), true);
  assert.ok(band.every((u) => u.task.type === 'attack' && u.task.targetId === foe.id), 'they go for him');
});

// ---- spies in disguise: a rival's colours, into its buildings -------------------------------------------------------
const rivalBuilding = (g, team, kind) => { const s = g.seatOf(team); const b = g.addBuilding(kind, team, Math.round(s.x) + 7, Math.round(s.y) - 2, true); g.recomputeWalk(); return b; };

test('disguise: a spy right-clicked onto a rival building never attacks it; without their colours he is refused, in them he goes in', () => {
  const g = mk({ fog: false });   // (a building must have been seen to be right-clicked) g.meet(0, 1); g.setRelation(0, 1, 'war');
  const m = rivalBuilding(g, 1, 'market'), s = g.addUnit('spy', PLAYER, m.x + 3, m.y + 3);
  g.contextCommand(PLAYER, [s.id], m.x, m.y);
  assert.notEqual(s.task.type, 'attack', 'a spy does not attack'); assert.notEqual(s.task.type, 'infiltrateB', 'and is not let in undisguised');
  assert.equal(g.applyIntent({ type: 'disguise', team: PLAYER, ids: [s.id], as: 1 }), true); assert.equal(s.disguise, 1);
  g.contextCommand(PLAYER, [s.id], m.x, m.y);
  assert.equal(s.task.type, 'infiltrateB'); assert.equal(s.task.targetId, m.id);
});

test('disguise: their soldiers let a spy in their colours be; inside their market he skims coin and they are warned', () => {
  const g = mk(); g.meet(0, 1); g.setRelation(0, 1, 'war');
  const m = rivalBuilding(g, 1, 'market'), s = g.addUnit('spy', PLAYER, m.x + 2, m.y + 2); s.disguise = 1;
  const guard = g.addUnit('footman', 1, m.x + 2.5, m.y + 2);
  assert.equal(g.closestEnemy(guard, 9, 1), null, 'the guard takes him for one of theirs');
  s.disguise = null; assert.equal(g.closestEnemy(guard, 9, 1), s, 'undisguised, he is a foe'); s.disguise = 1; guard.hp = 0;
  g.players[1].gold = 500; const mine0 = g.players[PLAYER].gold, theirs0 = g.players[1].gold;
  g.cmdInfiltrateB([s], m); for (let i = 0; i < 120 && s.hp > 0; i++) g.tick(0.25);
  if (s.hp > 0) { assert.ok(g.players[PLAYER].gold > mine0 && g.players[1].gold < theirs0, `coin moved: ours ${mine0} -> ${g.players[PLAYER].gold.toFixed(1)}`); assert.ok(g.spiedOn(PLAYER, 1), 'and a spy report came home'); }
  assert.ok(g.players[1].spied?.[m.id] != null, 'the owner noticed something wrong there');
});

test('disguise: a spy inside a rival barracks slows its training; a watchman of theirs catches spies far sooner', () => {
  const trainTime = (spy) => {
    const g = mk(); g.meet(0, 1); g.setRelation(0, 1, 'war'); const b = rivalBuilding(g, 1, 'barracks');
    Object.assign(g.players[1], { gold: 999, food: 999, wood: 999 }); g.train(1, b.id, 'footman');
    if (spy) { const s = g.addUnit('spy', PLAYER, b.x + 0.5, b.y + 0.5); s.disguise = 1; s.hp = s.maxHp = 1e6; g.cmdInfiltrateB([s], b); SPY_COVER.catch = 0; }
    let t = 0; while (b.queue.length && t < 200) { g.tick(0.25); t += 0.25; }
    SPY_COVER.catch = 0.006; return t;
  };
  assert.ok(trainTime(true) > trainTime(false) * 1.6, 'training took much longer with a spy inside');
  const caught = (watch, seed) => {
    const g = mk({ seed }); g.meet(0, 1); const b = rivalBuilding(g, 1, 'academy');
    if (watch) { const w = g.addUnit('spy', 1, b.x + 0.5, b.y + 0.5); g.cmdInfiltrateB([w], b); }
    const s = g.addUnit('spy', PLAYER, b.x + 0.5, b.y + 0.5); s.disguise = 1; g.cmdInfiltrateB([s], b); let t = 0;
    while (s.hp > 0 && t < 600) { g.tick(0.5); t += 0.5; } return t;
  };
  const avg = (w) => [8, 9, 10, 11].map((sd) => caught(w, sd)).reduce((a, b) => a + b, 0) / 4;
  assert.ok(avg(true) * 3 < avg(false), `watched ${avg(true).toFixed(0)}s vs unwatched ${avg(false).toFixed(0)}s`);
});

// ---- defence, pulling back, repair (owner, 2026-10-16) ----------------------------------------------------------------
test('defence: idle soldiers well beyond their own sight of the raiders turn out when a building of ours is hit', () => {
  const g = mk({ fog: false }); g.meet(0, 1); g.setRelation(0, 1, 'war'); const h = g.seatOf(PLAYER);
  const b = g.addBuilding('barracks', PLAYER, Math.round(h.x) + 8, Math.round(h.y) + 4, true); g.recomputeWalk();
  const ours = [0, 1, 2].map((i) => g.addUnit('footman', PLAYER, b.x - 11 + i * 0.5, b.y + 1));
  const foes = [0, 1].map((i) => g.addUnit('footman', 1, b.x + 3, b.y - 1 + i)); foes.forEach((f) => { f.hp = f.maxHp = 3000; }); g.cmdAttack(foes, b);
  for (let i = 0; i < 20; i++) g.tick(0.1);
  assert.ok(ours.every((u) => u.task.type === 'attack'), 'all three came: ' + ours.map((u) => u.task.type).join(','));
});

test('pulling back: when the foe turns away, our soldiers obey a move order (no lock, no rout)', () => {
  const g = mk(); const { ours, theirs } = brawl(g); const v = g.villages.find((x) => x.owner === PLAYER), l0 = v.loyalty;
  assert.ok(ours.some((u) => g.locked(u)), 'locked while they fight');
  g.cmdRetreat(theirs);   // they flee
  const h = g.seatOf(PLAYER); g.cmdMove(ours, h.x + 2, h.y + 2);
  assert.ok(ours.every((u) => u.task.type === 'move'), 'ours go where sent: ' + ours.map((u) => u.task.type).join(','));
  for (let i = 0; i < 20; i++) g.tick(0.1);
  assert.ok(ours.filter((u) => u.hp > 0).every((u) => u.task.type === 'move' || u.task.type === 'idle'), 'and keep going');
  assert.ok(!(g.players[PLAYER].routT > -1e9) && v.loyalty >= l0 - 2, 'it is no rout of ours');
});

test('repair: serfs mend a damaged building, paying half its price for the health they restore; the Repair button sends the nearest', () => {
  const g = mk(); const h = g.seatOf(PLAYER), p = g.players[PLAYER];
  const b = g.addBuilding('barracks', PLAYER, Math.round(h.x) + 8, Math.round(h.y) + 4, true); g.recomputeWalk();
  b.hp = b.maxHp * 0.3; Object.assign(p, { food: 999, wood: 999, gold: 999, stone: 999 }); const wood0 = p.wood;
  for (let i = 0; i < 3; i++) g.addUnit('serf', PLAYER, b.x - 3 + i * 0.5, b.y + 3);
  assert.equal(g.applyIntent({ type: 'repair', team: PLAYER, buildingId: b.id }), true);
  for (let i = 0; i < 1200 && b.hp < b.maxHp; i++) g.tick(0.25);
  assert.equal(b.hp, b.maxHp, 'mended to full');
  const paid = wood0 - p.wood, want = 0.7 * 0.5 * BUILDINGS.barracks.cost.wood;
  assert.ok(Math.abs(paid - want) < 2, `paid ${paid.toFixed(1)} timber for 70% of a barracks at half price (${want})`);
});

test('pack animals: not people (no population, never capped); each people names its own (donkey, Bactrian camel, camel)', () => {
  const g = mk({ people: 'romans' }); const h = g.seatOf(PLAYER), p = g.players[PLAYER];
  const m = g.addBuilding('market', PLAYER, Math.round(h.x) + 8, Math.round(h.y) + 4, true); Object.assign(p, { food: 999, wood: 999, gold: 999 });
  const before = g.popUsed(PLAYER); g.addUnit('camel', PLAYER, m.x + 2, m.y + 3);
  assert.equal(g.popUsed(PLAYER), before, 'a pack animal takes no room');
  while (g.popUsed(PLAYER) < g.popCap(PLAYER)) g.addUnit('serf', PLAYER, h.x + 2, h.y + 2);
  assert.equal(g.train(PLAYER, m.id, 'camel'), true, 'trained even at the population cap');
  assert.equal(packWords('Train a camel; two camels. Camel.', PLAYER), 'Train a donkey; two donkeys. Donkey.');
  const mg = new Game({ seed: 8, houses: 3, ai: false, people: 'mongols' }); assert.equal(packOf(PLAYER).one, 'Bactrian camel');
  const eg = new Game({ seed: 8, houses: 3, ai: false, people: 'egyptians' }); assert.equal(packWords('a camel', PLAYER), 'a camel');
});

test('villages: a village fights back with its folk, shared among its attackers - ten soldiers take a hillfort of ten, not of forty', () => {
  const attack = (pop) => {
    const g = mk({ seed: 5, fog: false }); const v = g.villages.find((x) => x.owner < 0 && x.kind === 'hillfort' && !x.home);
    v.pop = pop; v.protection = v.maxProtection;
    const us = Array.from({ length: 10 }, (_, i) => g.addUnit('footman', PLAYER, v.x + 3 + (i % 5) * 0.6, v.y + 3 + Math.floor(i / 5) * 0.6)); g.cmdAttack(us, v);
    let t = 0; while (t < 240 && v.owner !== PLAYER && us.some((u) => u.hp > 0)) { g.tick(0.25); t += 0.25; }
    return { taken: v.owner === PLAYER, alive: us.filter((u) => u.hp > 0).length };
  };
  const small = attack(10), big = attack(40);
  assert.ok(small.taken && small.alive === 10, `ten folk: taken ${small.taken}, ${small.alive} alive`);
  assert.ok(!big.taken, 'forty folk behind the walls of a hillfort hold against ten');
});

test('fighting: a soldier battering a building turns on the foe who strikes him, then goes back to the building', () => {
  const g = mk({ fog: false }); g.meet(0, 1); g.setRelation(0, 1, 'war'); const s = g.seatOf(1);
  const b = g.addBuilding('barracks', 1, Math.round(s.x) + 8, Math.round(s.y) + 4, true); g.recomputeWalk();
  const a = g.addUnit('footman', PLAYER, b.x + 2.5, b.y + 2.5); a.hp = a.maxHp = 400; g.cmdAttack([a], b);
  for (let i = 0; i < 20; i++) g.tick(0.1);
  const foe = g.addUnit('footman', 1, a.x + 0.8, a.y); foe.hp = foe.maxHp = 30; g.cmdAttack([foe], a);
  for (let i = 0; i < 15; i++) g.tick(0.1);
  assert.equal(a.task.targetId, foe.id, 'he turned on his attacker');
  for (let i = 0; i < 100 && foe.hp > 0; i++) g.tick(0.1); g.tick(0.1);
  assert.ok(foe.hp <= 0, 'and beat him'); assert.equal(a.task.type, 'attack'); assert.equal(a.task.targetId, b.id, 'then went back to the barracks');
});

console.log(`${passed} passed`);
