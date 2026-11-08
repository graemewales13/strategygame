// Auld World - unit duels: two equal-cost bands of two kinds meet on open ground and fight to the end (T59, unit counters).
//   node tools/duel.js [budget=1600] [seeds=1,2,3]
// Prints, for each pairing, how often each side won and the share of its cost left standing. Counters should win their match-up.
import { Game } from '../js/game.js';
import { UNITS } from '../js/config.js';

const budget = +process.argv[2] || 1600, seeds = (process.argv[3] || '1,2,3').split(',').map(Number);
let rng = 1; Math.random = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
const cost = (k) => Object.values(UNITS[k].cost).reduce((a, v) => a + v, 0);

// open, walkable ground well away from every seat and village, wide enough for two bands 14 tiles apart
function field(g) {
  let best = null, bd = -1;
  for (let y = 12; y < g.H - 12; y += 4) for (let x = 12; x < g.W - 26; x += 4) {
    let ok = true; for (let dy = -4; dy <= 4 && ok; dy++) for (let dx = -2; dx <= 16 && ok; dx++) if (!g.walk[(y + dy) * g.W + x + dx]) ok = false;
    if (!ok) continue;
    const d = Math.min(...g.villages.map((v) => Math.hypot(v.x - x, v.y - y)), ...g.buildings.map((b) => Math.hypot(b.x - x, b.y - y)));
    if (d > bd) { bd = d; best = [x, y]; }
  }
  return best;
}
function duel(a, b, seed) {
  rng = seed * 7919;
  const g = new Game({ seed, houses: 3, fog: false, ai: false, size: 160 });
  g.rel[0][1] = g.rel[1][0] = 'war';
  for (const p of g.players) p.gold = 1e6;   // nobody goes broke mid-fight
  const [x, y] = field(g), na = Math.floor(budget / cost(a)), nb = Math.floor(budget / cost(b));
  const band = (k, n, team, x0) => Array.from({ length: n }, (_, i) => g.addUnit(k, team, x0 + (i % 3) * 1.1, y - 4 + Math.floor(i / 3) * 1.1));
  const A = band(a, na, 0, x), B = band(b, nb, 1, x + 13);
  g.cmdAttackMove(A, x + 14, y); g.cmdAttackMove(B, x, y);
  for (let t = 0; t < 180; t += 0.1) { g.tick(0.1); if (!A.some((u) => u.hp > 0) || !B.some((u) => u.hp > 0)) break; }
  const left = (S, k) => S.filter((u) => u.hp > 0).reduce((s, u) => s + (u.hp / u.maxHp) * cost(k), 0);
  return { a: left(A, a) / (na * cost(a)), b: left(B, b) / (nb * cost(b)) };
}
const pairs = [['footman', 'knight'], ['knight', 'bowman'], ['bowman', 'footman']];
for (const [a, b] of pairs) {
  let wa = 0, wb = 0, la = 0, lb = 0;
  for (const s of seeds) { const r = duel(a, b, s); if (r.a > r.b) wa++; else if (r.b > r.a) wb++; la += r.a; lb += r.b; }
  console.log(`${a} x${Math.floor(budget / cost(a))} vs ${b} x${Math.floor(budget / cost(b))}: ${a} won ${wa}, ${b} won ${wb}; cost left ${Math.round(la / seeds.length * 100)}% vs ${Math.round(lb / seeds.length * 100)}%`);
}
