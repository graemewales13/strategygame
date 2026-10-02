// Economy probe: run AI houses and print a per-minute table for one house, to tune start purse and income flow.
// Usage: node tools/econ.js [minutes] [seed] [team]
import { Game } from '../js/game.js';
const minutes = +process.argv[2] || 12, seed = +process.argv[3] || 3, team = +process.argv[4] || 1;
const g = new Game({ seed, houses: 4, ai: true, fog: false });
const p = g.players[team];
const rows = [];
let next = 60;
const L = (n) => String(Math.round(n)).padStart(5);
console.log('min  serfs army  pop/cap  food wood coin | bld mines mkt  vill | income/s  (mining panning market tavern temple tribute trade loot) wages');
for (let t = 0; t < minutes * 60; t += 0.1) {
  g.tick(0.1);
  if (g.time >= next) {
    next += 60;
    const us = g.units.filter((u) => u.team === team && u.hp > 0), serfs = us.filter((u) => u.kind === 'serf').length, army = g.militaryOf(team).length;
    const b = g.buildings.filter((x) => x.team === team && x.hp > 0 && x.built >= 1), inc = p.inc || {};
    const tot = Object.values(inc).reduce((a, v) => a + v, 0);
    console.log(`${String(Math.round(g.time / 60)).padStart(3)} ${L(serfs)} ${L(army)}  ${String(g.popUsed(team)).padStart(3)}/${String(g.popCap(team)).padEnd(3)} ${L(p.food)}${L(p.wood)}${L(p.gold)} | ${L(b.length)} ${L(b.filter((x) => x.kind === 'mine').length)} ${L(b.filter((x) => x.kind === 'market').length)} ${L(g.villages.filter((v) => v.owner === team).length)} | ${tot.toFixed(2)}  (${['mining', 'panning', 'market', 'tavern', 'temple', 'tribute', 'trade', 'loot'].map((k) => (inc[k] || 0).toFixed(2)).join(' ')}) ${(p.wageRate || 0).toFixed(2)}`);
  }
}
