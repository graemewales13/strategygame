// The production overview (T40) and the idle production count (T50), as in Age of Empires IV. Pure helpers, so the rules test can
// check them headless: one row per finished building of the house that has something in hand (or should have), and the research.
import { PLAYER, UNITS, BUILDINGS, TECH, GEAR } from './config.js';

// buildings that count as idle when nothing is queued and Repeat is off: the soldier and serf makers. Taverns, academies and markets
// train now and then (a spy, a scholar, a camel) and an armoury makes kit, so standing still is their usual state: listed only when busy.
export const IDLE_KINDS = ['keep', 'barracks', 'archery', 'stable', 'workshop'];
const ORDER = [...IDLE_KINDS, 'tavern', 'academy', 'market', 'armoury'];

// one row per building: { id, kind, label, x, y, queue: [{ kind, label, p }], repeat, waiting, idle }, idle ones first by kind, then by id
export function productionRows(game, team = PLAYER) {
  const rows = [];
  for (const b of game.buildings) {
    if (b.team !== team || b.hp <= 0 || b.built < 1 || !ORDER.includes(b.kind)) continue;
    const queue = b.kind === 'armoury'
      ? (b.craft || []).map((q) => ({ kind: q.item, label: GEAR[q.item].label, p: Math.min(1, q.t / GEAR[q.item].time), gear: true }))
      : b.queue.map((q) => ({ kind: q.kind, label: UNITS[q.kind].label, p: Math.min(1, q.t / UNITS[q.kind].time) }));
    const idle = IDLE_KINDS.includes(b.kind) && !queue.length && !b.repeat;
    const waiting = b.repeat && !queue.length ? b.repeatWhy || 'starting' : null;   // (Repeat on but nothing queued: no coin or room; not idle)
    if (!queue.length && !b.repeat && !idle) continue;
    rows.push({ id: b.id, kind: b.kind, label: BUILDINGS[b.kind].label, x: b.x, y: b.y, queue, repeat: b.repeat || null, waiting, idle });
  }
  const rank = (r) => ORDER.indexOf(r.kind);
  return rows.sort((a, c) => (c.idle - a.idle) || rank(a) - rank(c) || a.id - c.id);
}

// the finished soldier and serf makers standing idle (nothing queued, no Repeat), in the order the key cycles them
export function idleProduction(game, team = PLAYER) {
  return productionRows(game, team).filter((r) => r.idle);
}

// what the academies study: { key, label, p, left (seconds at the present rate, null when nothing is learned) }, or null
export function researchRow(game, team = PLAYER) {
  const p = game.players[team], key = p?.research; if (!key || !TECH[key]) return null;
  const cost = TECH[key].cost.learning, have = Math.min(cost, p.learning || 0), rate = p.learnRate || 0;
  return { key, label: TECH[key].label, p: cost ? have / cost : 1, left: rate > 0 ? Math.ceil((cost - have) / rate) : null };
}
