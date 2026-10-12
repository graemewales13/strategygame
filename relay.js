// Auld World - online relay (groundwork for multiplayer). Zero dependencies.
//   node relay.js [port]      serves the game like serve.js AND relays online matches at ws://<host>:<port>/ws
// Players open  http://<host>:<port>/?mp=<room>&name=<name>  ; the first to join a room hosts it and presses Start.
// The relay never runs the simulation: it keeps the turn clock, stamps every order with its sender's seat, broadcasts turns,
// compares state fingerprints (desync check) and lets a dropped player rejoin. Protocol: see js/net.js.
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const MAX_SEATS = 5, MAX_INTENTS_PER_TURN = 40, CONFIG_KEYS = ['seed', 'houses', 'diff', 'people', 'size', 'fog', 'playbook'];

// ---- a minimal WebSocket (RFC 6455): text frames, ping/pong, close; client frames are masked, server frames are not -------------
function wsAccept(req, socket, onOpen) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  const conn = { open: true, onmessage: () => {}, onclose: () => {}, send: (text) => sendFrame(socket, 0x1, Buffer.from(text)), close: () => { if (conn.open) { sendFrame(socket, 0x8, Buffer.alloc(0)); socket.end(); } } };
  let buf = Buffer.alloc(0), parts = [];
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80; let len = buf[1] & 0x7f, at = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); at = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); at = 10; }
      if (len > 1 << 22) { socket.destroy(); return; }   // nobody sends 4 MB of orders
      const need = at + (masked ? 4 : 0) + len; if (buf.length < need) return;
      let data = buf.subarray(at + (masked ? 4 : 0), need);
      if (masked) { const m = buf.subarray(at, at + 4); data = Buffer.from(data); for (let i = 0; i < data.length; i++) data[i] ^= m[i & 3]; }
      buf = buf.subarray(need);
      if (op === 0x8) { conn.close(); return; }
      if (op === 0x9) { sendFrame(socket, 0xa, data); continue; }
      if (op === 0x1 || op === 0x0) { parts.push(data); if (fin) { const text = Buffer.concat(parts).toString('utf8'); parts = []; try { conn.onmessage(text); } catch (e) { console.error('[relay]', e); } } }
    }
  });
  const gone = () => { if (conn.open) { conn.open = false; conn.onclose(); } };
  socket.on('close', gone); socket.on('end', gone); socket.on('error', gone);
  onOpen(conn);
}
function sendFrame(socket, op, data) {
  if (socket.destroyed) return;
  const n = data.length, head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); return h; })();
  socket.write(Buffer.concat([head, data]));
}

// ---- rooms -----------------------------------------------------------------------------------------------------------------------
export function createRelay({ port = 8080, turnMs = 100, serveFiles = true, log = console.log } = {}) {
  const rooms = new Map();
  const roomOf = (code) => {
    let r = rooms.get(code);
    if (!r) rooms.set(code, (r = { code, members: [], build: null, config: { houses: 4, diff: 'mid', people: 'random', fog: true }, started: false, turn: 0, pending: [], log: [], hashes: new Map(), timer: null }));
    return r;
  };
  const view = (r, me) => r.members.map((m) => ({ name: m.name, seat: m.seat, host: m === r.members[0], connected: m.conn?.open || false, you: m === me }));
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
  const close = (r) => { clearInterval(r.timer); rooms.delete(r.code); log(`[relay] room ${r.code} closed`); };

  function onConnection(conn) {
    let me = null, room = null;
    conn.onmessage = (text) => {
      let msg; try { msg = JSON.parse(text); } catch { return; }
      if (!me) {
        if (msg.t !== 'hello' || typeof msg.room !== 'string' || !msg.room.trim()) return conn.send(JSON.stringify({ t: 'error', msg: 'Say hello with a room name first.' }));
        room = roomOf(msg.room.trim().slice(0, 32));
        if (room.build && msg.build && room.build !== msg.build) return conn.send(JSON.stringify({ t: 'error', msg: `This room runs build ${room.build}; you have ${msg.build}. Reload the page so both match.` }));
        room.build ||= msg.build || null;
        me = msg.token && room.members.find((m) => m.token === msg.token);   // a rejoin keeps its seat
        if (me) { try { me.conn?.close(); } catch {} me.conn = conn; }
        else {
          const taken = new Set(room.members.map((m) => m.seat));
          let seat = -1; if (!room.started) for (let s = 0; s < MAX_SEATS; s++) if (!taken.has(s)) { seat = s; break; }   // late arrivals watch
          me = { name: String(msg.name || 'Player').slice(0, 24), seat, token: randomBytes(12).toString('hex'), conn };
          room.members.push(me);
        }
        send(me, { t: 'welcome', seat: me.seat, host: me === room.members[0], token: me.token, room: room.code, members: view(room, me), config: room.config });
        if (room.started) send(me, { t: 'catchup', config: room.config, turns: room.log, now: room.turn });
        lobby(room); log(`[relay] ${me.name} in ${room.code} (seat ${me.seat})`);
        return;
      }
      const isHost = me === room.members[0];
      switch (msg.t) {
        case 'config':
          if (!isHost || room.started || !msg.config) return;
          for (const k of CONFIG_KEYS) if (msg.config[k] !== undefined) room.config[k] = msg.config[k];
          lobby(room); break;
        case 'start': {
          if (!isHost || room.started) return;
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
          room.pending.push({ ...msg.intent, team: me.seat });   // the seat comes from the connection, never from the message
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
      if (!room || !me) return;
      lobby(room);
      if (!room.members.some((m) => m.conn?.open)) close(room);   // everybody gone: the room ends
    };
  }

  const server = http.createServer(async (req, res) => {
    if (!serveFiles) { res.writeHead(404).end(); return; }
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
      const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const data = await readFile(f); res.writeHead(200, { 'Content-Type': TYPES[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
    } catch { res.writeHead(404).end('not found'); }
  });
  server.on('upgrade', (req, socket) => { if (new URL(req.url, 'http://x').pathname === '/ws') wsAccept(req, socket, onConnection); else socket.destroy(); });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, rooms, port: server.address().port, close: () => { for (const r of rooms.values()) clearInterval(r.timer); server.close(); } })));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const port = +process.argv[2] || 8080;
  createRelay({ port }).then(({ port: p }) => {
    console.log(`Auld World relay on http://localhost:${p}  (online: open http://<this machine>:${p}/?mp=ROOM&name=YOU ; Ctrl+C to stop)`);
  });
}
