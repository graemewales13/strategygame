// Auld World - battle reports (T63). The rules group every blow between two houses into fights (game.js noteBlow, fileBattle) and
// file each finished battle in `game.battleLog`; this module turns a filed report into the words of the card the player sees when a
// fight his people were in ends, and of the Battles list on the Council. Pure functions of the game state: nothing here touches the
// simulation, and no rule reads a report.
import { PLAYER, BATTLE_WORD, BATTLE_ORDER, RETREAT, KING, DEEDS } from './config.js';

export const BATTLE_SHOW = 24;     // seconds a report card stays up unless closed
export const BATTLE_LIST = 8;      // battles listed on the Council
export const BATTLE_NEAR = 40;     // a battle is named after the nearest village within this many tiles

const sum = (o) => Object.values(o || {}).reduce((a, n) => a + n, 0);
const plural = (c, n) => (BATTLE_WORD[c] ? BATTLE_WORD[c][n === 1 ? 0 : 1] : c);
// "8 foot, 3 bowmen and 1 king" (classes in BATTLE_ORDER), or "none"
export function menWords(by) {
  const parts = BATTLE_ORDER.filter((c) => by?.[c] > 0).map((c) => `${by[c]} ${plural(c, by[c])}`);
  return !parts.length ? 'none' : parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}
const houseName = (g, t, team) => (t === team ? 'you' : g.players[t]?.name || `House ${t}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// the battles a house took part in, newest first
export function battlesOf(g, team = PLAYER) {
  return (g.battleLog || []).filter((r) => r.sides.some((s) => s.team === team)).slice().reverse();
}
// the newest report of `team`'s not yet shown (filed after report id `after`), or null
export function newBattle(g, after, team = PLAYER) {
  for (let i = (g.battleLog || []).length - 1; i >= 0; i--) {
    const r = g.battleLog[i]; if (r.id <= after) break;
    if (r.sides.some((s) => s.team === team)) return r;
  }
  return null;
}
export function battlePlace(g, r) {
  let best = null, bd = BATTLE_NEAR;
  for (const v of g.villages || []) { const d = Math.hypot(v.x - r.x, v.y - r.y); if (d < bd) { bd = d; best = v; } }
  return best ? (bd < 8 ? `at ${best.name}` : `near ${best.name}`) : 'in the open country';
}
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// The report in words for `team`: { title, place, when, lines: [{ text, cls }], verdict: { text, cls } }. "Theirs" is every other house
// in the fight.
export function battleWords(g, r, team = PLAYER) {
  const mine = r.sides.find((s) => s.team === team), others = r.sides.filter((s) => s.team !== team);
  const foes = others;
  const lines = [];
  const who = (s) => `${houseName(g, s.team, team) === 'you' ? 'You' : houseName(g, s.team, team)} (${s.n}: ${menWords(s.men)})`;
  lines.push({ text: `${mine ? who(mine) : 'Nobody of yours'} against ${foes.map(who).join(' and ') || 'nobody'}.`, cls: '' });
  const lost = (s) => {
    const d = sum(s.dead), parts = [];
    parts.push(d ? `${d} dead (${menWords(s.dead)})` : 'none dead');
    if (s.hurt) parts.push(`${s.hurt} wounded`);
    if (s.razed) parts.push(`${s.razed} building${s.razed === 1 ? '' : 's'} lost`);
    return parts.join(', ');
  };
  if (mine) lines.push({ text: `Your losses: ${lost(mine)}.`, cls: sum(mine.dead) || mine.razed ? 'bad' : '' });
  for (const s of foes) lines.push({ text: `${cap(houseName(g, s.team, team))}'s losses: ${lost(s)}.`, cls: sum(s.dead) || s.razed ? 'good' : '' });
  // the king's part
  if (mine?.men.king) lines.push({ text: `Your ${g.kingOf?.(team)?.title || 'king'} fought in it${r.cries.includes(team) ? ' and cried his men on' : ''}.`, cls: '' });
  else if (r.cries.includes(team)) lines.push({ text: 'Your king\'s war cry steadied the men in it.', cls: '' });
  for (const t of r.cries) if (t !== team) lines.push({ text: `${cap(houseName(g, t, team))}'s king cried his men on.`, cls: 'warn' });
  for (const k of r.kings) lines.push({ text: k.team === team ? `Your ${k.name} fell${k.last ? ': the last of your line' : `; an heir takes the crown in ${KING.heir} s`}.` : `${cap(houseName(g, k.team, team))}'s ${k.name} fell${k.last ? ', the last of the line' : ''}.`, cls: k.team === team ? 'bad' : 'good' });
  // deeds earned
  const deeds = r.deeds.filter((d) => d.team === team);
  if (deeds.length) lines.push({ text: `Deeds: ${deeds.slice(0, 4).map((d) => `${d.name}, ${DEEDS[d.deed]?.label || d.deed}`).join('; ')}${deeds.length > 4 ? ` and ${deeds.length - 4} more` : ''}.`, cls: 'good' });
  // what it cost or won
  for (const t of r.routs) lines.push(t === team ? { text: `Your army fled the field: every village of yours lost ${Math.round(RETREAT.loyalty * 100)}% of its loyalty.`, cls: 'bad' } : { text: `${cap(houseName(g, t, team))}'s army fled the field: their villages waver.`, cls: 'good' });
  for (const v of r.villages) lines.push(v.to === team ? { text: `You took ${v.name}.`, cls: 'good' } : v.from === team ? { text: `You lost ${v.name} to ${houseName(g, v.to, team)}.`, cls: 'bad' } : { text: `${cap(houseName(g, v.to, team))} took ${v.name}.`, cls: '' });
  // the trade: what each side lost in men, by their cost
  const mineW = mine ? mine.worth : 0, theirW = foes.reduce((a, s) => a + s.worth, 0);
  let verdict;
  if (!mineW && !theirW) verdict = { text: 'Nobody fell: a skirmish.', cls: '' };
  else if (theirW >= mineW * 1.5) verdict = { text: `A good trade: they lost ${theirW} in men to your ${mineW}.`, cls: 'good' };
  else if (mineW >= theirW * 1.5) verdict = { text: `A costly fight: you lost ${mineW} in men to their ${theirW}.`, cls: 'bad' };
  else verdict = { text: `An even trade: ${mineW} in men lost against their ${theirW}.`, cls: '' };
  const secs = Math.max(1, Math.round(r.t1 - r.t0));
  return { title: `Battle ${battlePlace(g, r)}`, place: battlePlace(g, r), when: `${clock(r.t0)}, ${secs < 60 ? `${secs} s` : `${Math.round(secs / 60)} min`}`, lines, verdict };
}
// one line for the Council's Battles list
export function battleRow(g, r, team = PLAYER) {
  const mine = r.sides.find((s) => s.team === team), foes = r.sides.filter((s) => s.team !== team);
  return `${clock(r.t0)} ${battlePlace(g, r)}: against ${foes.map((s) => g.players[s.team]?.name || s.team).join(' and ')}; you lost ${sum(mine?.dead)}, they lost ${foes.reduce((a, s) => a + sum(s.dead), 0)}`;
}
