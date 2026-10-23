// Auld World - one hourly match (ONLINE.md section 3). The api starts one of these per match (a Kubernetes Job); it ends with the match.
//   node server/match.js        settings from the environment: MATCH_ID, MATCH_CONFIG (JSON), MATCH_SECRET, MATCH_START_AT, API_URL, PORT
// It does what relay.js does for open rooms (a turn clock, orders stamped with the sender's seat, rejoining) and more:
//   * only players holding a ticket the api signed for this match get in, each to the seat the ticket names
//   * the match starts when everyone is in, or MATCH.graceS after its start time without the missing (the AI holds their houses until they come)
//   * the REFEREE: the server plays its own copy of the match on the same turns. Its fingerprints are the truth: a browser whose copy differs
//     is sent the referee's state and carries on from there; a rejoining player is sent it too (no replaying an hour of turns)
//   * preset messages (ids only, see js/online.js), checked and rate-limited
//   * the end: the last house standing, every person fallen, or the two-hour cap. The referee's placings and points go to every player
//     and, signed, to the api (retried until it answers), and the server closes.
import http from 'node:http';
import { normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wsAccept } from './ws.js';
import { verifyTicket, signBody } from './ticket.js';
import { Game } from '../js/game.js';
import { NET, stateHash } from '../js/net.js';
import { MATCH, matchOpts, checkSay, placings, pointsFor } from '../js/online.js';

const PING_MS = 25000, DEAD_MS = 70000, MAX_INTENTS_PER_TURN = 40, KEEP_HASHES = 600, RESYNC_GAP_MS = 5000;

/**
 * id: the match id (8 lowercase letters or digits). config: { seed, houses, diff, people, fog }. seats: [{ seat, user, name }], the players
 * signed up (the other seats are AI). secret: shared with the api. startAt: ms since 1970. report(result): sends the result to the api
 * (may throw; it is retried). Returns { port, done (a promise of the result), state(), referee(), close() }.
 */
export function createMatch({ id, config, seats, secret, port = 8080, turnMs = NET.turnMs, startAt = Date.now(), graceS = MATCH.graceS, capS = MATCH.capS,
  awayMs = MATCH.awayMs, report = async () => {}, log = console.log, retryMs = 5000, retries = 60, lingerMs = 30000, now = () => Date.now() } = {}) {
  if (!/^[a-z0-9]{8}$/.test(id || '')) throw new Error('match id must be 8 lowercase letters or digits');
  if (!secret) throw new Error('no MATCH_SECRET');
  startAt = Math.max(startAt, now());   // the wait for players counts from when this server is up, not only from the hour (a launch and a pod take a little while)
  const houses = config.houses, roster = new Map();
  for (const s of seats) {
    if (!Number.isInteger(s.seat) || s.seat < 0 || s.seat >= houses || roster.has(s.seat)) throw new Error(`bad seat ${s.seat}`);
    roster.set(s.seat, { seat: s.seat, user: s.user, name: String(s.name || 'Player').slice(0, 24), conn: null, joined: false, away: false, awayTimer: null, says: [], resyncT: -1e9 });
  }
  const conns = new Set();
  let phase = 'waiting', turn = 0, pending = [], timer = null, ref = null, cfg = null, ended = null;
  const hashes = new Map(), fallenAt = {};
  let finish; const done = new Promise((r) => { finish = r; });

  const send = (m, msg) => { if (m.conn?.open) m.conn.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
  const everyone = (msg) => { const text = JSON.stringify(msg); for (const m of roster.values()) send(m, text); };
  const view = (me) => [...roster.values()].map((m) => ({ seat: m.seat, name: m.name, connected: !!m.conn?.open, you: m === me }));
  const lobby = () => { for (const m of roster.values()) send(m, { t: 'lobby', members: view(m), phase, config: cfg || undefined, startsIn: Math.max(0, Math.ceil((startAt + graceS * 1000 - now()) / 1000)) }); };
  const joinedSeats = () => [...roster.values()].filter((m) => m.joined).map((m) => m.seat);
  const snapshot = () => ({ t: 'catchup', config: cfg, n: turn - 1, snap: ref.serialize() });

  // ---- start: every signed-up player is in, or the grace time is up (no one at all: the match is abandoned)
  const waitTimer = setInterval(() => {
    if (phase !== 'waiting') return;
    const all = [...roster.values()].every((m) => m.joined), late = now() >= startAt + graceS * 1000;
    if (all && roster.size) start();
    else if (late) { if ([...roster.values()].some((m) => m.joined)) start(); else end('abandoned'); }
  }, Math.min(500, turnMs * 5));

  function start() {
    phase = 'live';
    const here = [...roster.values()].filter((m) => m.conn?.open).map((m) => m.seat).sort((a, b) => a - b);
    for (const m of roster.values()) if (!here.includes(m.seat)) m.away = true;   // not here yet: the AI holds the house until they come
    cfg = { ...config, endRule: 'conquest', humans: here, names: Object.fromEntries([...roster.values()].map((m) => [m.seat, m.name])), match: id };
    ref = new Game(matchOpts(cfg)); ref.playbook = null;
    everyone({ t: 'start', config: cfg });
    lobby();
    timer = setInterval(step, turnMs);
    log(`[match ${id}] started: seed ${cfg.seed}, ${houses} houses, people at seats ${here.join(',') || '(none)'}`);
  }

  // ---- one turn: the referee applies it first, then everyone gets it
  function step() {
    if (phase !== 'live') return;
    const n = turn++, intents = pending.splice(0);
    for (const it of intents) ref.applyIntent(it);
    for (let k = 0; k < NET.ticksPerTurn; k++) ref.tick(NET.dt);
    if (n % NET.hashEvery === 0) { hashes.set(n, stateHash(ref)); hashes.delete(n - KEEP_HASHES); }
    everyone({ t: 'turn', n, intents });
    for (const p of ref.players) if (!p.alive && fallenAt[p.team] === undefined) fallenAt[p.team] = ref.time;
    if (ref.outcome) end('conquest');
    else if (joinedSeats().length && joinedSeats().every((s) => !ref.players[s].alive)) end('fallen');   // (every person who came has fallen: only the AI is left)
    else if (ref.time >= capS) end('cap');
  }

  // ---- the end: placings and points from the referee, to the players and (signed) to the api
  async function end(reason) {
    if (phase === 'ended') return;
    const wasLive = phase === 'live'; phase = 'ended';
    clearInterval(timer); clearInterval(waitTimer);
    const places = wasLive ? placings(ref, fallenAt) : [];
    const pts = wasLive && reason !== 'stopped' ? pointsFor(places, joinedSeats()) : {};
    ended = {
      match: id, reason, endedAt: new Date(now()).toISOString(), gameTime: wasLive ? Math.round(ref.time) : 0, turns: turn, seed: cfg?.seed ?? config.seed,
      places: places.map((p) => { const m = roster.get(p.team); return { ...p, user: m?.user ?? null, name: m?.name ?? null, joined: !!m?.joined, points: pts[p.team] ?? 0 }; }),
      noShows: [...roster.values()].filter((m) => !m.joined).map((m) => ({ seat: m.seat, user: m.user, name: m.name })),
    };
    everyone({ t: 'end', result: ended });
    log(`[match ${id}] ended (${reason}) after ${ended.gameTime}s: ${ended.places.slice(0, 3).map((p) => `${p.place}. seat ${p.team}${p.name ? ` (${p.name})` : ''}`).join(', ')}`);
    for (let i = 0; i <= retries; i++) {
      try { await report(ended); log(`[match ${id}] result reported`); break; }
      catch (e) { log(`[match ${id}] reporting the result failed (${e.message || e}); ${i < retries ? `retrying in ${retryMs / 1000}s` : 'giving up'}`); if (i < retries) await new Promise((r) => setTimeout(r, retryMs)); }
    }
    setTimeout(() => { for (const c of conns) c.close(); finish(ended); }, lingerMs);
  }

  function onConnection(conn) {
    conns.add(conn);
    let me = null;
    conn.onmessage = (text) => {
      let msg; try { msg = JSON.parse(text); } catch { return; }
      if (!me) {
        if (msg.t !== 'hello') return;
        const c = verifyTicket(secret, msg.ticket, now()), m = c && c.m === id ? roster.get(c.s) : null;
        if (!m || m.user !== c.u) { conn.send(JSON.stringify({ t: 'error', msg: 'That ticket is not for this match. Join from the online menu.' })); conn.close(); return; }
        if (m.conn && m.conn !== conn) { try { m.conn.send(JSON.stringify({ t: 'error', msg: 'You joined this match from another tab.' })); m.conn.close(); } catch {} }
        me = m; me.conn = conn; me.joined = true; clearTimeout(me.awayTimer);
        if (phase === 'live' && me.away) { me.away = false; pending.push({ type: 'seat', relay: true, seat: me.seat, team: me.seat, ai: false }); }   // back (or late): the house is theirs again
        send(me, { t: 'welcome', seat: me.seat, match: id, members: view(me), phase, config: cfg });
        if (phase === 'live') send(me, snapshot());
        if (phase === 'ended') send(me, { t: 'end', result: ended });
        lobby(); log(`[match ${id}] ${me.name} in seat ${me.seat}`);
        return;
      }
      if (phase !== 'live') return;
      switch (msg.t) {
        case 'intent': {
          if (!msg.intent || typeof msg.intent.type !== 'string') return;
          if (pending.filter((i) => i.team === me.seat).length >= MAX_INTENTS_PER_TURN) return;   // a flood is dropped, not relayed
          const { relay: _r, team: _t, ...order } = msg.intent;   // only the server may hand a seat to the AI; the seat is the ticket's
          pending.push({ ...order, team: me.seat });
          break;
        }
        case 'hash': {   // a browser's fingerprint: if its copy differs from the referee's, it gets the referee's state
          if (!Number.isInteger(msg.n)) return;
          const want = hashes.get(msg.n);
          if (want !== undefined && String(msg.h) !== want && now() - me.resyncT > RESYNC_GAP_MS) {
            me.resyncT = now(); send(me, { ...snapshot(), t: 'resync' });
            log(`[match ${id}] seat ${me.seat} was out of step at turn ${msg.n}: sent the referee's state`);
          }
          break;
        }
        case 'say': {
          const s = checkSay(msg, houses), t = now();
          if (!s) return;
          me.says = me.says.filter((x) => t - x < 60000);
          if (me.says.length >= MATCH.sayPerMin || (me.says.length && t - me.says[me.says.length - 1] < MATCH.sayGapMs)) return;
          me.says.push(t);
          const out = { t: 'said', from: me.seat, ...s };
          if (s.to === -1) everyone(out); else { send(me, out); const r = roster.get(s.to); if (r) send(r, out); }
          break;
        }
      }
    };
    conn.onclose = () => {
      conns.delete(conn);
      if (!me || me.conn !== conn) return;
      if (phase === 'live') {   // gone a while: the AI holds the house (as an order in the turn stream, so every copy switches together)
        clearTimeout(me.awayTimer);
        me.awayTimer = setTimeout(() => { if (phase === 'live' && !me.conn?.open && !me.away) { me.away = true; pending.push({ type: 'seat', relay: true, seat: me.seat, team: me.seat, ai: true }); log(`[match ${id}] ${me.name} is away: the AI holds seat ${me.seat}`); } }, awayMs);
      }
      lobby();
    };
  }

  const pinger = setInterval(() => { const t = Date.now(); for (const c of conns) { if (t - c.seen > DEAD_MS) { c.socket.destroy(); conns.delete(c); } else c.ping(); } }, PING_MS);
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }).end(`ok match=${id} phase=${phase} turn=${turn} players=${[...roster.values()].filter((m) => m.conn?.open).length}`); return; }
    res.writeHead(404).end();
  });
  server.on('upgrade', (req, socket) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/ws' || path === `/m/${id}/ws`) wsAccept(req, socket, onConnection); else socket.destroy();
  });
  done.then(() => { clearInterval(pinger); server.close(); });
  return new Promise((resolve) => server.listen(port, () => resolve({
    port: server.address().port, done,
    state: () => ({ phase, turn, members: view(null), ended }),
    referee: () => ref,
    stop: () => end('stopped'),
    close: () => { clearInterval(timer); clearInterval(waitTimer); clearInterval(pinger); for (const m of roster.values()) clearTimeout(m.awayTimer); for (const c of conns) c.socket.destroy(); server.close(); },
  })));
}

// ---- run as a program (the container's command): settings from the environment, the result POSTed to the api ----------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const env = process.env;
  let config;
  try { config = JSON.parse(env.MATCH_CONFIG || ''); } catch { console.error('MATCH_CONFIG must be JSON: { seed, houses, diff, people, fog, seats: [{ seat, user, name }] }'); process.exit(2); }
  const api = (env.API_URL || '').replace(/\/$/, ''), secret = env.MATCH_SECRET;
  const report = async (result) => {
    if (!api) throw new Error('no API_URL');
    const body = JSON.stringify(result);
    const r = await fetch(`${api}/internal/results`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auld-Sig': signBody(secret, body) }, body, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`the api answered ${r.status}`);
  };
  const { seats = [], ...rest } = config;
  createMatch({ id: env.MATCH_ID, config: rest, seats, secret, port: +env.PORT || 8080, startAt: +env.MATCH_START_AT || Date.now(), report,
    capS: +env.MATCH_CAP_S || undefined, graceS: +env.MATCH_GRACE_S || undefined }).then((m) => {   // (a shorter cap and wait: staging tests only)
    console.log(`[match ${env.MATCH_ID}] listening on ${m.port}; ${seats.length} player(s) signed up`);
    process.on('SIGTERM', () => { console.log(`[match ${env.MATCH_ID}] SIGTERM: ending the match`); m.stop(); });
    m.done.then(() => process.exit(0));
  }).catch((e) => { console.error(`[match] could not start: ${e.message}`); process.exit(2); });
}
