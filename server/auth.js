// Accounts and sign-in (ONLINE.md section 6): sessions, emailed codes, Google / Discord / GitHub (OAuth 2 with PKCE), usernames, deletion.
// Secrets never stored in the clear: a session cookie and an email code are kept as hashes.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { tx } from './db.js';
import { nameProblem } from './names.js';

export const SESSION = { cookie: 'aw_sid', days: 30 };
export const CODE = { minutes: 10, tries: 5, perWindow: 3, windowMin: 15 };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
export const normEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
export const validEmail = (e) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ---- users and sessions -------------------------------------------------------------------------------------------------------
export function userView(u) { return u ? { id: u.id, username: u.username, needsName: !u.username } : null; }
export function getUser(db, id) { return db.prepare('SELECT * FROM users WHERE id = ? AND deleted IS NULL').get(id) || null; }

export function newSession(db, userId, now = Date.now()) {
  const value = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (id, user_id, created, expires) VALUES (?, ?, ?, ?)').run(sha(value), userId, now, now + SESSION.days * 864e5);
  return value;
}
export function sessionUser(db, value, now = Date.now()) {
  if (!value || typeof value !== 'string' || value.length > 100) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sha(value));
  if (!s || s.expires < now) return null;
  return getUser(db, s.user_id);
}
export function endSession(db, value) { if (value) db.prepare('DELETE FROM sessions WHERE id = ?').run(sha(value)); }

// The account a sign-in belongs to: the same provider and person as before; else (only with an address the provider has verified) the account
// that address already belongs to; else a new account, which picks its username next.
export function signInWith(db, provider, subject, verifiedEmail = null, now = Date.now()) {
  subject = String(subject); const email = verifiedEmail ? normEmail(verifiedEmail) : null;
  return tx(db, () => {
    const known = db.prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?').get(provider, subject);
    if (known) { const u = getUser(db, known.user_id); if (u) return u; }
    let user = null;
    if (email) {
      const byId = db.prepare('SELECT user_id FROM identities WHERE email = ? ORDER BY created LIMIT 1').get(email);
      user = byId ? getUser(db, byId.user_id) : null;
      if (!user) user = db.prepare('SELECT * FROM users WHERE email = ? AND deleted IS NULL').get(email) || null;
    }
    if (!user) { const r = db.prepare('INSERT INTO users (username, email, created) VALUES (NULL, ?, ?)').run(email, now); user = getUser(db, Number(r.lastInsertRowid)); }
    db.prepare('INSERT OR REPLACE INTO identities (provider, subject, user_id, email, created) VALUES (?, ?, ?, ?, ?)').run(provider, subject, user.id, email, now);
    if (email && !user.email) db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, user.id);
    return getUser(db, user.id);
  });
}

export function setUsername(db, userId, name) {
  const why = nameProblem(name); if (why) return { ok: false, why };
  try { db.prepare('UPDATE users SET username = ? WHERE id = ? AND deleted IS NULL').run(name, userId); }
  catch (e) { if (/UNIQUE/i.test(String(e.message))) return { ok: false, why: 'That name is taken.' }; throw e; }
  return { ok: true, user: userView(getUser(db, userId)) };
}

// Delete an account: the address, sign-ins and sessions go; the matches stay in the league under "Fallen house #<id>" (others played them too).
export function deleteUser(db, userId) {
  tx(db, () => {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM identities WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM email_codes WHERE email = (SELECT email FROM users WHERE id = ?)').run(userId);
    db.prepare("UPDATE users SET username = 'Fallen house #' || id, email = NULL, deleted = ? WHERE id = ?").run(Date.now(), userId);
  });
}

// ---- emailed codes --------------------------------------------------------------------------------------------------------------
// Make a code for an address and return it (the caller sends it), or { wait } if too many were sent lately. pepper: a server secret, so a
// stolen database does not give up the codes in it.
export function makeCode(db, email, pepper, now = Date.now()) {
  const row = db.prepare('SELECT * FROM email_codes WHERE email = ?').get(email);
  let sent = row ? row.sent : 0, window = row ? row.window : now;
  if (now - window > CODE.windowMin * 60e3) { sent = 0; window = now; }
  if (sent >= CODE.perWindow) return { wait: Math.ceil((window + CODE.windowMin * 60e3 - now) / 60e3) };
  const code = String(randomInt(0, 1e6)).padStart(6, '0');
  db.prepare('INSERT OR REPLACE INTO email_codes (email, hash, expires, tries, sent, window) VALUES (?, ?, ?, 0, ?, ?)').run(email, sha(`${pepper}:${email}:${code}`), now + CODE.minutes * 60e3, sent + 1, window);
  return { code };
}
// true once (the code is used up); false for a wrong, old or over-tried code
export function checkCode(db, email, code, pepper, now = Date.now()) {
  const row = db.prepare('SELECT * FROM email_codes WHERE email = ?').get(email);
  if (!row || row.expires < now || row.tries >= CODE.tries || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    if (row) db.prepare('UPDATE email_codes SET tries = tries + 1 WHERE email = ?').run(email);
    return false;
  }
  if (!same(sha(`${pepper}:${email}:${code}`), row.hash)) { db.prepare('UPDATE email_codes SET tries = tries + 1 WHERE email = ?').run(email); return false; }
  db.prepare('UPDATE email_codes SET expires = 0 WHERE email = ?').run(email);   // (one use; the send count stays, for the limit)
  return true;
}

// ---- Google, Discord, GitHub ------------------------------------------------------------------------------------------------------
// Each: where to send the player, where to swap the code for a token, and how to read who they are (an id, and an address only if verified).
export const PROVIDERS = {
  google: {
    label: 'Google', scope: 'openid email profile',
    auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token',
    async who(token, f, base) { const u = await getJson(f, base.userinfo || 'https://openidconnect.googleapis.com/v1/userinfo', token); return { id: u.sub, email: u.email_verified === true ? u.email : null }; },
    extra: { prompt: 'select_account' },
  },
  discord: {
    label: 'Discord', scope: 'identify email',
    auth: 'https://discord.com/oauth2/authorize', token: 'https://discord.com/api/oauth2/token',
    async who(token, f, base) { const u = await getJson(f, base.userinfo || 'https://discord.com/api/users/@me', token); return { id: u.id, email: u.verified === true ? u.email : null }; },
  },
  github: {
    label: 'GitHub', scope: 'read:user user:email',
    auth: 'https://github.com/login/oauth/authorize', token: 'https://github.com/login/oauth/access_token',
    async who(token, f, base) {
      const u = await getJson(f, base.userinfo || 'https://api.github.com/user', token);
      let email = null;
      try { const list = await getJson(f, base.emails || 'https://api.github.com/user/emails', token); const p = Array.isArray(list) && list.find((e) => e.primary && e.verified); email = p ? p.email : null; } catch { email = null; }
      return { id: u.id, email };
    },
  },
};
async function getJson(f, url, token) {
  const r = await f(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'auld-world' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
  return r.json();
}

// The short-lived cookie that carries the state and the PKCE verifier across the trip to the provider (signed, so it cannot be made up).
const seal = (secret, obj) => { const b = Buffer.from(JSON.stringify(obj)).toString('base64url'); return `${b}.${createHmac('sha256', secret).update(`oauth:${b}`).digest('base64url')}`; };
const unseal = (secret, v) => {
  if (typeof v !== 'string') return null; const i = v.indexOf('.'); if (i <= 0) return null;
  const b = v.slice(0, i); if (!same(v.slice(i + 1), createHmac('sha256', secret).update(`oauth:${b}`).digest('base64url'))) return null;
  try { const o = JSON.parse(Buffer.from(b, 'base64url').toString('utf8')); return o && o.exp > Date.now() ? o : null; } catch { return null; }
};

// cfg: { clientId, clientSecret, redirect, endpoints?: { auth, token, userinfo, emails } (tests point these at a fake) }
export function oauthStart(name, cfg, secret) {
  const p = PROVIDERS[name], state = randomBytes(18).toString('base64url'), verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const url = new URL(cfg.endpoints?.auth || p.auth);
  const q = { client_id: cfg.clientId, redirect_uri: cfg.redirect, response_type: 'code', scope: p.scope, state, code_challenge: challenge, code_challenge_method: 'S256', ...(p.extra || {}) };
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);
  return { url: url.toString(), cookie: seal(secret, { p: name, s: state, v: verifier, exp: Date.now() + 10 * 60e3 }) };
}
// -> { id, email } of the person, or throws with a reason to show
export async function oauthFinish(name, cfg, secret, cookie, query, f = fetch) {
  const p = PROVIDERS[name], st = unseal(secret, cookie);
  if (!st || st.p !== name) throw new Error('The sign-in took too long or came from elsewhere. Try again.');
  if (query.error) throw new Error(`${p.label} said: ${String(query.error).slice(0, 80)}`);
  if (typeof query.state !== 'string' || !same(query.state, st.s) || typeof query.code !== 'string') throw new Error('The sign-in did not match. Try again.');
  const body = new URLSearchParams({ grant_type: 'authorization_code', code: query.code, redirect_uri: cfg.redirect, client_id: cfg.clientId, client_secret: cfg.clientSecret, code_verifier: st.v });
  const r = await f(cfg.endpoints?.token || p.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'auld-world' }, body, signal: AbortSignal.timeout(10000) });
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.access_token) throw new Error(`${p.label} would not confirm the sign-in. Try again.`);
  const who = await p.who(t.access_token, f, cfg.endpoints || {});
  if (who.id === undefined || who.id === null || who.id === '') throw new Error(`${p.label} did not say who you are.`);
  return { id: String(who.id), email: who.email || null };
}
