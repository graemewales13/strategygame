// Headless sim tests: `npm test` or `node test/sim.test.js`. No dependencies.
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { PLAYER, UNITS, INFLUENCE_HOME, VILLAGE_WIN_SHARE } from '../js/config.js';

// Deterministic runs: the sim uses Math.random for spawn jitter and spy catches.
let _s = 12345;
Math.random = () => { _s = (_s + 0x6d2b79f5) >>> 0; let t = _s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const run = (g, secs, dt = 0.1) => { for (let t = 0; t < secs; t += dt) g.tick(dt); };

// helpers for the market / caravan tests
const placeNear = (g, team, kind, r0 = 5) => {
  const h = g.seatOf(team), size = { market: 3, mine: 2, warehouse: 3, foundry: 3, cottage: 2 }[kind] || 3;
  for (let r = r0; r < 17; r++) for (let a = 0; a < 90; a++) {
    const an = (a / 90) * 6.283, tx = Math.round(h.x + Math.cos(an) * r - size / 2), ty = Math.round(h.y + Math.sin(an) * r - size / 2);
    let ok = tx > 1 && ty > 1 && tx + size < g.W - 1 && ty + size < g.H - 1;
    for (let y = ty; ok && y < ty + size; y++) for (let x = tx; x < tx + size; x++) if (g.block[y * g.W + x] || g.resAt[y * g.W + x] >= 0 || g.terrain[y * g.W + x] === 2 || g.terrain[y * g.W + x] === 3) ok = false;
    if (ok) { const b = g.addBuilding(kind, team, tx, ty, true); g.recomputeWalk(); return b; }
  }
  throw new Error('no spot for ' + kind);
};

test('map: every start, village and resource node is reachable from every start (30 seeds x 3/4/5 houses)', () => {
  for (const houses of [3, 4, 5]) for (let seed = 1; seed <= 30; seed++) {
    const g = new Game({ seed, houses });
    const s0 = g.map.starts[0];
    for (const [sx, sy] of g.map.starts) assert.ok(g.findPath(s0[0] + 1, s0[1] + 3, sx + 1, sy + 3), `seed ${seed}/${houses}: start unreachable`);
    for (const v of g.villages) assert.ok(g.findPath(s0[0] + 1, s0[1] + 3, v.tx + 1, v.ty + 1), `seed ${seed}/${houses}: village ${v.name} unreachable`);
    assert.ok(g.villages.length >= 8, `seed ${seed}: only ${g.villages.length} villages`);
    let bad = 0;
    for (const n of g.resources) if (!g.findPath(s0[0] + 1, s0[1] + 3, n.x, n.y)) bad++;
    assert.equal(bad, 0, `seed ${seed}/${houses}: ${bad} unreachable resource nodes`);
  }
});

test('start: a home village of 30, three serfs on walkable tiles, no buildings, no army', () => {
  const g = new Game({ seed: 7, houses: 4 });
  for (let t = 0; t < 4; t++) {
    assert.equal(g.buildings.filter((b) => b.team === t).length, 0);
    const hv = g.villages.filter((v) => v.home === t && v.owner === t);
    assert.equal(hv.length, 1); assert.equal(Math.round(hv[0].pop), 30);
    const us = g.units.filter((u) => u.team === t);
    assert.equal(us.length, 3);
    for (const u of us) { assert.equal(u.kind, 'serf'); assert.ok(g.walk[Math.floor(u.y) * g.W + Math.floor(u.x)], 'serf spawned on blocked tile'); }
  }
  assert.ok(g.map.starts.length >= 4);
});

test('villages: others independent at start, not next to a home village', () => {
  const g = new Game({ seed: 11, houses: 5 });
  for (const v of g.villages) {
    if (v.home >= 0) continue;
    assert.equal(v.owner, -1);
    for (const h of g.villages) if (h.home >= 0) assert.ok(Math.hypot(v.x - h.x, v.y - h.y) > 20, 'village too close to a home');
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

test('building: place a cottage, serfs raise it, population cap grows; far ground is open once scouted', () => {
  const g = new Game({ seed: 3, houses: 3, ai: false });
  const hall = g.seatOf(PLAYER);
  g.players[PLAYER].wood = 900; g.players[PLAYER].gold = 500;
  assert.equal(g.canPlace(PLAYER, 'cottage', hall.tx + 6, hall.ty).ok, false, 'cottage is locked until a market stands');
  placeNear(g, PLAYER, 'market', 6);
  const cap0 = g.popCap(PLAYER);
  let placed = null;
  for (let r = 4; r < 10 && !placed; r++) for (let a = 0; a < 12 && !placed; a++) placed = g.applyIntent({ type: 'place', team: PLAYER, kind: 'cottage', tx: Math.round(hall.x + Math.cos(a / 2) * r), ty: Math.round(hall.y + Math.sin(a / 2) * r) });
  assert.ok(placed, 'could not place');
  run(g, 40);
  assert.equal(placed.built, 1);
  assert.equal(g.popCap(PLAYER), cap0 + 5);
  assert.equal(g.canPlace(PLAYER, 'cottage', hall.tx + 40, hall.ty).ok, false, 'unscouted ground is closed');
  g.seen[PLAYER].fill(1);
  const far = (() => { for (let y = 0; y < g.H - 2; y++) for (let x = 2; x < g.W - 6; x++) if (Math.hypot(x - hall.tx, y - hall.ty) > 30) { const r = g.canPlace(PLAYER, 'cottage', x, y); if (r.ok) return r; } return null; })();
  assert.ok(far, 'scouted ground 30+ tiles from the hall is open (no territory circle)');
});

test('training: serf from the keep respects cost and population', () => {
  const g = new Game({ seed: 3, houses: 3, ai: false });
  const hall = placeNear(g, PLAYER, 'keep', 6);
  g.players[PLAYER].food = 1000;
  let ok = 0;
  for (let i = 0; i < 10; i++) if (g.applyIntent({ type: 'train', team: PLAYER, buildingId: hall.id, kind: 'serf' })) ok++;
  assert.ok(ok >= 3 && ok <= g.popCap(PLAYER) - 3, `serfs trained within cap ${g.popCap(PLAYER)}: ${ok}`);
  run(g, 20);
  assert.ok(g.units.filter((u) => u.team === PLAYER).length >= 3);
  assert.equal(g.train(PLAYER, hall.id, 'knight'), null, 'keep must not train knights');
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
  assert.ok(turned >= 3 && caught >= 1, `turned ${turned}, caught ${caught}`);
  console.log(`        (spy outcomes over 12 villages: turned ${turned}, caught ${caught})`);
});

test('castle influence: a keep next to a village slowly turns it without a sack', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false });
  const v = g.villages[0];
  const k = g.addBuilding('keep', PLAYER, Math.round(v.x) - 8, Math.round(v.y) - 2, true);
  g.recomputeWalk();
  run(g, 360);
  assert.equal(v.owner, PLAYER, `loyalty ${v.loyalty}`);
  const before = g.players[PLAYER].gold + g.players[PLAYER].food + g.players[PLAYER].wood;
  run(g, 30);
  assert.ok(g.players[PLAYER].gold + g.players[PLAYER].food + g.players[PLAYER].wood > before, 'owned village should pay tribute');
});

test('loyalty decays when the lord has no influence nearby', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false });
  const seat = g.seatOf(PLAYER), v = g.villages.filter((x) => !x.founded).sort((a, b) => Math.hypot(b.x - seat.x, b.y - seat.y) - Math.hypot(a.x - seat.x, a.y - seat.y))[0];
  v.owner = PLAYER; v.loyalty = 60;
  run(g, 1000, 0.5);
  assert.equal(v.owner, -1, 'village should slip away');
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

test('AI: rivals expand from a bare hall (serfs, cottages, barracks, keep) within 9 minutes', () => {
  const g = new Game({ seed: 21, houses: 4 });
  g.units = g.units.filter((u) => u.team !== PLAYER);
  run(g, 540, 0.2);
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


test('deposits: every hall has stone near and metals exist; mines need a deposit', () => {
  const g = new Game({ seed: 5, houses: 4, ai: false });
  for (const kind of ['stone', 'copper', 'iron', 'coal', 'silver']) assert.ok(g.resources.some((n) => n.kind === kind), `no ${kind}`);
  const hall = g.seatOf(PLAYER);
  assert.ok(g.resources.some((n) => n.kind === 'stone' && Math.hypot(n.x - hall.x, n.y - hall.y) < 17), 'no stone near hall');
  g.players[PLAYER].wood = 500; g.players[PLAYER].gold = 200;
  assert.equal(g.canPlace(PLAYER, 'mine', hall.tx + 6, hall.ty).ok, false);
});

test('mining: a mine on a deposit, serfs assigned, ore reaches the stockpile; max 4 diggers', () => {
  const g = new Game({ seed: 5, houses: 4, ai: false }); g.tick(0.1); g.seen[PLAYER].fill(1);
  const hall = g.seatOf(PLAYER), p = g.players[PLAYER];
  p.wood = 500; p.gold = 200;
  const node = g.resources.filter((n) => n.kind === 'stone' && Math.hypot(n.x - hall.x, n.y - hall.y) < 16).sort((a, c) => Math.hypot(a.x - hall.x, a.y - hall.y) - Math.hypot(c.x - hall.x, c.y - hall.y))[0];
  assert.ok(node);
  const mine = g.applyIntent({ type: 'place', team: PLAYER, kind: 'mine', tx: 0, ty: 0, nodeId: node.id });
  assert.ok(mine && mine.kind === 'mine' && mine.nodeIds.includes(node.id));
  for (let i = 0; i < 3; i++) g.addUnit('serf', PLAYER, hall.x + i, hall.y + 3);
  const serfs = g.units.filter((u) => u.team === PLAYER && u.kind === 'serf');
  g.applyIntent({ type: 'mine', team: PLAYER, ids: serfs.map((u) => u.id), buildingId: mine.id });
  for (let i = 0; i < 60 * 10; i++) g.tick(0.1);
  assert.ok(mine.built >= 1, 'mine unfinished');
  assert.ok(p.stone > 20, `stone ${p.stone}`);
  assert.ok(g.minersOf(mine) >= 3 - 0, 'miners ' + g.minersOf(mine));
  for (let i = 0; i < 4; i++) g.addUnit('serf', PLAYER, hall.x + i, hall.y + 4);
  const more = g.units.filter((u) => u.team === PLAYER && u.kind === 'serf');
  g.cmdMine(more, mine);
  assert.ok(g.minersOf(mine) <= 4);
});

test('treaty: unmet houses cannot treaty; AI grants at once; human target gets an offer; peace cancels', () => {
  const g = new Game({ seed: 9, houses: 3, ai: false });
  assert.equal(g.proposeRelation(PLAYER, 1, 'trade'), false);
  g.meet(PLAYER, 1);
  assert.equal(g.proposeRelation(PLAYER, 1, 'trade'), true);
  assert.equal(g.rel[PLAYER][1], 'trade');
  g.proposeRelation(PLAYER, 1, 'peace');
  assert.equal(g.rel[PLAYER][1], 'peace');
  // AI -> human offer (human side must accept)
  g.players[PLAYER].ai = false; g.players[1].ai = true;
  assert.equal(g.proposeRelation(1, PLAYER, 'trade'), 'pending');
  assert.equal(g.rel[PLAYER][1], 'peace');
  g.applyIntent({ type: 'respond', team: PLAYER, from: 1, accept: true });
  assert.equal(g.rel[PLAYER][1], 'trade');
});

test('auto use: foundry smelts steel, forge turns steel into arms, academy turns silver into science, ware pleases a village', () => {
  const g = new Game({ seed: 11, houses: 3, ai: false });
  const h = g.seatOf(0), p = g.players[0];
  g.addBuilding('foundry', 0, h.tx + 5, h.ty, true); g.addBuilding('forge', 0, h.tx - 5, h.ty, true); g.addBuilding('academy', 0, h.tx, h.ty - 5, true); g.recomputeWalk();
  p.iron = 8; p.coal = 4; p.silver = 6; p.copper = 2;
  for (let i = 0; i < 60 * 10; i++) g.tick(0.1);
  assert.ok(p.steel >= 2 || p.arms >= 1, `steel ${p.steel} arms ${p.arms}`);
  p.steel = 6; p.silver = 6;
  for (let i = 0; i < 40 * 10; i++) g.tick(0.1);
  assert.ok(p.arms >= 1, 'arms level');
  assert.ok(p.sci >= 1, 'science level');
  const v = g.villages[0]; v.owner = 0; v.loyalty = 60; v.protection = v.maxProtection;
  g.addBuilding('tavern', 0, Math.floor(v.x) - 3, Math.floor(v.y) - 6, true); p.ware = 2;
  g.updateEconomy(0.1);
  assert.ok(v.joyT > 0 && p.ware === 1, 'village should be content');
});

test('AI: rivals dig stone and ore and raise tents/foundries', () => {
  const g = new Game({ seed: 21, houses: 4 });
  g.units = g.units.filter((u) => u.team !== PLAYER);
  for (let i = 0; i < 320 * 5; i++) g.tick(0.2);
  const ai = [1, 2, 3].filter((t) => g.buildings.some((b) => b.team === t && b.kind === 'mine' && b.built >= 1));
  assert.ok(ai.length >= 2, `only ${ai.length} AI houses mined`);
  assert.ok([1, 2, 3].some((t) => g.players[t].stone > 5 || g.hasBuilding(t, 'keep')), 'no stone economy');
});


test('garrison: right-click own keep sends units inside; they vanish, heal, and leave again', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false });
  const hall = placeNear(g, PLAYER, 'keep', 6);
  const serfs = g.units.filter((u) => u.team === PLAYER && u.kind === 'serf');
  serfs[0].hp = 10;
  g.applyIntent({ type: 'context', team: PLAYER, ids: serfs.map((u) => u.id), x: hall.x, y: hall.y });
  assert.equal(serfs[0].task.type, 'enter');
  run(g, 12);
  assert.ok(serfs.every((u) => u.inside === hall.id), 'inside');
  assert.equal(hall.garrison.length, 3);
  assert.ok(serfs[0].hp > 10, 'healed');
  assert.equal(g.unitAt(hall.x, hall.y, 3), null, 'hidden from picking');
  g.applyIntent({ type: 'leave', team: PLAYER, buildingId: hall.id });
  assert.ok(serfs.every((u) => !u.inside) && hall.garrison.length === 0);
  // capacity
  for (let i = 0; i < 10; i++) g.addUnit('footman', PLAYER, hall.x + 2, hall.y + 3);
  const fs = g.units.filter((u) => u.kind === 'footman' && u.team === PLAYER);
  g.cmdEnter(fs, hall); run(g, 15);
  assert.equal(hall.garrison.length, 8, 'keep holds 8');
});

test('village garrison: own village can be entered; sack is harder; lost village ejects them', () => {
  const g = new Game({ seed: 9, houses: 3, ai: false });
  const v = g.villages.find((x) => x.kind === 'hamlet'); v.owner = PLAYER; v.loyalty = 70;
  const us = [0, 1, 2].map((i) => g.addUnit('footman', PLAYER, v.x - 3, v.y + i * 0.5));
  g.applyIntent({ type: 'context', team: PLAYER, ids: us.map((u) => u.id), x: v.x, y: v.y });
  run(g, 10);
  assert.equal(v.garrison.length, 3);
  const p0 = v.protection; g.hitVillage(g.addUnit('footman', 1, v.x, v.y + 4), v, 10, UNITS.footman);
  assert.ok(p0 - v.protection < 7, 'garrison softens a sack');
  g.submit(v, 1, 'pillage');
  assert.ok(us.every((u) => !u.inside), 'ejected');
});

test('build queue: a serf raises several buildings in turn', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false });
  const hall = g.seatOf(PLAYER), p = g.players[PLAYER]; p.wood = 600; placeNear(g, PLAYER, 'market', 7);
  const serf = g.units.find((u) => u.team === PLAYER && u.kind === 'serf');
  const spots = [];
  for (let r = 4; r < 14 && spots.length < 3; r++) for (let a = 0; a < 60 && spots.length < 3; a++) { const tx = Math.round(hall.x + Math.cos(a / 60 * 6.283) * r - 1), ty = Math.round(hall.y + Math.sin(a / 60 * 6.283) * r - 1); if (g.canPlace(PLAYER, 'cottage', tx, ty).ok && !spots.some(([x, y]) => Math.hypot(x - tx, y - ty) < 4)) spots.push([tx, ty]); }
  const bs = spots.map(([tx, ty]) => g.applyIntent({ type: 'place', team: PLAYER, kind: 'cottage', tx, ty, ids: [serf.id] }));
  assert.ok(bs.every(Boolean));
  assert.ok(serf.buildQ.length >= 1, 'queued');
  run(g, 120);
  assert.ok(bs.every((b) => b.built >= 1), 'all built by one serf: ' + bs.map((b) => b.built.toFixed(2)));
});

test('tavern: roster of random wanderers; hiring spends gold and adds a recruit with traits', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false });
  const hall = g.seatOf(PLAYER), p = g.players[PLAYER]; p.gold = 300; p.food = 300;
  const tv = g.addBuilding('tavern', PLAYER, hall.tx + 5, hall.ty, true); g.recomputeWalk();
  g.addBuilding('cottage', PLAYER, hall.tx - 5, hall.ty, true);
  run(g, 1);
  assert.equal(tv.roster.length, 3);
  const w = tv.roster[1], gold0 = p.gold;
  const u = g.applyIntent({ type: 'hire', team: PLAYER, buildingId: tv.id, index: 1 });
  assert.ok(u && u.kind === 'recruit' && u.name === w.name && u.trait === w.trait);
  assert.equal(p.gold, gold0 - w.cost.gold);
  assert.notEqual(tv.roster[1], w, 'slot refreshed');
});

test('keep: levy draws villagers in; drill turns recruits and serfs into soldiers; restrictions hold', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false });
  const hall = g.seatOf(PLAYER), p = g.players[PLAYER]; p.gold = 500; p.food = 500; p.wood = 500;
  const keep = g.addBuilding('keep', PLAYER, hall.tx + 5, hall.ty, true);
  g.addBuilding('cottage', PLAYER, hall.tx - 5, hall.ty, true); g.addBuilding('cottage', PLAYER, hall.tx - 5, hall.ty + 4, true); g.recomputeWalk();
  const v = g.villages[0]; v.owner = PLAYER; v.loyalty = 70;
  assert.equal(g.applyIntent({ type: 'levy', team: PLAYER, buildingId: keep.id, villageId: v.id }), true);
  run(g, 55);
  assert.ok(keep.garrison.length >= 2, 'levied ' + keep.garrison.length);
  const rec = g.byId.get(keep.garrison[0]); assert.equal(rec.kind, 'recruit');
  assert.equal(g.applyIntent({ type: 'drill', team: PLAYER, buildingId: keep.id, unitId: rec.id, kind: 'bowman' }), true);
  run(g, 14);
  assert.equal(rec.kind, 'bowman'); assert.ok(rec.speed > 0);
  // a footman cannot be drilled again, and soldiers can build but not gather
  assert.equal(g.drill(PLAYER, keep.id, rec.id, 'knight'), false);
  const b = g.addBuilding('cottage', PLAYER, hall.tx, hall.ty - 6, false);
  rec.inside = null; rec.task = { type: 'idle' };
  g.cmdBuild([rec], b); assert.equal(rec.task.type, 'build', 'soldiers raise buildings (slowly)');
  const tree = g.resources.find((n) => n.kind === 'tree'); g.cmdGather([rec], tree); assert.notEqual(rec.task.type, 'gather');
  // a serf can be drilled into a footman
  const s = g.units.find((u) => u.team === PLAYER && u.kind === 'serf');
  g.cmdEnter([s], keep); run(g, 15);
  assert.equal(s.inside, keep.id);
  assert.equal(g.drill(PLAYER, keep.id, s.id, 'footman'), true); run(g, 12);
  assert.equal(s.kind, 'footman');
});


test('market shelf: stocked only from nearby suppliers (mine -> its ore, foundry -> steel/ware, warehouse -> anything)', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false });
  const p = g.players[PLAYER]; p.iron = 80; p.copper = 80; p.steel = 40; p.stone = 80;
  const mk = placeNear(g, PLAYER, 'market');
  run(g, 5);
  assert.ok(!mk.stock || !(mk.stock.iron > 0), 'no supplier, no stock');
  const node = g.resources.find((n) => n.kind === 'iron' || n.kind === 'copper' || n.kind === 'stone');
  const m = g.addBuilding('mine', PLAYER, mk.tx + 4, mk.ty, true); m.ore = 'iron'; m.nodeIds = [];
  run(g, 20);
  assert.ok(mk.stock.iron >= 20, 'iron from the iron mine: ' + mk.stock.iron);
  assert.ok(!(mk.stock.copper > 0), 'copper not supplied');
  placeNear(g, PLAYER, 'warehouse');
  run(g, 20);
  assert.ok(mk.stock.copper > 5 && mk.stock.stone > 5, 'a warehouse supplies anything');
  assert.ok(mk.stock.iron <= 100.01);
});

test('mines: gold deposits can be mined too', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false }); g.tick(0.1); g.seen[PLAYER].fill(1);
  const h = g.seatOf(PLAYER), p = g.players[PLAYER]; p.wood = 500; p.gold = 100;
  const node = g.resources.filter((n) => n.kind === 'gold').sort((a, c) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(c.x - h.x, c.y - h.y))[0];
  g.addBuilding('cottage', PLAYER, h.tx - 6, h.ty, true);
  const sp = g.mineSpot(PLAYER, node);
  assert.ok(sp, 'a mine fits on gold');
  const mine = g.place(PLAYER, 'mine', sp[0], sp[1], null, node.id);
  assert.ok(mine && mine.ore === 'gold');
  const serf = g.units.find((u) => u.team === PLAYER && u.kind === 'serf');
  g.cmdMine([serf], mine);
  const g0 = p.gold; run(g, 120);
  assert.ok(p.gold > g0 + 5, 'gold mined: ' + (p.gold - g0));
});

test('caravan: camel loads at the home market, trades at a treaty partner market, returns and unloads', () => {
  const g = new Game({ seed: 9, houses: 3, ai: false });
  const a = g.players[0], b = g.players[1];
  const ma = placeNear(g, 0, 'market'), mb = placeNear(g, 1, 'market');
  ma.stock = { iron: 50 }; mb.stock = { coal: 50 };
  g.addBuilding('cottage', 0, g.seatOf(0).tx - 5, g.seatOf(0).ty, true); g.recomputeWalk();
  const camel = g.addUnit('camel', 0, ma.x + 2.5, ma.y + 2.5);
  assert.equal(g.applyIntent({ type: 'load', team: 0, unitId: camel.id, good: 'iron', amount: 30 }), true);
  assert.equal(camel.cargo.iron, 30); assert.equal(ma.stock.iron, 20);
  // no treaty: refused, camel stays put
  g.meet(0, 1);
  const send = () => g.applyIntent({ type: 'context', team: 0, ids: [camel.id], x: mb.x, y: mb.y, want: 'coal' });
  send(); assert.notEqual(camel.task.type, 'caravan', 'no treaty');
  g.proposeRelation(0, 1, 'trade'); assert.equal(g.rel[0][1], 'trade');
  const iron1 = b.iron || 0, coal0 = a.coal;
  send(); assert.equal(camel.task.type, 'caravan');
  run(g, 400);
  g.applyIntent({ type: 'stoproute', team: 0, ids: [camel.id] }); run(g, 150);
  assert.equal(camel.task.type, 'idle', 'back home');
  assert.ok(a.coal > coal0 + 10 && a.coal < 45, `coal in our stockpile: ${a.coal}`);
  assert.ok(b.iron > iron1 + 3, `their stockpile got the iron (${b.iron})`);
  assert.ok(mb.stock.coal < 45, 'their shelf paid out');
  assert.equal(g.cargoTotal(camel), 0);
  // war stops it
  g.setRelation(0, 1, 'war');
  camel.task = { type: 'idle' }; send(); assert.notEqual(camel.task.type, 'caravan', 'war');
});

test('caravan: independent mining villages sell ore; coal for coin; capacity and stock limits hold', () => {
  const g = new Game({ seed: 9, houses: 3, ai: false });
  const mk = placeNear(g, 0, 'market'); g.addBuilding('cottage', 0, g.seatOf(0).tx - 5, g.seatOf(0).ty, true);
  const v = g.villages.find((x) => x.kind === 'mine'), p = g.players[0];
  v.owner = -1; v.stores.iron = 20;
  const camel = g.addUnit('camel', 0, mk.x + 2.5, mk.y + 2.5);
  mk.stock = { gold: 60 };
  g.load(0, camel.id, 'gold', 60);
  assert.equal(g.cargoTotal(camel), 40, 'capped at 40');
  assert.equal(g.cmdCaravan([camel], v, 'iron'), true);
  run(g, 600);
  assert.ok(p.iron >= 5 && p.iron <= 25, 'bought iron: ' + p.iron);
  assert.ok(v.stores.gold > 90 - 1, 'village got coin');
});

test('orders: any soldier or serf can attack a building by right-click; camels cannot; recruits become spies', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false }); g.fogOn = false;
  const e = placeNear(g, 1, 'keep'), us = [g.addUnit('serf', 0, e.x - 5, e.y), g.addUnit('serf', 0, e.x - 5, e.y + 1), g.addUnit('camel', 0, e.x - 5, e.y + 2), g.addUnit('recruit', 0, e.x - 5, e.y + 3)];
  g.applyIntent({ type: 'context', team: 0, ids: us.map((u) => u.id), x: e.x, y: e.y });
  assert.deepEqual(us.map((u) => u.task.type), ['attack', 'attack', 'move', 'attack']);
  const r = us[3]; g.players[0].gold = 100;
  assert.equal(g.applyIntent({ type: 'role', team: 0, ids: [r.id], role: 'spy' }), true);
  assert.equal(r.kind, 'spy'); assert.equal(g.players[0].gold, 100 - 25);
  const v = g.villages.find((x) => x.owner < 0);
  g.applyIntent({ type: 'context', team: 0, ids: [r.id], x: v.x, y: v.y });
  assert.equal(r.task.type, 'infiltrate');
});

test('caravan: if the home market falls the camel still brings its goods to the hall; a lost destination sends it home laden', () => {
  const g = new Game({ seed: 9, houses: 3, ai: false, fog: false });
  const p = g.players[0], mk = placeNear(g, 0, 'market'), far = placeNear(g, 1, 'market'); g.rel[0][1] = g.rel[1][0] = 'trade'; g.known[0][1] = g.known[1][0] = 1;
  mk.stock = { iron: 40 }; far.stock = { gold: 40 };
  const c1 = g.addUnit('camel', 0, mk.x + 2.5, mk.y + 2.5);
  g.load(0, c1.id, 'iron', 30); assert.equal(g.cmdCaravan([c1], far, 'gold'), true);
  for (let i = 0; i < 20; i++) g.tick(0.1);
  far.hp = 0; run(g, 300);   // destination razed before arrival
  assert.equal(c1.task.type, 'idle', 'camel ends idle'); assert.ok(g.cargoTotal(c1) === 0 || p.iron > 0, 'goods came home');
  const c2 = g.addUnit('camel', 0, mk.x + 2.5, mk.y + 2.5); mk.stock = { iron: 40 }; g.load(0, c2.id, 'iron', 30);
  const before = p.iron; g.cmdMove([c2], mk.x + 12, mk.y); run(g, 5); mk.hp = 0; mk.team = -1;
  g.units.splice(g.units.indexOf(c2), 1, c2);
  c2.task = { type: 'caravan', targetId: g.seatOf(0).id, stage: 'home' }; g.setPathToEntity(c2, g.seatOf(0)); run(g, 120);
  assert.ok(p.iron >= before + 29, 'cargo unloaded at the hall: ' + p.iron + ' vs ' + before);
});

test('rules: soldiers in a keep sway villages; a keep with no guard pulls far less', () => {
  const g = new Game({ seed: 4, houses: 3, ai: false, fog: false });
  const v = g.villages.find((x) => x.owner < 0), k = g.addBuilding('keep', 0, Math.round(v.x) - 8, Math.round(v.y) - 2, true);
  const bare = g.pullsFor(v)[0];
  for (let i = 0; i < 4; i++) { const u = g.addUnit('footman', 0, k.x + 1, k.y + 3); g.cmdEnter([u], k); }
  run(g, 20);
  assert.equal(k.garrison.length, 4, 'four footmen inside');
  const guarded = g.pullsFor(v)[0];
  assert.ok(guarded > bare * 2, `guarded ${guarded.toFixed(3)} vs bare ${bare.toFixed(3)}`);
});

test('rules: ore dug far from any store is hauled at a loss; a warehouse beside the mine restores it', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false, fog: false });
  const h = g.seatOf(0), far = g.resources.filter((n) => n.kind === 'iron' && Math.hypot(n.x - h.x, n.y - h.y) > 45).sort((a, c) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(c.x - h.x, c.y - h.y))[0];
  assert.ok(far, 'a distant iron seam exists');
  g.players[0].wood = 2000; g.players[0].gold = 500;
  const mine = g.place(0, 'mine', 0, 0, null, far.id);
  assert.ok(mine, 'remote mines can be raised (no territory circle)');
  mine.built = 1;
  assert.ok(g.haulOf(mine) < 0.8, 'remote yield ' + g.haulOf(mine).toFixed(2));
  g.addBuilding('warehouse', 0, mine.tx + 3, mine.ty, true); mine._haulT = undefined;
  assert.equal(g.haulOf(mine), 1);
});

test('rules: a market earns from the cottages and villages around it', () => {
  const g = new Game({ seed: 3, houses: 3, ai: false, fog: false });
  const mk = placeNear(g, 0, 'market'), alone = g.consumerIncome(mk);
  for (let i = 0; i < 5; i++) g.addBuilding('cottage', 0, Math.round(mk.x) - 10 + i * 3, Math.round(mk.y) + 6, true);
  assert.ok(g.consumerIncome(mk) > alone + 0.3, `with customers ${g.consumerIncome(mk).toFixed(2)} vs ${alone.toFixed(2)}`);
});

function guardedKeepBeside(g, team, v) {
  const k = g.addBuilding('keep', team, Math.round(v.x) - 8, Math.round(v.y) - 2, true);
  for (let i = 0; i < 4; i++) { const u = g.addUnit('footman', team, k.x + 1, k.y + 3); g.cmdEnter([u], k); }
  return k;
}
test('conquest: a manned castle beside an independent village brings it over by influence', () => {
  const g = new Game({ seed: 4, houses: 3, ai: false, fog: false });
  const v = g.villages.find((x) => x.owner < 0); v.loyalty = 20;
  guardedKeepBeside(g, 0, v);
  run(g, 120);
  assert.equal(v.owner, 0, `village loyalty ${v.loyalty.toFixed(0)}`);
});

test('conquest: the same castle also draws a village away from a rival house; a market near it adds pull', () => {
  const g = new Game({ seed: 4, houses: 3, ai: false, fog: false });
  const v = g.villages.find((x) => x.owner < 0); v.owner = 1; v.loyalty = 60;
  const before = g.pullsFor(v)[0];
  g.addBuilding('market', 0, Math.round(v.x) + 5, Math.round(v.y), true);
  assert.ok(g.pullsFor(v)[0] > before, 'a market sways the village');
  guardedKeepBeside(g, 0, v);
  run(g, 300);
  assert.equal(v.owner, 0, `rival village owner ${v.owner} loyalty ${v.loyalty.toFixed(0)}`);
});

test('conquest: soldiers can still take a village by force (rival-held too, which declares war)', () => {
  const g = new Game({ seed: 4, houses: 3, ai: false, fog: false });
  const v = g.villages.find((x) => x.owner < 0); v.owner = 1; v.loyalty = 100; g.seen[0].fill(1);
  const us = []; for (let i = 0; i < 8; i++) us.push(g.addUnit('footman', 0, v.x - 3, v.y + (i % 4)));
  g.applyIntent({ type: 'context', team: 0, ids: us.map((u) => u.id), x: v.x, y: v.y });
  assert.equal(g.rel[0][1], 'war');
  run(g, 240);
  assert.equal(v.owner, 0, 'taken by the sword, protection ' + v.protection.toFixed(0));
});

test('rule: serfs only gather on ground you rule; a warehouse or a held village extends it', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false, fog: false });
  const h = g.seatOf(0), far = g.resources.filter((n) => n.kind === 'tree' && Math.hypot(n.x - h.x, n.y - h.y) > 32).sort((a, c) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(c.x - h.x, c.y - h.y))[0];
  const s = g.addUnit('serf', 0, h.x + 2, h.y + 3);
  assert.equal(g.cmdGather([s], far), false, 'unruled timber refused');
  g.addBuilding('warehouse', 0, Math.round(far.x) - 3, Math.round(far.y), true);
  assert.equal(g.cmdGather([s], far), true, 'a warehouse beside it brings it into our rule');
});

test('terrain: seeds give five climates; rock and water never cut a hall off; halls stand on livable ground', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const g = new Game({ seed, houses: 5 });
    seen.add(g.biome);
    for (const [sx, sy] of g.map.starts) {
      for (let y = sy - 1; y <= sy + 3; y++) for (let x = sx - 1; x <= sx + 3; x++) assert.ok([0, 1, 4].includes(g.terrain[y * g.W + x]), `seed ${seed}: hall ground ${g.terrain[y * g.W + x]}`);
    }
    for (const n of g.resources) assert.ok(g.terrain[n.y * g.W + n.x] !== 6 && g.terrain[n.y * g.W + n.x] !== 2, 'node on rock or water');
  }
  assert.equal(seen.size, 5, `climates seen: ${[...seen]}`);
  const g = new Game({ seed: 5, houses: 3, ai: false });
  const rock = g.terrain.indexOf(6);
  assert.ok(rock >= 0, 'seed 5 has rock');
  g.seen[0].fill(1); g.players[0].wood = 999;
  assert.equal(g.canPlace(0, 'cottage', rock % g.W, (rock / g.W) | 0).ok, false, 'cannot build on rock');
  assert.equal(g.walk[rock], 0, 'rock is not walkable');
});

test('village population: fed villages grow, dry ones starve, held ones house folk and send settlers', () => {
  const g = new Game({ seed: 3, houses: 3, ai: false });
  const v = g.villages.find((x) => x.kind === 'hamlet') || g.villages[0];
  assert.ok(v.pop > 0 && v.pop <= v.popMax, 'starts with folk');
  const p0 = v.pop; v.pop = 3; v.stores.food = 60;
  for (let t = 0; t < 120; t += 0.5) g.tick(0.5);
  assert.ok(v.pop > 4, `a fed village grows (${v.pop})`);
  v.stores.food = 0; v.pop = 9;
  for (let t = 0; t < 150; t += 0.5) { v.stores.food = 0; g.tick(0.5); }
  assert.ok(v.pop < 9 && v.pop >= 2, `a dry village shrinks (${v.pop})`);
  // hold it: its folk raise the cap and settlers can be called
  v.owner = PLAYER; v.loyalty = 90; v.pop = 10; v.stores.food = 200;
  const cap = g.popCap(PLAYER);
  v.owner = -1; const capNo = g.popCap(PLAYER); v.owner = PLAYER;
  assert.equal(cap - capNo, 5, 'ten villagers house five');
  g.players[PLAYER].food = 100;
  const serfs = g.units.filter((u) => u.team === PLAYER && u.kind === 'serf').length;
  assert.equal(g.applyIntent({ type: 'settle', team: PLAYER, villageId: v.id }), true);
  assert.equal(g.units.filter((u) => u.team === PLAYER && u.kind === 'serf').length, serfs + 1);
  assert.ok(g.players[PLAYER].food <= 80.01, 'grain spent');
  v.owner = -1;
  assert.notEqual(g.applyIntent({ type: 'settle', team: PLAYER, villageId: v.id }), true, 'cannot call settlers from a village you do not hold');
});

test('village folk: a quarter muster when attacked and fall back after; wanderers walk to another village and carry word of their lord', () => {
  const g = new Game({ seed: 3, houses: 3, ai: false });
  const v = g.villages[0];
  v.pop = 16; v.hitT = 6;
  for (let t = 0; t < 4; t += 0.1) { v.hitT = 6; g.tick(0.1); }
  assert.equal(v.militia, 4, 'a quarter of 16 folk come out');
  v.hitT = 0;
  for (let t = 0; t < 4; t += 0.1) g.tick(0.1);
  assert.equal(v.militia, 0, 'they go back in');
  // wanderers
  const from = g.villages.find((x) => x !== v && g.villages.some((o) => o !== x && Math.hypot(o.x - x.x, o.y - x.y) < 55));
  from.owner = 1; from.pop = 12; from.wanderT = 0.1;
  const dest = g.villages.filter((o) => o !== from && Math.hypot(o.x - from.x, o.y - from.y) <= 62);
  dest.forEach((d) => { d.pop = 5; d.owner = -1; d.hitT = 0; });
  const before = dest.reduce((a, d) => a + d.pop, 0) + from.pop;
  g.tick(0.2);
  assert.equal(g.wanderers.length, 1, 'a family sets out');
  const w = g.wanderers[0], to = g.byId.get(w.to);
  assert.ok(w.n >= 1 && from.pop < 12, 'folk left home');
  from.wanderT = 1e9;
  for (let t = 0; t < 400 && g.wanderers.length; t += 0.25) g.tick(0.25);
  assert.equal(g.wanderers.length, 0, 'they arrive');
  assert.ok(to.owner === 1 || to.news?.some((q) => q.team === 1), 'and bring word of their lord (or the lord already holds it)');
  assert.ok(to.pop >= 5 + w.n - 0.5, 'population moved');
});

test('routes: a camel shuttles shelf goods to a village and brings back coin, repeatedly, until stopped', () => {
  const g = new Game({ seed: 9, houses: 3, ai: false });
  const mk = placeNear(g, 0, 'market'); g.addBuilding('cottage', 0, g.seatOf(0).tx - 5, g.seatOf(0).ty, true);
  const homes = g.villages.filter((x) => x.home >= 1);   // a village well clear of every rival home, so no rival influence turns it mid-test
  const cand = g.villages.filter((x) => !(x.home >= 0) && homes.every((h) => Math.hypot(h.x - x.x, h.y - x.y) > INFLUENCE_HOME.r));
  const score = (x) => { const m = { ...x.stores }; x.owner = -1; x.stores.gold = 90; x.stores.iron = 0; x.stores.coal = 0; const q = g.routeQuote(mk, x); x.stores = m; return q.profit || 0; };
  mk.stock = { iron: 60, coal: 30 };
  const v = cand.sort((a, b) => score(b) - score(a))[0], p = g.players[0];
  assert.ok(v, 'a quiet trading village');
  v.owner = -1; v.stores.gold = 90; v.stores.iron = 0; v.stores.coal = 0;
  mk.stock = { iron: 60, coal: 30 };
  const q = g.routeQuote(mk, v);
  assert.ok(q.n >= 4 && q.profit > 0, 'a profitable load exists: ' + JSON.stringify(q));
  assert.ok(!q.items.gold, 'never ships coin');
  const camel = g.addUnit('camel', 0, mk.x + 2.5, mk.y + 2.5);
  const g0 = p.gold;
  assert.equal(g.applyIntent({ type: 'route', team: 0, ids: [camel.id], targetId: v.id, want: 'gold' }), true);
  for (let i = 0; i < 9000 && p.trips < 2; i++) g.tick(0.1);   // two round trips, before rival influence can turn the village
  assert.ok(p.trips >= 2, 'several trips: ' + p.trips);
  assert.ok(p.gold > g0 + 20, 'coin earned: ' + (p.gold - g0));
  assert.ok(p.tradeEarned > 3 && camel.route.earned > 3, 'tracked ' + p.tradeEarned);
  assert.ok(mk.stock.iron < 60, 'shelf drawn down');
  g.applyIntent({ type: 'stoproute', team: 0, ids: [camel.id] });
  assert.equal(camel.route, null);
  assert.equal(g.standings()[0].money, Math.floor(p.gold));
});

test('names: every unit has a name from its people, unique within the house', () => {
  const g = new Game({ seed: 4, houses: 4, ai: false });
  for (let i = 0; i < 30; i++) g.addUnit('serf', 0, g.seatOf(0).x + 2, g.seatOf(0).y + 4);
  const us = g.units.filter((u) => u.team === 0);
  assert.ok(us.every((u) => u.name && u.name.includes(' ')), 'all named');
  assert.equal(new Set(us.map((u) => u.name)).size, us.length, 'unique');
  assert.notEqual(g.units.find((u) => u.team === 1).name.split(' ')[0], '', 'rivals named too');
});

test('wages: soldiers beyond the household cost coin; an empty purse breeds desertion and weak blows', () => {
  const g = new Game({ seed: 4, houses: 3, ai: false }); const p = g.players[0];
  for (let i = 0; i < 14; i++) g.addUnit('footman', 0, g.seatOf(0).x + 3, g.seatOf(0).y + 5);
  run(g, 2);
  assert.ok(Math.abs(p.wageRate - 10 * 0.05) < 0.001, 'ten paid soldiers: ' + p.wageRate);
  const g0 = p.spent; run(g, 60);
  assert.ok(p.spent - g0 >= 28 && p.spent - g0 <= 32, 'a minute of pay: ' + (p.spent - g0));
  p.gold = 0; run(g, 100);
  assert.ok(p.broke, 'broke');
  assert.ok(g.units.filter((u) => u.team === 0 && u.kind === 'footman').length < 14, 'deserters');
  assert.equal(g.units.filter((u) => u.team === 0 && u.kind === 'footman').length >= 4, true, 'the household guard stays');
});

test('selling: a market buys the stockpile; price sags with each sale and recovers', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false }); const p = g.players[0];
  const mk = placeNear(g, 0, 'market'); p.iron = 200;
  const first = g.sellPrice(mk, 'iron');
  const got = g.sellGoods(0, mk.id, 'iron', 60);
  assert.ok(got > 30 && p.iron === 140, 'sold 60 iron for ' + got);
  assert.ok(g.sellPrice(mk, 'iron') < first * 0.6, 'glut');
  assert.ok(p.inc && p.acc.sales > 0, 'booked as sales');
  run(g, 120);
  assert.ok(g.sellPrice(mk, 'iron') > first * 0.85, 'recovers');
  assert.equal(g.applyIntent({ type: 'sell', team: 0, marketId: mk.id, good: 'gold', amount: 5 }), false);
});

test('village: a founded village grows to 50, drafts serfs, miners and soldiers; soldiers can raise a keep', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false }); const p = g.players[0]; g.fogOn = false;
  p.wood = 2000; p.food = 2000; p.gold = 2000; p.stone = 300;
  const h = g.seatOf(0); placeNear(g, 0, 'keep', 7); g.addBuilding('cottage', 0, h.tx - 6, h.ty, true); g.addBuilding('cottage', 0, h.tx - 6, h.ty + 3, true); g.addBuilding('cottage', 0, h.tx - 6, h.ty + 6, true);
  let site = null;
  for (let r = 6; r < 18 && !site; r++) for (let a = 0; a < 60 && !site; a++) { const tx = Math.round(h.x + Math.cos(a / 60 * 6.283) * r - 1.5), ty = Math.round(h.y + Math.sin(a / 60 * 6.283) * r - 1.5); if (g.canPlace(0, 'village', tx, ty).ok) site = [tx, ty]; }
  assert.ok(site, 'a site');
  const b = g.place(0, 'village', site[0], site[1]);
  assert.ok(b, 'placed'); run(g, 70);
  const v = g.villages.find((x) => x.owner === 0 && x.founded && x.home !== 0);
  assert.ok(v, 'village founded'); assert.equal(v.popMax, 50); assert.ok(v.pop >= 4 && v.pop < 9, 'starts small: ' + v.pop);
  assert.ok(!g.buildings.includes(b), 'the site becomes the village');
  v.pop = 30; v.stores.food = 90;
  assert.equal(g.draft(0, v.id, 3, 'serf'), 3); assert.equal(Math.round(v.pop), 27);
  const m = g.addBuilding('mine', 0, h.tx + 5, h.ty + 6, true); m.nodeIds = []; m.ore = 'stone';
  assert.equal(g.draft(0, v.id, 2, 'mine') > 0, true);
  assert.ok(g.units.some((u) => u.team === 0 && u.task.type === 'mine'), 'miners dig');
  g.addBuilding('barracks', 0, h.tx + 6, h.ty - 6, true);
  assert.equal(g.draft(0, v.id, 4, 'soldier'), 4);
  assert.ok(g.units.filter((u) => u.kind === 'footman' && u.origin === v.name).length === 4, 'footmen from the village');
  // soldiers raise a keep
  const kp = g.place(0, 'keep', h.tx + 8, h.ty + 8, g.units.filter((u) => u.kind === 'footman').map((u) => u.id));
  if (kp) { run(g, 5); assert.ok(g.units.some((u) => u.kind === 'footman' && u.task.type === 'build'), 'soldiers build'); }
  v.pop = 1; assert.equal(g.draft(0, v.id, 1, 'serf'), 0, 'the village is never emptied');
  run(g, 600); const v2 = g.villages.find((x) => x.founded && x.home !== 0); assert.ok(v2.pop > 10, 'it grows: ' + v2.pop);
});

test('sack: the victor takes the stores and the survivors take service as serfs and soldiers', () => {
  const g = new Game({ seed: 4, houses: 3, ai: false }); const p = g.players[0];
  const v = g.villages.find((x) => x.kind === 'mine'); v.pop = 20; v.owner = -1; v.stores.gold = 100; v.stores.iron = 40;
  const gold0 = p.gold, iron0 = p.iron, units0 = g.units.length;
  g.submit(v, 0, 'pillage');
  assert.ok(p.gold >= gold0 + 70, 'coin taken: ' + (p.gold - gold0)); assert.ok(p.iron >= iron0 + 30, 'iron taken');
  assert.ok(g.units.length >= units0 + 3, 'survivors join: ' + (g.units.length - units0));
  assert.ok(v.pop < 16, 'the village shrank');
  assert.ok(g.events.some((e) => /take service/.test(e.text)), 'logged');
  const v2 = g.villages.find((x) => x.kind === 'hamlet'); v2.pop = 10; const n = g.units.length; g.submit(v2, 1, 'castle');
  assert.equal(g.units.length, n, 'a peaceful submission brings no loot');
});

test('keep: holds up to eight soldiers', () => {
  const g = new Game({ seed: 4, houses: 3, ai: false }); const h = g.seatOf(0);
  const keep = g.addBuilding('keep', 0, h.tx + 6, h.ty, true); g.recomputeWalk();
  const us = Array.from({ length: 10 }, () => g.addUnit('footman', 0, keep.x, keep.ty + 5));
  g.cmdEnter(us, keep); run(g, 30);
  assert.equal(keep.garrison.length, 8);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);

test('founding: a house may found only three villages; founded villages do not count toward the valley win; drafting does not shrink housing', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false }); const p = g.players[0]; g.fogOn = false;
  p.wood = 5000; p.food = 5000; p.gold = 5000; p.stone = 500;
  const h = g.seatOf(0);
  const cap0 = g.popCap(0);
  g.draft(0, h.id, 10, 'serf');
  assert.ok(g.popCap(0) >= cap0, 'housing holds when folk leave: ' + g.popCap(0) + ' vs ' + cap0);
  placeNear(g, 0, 'keep', 7);
  for (let i = 0; i < 3; i++) { const v = g.addVillage({ kind: 'hamlet', name: 'F' + i, tx: h.tx - 8 - i * 4, ty: h.ty + 12 }); v.owner = 0; v.founded = true; }
  assert.equal(g.canPlace(0, 'village', h.tx + 12, h.ty + 12).ok, false, 'fourth founding refused');
  const valley = g.villages.filter((v) => !v.founded).length;
  g.checkEnd(0.1);
  assert.equal(g.villageNeed, Math.ceil(valley * VILLAGE_WIN_SHARE), 'need counts valley villages only');
});

test('victory: a house that holds the tier fortune for 90 s wins by wealth; rivals can win it too', () => {
  const g = new Game({ seed: 4, houses: 3, ai: false, diff: 'easy' });
  g.players[0].gold = g.diff.wealth + 10;
  for (let t = 0; t < 95 && !g.outcome; t += 0.5) { g.players[0].gold = g.diff.wealth + 10; g.tick(0.5); }
  assert.ok(g.outcome && g.outcome.result === 'victory' && g.outcome.kind === 'wealth', JSON.stringify(g.outcome));
  const h = new Game({ seed: 4, houses: 3, ai: false, diff: 'easy' });
  for (let t = 0; t < 95 && !h.outcome; t += 0.5) { h.players[1].gold = h.diff.wealth + 10; h.tick(0.5); }
  assert.ok(h.outcome && h.outcome.result === 'defeat' && h.outcome.kind === 'wealth', 'a rival fortune ends the game');
});

test('difficulty: tiers scale the purse, rival income and army cap', () => {
  const e = new Game({ seed: 4, houses: 3, diff: 'easy' }), m = new Game({ seed: 4, houses: 3, diff: 'mid' }), hd = new Game({ seed: 4, houses: 3, diff: 'hard' });
  assert.ok(e.players[0].gold > m.players[0].gold && m.players[0].gold > hd.players[0].gold, 'player purse falls with tier');
  assert.equal(m.players[1].gold, hd.players[1].gold, 'rivals start alike');
  e.earn(1, 'mining', 100); hd.earn(1, 'mining', 100);
  assert.ok(e.players[1].gold < hd.players[1].gold, 'rivals earn more on hard');
});

test('victory: unloyal villages do not count toward the land win', () => {
  const g = new Game({ seed: 4, houses: 3, ai: false });
  const valley = g.villages.filter((v) => !v.founded);
  for (const v of valley) { v.owner = 0; v.loyalty = 40; }
  g.tick(1); assert.equal(g.winHold.team, -1, 'sullen villages do not win');
  for (const v of valley) v.loyalty = 90;
  g.tick(1); assert.equal(g.winHold.team, 0, 'loyal ones start the clock');
});

test('town: a rival village that falls takes the buildings standing within four tiles with it', () => {
  const g = new Game({ seed: 5, houses: 3, ai: false });
  const v = g.villages[0];
  v.owner = 1; v.loyalty = 60;
  const near = g.addBuilding('market', 1, v.tx + 3 + 2, v.ty, true);
  const far = g.addBuilding('market', 1, v.tx + 3 + 12, v.ty, true);
  assert.equal(near.town, v.id, 'a building raised beside a village is marked as part of the town');
  assert.equal(far.town, undefined);
  g.submit(v, PLAYER, 'pillage');
  assert.equal(near.team, PLAYER, 'the town building changes hands');
  assert.equal(far.team, 1, 'a distant building stays with its lord');
});
