// Auld World - the hourly online matches: what the browser and the servers share (no DOM, no Node-only modules).
//   * matchGame: every copy of a match (each player's browser and the server's referee) is built from the start config by this one function
//   * QUICK: the preset messages, the only words players can send each other (owner, 2026-10-22: no free chat, nothing to moderate)
//   * placings and pointsFor: who finished where, and the league points that earns (see ONLINE.md section 5)
import { ranking } from './diplomacy.js';

// Limits of an hourly match. capS: the match ends at two hours and standings decide (owner, 2026-10-22). graceS: how long the match waits
// for the signed-up players before it starts without the missing ones (their houses start under the AI and are handed over when they come).
export const MATCH = { capS: 7200, graceS: 120, sayGapMs: 2000, sayPerMin: 15, awayMs: 30000 };

// Build (or rebuild) the match a start config describes. The referee and every browser call this, so all copies start identical.
export const matchOpts = (c) => ({ seed: c.seed, houses: c.houses, fog: c.fog, diff: c.diff, people: c.people, humans: c.humans, endRule: c.endRule, ai: true });
export function matchGame(game, c) {
  game.reset(matchOpts(c));
  game.playbook = c.playbook || null;
  return game;
}

// Preset messages. {house} is filled with a house the sender picks. The wire carries only the id and the house's seat number; each
// screen writes the words from its own copy of this list, so no text a player typed ever reaches another player.
export const QUICK = [
  { id: 'join', text: 'Join me in defeating {house}.', house: true },
  { id: 'peace', text: 'Will you make peace?' },
  { id: 'trade', text: 'Let us trade.' },
  { id: 'beware', text: 'Beware {house}.', house: true },
  { id: 'help', text: '{house} is attacking me. Help!', house: true },
  { id: 'attack', text: 'Attack {house} now.', house: true },
  { id: 'hold', text: 'I will hold the line.' },
  { id: 'thanks', text: 'Thank you.' },
  { id: 'no', text: 'No.' },
  { id: 'wp', text: 'Well played.' },
  { id: 'gg', text: 'Good game.' },
];
const QUICK_BY_ID = new Map(QUICK.map((q) => [q.id, q]));
export function quickText(id, houseName = '') { const q = QUICK_BY_ID.get(id); return q ? q.text.replace('{house}', houseName) : ''; }
// A message as a player sent it, checked: a known id, a house on the board when the message names one (and none when it does not), and
// a recipient that is a seat on the board or everyone (-1). Anything else is null and is dropped.
export function checkSay(m, houses) {
  if (!m || typeof m.id !== 'string') return null;
  const q = QUICK_BY_ID.get(m.id); if (!q) return null;
  const seat = (v) => Number.isInteger(v) && v >= 0 && v < houses;
  const house = q.house ? (seat(m.house) ? m.house : null) : null;
  if (q.house && house === null) return null;
  const to = m.to === undefined || m.to === -1 ? -1 : seat(m.to) ? m.to : null;
  if (to === null) return null;
  return { id: q.id, house, to };
}

// Where each house finished. The last house standing is first (a conquest). Otherwise the houses still standing come first, in the order
// of the game's own ranking (the Council's Rank: land, folk, power, wealth, learning, arms), then the fallen, the last to fall placed highest.
// fallenAt: { team: game time it fell }. Returns [{ team, place, alive, conquest }] in order of place.
export function placings(g, fallenAt = {}) {
  const living = g.players.filter((p) => p.alive).map((p) => p.team);
  const conquest = living.length === 1;
  const order = conquest ? living : ranking(g).map((s) => s.team).filter((t) => living.includes(t));
  for (const t of living) if (!order.includes(t)) order.push(t);   // (a house the ranking leaves out still finishes among the living)
  const fallen = g.players.filter((p) => !p.alive).map((p) => p.team).sort((a, b) => (fallenAt[b] ?? -1) - (fallenAt[a] ?? -1) || a - b);
  return [...order, ...fallen].map((team, i) => ({ team, place: i + 1, alive: living.includes(team), conquest: conquest && i === 0 }));
}

// League points (ONLINE.md section 5): by place, more for every other person you finished above, and a bonus for a conquest.
// Only people score; humans: the seats people played. Returns { team: points } for those seats.
export const POINTS = { place: [100, 70, 50, 35, 25, 15, 10, 5], perPersonBeaten: 15, conquest: 50 };
export function pointsFor(places, humans) {
  const out = {};
  for (const p of places) {
    if (!humans.includes(p.team)) continue;
    const beaten = places.filter((q) => q.place > p.place && humans.includes(q.team)).length;
    out[p.team] = (POINTS.place[p.place - 1] ?? 0) + POINTS.perPersonBeaten * beaten + (p.conquest ? POINTS.conquest : 0);
  }
  return out;
}
