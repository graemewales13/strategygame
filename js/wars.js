// Auld World - the war overview (T71). The rules keep a war book (game.js openWar, bookBattle, bookVillage, bookKing): one record per
// war between two houses, from its declaration. This module turns it into the Council's Wars section: one row per war of the player's,
// with both sides as they stand (allies at war with the foe, a coalition's members), the battles won and lost, the dead and their worth,
// villages taken and lost, kings slain, how long it has run, and the last battles as a click to the spot; and the wars ended.
// Pure functions of the game state: nothing here touches the simulation, and no rule reads it.
import { PLAYER, WAR_BOOK } from './config.js';
import { coalitionOf } from './diplomacy.js';

export const WAR_SPOTS = 3;   // the last battles of a war offered as a click to the spot

const at = (g, a, b) => a !== b && g.rel[a]?.[b] === 'war';
const alive = (g, t) => !!g.players[t]?.alive;
const nameOf = (g, t) => (t === PLAYER ? 'you' : g.players[t]?.name || `House ${t}`);
export const warClock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const span = (s) => (s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.round(s / 60)} min`);

// The player's wars under way, grouped: a coalition against him is one war (its members at war with him); each other foe is its own.
// For each: ours (the player, his allies and his coalition's members at war with any of theirs) and theirs.
export function warSides(g, team = PLAYER) {
  if (!alive(g, team)) return [];   // a fallen house fights no more: its wars are among those ended
  const foes = g.players.filter((p) => p.alive && at(g, team, p.team)).map((p) => p.team), done = new Set(), out = [];
  for (const D of foes) {
    if (done.has(D)) continue;
    const ca = (g.coalitions || []).find((c) => c.state === 'war' && c.against === team && c.members.includes(D));
    const theirs = ca ? ca.members.filter((m) => foes.includes(m)) : [D];
    theirs.forEach((t) => done.add(t));
    const mine = coalitionOf(g, team), ours = [team];
    for (const p of g.players) {
      const s = p.team; if (s === team || !alive(g, s) || !theirs.some((t) => at(g, s, t))) continue;
      const sworn = mine && mine.state === 'war' && theirs.includes(mine.against) && mine.members.includes(s);
      if (sworn || g.rel[team][s] === 'alliance') ours.push(s);
    }
    out.push({ ours, theirs, coalition: ca || (mine && mine.state === 'war' && theirs.includes(mine.against) ? mine : null) });
  }
  return out;
}

// The tally of a war between two sides, from every record between a house of each (a battle fought by several is counted once).
export function warTally(g, ours, theirs, books = null) {
  const recs = [];
  for (const s of ours) for (const t of theirs) { const w = books ? books.find((b) => (b.a === s && b.b === t) || (b.a === t && b.b === s)) : g.warOf?.(s, t); if (w) recs.push(w); }
  const bat = new Map(), T = { t0: Infinity, battles: 0, won: 0, lost: 0, even: 0, dead: [0, 0], worth: [0, 0], razed: [0, 0], vil: [0, 0], kings: [0, 0], spots: [] };
  for (const w of recs) {
    T.t0 = Math.min(T.t0, w.t0);
    for (const e of w.bat) { const m = bat.get(e.id) || { id: e.id, t: e.t, x: e.x, y: e.y, d: {}, w: {}, r: {} }; Object.assign(m.d, e.d); Object.assign(m.w, e.w); Object.assign(m.r, e.r); bat.set(e.id, m); }
    const s = ours.includes(w.a) ? w.a : w.b, t = s === w.a ? w.b : w.a;
    T.vil[0] += w.vil[s] || 0; T.vil[1] += w.vil[t] || 0;     // villages we took, and they took
    T.kings[0] += w.kings[s] || 0; T.kings[1] += w.kings[t] || 0;   // kings we lost, and they lost
  }
  const sumOf = (o, side) => side.reduce((a, t) => a + (o[t] || 0), 0);
  for (const m of [...bat.values()].sort((a, b) => a.id - b.id)) {
    const wo = sumOf(m.w, ours), wt = sumOf(m.w, theirs);
    T.battles++; T.dead[0] += sumOf(m.d, ours); T.dead[1] += sumOf(m.d, theirs); T.worth[0] += wo; T.worth[1] += wt; T.razed[0] += sumOf(m.r, ours); T.razed[1] += sumOf(m.r, theirs);
    if (wt && wt >= wo * WAR_BOOK.won) T.won++; else if (wo && wo >= wt * WAR_BOOK.won) T.lost++; else T.even++;
    T.spots.push({ id: m.id, t: m.t, x: m.x, y: m.y });
  }
  T.spots = T.spots.slice(-WAR_SPOTS).reverse();
  if (!Number.isFinite(T.t0)) T.t0 = g.time;
  return T;
}

// How it goes, by what each side has lost (men by their worth, buildings, villages and kings), in a word and a class.
export function warVerdict(T) {
  const ours = T.worth[0] + T.razed[0] * 100 + T.vil[1] * 300 + T.kings[0] * 400, theirs = T.worth[1] + T.razed[1] * 100 + T.vil[0] * 300 + T.kings[1] * 400;
  if (!ours && !theirs) return { text: 'No blood yet', cls: '' };
  if (theirs >= ours * WAR_BOOK.won) return { text: 'Going your way', cls: 'good' };
  if (ours >= theirs * WAR_BOOK.won) return { text: 'Going against you', cls: 'bad' };
  return { text: 'In the balance', cls: '' };
}
const list = (g, side, team) => side.map((t) => nameOf(g, t)).join(', ').replace(/^you/, 'You');
// The words of one war for the Council: { title, sides, lines, verdict, spots }
export function warWords(g, w, team = PLAYER) {
  const T = warTally(g, w.ours, w.theirs);
  const lines = [];
  lines.push(`${T.battles ? `${T.battles} battle${T.battles === 1 ? '' : 's'}: ${T.won} won, ${T.lost} lost, ${T.even} even` : 'No battle yet'}.`);
  lines.push(`Dead: ours ${T.dead[0]} (${T.worth[0]} in men), theirs ${T.dead[1]} (${T.worth[1]})${T.razed[0] || T.razed[1] ? `; buildings lost ${T.razed[0]} to ${T.razed[1]}` : ''}.`);
  if (T.vil[0] || T.vil[1]) lines.push(`Villages: we took ${T.vil[0]}, they took ${T.vil[1]}.`);
  if (T.kings[0] || T.kings[1]) lines.push(`Kings slain: ${T.kings[1]} of theirs, ${T.kings[0]} of ours.`);
  const lead = w.theirs.length > 1 ? `the coalition of ${list(g, w.theirs, team)}` : nameOf(g, w.theirs[0]);
  return {
    title: `War with ${lead}`, since: `since ${warClock(T.t0)} (${span(g.time - T.t0)})`,
    sides: `${list(g, w.ours, team)}${w.coalition && w.coalition.against !== team ? ' (coalition)' : ''} against ${list(g, w.theirs, team)}`,
    lines, verdict: warVerdict(T), spots: T.spots,
  };
}
// The player's wars ended (newest first), one line each
export function pastWars(g, team = PLAYER) {
  return (g.warsPast || []).filter((w) => w.a === team || w.b === team).slice().reverse().map((w) => {
    const foe = w.a === team ? w.b : w.a, T = warTally(g, [team], [foe], [w]);
    const how = w.how === 'peace' ? 'ended in peace' : g.players[foe]?.alive === false ? (w.how === 'ended' ? 'you ended their line' : 'their line ended by another hand') : 'your line ended';
    return { text: `${g.players[foe]?.name || foe}, ${warClock(w.t0)} to ${warClock(w.t1)} (${span(w.t1 - w.t0)}): ${how}; ${T.won} won, ${T.lost} lost; dead ${T.dead[0]} to ${T.dead[1]}${T.vil[0] || T.vil[1] ? `; villages ${T.vil[0]} to ${T.vil[1]}` : ''}`, cls: warVerdict(T).cls };
  });
}
