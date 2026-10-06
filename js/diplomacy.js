// Auld World - how the houses regard one another.
// Every house keeps an OPINION of every other (-100 hateful .. +100 devoted). It drifts with trade, common enemies, envy of the strongest house,
// and jumps with gifts, broken oaths, sacked villages and slain kings. Leaders judge requests (alliance, trade, peace, "join my war", tribute, aid)
// from opinion, relative strength and their own temper (see KING / TEMPERS in config.js). Rival leaders also write to the player and to each other:
// the same judging code answers a human's request, an AI's request of a human (as a letter with Accept / Decline) and an AI's request of an AI.
import { PLAYER, HOUSES, WAR_MIN } from './config.js';
import { shortName } from './names.js';

export const DIPLO = {
  every: 6,                     // seconds between a leader's deliberations
  opinionEvery: 5,              // seconds between opinion drifts
  letterGap: 25,                // an AI writes to the player at most this often (overall)
  expire: { treaty: 120, joinwar: 90, tribute: 90, aid: 90 },
  cool: { gift: 45, demand: 150, askwar: 120, askaid: 120, alliance: 90, letter: 240 },
  need: { trade: -10, alliance: 30, joinwar: 25, aid: 25 },
  maxLetters: 3,                // unanswered letters waiting on the player
  minGiftGold: 10,
};

export const ATTITUDES = [[60, 'Devoted'], [30, 'Friendly'], [10, 'Warm'], [-10, 'Neutral'], [-30, 'Cool'], [-60, 'Hostile'], [-101, 'Hateful']];
export const attitudeLabel = (o) => ATTITUDES.find(([min]) => o >= min)[1];

const pers = (g, t) => g.players[t]?.persona || { aggr: 0.5, greed: 0.5, honor: 0.5, wary: 0.5, temper: 'cunning' };
export const nameOf = (g, t) => HOUSES[t].short;
export const leaderName = (g, t) => { const k = g.kingOf(t), p = g.players[t]; return k ? `${k.title} ${shortName(k.name)}` : p.kingName ? `${shortName(p.kingName)}'s regent` : `The regent of ${nameOf(g, t)}`; };
export const op = (g, a, b) => g.opinion[a][b];
export const strength = (g, t) => Math.max(1, g.powerOfTeam(t) + 0.8 * g.villagesOf(t).length);
export const alive = (g, t) => !!g.players[t]?.alive;
export const alliesOf = (g, t) => g.players.filter((q) => q.team !== t && q.alive && g.rel[t][q.team] === 'alliance').map((q) => q.team);
export const enemiesOf = (g, t) => g.players.filter((q) => q.team !== t && q.alive && g.rel[t][q.team] === 'war').map((q) => q.team);
const sharedEnemies = (g, a, b) => enemiesOf(g, a).filter((c) => g.rel[b][c] === 'war');
export const cooled = (g, a, b, kind) => g.time - (g.cool[a + '>' + b + ':' + kind] ?? -1e9) >= DIPLO.cool[kind];
export const stamp = (g, a, b, kind) => { g.cool[a + '>' + b + ':' + kind] = g.time; };

// ---- opinions -----------------------------------------------------------------------------------------
export function shift(g, a, b, d, why) {
  if (a === b || !alive(g, a) || !g.opinion) return;
  const was = g.opinion[a][b];
  g.opinion[a][b] = Math.max(-100, Math.min(100, was + d));
  if (why && Math.abs(d) >= 3) { const l = (g.whyOp[a + '>' + b] ||= []); l.unshift({ t: g.time, d: Math.round(d), why }); if (l.length > 5) l.length = 5; }
}
// slow drift, every opinionEvery seconds: what makes friends and enemies without anyone writing a letter
export function drift(g) {
  const top = g.players.filter((p) => p.alive).sort((x, y) => strength(g, y.team) - strength(g, x.team))[0]?.team;
  for (const A of g.players) {
    if (!A.alive || A.team === PLAYER) continue;
    const a = A.team, pr = pers(g, a);
    for (const B of g.players) {
      if (!B.alive || B.team === a || !g.known[a][B.team]) continue;
      const b = B.team, rel = g.rel[a][b]; let d = -g.opinion[a][b] * 0.012;                  // feelings fade toward indifference
      if (rel === 'trade') d += 0.3 + pr.greed * 0.3;
      if (rel === 'alliance') d += 0.45 + pr.honor * 0.25;
      if (rel === 'war') d -= 0.8;
      d += 0.5 * sharedEnemies(g, a, b).length;
      for (const c of alliesOf(g, a)) if (c !== b && g.rel[b][c] === 'war') d -= 1.0;          // you are fighting my friend
      for (const c of enemiesOf(g, a)) if (c !== b && g.rel[b][c] === 'alliance') d -= 0.5;   // you befriend my enemy
      const sa = strength(g, a), sb = strength(g, b);
      if (rel !== 'alliance') {
        if (sb > sa * 1.8) d -= 0.25 + pr.greed * 0.3;                                         // envy of the stronger
        if (b === top && rel !== 'trade') d -= 0.25;                                           // balance of power: the strongest is watched by all
        if (sb < sa * 0.5 && pr.aggr > 0.55) d -= 0.3;                                         // contempt for the weak, from the warlike
      }
      g.opinion[a][b] = Math.max(-100, Math.min(100, g.opinion[a][b] + d));
    }
  }
}

// ---- judging requests ---------------------------------------------------------------------------------
const settled = (g, a, b) => g.time - g.relSince[a][b] < 240;   // a peace just made is not broken at once
const yes = (extra = {}) => ({ ok: true, ...extra });
const no = (why) => ({ ok: false, why });
// `to` (an AI house) answers a request from `from`. kind: trade | peace | alliance | joinwar {target} | tribute {amount} | aid {amount}
export function judge(g, kind, from, to, ctx = {}) {
  const pr = pers(g, to), o = op(g, to, from), N = nameOf(g, from), me = leaderName(g, to);
  const sTo = strength(g, to), sFrom = strength(g, from), rel = g.rel[to][from];
  switch (kind) {
    case 'trade': {
      if (o < (pr.greed > 0.6 ? DIPLO.need.trade - 15 : DIPLO.need.trade)) return no(`${me} does not trust ${N} enough to trade (${attitudeLabel(o).toLowerCase()}).`);
      return yes();
    }
    case 'peace': {
      if (o < -60) return no(`${me} will hear nothing from ${N} (${attitudeLabel(o).toLowerCase()}).`);
      return yes();
    }
    case 'alliance': {
      if (rel === 'war') return no('End the war first.');
      const need = pr.temper === 'honourable' ? DIPLO.need.alliance - 8 : pr.temper === 'cunning' ? DIPLO.need.alliance - 3 : DIPLO.need.alliance;
      if (o < need) return no(`${me} does not yet count ${N} a friend (${attitudeLabel(o)}, ${o >= 0 ? '+' : ''}${Math.round(o)}; needs ${need}). Trade, gifts and common enemies warm him.`);
      if (rel !== 'alliance' && alliesOf(g, to).length >= 2) return no(`${me} is already bound by two oaths.`);
      for (const c of alliesOf(g, to)) if (c !== from && g.rel[from][c] === 'war') return no(`${me} is bound to ${nameOf(g, c)}, whom you are fighting.`);
      if (pr.temper === 'cunning' && sFrom < sTo * 0.7) return no(`${me} sees no use in an alliance with the weak.`);
      if (pr.temper === 'warlike' && !enemiesOf(g, to).length && !sharedEnemies(g, to, from).length) return no(`${me}: "Give me a common enemy and we will talk."`);
      return yes();
    }
    case 'joinwar': {
      const T = ctx.target;
      if (T === to || T === from || !alive(g, T)) return no('There is no such foe.');
      if (rel !== 'alliance' && o < DIPLO.need.joinwar) return no(`${me} is not close enough to ${N} to take up their quarrels.`);
      if (g.rel[to][T] === 'war') return yes({ already: true });
      if (g.rel[to][T] === 'alliance') return no(`${nameOf(g, T)} is ${me}'s ally.`);
      if (!g.known[to][T]) return no(`${me} has not even met ${nameOf(g, T)}.`);
      if (settled(g, to, T)) return no(`${me} has only just made peace with ${nameOf(g, T)}.`);
      if (pr.honor > 0.65 && g.rel[to][T] === 'trade') return no(`${me} trades with ${nameOf(g, T)} and will not betray a treaty.`);
      const sT = strength(g, T), bar = sT * (0.8 + pr.wary * 0.7) * (op(g, to, T) < -20 ? 0.7 : 1);
      if (sTo + sFrom < bar) return no(`${me}: "${nameOf(g, T)} is too strong for the two of us."`);
      return yes();
    }
    case 'tribute': {
      const amount = ctx.amount || 0, bar = 1.7 - pr.wary * 0.5 + (pr.honor > 0.7 ? 0.5 : 0);
      if (g.players[to].gold < amount) return no(`${me} has not that much coin.`);
      if (sFrom / sTo < bar) return no(`${me} laughs: "Come and take it, ${N}."`);
      return yes();
    }
    case 'aid': {
      const amount = ctx.amount || 0;
      if (o < DIPLO.need.aid) return no(`${me} owes ${N} nothing yet.`);
      if (g.players[to].gold < amount * 2.5) return no(`${me} cannot spare the coin.`);
      return yes();
    }
  }
  return no('Unknown request.');
}

// ---- effects of an accepted request (shared by every route) ------------------------------------------------
export function exec(g, kind, from, to, ctx = {}) {   // `from` asked, `to` agreed
  switch (kind) {
    case 'alliance': g.setRelation(from, to, 'alliance'); shift(g, to, from, 6, 'sealed our alliance'); shift(g, from, to, 6, 'sealed our alliance'); break;
    case 'joinwar': { const T = ctx.target; if (g.rel[to][T] !== 'war') g.setRelation(to, T, 'war'); shift(g, from, to, 12, `joined our war on ${nameOf(g, T)}`); shift(g, to, from, 6, 'asked and was heard'); break; }
    case 'tribute': g.players[to].gold -= ctx.amount; g.earn(from, 'tribute', ctx.amount); shift(g, to, from, -6, 'took tribute'); shift(g, from, to, 5, 'paid tribute'); break;
    case 'aid': g.players[to].gold -= ctx.amount; g.earn(from, 'tribute', ctx.amount); shift(g, from, to, 15, 'sent aid'); shift(g, to, from, 4, 'a friend in need'); break;
  }
}
// the answer to a request that was declined or ignored
export function snubbed(g, kind, from, to, ctx = {}) {
  const pr = pers(g, from);
  switch (kind) {
    case 'alliance': shift(g, from, to, -4, 'refused our alliance'); break;
    case 'joinwar': shift(g, from, to, g.rel[from][to] === 'alliance' ? -15 : -8, `would not join our war on ${nameOf(g, ctx.target)}`); break;
    case 'tribute': shift(g, from, to, -15 - pr.aggr * 8, 'defied our demand'); g.players[from].defied = g.players[from].defied || {}; g.players[from].defied[to] = g.time; break;
    case 'aid': shift(g, from, to, -3, 'refused help'); break;
  }
}

// ---- speech -------------------------------------------------------------------------------------------------
const LINES = {
  alliance: {
    warlike: (a, b) => `Stand with me, ${b}. Together our spears will be a wall no house can break. Let us swear an alliance.`,
    mercantile: (a, b) => `Our coffers and our caravans prosper side by side, ${b}. Let us bind it with an alliance.`,
    honourable: (a, b) => `I have found you true, ${b}. I offer my hand and my word in an alliance of our houses.`,
    cunning: (a, b) => `The valley grows crowded, ${b}. Two crowns stand firmer than one: shall we ally?`,
  },
  joinwar: {
    warlike: (a, b, t) => `${t} has wronged me and must burn. Declare war on them beside me, ${b}!`,
    mercantile: (a, b, t) => `${t} hoards what should be traded freely. Join me against them and share the spoils.`,
    honourable: (a, b, t) => `${t} has broken faith with me. I ask my friend ${b} to stand against them.`,
    cunning: (a, b, t) => `${t} grows too strong, ${b}. Better we fall on them now, together, than one by one later.`,
  },
  tribute: {
    warlike: (a, b, amt) => `My armies stand at your gates, ${b}. Send ${amt} coin and I may call them home.`,
    mercantile: (a, b, amt) => `Protection is a service, ${b}, and services are paid for. ${amt} coin will do.`,
    honourable: (a, b, amt) => `I do not ask lightly, ${b}: ${amt} coin, as the weaker house owes the stronger.`,
    cunning: (a, b, amt) => `A small gift of ${amt} coin, ${b}, would keep our friendship cheap and your borders quiet.`,
  },
  aid: {
    warlike: (a, b, amt) => `My war chest runs low, ${b}. Lend me ${amt} coin and I will remember it.`,
    mercantile: (a, b, amt) => `A loan of ${amt} coin, ${b}, and I will see it repaid in goodwill many times over.`,
    honourable: (a, b, amt) => `I am hard pressed, ${b}. I ask my friend for ${amt} coin and will not forget it.`,
    cunning: (a, b, amt) => `A friend would lend ${amt} coin in a lean season, ${b}. I do not forget who did.`,
  },
  peace: {
    warlike: () => 'Enough blood for now. I will take peace, until I am ready again.',
    mercantile: () => 'War is bad for trade. Let us make peace and open the roads.',
    honourable: () => 'Too many have died. I offer peace, with honour on both sides.',
    cunning: () => 'Our quarrel serves only our rivals. Let us make peace.',
  },
};
export function voice(g, kind, from, to, ctx = {}) {
  const t = pers(g, from).temper, f = LINES[kind]?.[t] || LINES[kind]?.cunning;
  const body = f ? f(nameOf(g, from), leaderName(g, to).replace(/^.* /, ''), ctx.target != null ? nameOf(g, ctx.target) : ctx.amount) : '';
  return `${leaderName(g, from)} of ${nameOf(g, from)}: "${body}"`;
}

// ---- letters ------------------------------------------------------------------------------------------------
// A letter to the human is an entry in g.offers (it waits for Accept / Decline) and in g.letters (the history shown on the Council screen).
export function writeLetter(g, from, to, kind, ctx = {}) {
  const text = ctx.text || voice(g, kind, from, to, ctx);
  const o = { id: g.nextLetter++, from, to, kind: kind === 'peace' || kind === 'alliance' || kind === 'trade' ? 'treaty' : kind, state: ctx.state || (kind === 'peace' || kind === 'alliance' || kind === 'trade' ? kind : undefined), target: ctx.target, amount: ctx.amount, text, t: g.time, expires: g.time + (DIPLO.expire[kind === 'peace' || kind === 'alliance' || kind === 'trade' ? 'treaty' : kind] || 90) };
  g.offers.push(o);
  record(g, from, to, o.kind === 'treaty' ? o.state : kind, text, 'open', o.id);
  g.log(PLAYER, text, 'info');
  return o;
}
export function notice(g, from, to, kind, text) {   // a letter that needs no answer
  record(g, from, to, kind, text, 'note');
  if (to === PLAYER || from === PLAYER) g.log(PLAYER, text, kind === 'warning' ? 'warn' : 'info');
}
export function record(g, from, to, kind, text, state, id = null) {
  g.letters.unshift({ id: id ?? g.nextLetter++, t: g.time, from, to, kind, text, state });
  if (g.letters.length > 60) g.letters.length = 60;
}
export function settleLetter(g, id, state) { const l = g.letters.find((x) => x.id === id); if (l) l.state = state; }

// ---- what a leader does of his own accord ----------------------------------------------------------------------
export function deliberate(g, team) {
  const p = g.players[team], pr = pers(g, team);
  if (!p.alive || g.time < 90) return;
  const myS = strength(g, team);
  const waiting = g.offers.filter((o) => o.to === PLAYER).length;
  const canWrite = () => g.offers.filter((o) => o.to === PLAYER).length < DIPLO.maxLetters && g.time - (p.lastLetter ?? -1e9) >= DIPLO.letterGap;
  const wrote = () => { p.lastLetter = g.time; };
  for (const q of g.players) {
    if (!q.alive || q.team === team || !g.known[team][q.team]) continue;
    const b = q.team, rel = g.rel[team][b], o = op(g, team, b), human = b === PLAYER;
    // allies take up each other's wars
    if (rel === 'alliance') {
      for (const c of enemiesOf(g, b)) {
        if (c === team || g.rel[team][c] === 'war' || !g.known[team][c] || settled(g, team, c)) continue;
        const j = judge(g, 'joinwar', b, team, { target: c });
        if (j.ok) {
          g.setRelation(team, c, 'war'); shift(g, b, team, 8, 'came to our aid');
          notice(g, team, b, 'note', `${leaderName(g, team)} of ${nameOf(g, team)}: "${nameOf(g, b)} is my ally. Their enemy ${nameOf(g, c)} is mine."`);
          break;
        }
      }
    }
    // a house that is losing sues for peace
    if (rel === 'war' && g.parleyIn(team, b) <= 0) {
      const sue = myS < strength(g, b) * 0.6 || g.time - g.relSince[team][b] > 300;
      if (sue && cooled(g, team, b, 'alliance')) {
        if (human) { if (canWrite() && !g.offers.some((x) => x.from === team && x.to === PLAYER)) { stamp(g, team, b, 'alliance'); writeLetter(g, team, b, 'peace', { state: 'peace' }); wrote(); } }
        else if (judge(g, 'peace', team, b).ok && g.willMakePeace(b, team)) { stamp(g, team, b, 'alliance'); g.setRelation(team, b, 'peace'); }
      }
      continue;
    }
    // proposals among friends
    if ((rel === 'peace' || rel === 'trade') && o >= DIPLO.need.alliance && cooled(g, team, b, 'alliance')) {
      const useful = sharedEnemies(g, team, b).length || (enemiesOf(g, team).length && strength(g, b) > myS * 0.5) || (human && pr.honor > 0.6);
      if (!human && alliesOf(g, team).length >= 1) continue;
      if (useful) {
        if (human) { if (canWrite() && !g.offers.some((x) => x.from === team && x.to === PLAYER && x.state === 'alliance')) { stamp(g, team, b, 'alliance'); writeLetter(g, team, b, 'alliance', { state: 'alliance' }); wrote(); } }
        else { stamp(g, team, b, 'alliance'); if (judge(g, 'alliance', team, b).ok && judge(g, 'alliance', b, team).ok) exec(g, 'alliance', team, b); }
      }
    }
    // ask a friend to join a war
    if ((rel === 'alliance' || (o >= DIPLO.need.joinwar && rel !== 'war')) && cooled(g, team, b, 'askwar')) {
      const foes = enemiesOf(g, team).filter((c) => c !== b && g.rel[b][c] !== 'war' && g.rel[b][c] !== 'alliance' && g.known[b][c]);
      if (foes.length) {
        const T = foes.sort((x, y) => strength(g, y) - strength(g, x))[0];
        if (human) { if (canWrite() && !g.offers.some((x) => x.kind === 'joinwar' && x.from === team)) { stamp(g, team, b, 'askwar'); writeLetter(g, team, b, 'joinwar', { target: T }); wrote(); } }
        else { stamp(g, team, b, 'askwar'); const j = judge(g, 'joinwar', team, b, { target: T }); if (j.ok) exec(g, 'joinwar', team, b, { target: T }); else snubbed(g, 'joinwar', team, b, { target: T }); }
      }
    }
    if (!human) continue;
    // demands on a weaker neighbour, and the price of defying them
    if (rel !== 'alliance' && rel !== 'war' && g.time > 420 && cooled(g, team, b, 'demand') && myS >= strength(g, b) * 1.8 && (pr.aggr > 0.5 || pr.greed > 0.6) && o <= 20 && canWrite() && !g.offers.some((x) => x.kind === 'tribute' && x.from === team)) {
      const amount = Math.max(40, Math.min(300, Math.round(g.players[b].gold * 0.15 / 10) * 10));
      stamp(g, team, b, 'demand'); writeLetter(g, team, b, 'tribute', { amount }); wrote(); continue;
    }
    const def = p.defied?.[b];
    if (def != null && !settled(g, team, b) && g.time - def > 20 && g.time - def < 120 && rel !== 'war' && rel !== 'alliance' && pr.aggr > 0.45 && myS > strength(g, b) * 1.1 && g.time > 480) {
      p.defied[b] = null;
      notice(g, team, b, 'warning', `${leaderName(g, team)} of ${nameOf(g, team)}: "You have defied me for the last time. This is war."`);
      g.setRelation(team, b, 'war'); continue;
    }
    // a friend in need
    if (rel !== 'war' && o >= DIPLO.need.aid && p.gold < 50 && g.players[b].gold > 250 && cooled(g, team, b, 'askaid') && canWrite()) {
      stamp(g, team, b, 'askaid'); writeLetter(g, team, b, 'aid', { amount: 80 }); wrote(); continue;
    }
    // generosity from a rich friend; a stern word to a house that has made itself hated
    if (o >= 40 && p.gold > 400 && rel !== 'war' && cooled(g, team, b, 'gift') && g.time - (p.lastGift ?? -1e9) > 360) {
      p.lastGift = g.time; stamp(g, team, b, 'gift'); const amt = 50;
      p.gold -= amt; g.earn(b, 'tribute', amt); shift(g, team, b, 2, 'received our gift');
      notice(g, team, b, 'note', `${leaderName(g, team)} of ${nameOf(g, team)} sends you ${amt} coin: "A token of friendship between our houses."`);
    } else if (o <= -30 && rel === 'peace' && cooled(g, team, b, 'letter') && pr.aggr > 0.4) {
      stamp(g, team, b, 'letter');
      notice(g, team, b, 'warning', `${leaderName(g, team)} of ${nameOf(g, team)}: "My patience with ${nameOf(g, b)} wears thin. Mend your ways, or answer to my spears."`);
    }
    // hostility turns into war when the house is stronger and cannot abide the other
    if (o <= -45 && rel !== 'war' && rel !== 'alliance' && !settled(g, team, b) && g.time > 540 && myS > strength(g, b) * 1.2 && pr.aggr > 0.35) {
      notice(g, team, b, 'warning', `${leaderName(g, team)} of ${nameOf(g, team)}: "Enough. ${nameOf(g, b)} has tried my patience. I declare war."`);
      g.setRelation(team, b, 'war');
    }
  }
  // AI against AI: the hated and weak are fought
  for (const q of g.players) {
    if (!q.alive || q.team === team || q.team === PLAYER || !g.known[team][q.team]) continue;
    const b = q.team, o = op(g, team, b);
    if (o <= -45 && g.rel[team][b] !== 'war' && g.rel[team][b] !== 'alliance' && !settled(g, team, b) && g.time > 540 && myS > strength(g, b) * 1.2 && pr.aggr > 0.35) g.setRelation(team, b, 'war');
  }
  void waiting;
}

// every house's standing, for the Council screen: rank by a composite of land, people, arms, wealth and learning
export function ranking(g) {
  const rows = g.standings().filter((s) => s.alive);
  for (const s of rows) {
    s.power = +g.powerOfTeam(s.team).toFixed(1);
    s.score = Math.round(s.wealth * 0.1 + s.land * 12 + s.landPop * 0.3 + s.power * 6 + s.sci * 10 + s.arms * 5);
  }
  rows.sort((a, b) => b.score - a.score);
  rows.forEach((s, i) => { s.rank = i + 1; });
  return rows;
}

// everything the interface may show about one house: leader, size, wealth, power, influence, and how it regards you
export function intel(g, t, viewer = PLAYER) {
  const p = g.players[t], st = g.standings().find((s) => s.team === t), k = g.kingOf(t), pr = p.persona || {};
  const rank = ranking(g).find((r) => r.team === t);
  const infl = g.influenceMap();
  const partner = t === viewer || g.rel[viewer][t] === 'trade' || g.rel[viewer][t] === 'alliance';
  const fuzz = (n) => (n < 100 ? Math.round(n / 10) * 10 : Math.round(n / 50) * 50);
  const o = t === viewer ? 0 : op(g, t, viewer);
  return {
    team: t, name: p.name, short: nameOf(g, t), alive: p.alive, known: !!g.known[viewer][t], rel: t === viewer ? null : g.rel[viewer][t],
    leader: { alive: !!k, title: k?.title || (HOUSES[t] && g.kingOf(t) === null ? 'Regent' : 'King'), name: k?.name || p.kingName || '', rank: k?.rank || 0, hp: k ? k.hp / k.maxHp : 0, temper: pr.temper, heirIn: !k && p.heirAt != null ? Math.max(0, Math.ceil(p.heirAt - g.time)) : null, kingsLost: p.kingsLost || 0 },
    rank: rank?.rank, score: rank?.score, land: st.land, landPop: st.landPop, pop: st.pop, army: st.army, power: rank?.power ?? +g.powerOfTeam(t).toFixed(1),
    money: st.money, moneyShown: partner ? st.money : fuzz(st.money), moneyExact: partner, wealth: st.wealth, sci: st.sci, arms: st.arms, loyalty: st.loyalty,
    influence: Math.round(infl.pull[t] * 10), leaning: infl.leaning[t],
    opinion: Math.round(o), attitude: attitudeLabel(o), why: (g.whyOp[t + '>' + viewer] || []).slice(0, 3),
    allies: alliesOf(g, t), enemies: enemiesOf(g, t),
  };
}
