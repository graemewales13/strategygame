// Auld World - battle reports (T63). The rules group every blow between two houses into fights (game.js noteBlow, fileBattle) and
// file each finished battle in `game.battleLog`; this module turns a filed report into the words of the card the player sees when a
// fight his people were in ends, and of the Battles list on the Council. Pure functions of the game state: nothing here touches the
// simulation, and no rule reads a report.
import { PLAYER, BATTLE_WORD, BATTLE_ORDER, RETREAT, KING, DEEDS, WAR_BOOK, AFTERMATH } from './config.js';

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

// Who in a report fought on `team`'s side: the houses not at war with it when the fight ended (T-136: an ally's dead are not the foe's).
// A report filed before the field was kept falls back on the houses' standing now.
const foeIn = (g, r, team, t) => (r.wars ? r.wars.includes(team < t ? `${team}>${t}` : `${t}>${team}`) : g.rel?.[team]?.[t] === 'war');
export function battleSides(g, r, team = PLAYER) {
  const others = r.sides.filter((s) => s.team !== team);
  let foes = others.filter((s) => foeIn(g, r, team, s.team));
  if (!foes.length) foes = others;   // (a fight with nobody at war, a brawl after a peace: everyone else stands against you)
  return { mine: r.sides.find((s) => s.team === team), friends: others.filter((s) => !foes.includes(s)), foes };
}
// The report in words for `team`: { title, place, when, lines: [{ text, cls }], verdict: { text, cls } }. "Theirs" is every other house
// in the fight.
export function battleWords(g, r, team = PLAYER) {
  const { mine, friends, foes } = battleSides(g, r, team), foe = (t) => foes.some((s) => s.team === t);
  const lines = [];
  const who = (s) => `${houseName(g, s.team, team) === 'you' ? 'You' : houseName(g, s.team, team)} (${s.n}: ${menWords(s.men)})`;
  lines.push({ text: `${[mine ? who(mine) : 'Nobody of yours', ...friends.map(who)].join(' with ')} against ${foes.map(who).join(' and ') || 'nobody'}.`, cls: '' });
  const lost = (s) => {
    const d = sum(s.dead), parts = [];
    parts.push(d ? `${d} dead (${menWords(s.dead)})` : 'none dead');
    if (s.hurt) parts.push(`${s.hurt} wounded`);
    if (s.razed) parts.push(`${s.razed} building${s.razed === 1 ? '' : 's'} lost`);
    return parts.join(', ');
  };
  if (mine) lines.push({ text: `Your losses: ${lost(mine)}.`, cls: sum(mine.dead) || mine.razed ? 'bad' : '' });
  for (const s of friends) lines.push({ text: `${cap(houseName(g, s.team, team))}'s losses, at your side: ${lost(s)}.`, cls: '' });
  for (const s of foes) lines.push({ text: `${cap(houseName(g, s.team, team))}'s losses: ${lost(s)}.`, cls: sum(s.dead) || s.razed ? 'good' : '' });
  // the king's part
  if (mine?.men.king) lines.push({ text: `Your ${g.kingOf?.(team)?.title || 'king'} fought in it${r.cries.includes(team) ? ' and cried his men on' : ''}.`, cls: '' });
  else if (r.cries.includes(team)) lines.push({ text: 'Your king\'s war cry steadied the men in it.', cls: '' });
  for (const t of r.cries) if (t !== team) lines.push({ text: `${cap(houseName(g, t, team))}'s king cried his men on.`, cls: foe(t) ? 'warn' : '' });
  for (const k of r.kings) lines.push({ text: k.team === team ? `Your ${k.name} fell${k.last ? ': the last of your line' : `; an heir takes the crown in ${KING.heir} s`}.` : `${cap(houseName(g, k.team, team))}'s ${k.name} fell${k.last ? ', the last of the line' : ''}.`, cls: k.team === team ? 'bad' : foe(k.team) ? 'good' : 'warn' });
  // deeds earned
  const deeds = r.deeds.filter((d) => d.team === team);
  if (deeds.length) lines.push({ text: `Deeds: ${deeds.slice(0, 4).map((d) => `${d.name}, ${DEEDS[d.deed]?.label || d.deed}`).join('; ')}${deeds.length > 4 ? ` and ${deeds.length - 4} more` : ''}.`, cls: 'good' });
  // what it cost or won
  for (const t of r.routs) lines.push(t === team ? { text: `Your army fled the field: every village of yours lost ${Math.round(RETREAT.loyalty * 100)}% of its loyalty.`, cls: 'bad' } : { text: `${cap(houseName(g, t, team))}'s army fled the field: their villages waver.`, cls: foe(t) ? 'good' : 'warn' });
  for (const v of r.villages) lines.push(v.to === team ? { text: `You took ${v.name}.`, cls: 'good' } : v.from === team ? { text: `You lost ${v.name} to ${houseName(g, v.to, team)}.`, cls: 'bad' } : { text: `${cap(houseName(g, v.to, team))} took ${v.name}.`, cls: '' });
  // the trade: what each side lost in men, by their cost
  // (your side is you and the houses that fought beside you; WAR_BOOK.won is the war overview's measure of a battle won too, T71)
  const { trade, mineW, theirW } = battleTrade(g, r, team), yours = friends.length ? 'your side\'s' : 'your', you = friends.length ? 'your side' : 'you';
  const verdict = trade === 'none' ? { text: 'Nobody fell: a skirmish.', cls: '' }
    : trade === 'good' ? { text: `A good trade: they lost ${theirW} in men to ${yours} ${mineW}.`, cls: 'good' }
    : trade === 'bad' ? { text: `A costly fight: ${you} lost ${mineW} in men to their ${theirW}.`, cls: 'bad' }
    : { text: `An even trade: ${mineW} in men lost against their ${theirW}.`, cls: '' };
  const secs = Math.max(1, Math.round(r.t1 - r.t0));
  return { title: `Battle ${battlePlace(g, r)}`, place: battlePlace(g, r), when: `${clock(r.t0)}, ${secs < 60 ? `${secs} s` : `${Math.round(secs / 60)} min`}`, lines, verdict };
}
// The trade of men for `team`'s side (it and the houses beside it) against the foes, by the worth of the dead: 'good' when the foes lost
// WAR_BOOK.won times what your side did, 'bad' the other way round, 'even' between, 'none' when nobody fell. The report's verdict and the
// minimap's battle mark (T67) both read it.
export function battleTrade(g, r, team = PLAYER) {
  const { mine, friends, foes } = battleSides(g, r, team);
  const mineW = (mine ? mine.worth : 0) + friends.reduce((a, s) => a + s.worth, 0), theirW = foes.reduce((a, s) => a + s.worth, 0);
  const trade = !mineW && !theirW ? 'none' : theirW >= mineW * WAR_BOOK.won ? 'good' : mineW >= theirW * WAR_BOOK.won ? 'bad' : 'even';
  return { trade, mineW, theirW };
}
// T67: the player's battles still marked on the minimap, newest last: { r, x, y, age, trade } while younger than AFTERMATH.mark s
export function battleMarks(g, team = PLAYER) {
  const out = [];
  for (const r of g.battleLog || []) {
    const age = g.time - r.t1; if (age < 0 || age > AFTERMATH.mark || !r.sides.some((s) => s.team === team)) continue;
    out.push({ r, x: r.x, y: r.y, age, trade: battleTrade(g, r, team).trade });
  }
  return out;
}
// T67: what lies on the field where men fell in filed battles younger than AFTERMATH.field s: { x, y, kind, fade (1 fresh .. 0 gone),
// mine (the player's men were in that battle: he saw it, so it shows wherever he has explored; else only where he can see now) }.
// The kind is fixed per spot from the report id: a king leaves a fallen banner, the rest a broken spear or a dropped shield.
export function battleLitter(g, team = PLAYER) {
  const out = [];
  for (const r of g.battleLog || []) {
    const age = g.time - r.t1; if (age < 0 || age > AFTERMATH.field || !r.falls?.length) continue;
    const fade = Math.min(1, (AFTERMATH.field - age) / AFTERMATH.fade), mine = r.sides.some((s) => s.team === team);
    r.falls.forEach((f, i) => out.push({ x: f.x, y: f.y, kind: f.c === 'king' ? 'banner' : ((r.id * 7 + i * 13) % 5) < 3 ? 'spear' : 'shield', fade, mine, team: f.team, turn: ((r.id * 31 + i * 17) % 8) / 8 }));
  }
  return out;
}
// one line for the Council's Battles list
export function battleRow(g, r, team = PLAYER) {
  const { mine, friends, foes } = battleSides(g, r, team);
  return `${clock(r.t0)} ${battlePlace(g, r)}: ${friends.length ? `with ${friends.map((s) => g.players[s.team]?.name || s.team).join(' and ')} ` : ''}against ${foes.map((s) => g.players[s.team]?.name || s.team).join(' and ')}; you lost ${sum(mine?.dead)}, they lost ${foes.reduce((a, s) => a + sum(s.dead), 0)}`;
}
