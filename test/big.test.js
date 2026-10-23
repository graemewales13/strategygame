// Full-size board checks (320x320): `npm run test:big`. Slower than `npm test`, which uses a small board.
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';

let n = 0; const test = (name, fn) => { try { fn(); n++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
delete process.env.AULD_MAP;
const sizeOK = new Game({ seed: 1, houses: 3 }).W;
test('board is full size', () => assert.ok(sizeOK >= 300, 'W=' + sizeOK + ' (is AULD_MAP set?)'));
test('generation: 12 seeds x 3/4/5 houses are quick, connected, and have villages and ore', () => {
  for (let i = 0; i < 12; i++) {
    const houses = 3 + (i % 3), t = Date.now(), g = new Game({ seed: 1000 + i * 37, houses });
    assert.ok(Date.now() - t < 4000, `seed ${g.seed} took ${Date.now() - t} ms`);
    assert.ok(g.villages.length > 150, 'villages ' + g.villages.length);
    assert.ok(g.resources.filter((r) => r.kind !== 'tree').length > 100, 'deposits exist');
    const s0 = g.map.starts[0];
    for (const [sx, sy] of g.map.starts.slice(0, houses)) assert.ok(g.findPath(s0[0] + 1, s0[1] + 3, sx + 1, sy + 3), `seed ${g.seed}: a start is unreachable`);
    if (i < 4) for (const v of g.villages) assert.ok(g.findPath(s0[0] + 1, s0[1] + 3, v.tx + 1, v.ty + 1), `seed ${g.seed}: village ${v.name} unreachable`);
  }
});
test('speed: 5 simulated minutes of 4 AI houses stays under 2.5 s of wall clock per simulated minute', () => {
  const g = new Game({ seed: 11, houses: 4 }); const t = Date.now();
  for (let i = 0; i < 3000; i++) g.tick(0.1);
  const per = (Date.now() - t) / 5000;
  assert.ok(per < 2.5, per.toFixed(2) + ' s per simulated minute');
});
// Eight houses must stay playable in a browser (ROADMAP T18; online matches have eight seats). Work counted, not timed, so the check
// is the same on any machine: the squares the path search opens, the searches, and village influence reckonings over 6 minutes of
// 8 AI houses. Measured 2026-10-23: 2.89M squares (the old search: 7.68M), 26.4k searches, 131k reckonings. A rule change may move
// these a little; one that moves them past the budget has made the game slower and should be looked at (then re-measure here).
test('speed budget: 6 minutes of 8 AI houses search no more ground than budgeted (counted, so the same on any machine)', () => {
  const g = new Game({ seed: 4242, houses: 8, ai: true }); g.reset({ seed: 4242, houses: 8 }); g.sfxOn = false;
  for (let i = 0; i < 1200 * 6; i++) g.tick(0.05);
  const w = g.work;
  assert.ok(w.nodes < 4.0e6, `path search opened ${w.nodes} squares (budget 4.0M)`);
  assert.ok(w.paths < 37000, `${w.paths} path searches (budget 37k)`);
  assert.ok(w.pulls < 185000, `${w.pulls} influence reckonings (budget 185k)`);
});
test('save/load at full size round-trips', () => {
  const g = new Game({ seed: 5, houses: 4 }); for (let i = 0; i < 1200; i++) g.tick(0.1);
  const json = JSON.stringify(g.serialize()); assert.ok(json.length < 4e6, 'save size ' + json.length);
  const h = new Game({ seed: 2, houses: 3 }); h.restore(JSON.parse(json));
  assert.equal(h.units.length, g.units.length); assert.equal(h.W, g.W);
  for (let i = 0; i < 300; i++) h.tick(0.1);
});
console.log(`\n${n} passed${process.exitCode ? ', some FAILED' : ''}`);
