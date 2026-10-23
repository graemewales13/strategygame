// Auld World - online relay (groundwork for multiplayer). Zero dependencies.
//   node relay.js [port]      serves the game like serve.js AND relays online matches at ws://<host>:<port>/ws
// Players open  http://<host>:<port>/?mp=<room>&name=<name>  ; the first to join a room hosts it and presses Start.
// The relay never runs the simulation: it keeps the turn clock, stamps every order with its sender's seat, broadcasts turns,
// compares state fingerprints (desync check) and lets a dropped player rejoin. Protocol: see js/net.js.
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { wsAccept } from './server/ws.js';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
// limits for a public server: rooms, people per room (five seats and a few watchers), message size (a learned playbook is the largest)
const MAX_ROOMS = 500, MAX_MEMBERS = 8, PING_MS = 25000, DEAD_MS = 70000;
const MAX_SEATS = 5, MAX_INTENTS_PER_TURN = 40, CONFIG_KEYS = ['seed', 'houses', 'diff', 'people', 'size', 'fog', 'playbook'];

// ---- rooms -----------------------------------------------------------------------------------------------------------------------
export function createRelay({ port = 8080, turnMs = 100, serveFiles = true, log = console.log, awayMs = 30000 } = {}) {
  const rooms = new Map(), conns = new Set();
  // keep-alive: load balancers and proxies (AWS ALB, CloudFront, nginx) close a connection that is quiet for a minute, and a lobby is quiet.
  // Ping every PING_MS (browsers answer with a pong by themselves); a connection silent for DEAD_MS is dropped so its seat can be held.
  const pinger = setInterval(() => { const now = Date.now(); for (const c of conns) { if (now - c.seen > DEAD_MS) { c.socket.destroy(); conns.delete(c); } else c.ping(); } }, PING_MS);
  const roomOf = (code) => {
    let r = rooms.get(code);
    if (!r) rooms.set(code, (r = { code, members: [], build: null, config: { houses: 4, diff: 'mid', people: 'random', fog: true }, started: false, turn: 0, pending: [], log: [], hashes: new Map(), timer: null }));
    return r;
  };
  // the host is the earliest player still connected: if the first one leaves the lobby, the next can start the match
  const hostOf = (r) => r.members.find((m) => m.conn?.open) || r.members[0];
  const view = (r, me) => r.members.map((m) => ({ name: m.name, seat: m.seat, host: m === hostOf(r), connected: m.conn?.open || false, you: m === me }));
  const send = (m, msg) => { if (m.conn?.open) m.conn.send(JSON.stringify(msg)); };
  const lobby = (r) => { for (const m of r.members) send(m, { t: 'lobby', members: view(r, m), config: r.config, started: r.started }); };
  const everyone = (r, msg) => { const text = JSON.stringify(msg); for (const m of r.members) if (m.conn?.open) m.conn.send(text); };
  const startClock = (r) => {
    r.timer = setInterval(() => {
      const n = r.turn++, intents = r.pending.splice(0);
      if (intents.length) r.log.push([n, intents]);
      everyone(r, { t: 'turn', n, intents });
    }, turnMs);
  };
  const close = (r) => { clearInterval(r.timer); for (const m of r.members) clearTimeout(m.awayTimer); rooms.delete(r.code); log(`[relay] room ${r.code} closed`); };

  function onConnection(conn) {
    conns.add(conn);
    let me = null, room = null;
    conn.onmessage = (text) => {
      let msg; try { msg = JSON.parse(text); } catch { return; }
      if (!me) {
        if (msg.t !== 'hello' || typeof msg.room !== 'string' || !msg.room.trim()) return conn.send(JSON.stringify({ t: 'error', msg: 'Say hello with a room name first.' }));
        if (!rooms.has(msg.room.trim().slice(0, 32)) && rooms.size >= MAX_ROOMS) return conn.send(JSON.stringify({ t: 'error', msg: 'The server is full. Try again later.' }));
        room = roomOf(msg.room.trim().slice(0, 32));
        if (room.build && msg.build && room.build !== msg.build) return conn.send(JSON.stringify({ t: 'error', msg: `This room runs build ${room.build}; you have ${msg.build}. Reload the page so both match.` }));
        room.build ||= msg.build || null;
        me = msg.token && room.members.find((m) => m.token === msg.token);   // a rejoin keeps its seat
        if (!me && !msg.token && room.members.length >= MAX_MEMBERS) return conn.send(JSON.stringify({ t: 'error', msg: 'That room is full.' }));
        if (me) { try { me.conn?.close(); } catch {} me.conn = conn; clearTimeout(me.awayTimer); if (me.away) { me.away = false; room.pending.push({ type: 'seat', relay: true, seat: me.seat, team: me.seat, ai: false }); } }
        else {
          const taken = new Set(room.members.map((m) => m.seat));
          let seat = -1; if (!room.started) for (let s = 0; s < MAX_SEATS; s++) if (!taken.has(s)) { seat = s; break; }   // late arrivals watch
          me = { name: String(msg.name || 'Player').slice(0, 24), seat, token: randomBytes(12).toString('hex'), conn };
          room.members.push(me);
        }
        send(me, { t: 'welcome', seat: me.seat, host: me === hostOf(room), token: me.token, room: room.code, members: view(room, me), config: room.config });
        if (room.started) send(me, { t: 'catchup', config: room.config, turns: room.log, now: room.turn });
        lobby(room); log(`[relay] ${me.name} in ${room.code} (seat ${me.seat})`);
        return;
      }
      const isHost = me === hostOf(room);
      switch (msg.t) {
        case 'config':
          if (!isHost || room.started || !msg.config) return;
          for (const k of CONFIG_KEYS) if (msg.config[k] !== undefined) room.config[k] = msg.config[k];
          lobby(room); break;
        case 'start': {
          if (!isHost || room.started) return;
          room.members = room.members.filter((m) => m.conn?.open);   // whoever left the lobby gives up their seat: it goes to the AI
          const seats = room.members.filter((m) => m.seat >= 0).map((m) => m.seat).sort((a, b) => a - b);
          room.config.houses = Math.max(room.config.houses || 3, seats.length ? seats[seats.length - 1] + 1 : 3, 3);
          room.config.seed ??= (randomBytes(4).readUInt32BE(0) % 1e9) + 1;
          room.config.humans = seats; room.config.names = Object.fromEntries(room.members.filter((m) => m.seat >= 0).map((m) => [m.seat, m.name]));
          room.started = true;
          everyone(room, { t: 'start', config: room.config }); lobby(room); startClock(room);
          log(`[relay] room ${room.code} started: seed ${room.config.seed}, seats ${seats.join(',')}`);
          break;
        }
        case 'intent': {
          if (!room.started || me.seat < 0 || !msg.intent || typeof msg.intent.type !== 'string') return;
          if (room.pending.filter((i) => i.team === me.seat).length >= MAX_INTENTS_PER_TURN) return;   // a flood is dropped, not relayed
          const { relay: _r, ...order } = msg.intent;   // only the relay may hand a seat to the AI
          room.pending.push({ ...order, team: me.seat });   // the seat comes from the connection, never from the message
          break;
        }
        case 'hash': {
          if (!room.started || me.seat < 0 || !Number.isInteger(msg.n)) return;
          const got = room.hashes.get(msg.n) || new Map(); got.set(me.seat, String(msg.h)); room.hashes.set(msg.n, got);
          const live = room.members.filter((m) => m.seat >= 0 && m.conn?.open);
          if (live.every((m) => got.has(m.seat))) {
            if (new Set(got.values()).size > 1) { everyone(room, { t: 'desync', n: msg.n, hashes: Object.fromEntries(got) }); log(`[relay] DESYNC in ${room.code} at turn ${msg.n}`); }
            room.hashes.delete(msg.n);
          }
          for (const n of room.hashes.keys()) if (n < msg.n - 200) room.hashes.delete(n);
          break;
        }
      }
    };
    conn.onclose = () => {
      conns.delete(conn);
      if (!room || !me) return;
      if (room.started && me.seat >= 0 && me.conn === conn) {   // gone a while mid-match: the AI holds the house (as an order, so every copy switches together)
        clearTimeout(me.awayTimer);
        me.awayTimer = setTimeout(() => { if (!me.conn?.open && rooms.has(room.code)) { me.away = true; room.pending.push({ type: 'seat', relay: true, seat: me.seat, team: me.seat, ai: true }); log(`[relay] ${me.name} is away: the AI holds seat ${me.seat}`); } }, awayMs);
      }
      lobby(room);
      if (!room.members.some((m) => m.conn?.open)) close(room);   // everybody gone: the room ends
    };
  }

  const server = http.createServer(async (req, res) => {
    if (req.url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }).end(`ok rooms=${rooms.size} connections=${conns.size}`); return; }   // for a load balancer's health check
    if (!serveFiles) { res.writeHead(404).end(); return; }
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
      const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const data = await readFile(f); res.writeHead(200, { 'Content-Type': TYPES[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
    } catch { res.writeHead(404).end('not found'); }
  });
  server.on('upgrade', (req, socket) => { if (new URL(req.url, 'http://x').pathname === '/ws') wsAccept(req, socket, onConnection); else socket.destroy(); });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, rooms, port: server.address().port, close: () => { clearInterval(pinger); for (const r of rooms.values()) { clearInterval(r.timer); for (const m of r.members) clearTimeout(m.awayTimer); } for (const c of conns) c.socket.destroy(); server.close(); } })));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const port = +process.argv[2] || +process.env.PORT || 8080;   // hosting services pass the port in PORT
  createRelay({ port }).then(({ port: p, rooms, close }) => {
    const stop = (sig) => {   // a deploy or restart: tell everyone, then go (matches in memory end here)
      console.log(`[relay] ${sig}: closing ${rooms.size} room(s)`);
      for (const r of rooms.values()) for (const m of r.members) if (m.conn?.open) m.conn.send(JSON.stringify({ t: 'error', msg: 'The server is restarting. Reload in a minute to start a new match.' }));
      setTimeout(() => { close(); process.exit(0); }, 300);
    };
    process.on('SIGTERM', () => stop('SIGTERM')); process.on('SIGINT', () => stop('SIGINT'));
    console.log(`Auld World relay on http://localhost:${p}  (online: open http://<this machine>:${p}/?mp=ROOM&name=YOU ; Ctrl+C to stop)`);
  });
}
