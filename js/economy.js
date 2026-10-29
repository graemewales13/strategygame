// The economy overview (T51), as AoE IV's economic panel and Manor Lords' labour screen. Pure helpers, so the rules test can check them
// headless: who works at what, each mine's crew, the farms, what every market and warehouse holds, and how each good has moved lately.
import { PLAYER, NODE_RES, ALL_GOODS, MINE_MAX_WORKERS, INCOME_SOURCES } from './config.js';

// the jobs a serf can be counted under, in the order the panel lists them
export const JOBS = ['wood', 'food', 'gold', 'build', 'shelter', 'walking', 'idle'];
export const JOB_LABEL = { wood: 'Timber', food: 'Berries', gold: 'Panning coin', build: 'Building and repair', shelter: 'Sheltering', walking: 'On the move', idle: 'Idle' };

// what one serf is doing, as one of JOBS
export function jobOf(game, u) {
  if (u.inside) return 'shelter';
  const t = u.task || {};
  if (t.type === 'gather' || t.type === 'return') {
    const node = game.resources[t.type === 'gather' ? t.nodeId : t.resume];
    const res = node ? NODE_RES[node.kind] : u.carry?.kind;
    return res === 'wood' || res === 'food' || res === 'gold' ? res : 'walking';
  }
  if (t.type === 'build' || t.type === 'repair') return 'build';
  if (t.type === 'idle') return 'idle';
  return 'walking';
}

// { serfs, jobs: { job: [ids] }, mines: [{ id, mineral, n, max, x, y }], farms: [ids] } for the house
export function labour(game, team = PLAYER) {
  const jobs = Object.fromEntries(JOBS.map((j) => [j, []]));
  let serfs = 0;
  for (const u of game.units) {
    if (u.team !== team || u.kind !== 'serf' || u.hp <= 0) continue;
    serfs++; jobs[jobOf(game, u)].push(u.id);
  }
  const mines = [], farms = [];
  for (const b of game.buildings) {
    if (b.team !== team || b.hp <= 0 || b.built < 1) continue;
    if (b.kind === 'farm') farms.push(b.id);
    if (b.kind !== 'mine') continue;
    const node = (b.nodeIds || []).map((id) => game.resources[id]).find((n) => n && n.amount > 0) || game.resources[b.nodeIds?.[0]];
    mines.push({ id: b.id, mineral: node?.kind || null, spent: !node || !(node.amount > 0), n: game.minersOf(b), max: MINE_MAX_WORKERS, x: b.x, y: b.y });
  }
  mines.sort((a, c) => (a.n - c.n) || a.id - c.id);   // the emptiest first: those are the ones to fix
  return { serfs, jobs, mines, farms };
}

// every finished market and warehouse of the house with what it holds: [{ id, kind, x, y, goods: [[good, n]] }], markets first
export function stores(game, team = PLAYER) {
  const out = [];
  for (const b of game.buildings) {
    if (b.team !== team || b.hp <= 0 || b.built < 1 || (b.kind !== 'market' && b.kind !== 'warehouse')) continue;
    const goods = ALL_GOODS.map((k) => [k, Math.floor(b.stock?.[k] || 0)]).filter(([, n]) => n > 0).sort((a, c) => c[1] - a[1]);
    out.push({ id: b.id, kind: b.kind, x: b.x, y: b.y, goods });
  }
  return out.sort((a, c) => (a.kind === c.kind ? a.id - c.id : a.kind === 'market' ? -1 : 1));
}

// ---- how the stockpile has moved: the panel notes it every few seconds of game time and reads the change a minute
export const RATE = { every: 5, span: 120 };
export function noteStock(hist, game, team = PLAYER) {
  const p = game.players[team]; if (!p) return hist;
  const last = hist.at(-1);
  if (last && (game.time < last.t || game.seed !== last.seed)) hist.length = 0;   // a new match or a load: start again
  else if (last && game.time - last.t < RATE.every) return hist;
  hist.push({ t: game.time, seed: game.seed, goods: Object.fromEntries(ALL_GOODS.map((k) => [k, p[k] || 0])) });
  while (hist.length > 2 && game.time - hist[1].t >= RATE.span) hist.shift();
  return hist;
}
// { good: change a minute } between the oldest note kept and now, or null before a stretch of at least 20 s has been seen
export function netRates(hist, game, team = PLAYER) {
  const p = game.players[team], first = hist[0]; if (!p || !first) return null;
  const dt = game.time - first.t; if (dt < 20) return null;
  return Object.fromEntries(ALL_GOODS.map((k) => [k, ((p[k] || 0) - first.goods[k]) * 60 / dt]));
}
// coin earned a minute by source (the smoothed rates the game already keeps), the largest first
export function coinBySource(game, team = PLAYER) {
  const inc = game.players[team]?.inc || {};
  return INCOME_SOURCES.map((k) => [k, (inc[k] || 0) * 60]).filter(([, v]) => v >= 0.5).sort((a, c) => c[1] - a[1]);
}
