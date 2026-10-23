// A minimal WebSocket server side (RFC 6455) with no dependencies: text frames, ping/pong, close. Client frames are masked, server frames
// are not. Shared by relay.js (open rooms, for local play) and server/match.js (one hourly match).
import { createHash } from 'node:crypto';

// a frame larger than this from a client closes the connection (nobody sends a megabyte of orders)
export const MAX_MESSAGE = 1 << 20;

// Accept an upgrade request; onOpen(conn) gets { open, seen, socket, send(text), ping(), close(), onmessage, onclose }.
export function wsAccept(req, socket, onOpen, maxMessage = MAX_MESSAGE) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  const conn = { open: true, seen: Date.now(), socket, onmessage: () => {}, onclose: () => {}, send: (text) => sendFrame(socket, 0x1, Buffer.from(text)), ping: () => sendFrame(socket, 0x9, Buffer.alloc(0)), close: () => { if (conn.open) { sendFrame(socket, 0x8, Buffer.alloc(0)); socket.end(); } } };
  let buf = Buffer.alloc(0), parts = [], partsLen = 0;
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]); conn.seen = Date.now();
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80; let len = buf[1] & 0x7f, at = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); at = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); at = 10; }
      if (len > maxMessage || partsLen + len > maxMessage) { socket.destroy(); return; }   // (a message split into fragments counts whole)
      const need = at + (masked ? 4 : 0) + len; if (buf.length < need) return;
      let data = buf.subarray(at + (masked ? 4 : 0), need);
      if (masked) { const m = buf.subarray(at, at + 4); data = Buffer.from(data); for (let i = 0; i < data.length; i++) data[i] ^= m[i & 3]; }
      buf = buf.subarray(need);
      if (op === 0x8) { conn.close(); return; }
      if (op === 0x9) { sendFrame(socket, 0xa, data); continue; }
      if (op === 0x1 || op === 0x0) { parts.push(data); partsLen += data.length; if (fin) { const text = Buffer.concat(parts).toString('utf8'); parts = []; partsLen = 0; try { conn.onmessage(text); } catch (e) { console.error('[ws]', e); } } }
    }
  });
  const gone = () => { if (conn.open) { conn.open = false; conn.onclose(); } };
  socket.on('close', gone); socket.on('end', gone); socket.on('error', gone);
  onOpen(conn);
}

export function sendFrame(socket, op, data) {
  if (socket.destroyed) return;
  const n = data.length, head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); return h; })();
  socket.write(Buffer.concat([head, data]));
}
