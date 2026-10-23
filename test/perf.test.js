// Speed work (ROADMAP T18) must not change what the simulation does. Each shortcut is checked against the plain way it replaced.
// Fast: `node test/perf.test.js` (part of `npm test`).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../js/game.js';
import { VISION_MUL, UNITS, BUILDINGS, PERK, KING } from '../js/config.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const play = (g, secs) => { for (let i = 0; i < secs * 20; i++) g.tick(0.05); };
const match = (houses = 4, seed = 4242) => { const g = new Game({ seed, houses, ai: true }); g.reset({ seed, houses }); g.sfxOn = false; return g; };

test('unit grid: every unit is filed in the cell it stands in, through two minutes of play (moves, entering, leaving, deaths, new units)', () => {
  const g = match(4); g._ugCheck = true;   // (unitsNear checks the whole grid on every search)
  play(g, 120);
  g.ugVerify();
  assert.ok(g.units.length > 20);
});

test('unit grid: a search near a point finds exactly the units a search over everyone finds, in the same order', () => {
  const g = match(4); play(g, 90);
  for (let k = 0; k < 200; k++) {
    const x = g.rnd() * g.W, y = g.rnd() * g.H, r = 1 + g.rnd() * 20;
    const near = g.unitsNear(x, y, r).filter((u) => Math.hypot(u.x - x, u.y - y) <= r);
    const all = g.units.filter((u) => Math.hypot(u.x - x, u.y - y) <= r);
    assert.deepEqual(near.map((u) => u.id), all.map((u) => u.id));
  }
});

test('paths: knowing which ground connects gives the same path (or none) as searching it out', () => {
  const g = match(4); play(g, 60);
  const plain = Object.create(g), one = new Proxy({}, { get: () => 1 });
  plain.walkComp = () => one;   // a stand-in: every tile in one region, so A* searches it out as before
  for (const k of ['_g', '_came', '_stamp', '_closed']) plain[k] = new g[k].constructor(g[k].length);   // (its own scratch arrays: the run stamps of two searchers must not mix)
  plain._run = 0; plain._hf = null; plain._hn = null;
  let none = 0;
  for (let k = 0; k < 150; k++) {
    const sx = Math.floor(g.rnd() * g.W), sy = Math.floor(g.rnd() * g.H), gx = Math.floor(g.rnd() * g.W), gy = Math.floor(g.rnd() * g.H);
    const a = g.findPath(sx, sy, gx, gy), b = Game.prototype.findPath.call(plain, sx, sy, gx, gy);
    assert.deepEqual(a, b, `path ${sx},${sy} -> ${gx},${gy}`);
    if (a === null) none++;
  }
  assert.ok(none < 150, 'some paths were found');
});

test('vision: marking rows of each circle sees exactly the tiles the tile-by-tile circle saw', () => {
  const g = match(4); play(g, 60);
  g.updateVisibility();
  for (let t = 0; t < g.houses; t++) {
    const want = new Uint8Array(g.W * g.H);
    const mark = (x, y, r0) => {
      const r = Math.round(r0 * VISION_MUL), cx = Math.floor(x), cy = Math.floor(y), r2 = r * r;
      for (let j = Math.max(0, cy - r); j <= Math.min(g.H - 1, cy + r); j++) for (let i = Math.max(0, cx - r); i <= Math.min(g.W - 1, cx + r); i++) if ((i - cx) ** 2 + (j - cy) ** 2 <= r2) want[j * g.W + i] = 1;
    };
    for (const u of g.units) if (u.team === t && u.hp > 0) mark(u.x, u.y, UNITS[u.kind].sight * (u.far === 'parthian' ? PERK.sight : 1));
    for (const b of g.buildings) if (b.team === t && b.hp > 0) mark(b.x, b.y, BUILDINGS[b.kind].sight);
    for (const v of g.villages) if (v.owner === t) mark(v.x, v.y, v.home === t ? 13 : 8);
    for (const p of g.players) { const k = p.alive && p.team !== t && !g.seatOf(p.team) ? g.kingOf(p.team) : null; if (k && !k.inside) mark(k.x, k.y, KING.fugitiveSight); }
    if (!g.fogOn) want.fill(1);
    assert.deepEqual(g.vis[t], want, `house ${t}`);
  }
});

test('building index: by house and by kind it lists exactly what a scan of every building finds, in order, also after a town changes hands', () => {
  const g = match(4); play(g, 120);
  const check = () => {
    for (let t = 0; t < g.houses; t++) {
      assert.deepEqual(g.teamB(t).map((b) => b.id), g.buildings.filter((b) => b.team === t).map((b) => b.id));
      for (const k of Object.keys(BUILDINGS)) assert.deepEqual(g.kindB(t, k).map((b) => b.id), g.buildings.filter((b) => b.team === t && b.kind === k).map((b) => b.id));
    }
  };
  check();
  const v = g.villages.find((x) => x.owner >= 0 && g.buildings.some((b) => b.town === x.id)) || g.villages.find((x) => x.owner >= 0);
  if (v) { g.submit(v, (v.owner + 1) % g.houses, 'castle'); check(); }
  play(g, 20); check();
});

test('nearby buildings and villages: the gap rules give the same answer through the index as through every one', () => {
  const g = match(4); play(g, 120);
  const plain = Object.create(g); plain.fixedNear = (list) => list;
  for (let k = 0; k < 400; k++) {
    const kind = ['keep', 'cottage', 'mine', 'village', 'tower', 'farm'][k % 6], tx = 2 + Math.floor(g.rnd() * (g.W - 8)), ty = 2 + Math.floor(g.rnd() * (g.H - 8)), team = k % g.houses;
    assert.deepEqual(g.canPlace(team, kind, tx, ty), Game.prototype.canPlace.call(plain, team, kind, tx, ty), `${kind} at ${tx},${ty}`);
  }
});

test('villages by lord: the index lists what a scan finds, in order, through play and changes of hands; every line that sets an owner drops it', () => {
  const g = match(4); play(g, 150);
  const check = () => { for (let t = -1; t < g.houses; t++) assert.deepEqual(g.vOwn(t).map((v) => v.id), g.villages.filter((v) => v.owner === t).map((v) => v.id)); };
  check();
  const v = g.villages.find((x) => x.owner < 0); g.submit(v, 1, 'castle'); check();
  play(g, 30); check();
  const src = readFileSync(new URL('../js/game.js', import.meta.url), 'utf8').split(/\r?\n/);
  const sets = src.filter((l) => /\bv\.owner = /.test(l));
  assert.ok(sets.length >= 5);
  for (const l of sets) assert.match(l, /this\._vOwn = null/, `a village changes hands without dropping the index: ${l.trim().slice(0, 90)}`);
});

test('villages worked out a quarter at a time: they fill, grow and pay at the same rates (each village every fourth tick with the time gathered)', () => {
  const g = match(4); play(g, 30);
  const v = g.villages.find((x) => x.owner < 0 && x.stores.gold !== undefined) || g.villages[0];
  v.stores.gold = 0; v._vdt = 0;
  const before = g.time; play(g, 20);
  const t0 = v._vdt;   // (time it has gathered but not yet used)
  assert.ok(t0 >= 0 && t0 < 0.2 + 1e-9, 'a village is never more than four ticks behind');
  assert.ok(v.stores.gold > 0, 'its purse refills');
  // every village was worked out about 100 times in 20 s
  assert.ok(Math.abs(g.time - before - 20) < 1e-6);
  for (const x of g.villages) assert.ok(x._vdt < 0.2 + 1e-9, `village ${x.id} waits ${x._vdt}s`);
  // the same with longer ticks (tests and slow frames step 0.1 s): no village is left out
  const h = match(4); for (let i = 0; i < 100; i++) h.tick(0.1);
  for (const x of h.villages) assert.ok(x._vdt < 0.2 + 1e-9, `village ${x.id} waits ${x._vdt}s with 0.1 s ticks`);
});

test('influence on a village: through the nearby index it comes out exactly as summed over every building and village', () => {
  const g = match(4); play(g, 240);
  const plain = Object.create(g); plain.fixedNearSorted = (list) => list;
  for (const v of g.villages) assert.deepEqual(g.pullsFor(v), Game.prototype.pullsFor.call(plain, v), v.name);
});

console.log(`${passed} passed`);
