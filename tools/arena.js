// Auld World - the arena: is a playbook actually better? Headless all-AI matches where one house plays by the playbook and the rest by the built-in
// habits, against a control run where every house uses the built-in habits. Seats are rotated so position bias cancels.
//   node tools/arena.js [minutes=10] [seeds=1,2,3,4,5,6] [houses=3] [playbook.json | features.json]
import { readFileSync } from 'node:fs';
import { Game } from '../js/game.js';
import { learnPlaybook } from '../js/learn.js';

const minutes = +process.argv[2] || 10, seeds = (process.argv[3] || '1,2,3,4,5,6').split(',').map(Number), houses = +process.argv[4] || 3;
const file = process.argv[5] || new URL('../data/features.json', import.meta.url).pathname;
let rng = 1; Math.random = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
const raw = JSON.parse(readFileSync(file, 'utf8'));
const pb = raw.plan ? raw : learnPlaybook(raw.records || raw);
if (!pb) { console.log('no playbook to test (no usable recordings).'); process.exit(0); }

const power = (s) => (s.alive ? 500 : 0) + s.land * 100 + s.pop * 3 + s.army * 8 + s.wealth / 10;
function match(seed, seat, usePb) {
  rng = seed * 7919 + seat;
  const g = new Game({ seed, houses, fog: false, ai: true });
  g.playbook = null;
  g.players.forEach((p, i) => { p.ai = true; p.playbook = usePb && i === seat ? pb : null; });
  for (let t = 0; t < minutes * 60 && !g.outcome; t += 0.1) g.tick(0.1);
  const st = g.standings(), mine = power(st[seat]), others = st.filter((_, i) => i !== seat).map(power);
  return { mine, rest: others.reduce((a, b) => a + b, 0) / others.length, alive: st[seat].alive, land: st[seat].land, army: st[seat].army };
}
const run = (usePb) => seeds.flatMap((seed) => [0, 1, 2].slice(0, houses).map((seat) => match(seed, seat, usePb)));
const agg = (rs) => ({ rel: rs.reduce((a, r) => a + r.mine / Math.max(1, r.rest), 0) / rs.length, alive: rs.filter((r) => r.alive).length, n: rs.length, army: rs.reduce((a, r) => a + r.army, 0) / rs.length, land: rs.reduce((a, r) => a + r.land, 0) / rs.length });
const base = agg(run(false)), tuned = agg(run(true));
const f = (a) => `power vs rivals x${a.rel.toFixed(2)}  survived ${a.alive}/${a.n}  army ${a.army.toFixed(1)}  villages ${a.land.toFixed(1)}`;
console.log(`playbook: ${pb.matches} matches, confidence ${Math.round(pb.conf * 100)}%   (${minutes} min, seeds ${seeds.join(',')}, ${houses} houses)`);
console.log('control  (built-in habits):', f(base));
console.log('playbook house            :', f(tuned));
console.log(`change in relative power: ${(tuned.rel - base.rel >= 0 ? '+' : '') + ((tuned.rel / base.rel - 1) * 100).toFixed(1)}%`);
