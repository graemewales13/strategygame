// Tests for the record-and-train loop: recorder.js, learn.js and the AI's use of a playbook. `node test/learn.test.js`
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { findSpot } from '../js/ai.js';
import { PLAYER } from '../js/config.js';
import { Recorder } from '../js/recorder.js';
import { learnPlaybook, blendPlan, curveAt, usable } from '../js/learn.js';

let _s = 777;
const seedRng = (v) => { _s = v; };
Math.random = () => { _s = (_s + 0x6d2b79f5) >>> 0; let t = _s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const run = (g, secs, dt = 0.1) => { for (let t = 0; t < secs; t += dt) g.tick(dt); };
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, m }; };

// a synthetic match: builds in the given order, army grows at `rate` units per minute
const fake = (id, order, { result = 'victory', dur = 600, rate = 2, attackAt = 300, camels = 0 } = {}) => ({
  v: 1, id, at: 1, seed: 1, houses: 3, diff: 'mid', dur, result,
  builds: order.map((k, i) => [20 + i * 25, k]), trains: Array.from({ length: 12 }, (_, i) => [60 + i * 20, i % 3 === 2 ? 'bowman' : 'footman']),
  attacks: attackAt ? [[attackAt, 6]] : [], wars: [450],
  samples: Array.from({ length: dur / 20 + 1 }, (_, i) => ({ t: i * 20, serf: Math.min(14, 4 + i), army: Math.round((i * 20 / 60) * rate), camel: camels, mine: 2, gw: 4, gf: 3, gg: 1, rt: camels ? 1 : 0 })),
});
const ORDER_A = ['barracks', 'mine', 'market', 'cottage', 'farm', 'tavern', 'keep'];

test('recorder: logs the player\'s successful orders and samples their house; the AI\'s orders are not recorded', () => {
  const st = memStore(), g = new Game({ seed: 4, houses: 3, ai: false }), rec = new Recorder(st);
  rec.start(g);
  const h = g.seatOf(PLAYER), p = g.players[PLAYER]; p.wood = 900; p.stone = 400; p.gold = 500;
  run(g, 1); g.seen[PLAYER].fill(1); g.recomputeWalk?.();
  const [tx, ty] = findSpot(g, PLAYER, h, 'market') || [h.tx + 6, h.ty + 6];
  g.applyIntent({ type: 'place', kind: 'market', tx, ty, ids: [], team: PLAYER });
  g.applyIntent({ type: 'place', kind: 'market', tx: -50, ty: -50, ids: [], team: PLAYER });   // illegal: not recorded
  g.applyIntent({ type: 'place', kind: 'market', tx: h.tx + 6, ty: h.ty, team: 1 });           // another team: not recorded
  run(g, 45); for (let i = 0; i < 3; i++) { rec.tick(); run(g, 20); }
  rec.finish('victory');
  const r = rec.records()[0];
  assert.ok(r, 'a record was saved');
  assert.equal(r.result, 'victory'); assert.equal(r.v, 1);
  assert.deepEqual(r.builds.map((b) => b[1]), ['market'], 'only the legal order by the player');
  assert.ok(r.samples.length >= 3 && r.samples[0].serf >= 3, 'house sampled: ' + JSON.stringify(r.samples[0]));
  assert.ok(r.dur >= 100, 'duration: ' + r.dur);
});

test('recorder: attacks are counted by who actually marched; storage failures never break the game', () => {
  const g = new Game({ seed: 4, houses: 3, ai: false });
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  const rec = new Recorder(bad); rec.start(g);
  assert.doesNotThrow(() => { run(g, 30); rec.tick(); g.applyIntent({ type: 'move', ids: [], x: 1, y: 1, team: PLAYER }); rec.finish('quit'); });
  const g2 = new Game({ seed: 4, houses: 3, ai: false }), rec2 = new Recorder(memStore()); rec2.start(g2);
  const foes = g2.units.filter((u) => u.team === PLAYER && u.kind === 'serf').slice(0, 2);
  g2.tap = (it, r) => rec2.intent(it, r);
  const v = g2.villages[0]; foes.forEach((u) => { u.task = { type: 'attack', targetId: v.id }; });
  rec2.intent({ type: 'attack', ids: foes.map((u) => u.id) }, true);
  assert.deepEqual(rec2.cur.attacks.map((a) => a[1]), [2]);
  g2.tap = () => { throw new Error('boom'); };
  assert.doesNotThrow(() => g2.applyIntent({ type: 'stop', ids: [], team: PLAYER }), 'a faulty recorder cannot break an order');
  assert.equal(g2.tap, null, 'and is switched off');
});

test('recorder: export, import (deduplicated), cap and clear', () => {
  const rec = new Recorder(memStore());
  for (let i = 0; i < 40; i++) rec._write([...rec.records(), fake('m' + i, ORDER_A)]);
  assert.ok(rec.records().length <= 30, 'capped: ' + rec.records().length);
  const text = rec.exportJSON(), other = new Recorder(memStore());
  assert.equal(other.importJSON(text).added, rec.records().length);
  assert.equal(other.importJSON(text).added, 0, 'importing twice adds nothing');
  assert.equal(other.importJSON('not json').ok, false); assert.equal(other.importJSON('{"x":1}').ok, false);
  other.clear(); assert.equal(other.records().length, 0);
  const off = new Recorder(memStore()); off.setEnabled(false); const g = new Game({ seed: 4, houses: 3, ai: false }); off.start(g);
  assert.equal(g.tap, null, 'switched off: nothing is watched');
});

test('learn: the playbook follows the player\'s build order, trusts more matches more, and weights wins over losses', () => {
  assert.equal(learnPlaybook([]), null);
  assert.equal(usable(fake('short', ORDER_A, { dur: 60 })), false, 'a minute is not a match');
  const one = learnPlaybook([fake('a', ORDER_A)]), five = learnPlaybook(Array.from({ length: 5 }, (_, i) => fake('b' + i, ORDER_A)));
  assert.deepEqual(one.plan.slice(0, 3).map((e) => e.k), ['barracks', 'mine', 'market']);
  assert.ok(five.conf > one.conf && five.conf <= 0.85 && five.trained, `confidence grows: ${one.conf} -> ${five.conf}`);
  const mixed = learnPlaybook([fake('w', ORDER_A, { rate: 4 }), fake('l', ORDER_A, { rate: 1, result: 'defeat' })]);
  assert.ok(curveAt(mixed.army, mixed.step, 300) > 2.5 * 5 * 0.5 * 2 / 2 && curveAt(mixed.army, mixed.step, 300) > curveAt(learnPlaybook([fake('l', ORDER_A, { rate: 1 })]).army, 30, 300), 'the winning pace counts for more');
  assert.equal(five.attack.size, 6); assert.equal(five.warAt, 450);
  assert.ok(five.share.wood > five.share.gold && five.mix.footman > five.mix.bowman, 'shares and unit mix learned');
});

test('learn: the AI build list is re-ordered toward the player\'s, in proportion to confidence', () => {
  const def = [['mine', 1], ['market', 1], ['barracks', 1], ['cottage', 1], ['tavern', 1], ['keep', 1], ['farm', 1]];
  const pb = learnPlaybook(Array.from({ length: 6 }, (_, i) => fake('o' + i, ORDER_A)));
  const out = blendPlan(def, pb);
  assert.equal(out[0][0], 'barracks', 'the player built barracks first: ' + out.map((e) => e[0]));
  assert.equal(out.length, def.length, 'nothing the AI always builds is dropped');
  assert.equal(blendPlan(def, null), def, 'no playbook, no change');
  const weak = { ...pb, conf: 0.05 }; assert.equal(blendPlan(def, weak)[0][0], 'mine', 'a barely-trained playbook leaves the AI\'s own order alone');
});

test('ai: a house with a playbook raises the army the player raised, and a house without one is unchanged', () => {
  const army = (pbk) => {
    seedRng(99); const g = new Game({ seed: 11, houses: 3, ai: true, diff: 'hard' }); g.playbook = null;
    g.players.forEach((p, i) => { p.ai = i === 1; if (i === 1) p.playbook = pbk; });
    g.players[1].gold = 4000; g.players[1].food = 3000; g.players[1].wood = 3000;
    run(g, 330); return g.militaryOf(1).length;
  };
  const big = learnPlaybook(Array.from({ length: 6 }, (_, i) => fake('big' + i, ORDER_A, { rate: 9, dur: 900 })));
  const none = learnPlaybook(Array.from({ length: 6 }, (_, i) => fake('none' + i, ORDER_A, { rate: 0.2, dur: 900 })));
  const a = army(none), b = army(big), c = army(null), d = army(undefined);
  assert.ok(b >= a, `army with a big-army playbook (${b}) is not smaller than with a tiny one (${a})`);
  assert.equal(c, d, 'null and undefined playbooks both play the default game');
});

test('ai: playbooks with missing or odd fields never crash a match', () => {
  const g = new Game({ seed: 3, houses: 3, ai: true }); g.playbook = { v: 1, conf: 0.8, plan: [{ k: 'cottage', n: 3, idx: 0, t: 5 }, { k: 'nonsense', n: 1, idx: 1, t: 9 }], serf: [], army: [], step: 30, mix: { knight: 1 }, attack: { first: 10, size: 99 }, warAt: 1, share: { wood: 1, food: 0, gold: 0 }, camels: { perMine: 3, routeUse: 1 } };
  assert.doesNotThrow(() => run(g, 240));
  assert.ok(g.units.some((u) => u.team === 1 && u.hp > 0), 'rivals still stand');
});

console.log(`${passed} passed`);
