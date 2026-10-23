// The hourly matches, as the api keeps them (ONLINE.md sections 3 and 5): the timetable, signing up, launching each match on the hour,
// tickets, results and the league. No HTTP here (server/api.js), so all of it can be tested directly with a clock passed in.
import { randomBytes, randomInt } from 'node:crypto';
import { tx } from './db.js';
import { signTicket, checkBody } from './ticket.js';
import { MATCH } from '../js/online.js';

export const SCHEDULE = { everyMin: 60, opensMin: 30, lateMin: 5, houses: 8 };
const ALPHA = 'abcdefghijklmnopqrstuvwxyz0123456789';
const newId = () => Array.from(randomBytes(8), (b) => ALPHA[b % 36]).join('');

export function makeService({ db, secret, launcher, log = console.log, everyMin = SCHEDULE.everyMin, opensMin = SCHEDULE.opensMin, houses = SCHEDULE.houses,
  capS = MATCH.capS, graceS = MATCH.graceS, onFinished = () => {}, matchConfig = {} }) {
  const every = everyMin * 60e3, opens = Math.min(opensMin, everyMin) * 60e3;
  const nextSlot = (now) => Math.floor(now / every) * every + every;   // the next start on the hour (or every `everyMin` minutes)

  // the scheduled match for a start time, made when first needed
  function slot(startsAt) {
    let m = db.prepare('SELECT * FROM matches WHERE starts_at = ?').get(startsAt);
    if (!m) {
      const cfg = { houses, diff: 'mid', people: 'random', fog: true, ...matchConfig };
      try { db.prepare("INSERT INTO matches (id, starts_at, status, seed, config) VALUES (?, ?, 'scheduled', ?, ?)").run(newId(), startsAt, randomInt(1, 1e9), JSON.stringify(cfg)); }
      catch (e) { if (!/UNIQUE/i.test(String(e.message))) throw e; }   // (made a moment ago by another call)
      m = db.prepare('SELECT * FROM matches WHERE starts_at = ?').get(startsAt);
    }
    return m;
  }
  const seatsOf = (id) => db.prepare('SELECT mp.seat, mp.user_id AS user, u.username AS name FROM match_players mp JOIN users u ON u.id = mp.user_id WHERE mp.match_id = ? ORDER BY mp.seat').all(id);

  // what the online menu shows: the next match, the player's place in it, and a live match they are in
  function schedule(user, now = Date.now()) {
    const next = slot(nextSlot(now)), seats = seatsOf(next.id);
    const live = user ? db.prepare("SELECT m.* FROM matches m JOIN match_players mp ON mp.match_id = m.id WHERE mp.user_id = ? AND m.status = 'live' ORDER BY m.starts_at DESC LIMIT 1").get(user.id) : null;
    return {
      now, everyMin, opensMin: opens / 60e3,
      next: { id: next.id, startsAt: next.starts_at, opensAt: next.starts_at - opens, open: now >= next.starts_at - opens, houses, seats: seats.map((s) => ({ seat: s.seat, name: s.name })), you: user ? seats.some((s) => s.user === user.id) : false },
      live: live ? { id: live.id, startsAt: live.starts_at } : null,
    };
  }

  function join(user, now = Date.now()) {
    if (!user?.username) return { ok: false, why: 'Choose a username first.' };
    const m = slot(nextSlot(now));
    if (now < m.starts_at - opens) return { ok: false, why: `Sign-up opens ${opens / 60e3} minutes before the match.` };
    return tx(db, () => {
      if (db.prepare('SELECT 1 FROM match_players WHERE match_id = ? AND user_id = ?').get(m.id, user.id)) return { ok: true, already: true };
      const busy = db.prepare("SELECT 1 FROM matches mm JOIN match_players mp ON mp.match_id = mm.id WHERE mp.user_id = ? AND mm.status = 'live'").get(user.id);
      if (busy) return { ok: false, why: 'Finish your match in progress first.' };
      const taken = new Set(db.prepare('SELECT seat FROM match_players WHERE match_id = ?').all(m.id).map((r) => r.seat));
      let seat = -1; for (let s = 0; s < houses; s++) if (!taken.has(s)) { seat = s; break; }
      if (seat < 0) return { ok: false, why: 'This match is full. Try the next one.' };
      db.prepare('INSERT INTO match_players (match_id, user_id, seat, joined_at) VALUES (?, ?, ?, ?)').run(m.id, user.id, seat, now);
      return { ok: true, seat, match: m.id };
    });
  }
  function leave(user, now = Date.now()) {
    const m = slot(nextSlot(now));
    db.prepare("DELETE FROM match_players WHERE match_id = ? AND user_id = ? AND (SELECT status FROM matches WHERE id = ?) = 'scheduled'").run(m.id, user.id, m.id);
    return { ok: true };
  }

  // a ticket into the live match the player is seated in (null if none)
  function ticketFor(user, now = Date.now()) {
    const r = db.prepare("SELECT m.id, m.starts_at, mp.seat FROM matches m JOIN match_players mp ON mp.match_id = m.id WHERE mp.user_id = ? AND m.status = 'live' ORDER BY m.starts_at DESC LIMIT 1").get(user.id);
    if (!r) return null;
    const exp = r.starts_at + (graceS + capS + 1800) * 1000;
    return { match: r.id, seat: r.seat, ws: `/m/${r.id}/ws`, ticket: signTicket(secret, { m: r.id, u: user.id, s: r.seat, n: user.username, exp }) };
  }

  // every few seconds: launch what is due, give up on what was missed, and fail matches that never reported
  let busy = false;
  async function tick(now = Date.now()) {
    if (busy) return; busy = true;
    try {
      slot(nextSlot(now));   // (the next match exists before anyone asks)
      for (const m of db.prepare("SELECT * FROM matches WHERE status = 'scheduled' AND starts_at <= ?").all(now)) {
        const seats = seatsOf(m.id);
        if (now - m.starts_at > SCHEDULE.lateMin * 60e3) { db.prepare("UPDATE matches SET status = 'missed', ended = ? WHERE id = ?").run(now, m.id); log(`[schedule] ${m.id} missed (the api was down at its start)`); continue; }
        if (!seats.length) { db.prepare("UPDATE matches SET status = 'empty', ended = ? WHERE id = ?").run(now, m.id); continue; }
        db.prepare("UPDATE matches SET status = 'live', launched = ? WHERE id = ?").run(now, m.id);
        try {
          const where = await launcher.start({ id: m.id, startsAt: m.starts_at, config: { ...JSON.parse(m.config), seed: m.seed }, seats: seats.map((s) => ({ seat: s.seat, user: s.user, name: s.name })) });
          log(`[schedule] ${m.id} launched for ${seats.length} player(s) at ${where.where}`);
        } catch (e) {
          db.prepare("UPDATE matches SET status = 'failed', ended = ? WHERE id = ?").run(now, m.id);
          log(`[schedule] ${m.id} could not be launched: ${e.message}`);
        }
      }
      const stale = now - (graceS + capS + 3600) * 1000;
      db.prepare("UPDATE matches SET status = 'failed', ended = ? WHERE status = 'live' AND launched < ?").run(now, stale);
      db.prepare('DELETE FROM sessions WHERE expires < ?').run(now);
    } finally { busy = false; }
  }

  // a result from a match server (signed with the shared secret); returns an HTTP status
  function result(text, sig) {
    if (!checkBody(secret, text, sig)) return 403;
    let r; try { r = JSON.parse(text); } catch { return 400; }
    const m = r && db.prepare('SELECT * FROM matches WHERE id = ?').get(r.match);
    if (!m) return 404;
    if (m.status !== 'live') return 200;   // (already recorded: a retry)
    const status = r.reason === 'abandoned' ? 'abandoned' : r.reason === 'stopped' ? 'stopped' : 'finished';
    tx(db, () => {
      db.prepare('UPDATE matches SET status = ?, ended = ?, result = ? WHERE id = ?').run(status, Date.now(), text, m.id);
      if (status === 'finished') for (const p of r.places || []) {
        if (!Number.isInteger(p.team)) continue;
        db.prepare('UPDATE match_players SET place = ?, points = ?, showed = ? WHERE match_id = ? AND seat = ?').run(p.place | 0, Math.max(0, p.points | 0), p.joined ? 1 : 0, m.id, p.team);
      }
    });
    log(`[results] ${m.id}: ${status}${r.reason ? ` (${r.reason})` : ''}`);
    if (status === 'finished') try { onFinished(m.id, r); } catch (e) { log(`[results] ${e.message}`); }
    return 200;
  }

  // the league: a calendar month (UTC, 'YYYY-MM') or all time; points, then wins, then points per match
  function league(season = 'all', limit = 50) {
    let from = 0, to = 8.64e15;
    if (/^\d{4}-\d{2}$/.test(season)) { const [y, mo] = season.split('-').map(Number); from = Date.UTC(y, mo - 1, 1); to = Date.UTC(y, mo, 1); }
    return db.prepare(`SELECT u.username AS name, SUM(mp.points) AS points, COUNT(*) AS played, SUM(mp.place = 1) AS wins, MIN(mp.place) AS best
      FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN users u ON u.id = mp.user_id
      WHERE m.status = 'finished' AND mp.showed = 1 AND m.starts_at >= ? AND m.starts_at < ?
      GROUP BY u.id ORDER BY points DESC, wins DESC, CAST(points AS REAL) / played DESC, u.id LIMIT ?`).all(from, to, limit)
      .map((r, i) => ({ rank: i + 1, ...r }));
  }
  function recent(limit = 10) {
    return db.prepare("SELECT id, starts_at, ended, result FROM matches WHERE status = 'finished' ORDER BY starts_at DESC LIMIT ?").all(limit).map((m) => {
      const r = JSON.parse(m.result || '{}'), names = new Map(seatsOf(m.id).map((s) => [s.seat, s.name]));   // (names as they are now: a deleted account shows as a fallen house)
      return { id: m.id, startsAt: m.starts_at, reason: r.reason, gameTime: r.gameTime, places: (r.places || []).map((p) => ({ place: p.place, team: p.team, name: names.get(p.team) ?? null, points: p.points ?? 0 })) };
    });
  }

  return { schedule, join, leave, ticketFor, tick, result, league, recent, nextSlot, slot };
}
