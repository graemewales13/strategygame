// Seven Holds - scripted human player. Team 0 is driven only through applyIntent (what the buttons send); rivals run the AI.
//   node tools/play.js [minutes=20] [seeds=1,2,3] [houses=4] [style=econ|rush|turtle]
import { Game } from '../js/game.js';
import { BUILDINGS } from '../js/config.js';
import { findSpot, pickDeposit } from '../js/ai.js';

const minutes = +process.argv[2] || 20, seeds = (process.argv[3] || '1,2,3').split(',').map(Number), houses = +process.argv[4] || 4, style = process.argv[5] || 'econ';
let rng = 1; Math.random = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
const issues = new Map();
let curSeed = 0;
const flag = (k, t, s) => { const i = issues.get(k); if (i) i.n++; else issues.set(k, { n: 1, first: t, sample: `seed ${curSeed}: ${s}` }); };

for (const seed of seeds) {
  rng = seed * 104729; curSeed = seed;
  const g = new Game({ seed, houses, fog: false, ai: true });
  g.players[0].ai = false;
  const me = g.players[0], T = 0;
  const intent = (it) => { it.team = T; try { return g.applyIntent(it); } catch (e) { flag('EXCEPTION ' + it.type + ': ' + e.message, g.time, e.stack.split('\n').slice(1, 3).join('|')); return false; } };
  const mine = (k) => g.buildings.filter((b) => b.team === T && b.kind === k && b.hp > 0);
  const built = (k) => mine(k).filter((b) => b.built >= 1);
  const serfs = () => g.units.filter((u) => u.team === T && u.kind === 'serf' && u.hp > 0);
  const home = () => g.seatOf(T);
  const myVillages = () => g.villages.filter((v) => v.owner === T);
  const queuedB = (k) => mine(k).length;
  const seenWarn = new Set(); let evIdx = 0, tl = [], firstOf = {};
  const mark = (k) => { if (!(k in firstOf)) firstOf[k] = Math.round(g.time); };
  const log = [];
  const stat = { sallies: 0 };
  const step = () => {
    const h = home(); if (!h) return;
    const ss = serfs(), idle = ss.filter((u) => u.task.type === 'idle');
    // 1. manpower: draft serfs until 8, then miners/soldiers by style
    const want = style === 'rush' ? 6 : 8;
    const big = () => myVillages().sort((a, b) => b.pop - a.pop)[0] || h;
    if (ss.length < want && me.food >= 20) intent({ type: 'draft', villageId: big().id, n: 2, role: 'serf' });
    // 2. build order
    const order = style === 'rush' ? ['mine', 'barracks', 'market', 'keep', 'tavern', 'cottage', 'farm', 'village'] : ['mine', 'market', 'cottage', 'barracks', 'tavern', 'keep', 'cottage', 'farm', 'cottage', 'tower', 'archery', 'cottage', 'village', 'cottage', 'tower', 'foundry', 'cottage', 'warehouse', 'temple', 'cottage', 'academy', 'cottage', 'cottage'];
    const counts = {};
    for (const k of order) {
      counts[k] = (counts[k] || 0) + 1;
      if (queuedB(k) >= counts[k]) continue;
      if (BUILDINGS[k].requires.some((r) => !g.hasBuilding(T, r))) continue;
      if (!g.canAfford(T, BUILDINGS[k].cost)) break;
      const builders = ss.slice(0, 2).map((u) => u.id);
      if (k === 'mine') { const n = pickDeposit(g, T, h); if (!n) continue; const r = intent({ type: 'place', kind: 'mine', tx: 0, ty: 0, ids: builders, nodeId: n.id }); if (!r) flag('mine place refused', g.time, 'deposit ' + n.kind); }
      else { const s = findSpot(g, T, h, k); if (!s) { flag('no spot for ' + k, g.time, k); continue; } intent({ type: 'place', kind: k, tx: s[0], ty: s[1], ids: builders }); }
      break;
    }
    // 3. idle serfs: help build anything unfinished, else dig, else chop
    for (const u of idle) {
      const unfinished = g.buildings.find((b) => b.team === T && b.built < 1 && b.hp > 0);
      if (unfinished) { intent({ type: 'build', ids: [u.id], buildingId: unfinished.id }); continue; }
      const m = built('mine').find((b) => g.minersOf(b) < 4);
      if (m) { intent({ type: 'mine', ids: [u.id], buildingId: m.id }); continue; }
      const node = g.nearestNode(h.x, h.y, me.wood < me.food ? 'wood' : 'food');
      if (node) intent({ type: 'gather', ids: [u.id], nodeId: node.id });
    }
    // 4. miners from the village, soldiers when barracks stand
    if (built('mine').some((b) => g.minersOf(b) < 4) && me.food >= 40) intent({ type: 'draft', villageId: big().id, n: 2, role: 'mine' });
    const army = g.militaryOf(T).length, goal = style === 'rush' ? 14 : style === 'turtle' ? 12 : Math.min(14, 4 + Math.floor(g.time / 90));
    if (built('barracks').length && army < goal && me.gold >= 60 && me.food >= 25) intent({ type: 'draft', villageId: big().id, n: 2, role: 'soldier' });
    // 5. keep: levy nearest village; garrison; camels
    const kp = built('keep')[0];
    if (kp && !kp.levyVillage) { const v = g.villages.filter((x) => x.owner < 0).sort((a, b) => Math.hypot(a.x - kp.x, a.y - kp.y) - Math.hypot(b.x - kp.x, b.y - kp.y))[0]; if (v) intent({ type: 'levy', buildingId: kp.id, villageId: v.id }); }
    const mk = built('market')[0];
    if (mk && g.units.filter((u) => u.team === T && u.kind === 'camel').length < 1 && me.gold > 200) intent({ type: 'train', buildingId: mk.id, kind: 'camel' });
    if (mk) for (const c of g.units.filter((u) => u.team === T && u.kind === "camel" && !u.route && u.hp > 0)) {
      const tg = g.villages.filter((v) => v.owner < 0).map((v) => ({ v, q: g.routeQuote(mk, v) })).sort((a, b) => b.q.profit - a.q.profit)[0];
      if (tg && tg.q.n >= 4) intent({ type: 'route', ids: [c.id], targetId: tg.v.id, want: 'gold' });
    }
    for (const o of g.offers.filter((o) => o.to === T)) intent({ type: 'respond', from: o.from, accept: true });
    // 6. sell glut
    if (mk) for (const k of ['stone', 'iron', 'coal', 'copper', 'silver']) if (me[k] > 150) intent({ type: 'sell', marketId: mk.id, good: k, amount: me[k] - 100 });
    // 7. defence: soldiers (garrisoned too) sally at the nearest enemy near our holdings; otherwise stand at the keep
    const mine2 = [...g.buildings.filter((b) => b.team === T && b.hp > 0), ...myVillages()];
    const foes = g.units.filter((u) => u.team !== T && u.hp > 0 && u.kind !== 'camel' && g.rel[T][u.team] === 'war' && mine2.some((b) => Math.hypot(b.x - u.x, b.y - u.y) < 16));
    if (foes.length && kp) { for (const b of g.buildings.filter((b) => b.team === T && b.garrison && b.garrison.length)) intent({ type: 'leave', buildingId: b.id }); }
    const army2 = g.units.filter((u) => u.team === T && u.hp > 0 && u.kind !== 'serf' && u.kind !== 'camel' && u.kind !== 'spy' && u.kind !== 'scholar' && !u.inside);
    if (foes.length) { const f = foes[0]; stat.sallies++; intent({ type: 'attack', ids: army2.map((u) => u.id), targetId: f.id }); }
    else if (kp) for (const u of army2.filter((u) => u.task.type === 'idle' && Math.hypot(u.x - kp.x, u.y - kp.y) > 6)) intent({ type: 'move', ids: [u.id], x: kp.x + 2, y: kp.y + 4 });
  };

  let t = 0, nextStep = 0;
  const rows = [];
  while (t < minutes * 60 && !g.outcome) {
    g.tick(0.1); t += 0.1;
    if (t >= nextStep) { nextStep = t + 2; step(); }
    for (; evIdx < g.events.length; evIdx++) { const e = g.events[evIdx]; if (e.team === T && e.kind === 'warn') { const k = e.text.replace(/\d+/g, 'N'); if (!seenWarn.has(k)) { seenWarn.add(k); flag('warn: ' + k, e.t, e.text); } else flag('warn: ' + k, e.t, e.text); } }
    if (Math.round(t * 10) % 600 === 0) {
      const s = g.standings()[0];
      rows.push(`${Math.round(t / 60)}m pop ${g.popUsed(T)}/${g.popCap(T)} serfs ${serfs().length} army ${g.militaryOf(T).length} coin ${Math.floor(me.gold)} (${(me.inc && Object.values(me.inc).reduce((a, b) => a + b, 0) || 0).toFixed(1)}/s) food ${Math.floor(me.food)} wood ${Math.floor(me.wood)} stone ${Math.floor(me.stone)} bld ${g.buildings.filter((b) => b.team === T && b.hp > 0).length} vill ${s.land} loyalty ${s.loyalty} alive ${g.alive(T)}`);
      if (!g.alive(T)) { flag('player eliminated', t, `at ${Math.round(t / 60)}m`); break; }
      if (g.popUsed(T) > g.popCap(T) + 2) flag('pop over cap', t, g.popUsed(T) + '/' + g.popCap(T));
      if (me.food < 5 && g.time > 120) flag('player starving', t, 'food ' + me.food);
      if (t > 180 && serfs().filter((u) => u.task.type === 'idle').length > serfs().length / 2) flag('over half serfs idle', t, serfs().length + ' serfs');
    }
  }
  if (process.env.EV) for (const e of g.events) if (e.team === T && e.t > +process.env.EV && e.kind !== "warn") console.log("   ev", Math.round(e.t), e.text);
  if (process.env.WV) { console.log("villages", g.villages.filter((v) => v.owner === T).map((v) => `${v.name} pop ${Math.floor(v.pop)} ${v.home >= 0 ? "HOME" : ""}`).join(", ")); console.log("warns", g.events.filter((e) => e.team === T && e.kind === "warn").slice(-6).map((e) => Math.round(e.t) + " " + e.text).join(" | ")); }
  if (process.env.REL) { console.log("rel", JSON.stringify(g.rel)); console.log(g.events.filter((e) => e.kind === "war").slice(0, 12).map((e) => Math.round(e.t) + " " + e.text).join("\n")); }
  console.log(`== seed ${seed} (${style}) ${g.outcome ? 'OUTCOME ' + JSON.stringify(g.outcome) : 'no result'} t=${Math.round(g.time / 60)}m`);
  for (const r of rows.filter((_, i) => i % 3 === 2 || i === rows.length - 1)) console.log('  ' + r);
  console.log('  standings: ' + g.standings().map((s) => `${s.name.split(' ').pop()} $${s.money} v${s.land} a${s.army}${s.alive ? '' : ' X'}`).join(' | '));
}
console.log('\n== issues');
for (const [k, v] of [...issues].sort((a, b) => b[1].n - a[1].n)) console.log(`  x${v.n}  ${k}  (first @${Math.round(v.first)}s: ${v.sample})`);
