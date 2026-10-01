// Headless sim tests: `npm test` or `node test/sim.test.js`. No dependencies.
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { PLAYER, UNITS } from '../js/config.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const run = (g, secs, dt = 0.1) => { for (let t = 0; t < secs; t += dt) g.tick(dt); };

test('map: every start, village and resource node is reachable from every start (30 seeds x 3/4/5 houses)', () => {
  for (const houses of [3, 4, 5]) for (let seed = 1; seed <= 30; seed++) {
    const g = new Game({ seed, houses });
    const s0 = g.map.starts[0];
    for (const [sx, sy] of g.map.starts) assert.ok(g.findPath(s0[0] + 1, s0[1] + 3, sx + 1, sy + 3), `seed ${seed}/${houses}: start unreachable`);
    for (const v of g.villages) assert.ok(g.findPath(s0[0] + 1, s0[1] + 3, v.tx + 1, v.ty + 1), `seed ${seed}/${houses}: village ${v.name} unreachable`);
    assert.ok(g.villages.length >= 10, `seed ${seed}: only ${g.villages.length} villages`);
    let bad = 0;
    for (const n of g.resources) if (!g.findPath(s0[0] + 1, s0[1] + 3, n.x, n.y)) bad++;
    assert.equal(bad, 0, `seed ${seed}/${houses}: ${bad} unreachable resource nodes`);
  }
});

test('start: one hall, two serfs standing on walkable tiles, small stock, no army, no keep', () => {
  const g = new Game({ seed: 7, houses: 4 });
  for (let t = 0; t < 4; t++) {
    assert.equal(g.buildings.filter((b) => b.team === t).length, 1);
    assert.equal(g.buildings.find((b) => b.team === t).kind, 'hall');
    const us = g.units.filter((u) => u.team === t);
    assert.equal(us.length, 2);
    for (const u of us) { assert.equal(u.kind, 'serf'); assert.ok(g.walk[Math.floor(u.y) * g.W + Math.floor(u.x)], 'serf spawned on blocked tile'); }
  }
  assert.ok(g.map.starts.length >= 4);
});

test('villages: independent at start, not next to a hall', () => {
  const g = new Game({ seed: 11, houses: 5 });
  for (const v of g.villages) {
    assert.equal(v.owner, -1);
    for (const b of g.buildings) assert.ok(Math.hypot(v.x - b.x, v.y - b.y) > 20, 'village too close to a hall');
  }
  const kinds = new Set(g.villages.map((v) => v.kind));
  assert.ok(kinds.size >= 5, `only ${kinds.size} village kinds`);
});

test('economy: serfs gather timber, carry it home and the stock rises', () => {
  const g = new Game({ seed: 3, houses: 3, ai: false });
  const serfs = g.units.filter((u) => u.team === PLAYER);
  const hall = g.seatOf(PLAYER);
  const node = g.nearestNode(hall.x, hall.y, 'wood');
  g.applyIntent({ type: 'gather', team: PLAYER, ids: serfs.map((u) => u.id), nodeId: node.id });
  const before = g.players[PLAYER].wood;
  run(g, 60);
  assert.ok(g.players[PLAYER].wood > before + 20, `wood ${before} -> ${g.players[PLAYER].wood}`);
});

test('building: place a cottage, serfs raise it, population cap grows; cannot place out of territory', () => {
  const g = new Game({ seed: 3, houses: 3, ai: false });
  const hall = g.seatOf(PLAYER);
  g.players[PLAYER].wood = 500;
  const cap0 = g.popCap(PLAYER);
  let placed = null;
  for (let r = 4; r < 10 && !placed; r++) for (let a = 0; a < 12 && !placed; a++) placed = g.applyIntent({ type: 'place', team: PLAYER, kind: 'cottage', tx: Math.round(hall.x + Math.cos(a / 2) * r), ty: Math.round(hall.y + Math.sin(a / 2) * r) });
  assert.ok(placed, 'could not place');
  run(g, 40);
  assert.equal(placed.built, 1);
  assert.equal(g.popCap(PLAYER), cap0 + 5);
  assert.equal(g.canPlace(PLAYER, 'cottage', hall.tx + 40, hall.ty).ok, false);
});

test('training: serf from the hall respects cost and population', () => {
  const g = new Game({ seed: 3, houses: 3, ai: false });
  const hall = g.seatOf(PLAYER);
  g.players[PLAYER].food = 1000;
  let ok = 0;
  for (let i = 0; i < 10; i++) if (g.applyIntent({ type: 'train', team: PLAYER, buildingId: hall.id, kind: 'serf' })) ok++;
  assert.equal(ok, 4, `hall pop 6 with 2 serfs -> 4 more, got ${ok}`);
  run(g, 20);
  assert.ok(g.units.filter((u) => u.team === PLAYER).length >= 3);
  assert.equal(g.train(PLAYER, hall.id, 'knight'), null, 'hall must not train knights');
});

function armyAt(g, v, kind, n, team = PLAYER) {
  const us = [];
  for (let i = 0; i < n; i++) us.push(g.addUnit(kind, team, v.x - 4 - (i % 3) * 0.5, v.y + (i / 3 | 0) * 0.5));
  return us;
}
const clearGround = (g, v) => { /* make sure attackers can reach: units just walk to v */ };

test('pillage: footmen attack a hamlet until protection hits zero; it submits to the attacker', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false });
  const v = g.villages.find((x) => x.kind === 'hamlet') || g.villages[0];
  const us = armyAt(g, v, 'footman', 6);
  g.applyIntent({ type: 'attack', team: PLAYER, ids: us.map((u) => u.id), targetId: v.id });
  run(g, 60);
  assert.equal(v.owner, PLAYER, `owner ${v.owner}, protection ${v.protection}`);
});

test('spy: infiltrating an independent village raises loyalty until it turns (and the spy can still be caught)', () => {
  let turned = 0, caught = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const g = new Game({ seed, houses: 3, ai: false });
    const v = g.villages.find((x) => x.kind === 'hamlet');
    const spy = g.addUnit('spy', PLAYER, v.x - 3, v.y + 3);
    g.applyIntent({ type: 'infiltrate', team: PLAYER, ids: [spy.id], villageId: v.id });
    run(g, 90);
    if (v.owner === PLAYER) turned++; else if (spy.hp <= 0) caught++;
  }
  assert.ok(turned >= 5, `turned ${turned}, caught ${caught}`);
  assert.ok(turned + caught >= 12);
});

test('castle influence: a keep next to a village slowly turns it without a sack', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false });
  const v = g.villages[0];
  const k = g.addBuilding('keep', PLAYER, Math.round(v.x) - 8, Math.round(v.y) - 2, true);
  g.recomputeWalk();
  run(g, 120);
  assert.equal(v.owner, PLAYER, `loyalty ${v.loyalty}`);
  const before = g.players[PLAYER].gold + g.players[PLAYER].food + g.players[PLAYER].wood;
  run(g, 30);
  assert.ok(g.players[PLAYER].gold + g.players[PLAYER].food + g.players[PLAYER].wood > before, 'owned village should pay tribute');
});

test('loyalty decays when the lord has no influence nearby', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false });
  const v = g.villages[0];
  v.owner = PLAYER; v.loyalty = 60;
  run(g, 300);
  assert.equal(v.owner, -1, 'village should slip away');
});

test('trade: needs market + trade relation; gives a worse-than-1:1 rate', () => {
  const g = new Game({ seed: 9, houses: 3, ai: false });
  const hall = g.seatOf(PLAYER);
  g.players[PLAYER].wood = 400;
  g.addBuilding('market', PLAYER, hall.tx + 5, hall.ty, true);
  g.recomputeWalk();
  assert.equal(g.tradePartners(PLAYER).filter((p) => p.type === 'house').length, 0);
  g.proposeRelation(PLAYER, 1, 'trade');
  const partner = g.tradePartners(PLAYER).find((p) => p.type === 'house');
  assert.ok(partner);
  const gold0 = g.players[PLAYER].gold;
  const q = g.applyIntent({ type: 'trade', team: PLAYER, partner: { type: 'house', id: 1 }, give: 'wood', get: 'gold', amount: 100 });
  assert.ok(q && q.got > 0 && q.got < 50, `got ${q?.got}`);
  assert.equal(g.players[PLAYER].gold, gold0 + q.got);
});

test('war: attacking a house at peace declares war; destroying hall+keep eliminates it', () => {
  const g = new Game({ seed: 4, houses: 3, ai: false });
  const hall = g.seatOf(1);
  assert.equal(g.rel[PLAYER][1], 'peace');
  const rams = armyAt(g, hall, 'ram', 4);
  rams.forEach((u) => { u.x = hall.x - 5; u.y = hall.y; });
  g.applyIntent({ type: 'attack', team: PLAYER, ids: rams.map((u) => u.id), targetId: hall.id });
  assert.equal(g.rel[PLAYER][1], 'war');
  run(g, 120);
  assert.equal(g.players[1].alive, false);
  assert.equal(g.units.filter((u) => u.team === 1).length, 0);
});

test('AI: rivals expand from a bare hall (serfs, cottages, barracks, keep) within 8 minutes', () => {
  const g = new Game({ seed: 21, houses: 4 });
  g.units = g.units.filter((u) => u.team !== PLAYER);
  run(g, 480, 0.2);
  for (let t = 1; t < 4; t++) {
    if (!g.players[t].alive) continue;
    const kinds = new Set(g.buildings.filter((b) => b.team === t).map((b) => b.kind));
    assert.ok(kinds.has('cottage') && kinds.has('barracks'), `team ${t} built ${[...kinds]}`);
    assert.ok(g.units.filter((u) => u.team === t).length >= 6, `team ${t} units ${g.units.filter((u) => u.team === t).length}`);
  }
  assert.ok([1, 2, 3].some((t) => g.hasBuilding(t, 'keep')), 'nobody raised a keep');
});

test('AI: an idle player can be beaten - match ends in defeat within 30 min of game time', () => {
  const g = new Game({ seed: 8, houses: 3 });
  run(g, 1800, 0.25);
  assert.ok(g.outcome, 'match never ended');
  assert.equal(g.outcome.result, 'defeat');
});

test('victory: last house standing wins', () => {
  const g = new Game({ seed: 2, houses: 3, ai: false });
  g.eliminate(1); g.eliminate(2);
  g.tick(0.1);
  assert.equal(g.outcome.result, 'victory');
});

test('fog: starts dim-but-unknown; own sight reveals; fog off reveals everything', () => {
  const g = new Game({ seed: 2, houses: 3 });
  const far = g.seatOf(1);
  assert.equal(g.canSee(PLAYER, far.x, far.y), false);
  const hall = g.seatOf(PLAYER);
  assert.equal(g.canSee(PLAYER, hall.x, hall.y), true);
  const g2 = new Game({ seed: 2, houses: 3, fog: false });
  assert.equal(g2.canSee(PLAYER, far.x, far.y), true);
});

test('snapshot is JSON-serialisable (host -> client)', () => {
  const g = new Game({ seed: 2, houses: 4 });
  run(g, 5);
  assert.ok(JSON.stringify(g.snapshot()).length > 200);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
