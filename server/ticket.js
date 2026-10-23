// Signed tokens shared by the api and the match servers (HMAC-SHA256 with a secret only the servers know).
//   ticket: lets one player into one match, in one seat. The api signs it; the match checks it. The seat comes from here, never from the player.
//   signBody / checkBody: the match signs the result it reports to the api, so nothing else on the network can post a result.
import { createHmac, timingSafeEqual } from 'node:crypto';

const mac = (secret, text) => createHmac('sha256', secret).update(text).digest('base64url');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

// claims: { m: match id, u: user id, s: seat, n: username, exp: ms since 1970 }
export function signTicket(secret, claims) {
  if (!secret) throw new Error('no secret');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${mac(secret, body)}`;
}

// The claims if the ticket is genuine and not expired, else null (never throws on a bad ticket).
export function verifyTicket(secret, ticket, now = Date.now()) {
  if (!secret || typeof ticket !== 'string' || ticket.length > 2048) return null;
  const dot = ticket.indexOf('.'); if (dot <= 0) return null;
  const body = ticket.slice(0, dot), sig = ticket.slice(dot + 1);
  if (!same(sig, mac(secret, body))) return null;
  let c; try { c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!c || typeof c !== 'object' || !(c.exp > now)) return null;
  return c;
}

export const signBody = (secret, text) => mac(secret, `body:${text}`);
export const checkBody = (secret, text, sig) => !!secret && typeof sig === 'string' && same(sig, signBody(secret, text));
