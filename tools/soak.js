// Seven Holds - soak harness. Plays headless matches with EVERY house (the player's too) under the AI and records anomalies.
//   node tools/soak.js [minutes=25] [seeds=1,2,3] [houses=4]     -> prints a report and writes logs/soak-latest.log
import { Game } from '../js/game.js';
import { UNITS, BUILDINGS } from '../js/config.js';
import { distTo } from '../js/entities.js';
import { writeFileSync } from 'node:fs';

const CHAOS = process.argv[5] === 'chaos';   // team 0 is driven by a random intent generator instead of the AI
const minutes = +process.argv[2] || 25, seeds = (process.argv[3] || '1,2,3').split(',').map(Number), houses = +process.argv[4] || 4;
let rng = 1; Math.random = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
const out = [], say = (s) => { out.push(s); console.log(s); };
const issues = new Map();   // key -> { n, first, sample }
let curSeed = 0;
const flag = (key, t, sample) => { sample = `seed ${curSeed}: ${sample}`; const i = issues.get(key); if (i) i.n++; else issues.set(key, { n: 1, first: t, sample }); };
const MOVING = new Set(['move', 'gather', 'build', 'mine', 'caravan', 'enter', 'attack', 'infiltrate', 'return']);

for (const seed of seeds) {
  rng = seed * 7919; curSeed = seed;
  const g = new Game({ seed, houses, fog: false, ai: true });
  g.players.forEach((p) => { p.ai = !CHAOS || p.team !== 0; });
  const stat = { caravans: 0, exchanges: 0, hired: 0, drilled: 0, spyTrips: 0, mines: 0 };
  const ex = g.exchange.bind(g); g.exchange = (u, t, w) => { stat.exchanges++; return ex(u, t, w); };
  const track = new Map(); let t = 0, err = null; const wall0 = Date.now(); let worst = 0;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const chaos = () => {
    const mine = g.units.filter((u) => u.team === 0 && u.hp > 0), bl = g.buildings.filter((b) => b.team === 0 && b.hp > 0);
    const ids = () => { const n = 1 + Math.floor(Math.random() * 4), o = []; for (let i = 0; i < n && mine.length; i++) o.push(pick(mine).id); return o; };
    const anyB = () => pick(g.buildings), anyV = () => pick(g.villages), anyN = () => pick(g.resources);
    const X = () => Math.random() * g.W, Y = () => Math.random() * g.H;
    const kinds = ['cottage', 'farm', 'mill', 'warehouse', 'market', 'mine', 'foundry', 'barracks', 'tower', 'keep', 'tavern', 'forge', 'academy', 'temple', 'stable', 'archery', 'workshop'];
    const goods = ['food', 'wood', 'gold', 'stone', 'copper', 'iron', 'coal', 'silver', 'steel', 'ware'];
    const make = [
      () => ({ type: 'context', ids: ids(), x: X(), y: Y(), want: Math.random() < 0.5 ? pick(goods) : null }),
      () => { const b = anyB(); return { type: 'context', ids: ids(), x: b.x, y: b.y, queue: Math.random() < 0.3 }; },
      () => { const v = anyV(); return { type: 'context', ids: ids(), x: v.x, y: v.y, want: pick(goods) }; },
      () => { const n = anyN(); return { type: 'context', ids: ids(), x: n.x + 0.5, y: n.y + 0.5 }; },
      () => ({ type: 'train', buildingId: (bl.length ? pick(bl) : anyB()).id, kind: pick(['serf', 'footman', 'bowman', 'knight', 'scout', 'camel', 'scholar', 'spy', 'ram']) }),
      () => { const s = g.seatOf(0), n = anyN(); return { type: 'place', kind: pick(kinds), tx: Math.round(s.tx + (Math.random() - 0.5) * 24), ty: Math.round(s.ty + (Math.random() - 0.5) * 24), ids: ids(), nodeId: Math.random() < 0.4 ? n.id : null }; },
      () => ({ type: 'load', unitId: pick(mine.length ? mine : g.units).id, good: pick(goods), amount: Math.floor(Math.random() * 60) - 5 }),
      () => ({ type: 'unload', unitId: pick(mine.length ? mine : g.units).id }),
      () => ({ type: 'role', ids: ids(), role: pick(['spy', 'knight']) }),
      () => ({ type: 'hire', buildingId: (bl.length ? pick(bl) : anyB()).id, index: Math.floor(Math.random() * 7) - 1 }),
      () => ({ type: 'drill', buildingId: (bl.length ? pick(bl) : anyB()).id, unitId: pick(mine.length ? mine : g.units).id, kind: pick(['footman', 'bowman', 'knight', 'serf']) }),
      () => ({ type: 'levy', buildingId: (bl.length ? pick(bl) : anyB()).id, villageId: anyV().id }),
      () => ({ type: 'leave', buildingId: (bl.length ? pick(bl) : anyB()).id }),
      () => ({ type: 'enter', ids: ids(), targetId: Math.random() < 0.5 ? anyB().id : anyV().id }),
      () => ({ type: 'attack', ids: ids(), targetId: Math.random() < 0.5 ? anyB().id : anyV().id }),
      () => ({ type: 'infiltrate', ids: ids(), villageId: anyV().id }),
      () => ({ type: 'mine', ids: ids(), buildingId: anyB().id }),
      () => ({ type: 'unmine', buildingId: anyB().id }),
      () => ({ type: 'cancel', buildingId: anyB().id, index: Math.floor(Math.random() * 3) - 1 }),
      () => ({ type: 'rally', buildingId: anyB().id, x: X(), y: Y() }),
      () => ({ type: 'relation', other: 1 + Math.floor(Math.random() * (houses - 1)), state: pick(['trade', 'peace', 'war']) }),
      () => ({ type: 'respond', from: 1 + Math.floor(Math.random() * (houses - 1)), accept: Math.random() < 0.7 }),
      () => ({ type: 'stop', ids: ids() }),
      () => ({ type: 'gather', ids: ids(), nodeId: anyN().id }),
      () => ({ type: 'build', ids: ids(), buildingId: anyB().id }),
    ];
    for (let i = 0; i < 3; i++) { const it = pick(make)(); it.team = 0; try { g.applyIntent(it); } catch (e) { flag('EXCEPTION in intent ' + it.type + ': ' + e.message, t, e.stack.split('\n').slice(1, 3).join(' | ').trim()); } }
  };
  const sample = () => {
    try { const s = JSON.stringify(g.snapshot()); if (s.includes('null') && /NaN|Infinity/.test(s)) flag('snapshot has NaN', t, ''); if (s.length > 3e6) flag('snapshot huge >3MB', t, s.length); } catch (e) { flag('snapshot failed: ' + e.message, t, ''); }
    for (const u of g.units) {
      if (u.hp <= 0 || u.inside) continue;
      for (const k of ['x', 'y', 'hp']) if (!Number.isFinite(u[k])) flag(`NaN unit.${k} (${u.kind})`, t, u.id);
      const k = u.task, tg = k.type === 'gather' ? g.resources[k.nodeId] : (k.type === 'mine' || k.type === 'build') ? g.byId.get(k.buildingId) : (k.type === 'attack' || k.type === 'infiltrate') ? g.byId.get(k.targetId) : null;
      const inRange = (k.type === 'attack') && tg && distTo(u.x, u.y, tg) <= (UNITS[u.kind].range || 1.2) + 1.2;
      const working = inRange || tg && Math.hypot(u.x - (tg.x + (tg.size ? 0 : 0.5)), u.y - (tg.y + (tg.size ? 0 : 0.5))) < (tg.size ? 1.2 + tg.size : tg.type === 'village' ? 4.5 : 2.6);   // digging in place is not being stuck
      const s = track.get(u.id), moving = MOVING.has(u.task.type) && !working;
      if (!s || !moving || Math.hypot(u.x - s.x, u.y - s.y) > 0.3 || s.task !== u.task.type) track.set(u.id, { x: u.x, y: u.y, t, task: u.task.type });
      else if (t - s.t >= 40) { { const tt = g.byId.get(u.task.targetId ?? u.task.buildingId); flag(`stuck ${u.kind} while '${u.task.type}'`, t, `team ${u.team} #${u.id} at ${u.x.toFixed(1)},${u.y.toFixed(1)} for ${Math.round(t - s.t)}s -> ${tt ? `${tt.kind || 'unit'} t${tt.team ?? tt.owner} hp ${Math.round(tt.hp ?? tt.protection)} at ${tt.x.toFixed(1)},${tt.y.toFixed(1)} dist ${Math.hypot(u.x - tt.x, u.y - tt.y).toFixed(1)} path ${u.path.length} rel ${g.rel[u.team][tt.team ?? tt.owner]}` : 'none'}`); }; s.t = t; }
    }
    for (const p of g.players) {
      for (const k in p) if (typeof p[k] === 'number' && !Number.isFinite(p[k])) flag(`NaN player.${k}`, t, p.team);
      for (const k of ['food', 'wood', 'gold', 'stone', 'copper', 'iron', 'coal', 'silver', 'steel', 'ware']) {
        if (p[k] < -0.01) flag(`negative stock ${k}`, t, `team ${p.team}: ${p[k].toFixed(2)}`);
        if (p[k] > 3000) flag(`hoarding ${k} >3000`, t, `team ${p.team}: ${Math.round(p[k])}`);
      }
      if (!p.alive) continue;
      const serfs = g.units.filter((u) => u.team === p.team && u.kind === 'serf' && u.hp > 0);
      const idle = serfs.filter((u) => u.task.type === 'idle' && !u.inside).length;
      if (serfs.length >= 5 && idle / serfs.length > 0.5 && t > 120) flag('over half the serfs idle', t, `team ${p.team}: ${idle}/${serfs.length}`);
      if (g.popCap(p.team) > 0 && g.popUsed(p.team) >= g.popCap(p.team) && t > 300 && p.wood >= 60 && !g.buildings.some((b) => b.team === p.team && b.kind === 'cottage' && b.built < 1)) flag('population capped with timber to spare and no cottage rising', t, `team ${p.team} pop ${g.popUsed(p.team)}/${g.popCap(p.team)} wood ${Math.round(p.wood)} serfs ${serfs.length} afford ${g.canAfford(p.team, BUILDINGS.cottage.cost)} spots ${(() => { const s = g.seatOf(p.team); let n = 0, why = {}; if (!s) return 'noseat'; for (let y = -22; y <= 22; y++) for (let x = -22; x <= 22; x++) { const c = g.canPlace(p.team, 'cottage', Math.round(s.x + x), Math.round(s.y + y)); if (c.ok) n++; else why[c.reason] = (why[c.reason] || 0) + 1; } return n + ' ' + JSON.stringify(why); })()} bld ${g.buildings.filter((b) => b.team === p.team && b.hp > 0).map((b) => b.kind).join(',')}`);
    }
    // invariants
    for (const b of g.buildings) {
      if (b.hp <= 0) continue;
      for (const id of b.garrison || []) { const u = g.byId.get(id); if (!u || u.inside !== b.id || u.hp <= 0) flag('garrison list out of sync', t, `${b.kind} team ${b.team} unit ${id}`); }
      for (const k in b.stock || {}) if (!(b.stock[k] >= 0) || b.stock[k] > 101) flag('bad shelf value', t, `${k}=${b.stock[k]}`);
    }
    for (const v of g.villages) { for (const k in v.stores || {}) if (!(v.stores[k] >= 0)) flag('bad village stock', t, `${v.name} ${k}=${v.stores[k]}`); for (const id of v.garrison || []) { const u = g.byId.get(id); if (!u || u.inside !== v.id) flag('village garrison out of sync', t, v.name); } }
    for (const u of g.units) {
      if (u.hp <= 0) continue;
      if (u.kind === 'camel' && g.cargoTotal(u) - ((u.cargo && u.cargo.gold) || 0) > 40.01) flag('camel overloaded', t, g.cargoTotal(u));
      if (u.inside && !g.byId.get(u.inside)) flag('unit inside a vanished building', t, `${u.kind} team ${u.team}`);
      const tid = u.task.targetId ?? u.task.buildingId;
      if (tid != null && MOVING.has(u.task.type) && !g.byId.get(tid)) { if (u._van && t - u._van >= 5) flag(`task '${u.task.type}' kept on a vanished target`, t, `${u.kind} team ${u.team}`); u._van = u._van || t; } else u._van = 0;
    }
    for (const b of g.buildings) if (b.kind === 'mine' && b.hp > 0 && b.built >= 1 && !g.minersOf(b) && t > 200 && !g.players[b.team].glut?.[b.ore] && b.nodeIds.some((id) => g.resources[id]?.amount > 0)) flag('mine with no diggers', t, `team ${b.team} ${b.ore}`);
  };
  try {
    for (; t < minutes * 60 && !g.outcome; t += 0.1) { const w = performance.now(); g.tick(0.1); worst = Math.max(worst, performance.now() - w); if (CHAOS && Math.round(t * 10) % 15 === 0) chaos(); if (Math.round(t * 10) % 100 === 0) sample(); }
  } catch (e) { err = e; flag('EXCEPTION ' + e.message, t, e.stack.split('\n').slice(0, 3).join(' | ')); }
  say(`\n== seed ${seed}: ${g.outcome ? g.outcome.result + ' (' + g.outcome.reason + ')' : 'no result'} at ${Math.floor(g.time / 60)}:${String(Math.floor(g.time % 60)).padStart(2, '0')}${err ? ' CRASHED' : ''}`);
  say(`  speed: ${(g.time / ((Date.now() - wall0) / 1000)).toFixed(0)}x realtime, slowest tick ${worst.toFixed(1)} ms`);
  if (worst > 40) flag('slow tick >40 ms', t, `${worst.toFixed(0)} ms`);
  for (const p of g.players) {
    const mine = (k) => g.buildings.filter((b) => b.team === p.team && b.kind === k && b.hp > 0).length;
    const mil = g.militaryOf(p.team).length, serfs = g.units.filter((u) => u.team === p.team && u.kind === 'serf' && u.hp > 0).length;
    const camels = g.units.filter((u) => u.team === p.team && u.kind === 'camel' && u.hp > 0).length;
    say(`  ${p.name.padEnd(12)} ${p.alive ? 'alive' : 'FALLEN'} serfs ${serfs} army ${mil} camels ${camels} villages ${g.villagesOf(p.team).length} | bld ${g.buildings.filter((b) => b.team === p.team && b.hp > 0).length} (mines ${mine('mine')} market ${mine('market')} tavern ${mine('tavern')} keep ${mine('keep')}) | grain ${Math.round(p.food)} timber ${Math.round(p.wood)} coin ${Math.round(p.gold)} stone ${Math.round(p.stone)} iron ${Math.round(p.iron)} coal ${Math.round(p.coal)} steel ${Math.round(p.steel)} arms ${p.arms} sci ${p.sci}`);
  }
  say(`  exchanges ${stat.exchanges}; treaties ${g.rel.flat().filter((r) => r === 'trade').length / 2}; wars ${g.rel.flat().filter((r) => r === 'war').length / 2}`);
}
say('\n== anomalies');
if (!issues.size) say('  none');
for (const [k, v] of [...issues].sort((a, b) => b[1].n - a[1].n)) say(`  x${String(v.n).padEnd(4)} ${k} (first @${Math.round(v.first)}s: ${v.sample})`);
writeFileSync(new URL('../logs/soak-latest.log', import.meta.url), out.join('\n') + '\n');
