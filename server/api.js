// Auld World - the api (ONLINE.md section 4): the game's files, accounts and sign-in, the hourly timetable, tickets, results, the league.
//   node --disable-warning=ExperimentalWarning server/api.js          settings from the environment (see SETTINGS below and DEPLOY.md)
// One copy runs (SQLite has one writer). A match runs in its own server (server/match.js); a browser reaches it at /m/<id>/ws, which in
// Kubernetes the front door (Caddy) sends straight to the match, and which this api also passes through (local runs, and as a fallback).
import http from 'node:http';
import net from 'node:net';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import * as auth from './auth.js';
import { makeMailer, codeMail } from './mail.js';
import { makeService } from './service.js';
import { localLauncher, k8sLauncher } from './launch.js';
import { MATCH } from '../js/online.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2' };
// only the game itself is served: never the server's code, tests, tools, deployment files or notes
const PUBLIC = ['index.html', 'style.css', 'js/', 'assets/', 'data/'];
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export async function createApi(s = {}) {
  const env = { ...process.env, ...s.env };
  const prod = env.NODE_ENV === 'production';
  const publicUrl = (env.PUBLIC_URL || `http://localhost:${env.PORT || 8080}`).replace(/\/$/, ''), origin = new URL(publicUrl).origin, https = publicUrl.startsWith('https:');
  const sessionSecret = env.SESSION_SECRET || (prod ? '' : 'dev-session-secret'), matchSecret = env.MATCH_SECRET || (prod ? '' : 'dev-match-secret');
  if (!sessionSecret || !matchSecret) throw new Error('SESSION_SECRET and MATCH_SECRET must be set in production');
  if (env.AUTH_DEV === '1' && prod) throw new Error('AUTH_DEV (sign in without a password, for testing) must never be on in production');
  const log = s.log || console.log, now = s.now || (() => Date.now());
  const db = s.db || openDb(env.DB_FILE || ':memory:');
  const mailer = s.mailer || makeMailer({ mode: env.MAIL || 'console', from: env.MAIL_FROM, log });
  const fetchFn = s.fetch || fetch;
  const providers = {};
  for (const p of ['google', 'discord', 'github']) {
    const id = env[`${p.toUpperCase()}_CLIENT_ID`], secret = env[`${p.toUpperCase()}_CLIENT_SECRET`];
    if (id && secret) providers[p] = { clientId: id, clientSecret: secret, redirect: `${publicUrl}/api/auth/${p}/callback`, endpoints: s.endpoints?.[p] };
  }
  const report = async (result) => { const body = JSON.stringify(result); const { signBody } = await import('./ticket.js'); const code = service.result(body, signBody(matchSecret, body)); if (code !== 200) throw new Error(`result refused (${code})`); };
  const launcher = s.launcher || (env.LAUNCHER === 'k8s'
    ? k8sLauncher({ namespace: env.K8S_NAMESPACE, image: env.MATCH_IMAGE, apiUrl: env.API_INTERNAL_URL, secretName: env.MATCH_SECRET_NAME || 'auld-secrets', capS: +env.MATCH_CAP_S || undefined, graceS: +env.MATCH_GRACE_S || undefined, log })
    : localLauncher({ secret: matchSecret, report, log, ...(+env.MATCH_CAP_S ? { capS: +env.MATCH_CAP_S } : {}), ...(+env.MATCH_GRACE_S ? { graceS: +env.MATCH_GRACE_S } : {}), ...(s.matchOpts || {}) }));
  const webhook = env.DISCORD_WEBHOOK_URL;
  const service = makeService({
    db, secret: matchSecret, launcher, log, everyMin: +env.EVERY_MIN || undefined, opensMin: env.OPENS_MIN !== undefined ? +env.OPENS_MIN : undefined,
    houses: +env.MATCH_HOUSES || undefined, capS: +env.MATCH_CAP_S || undefined, matchConfig: s.matchConfig,
    onFinished: (id, r) => { if (webhook) postDiscord(webhook, id, r, service, fetchFn).catch((e) => log(`[discord] ${e.message}`)); },
  });

  // ---- small helpers ------------------------------------------------------------------------------------------------------------
  const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p.length >= 2).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  const cookie = (name, value, maxAge) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https ? '; Secure' : ''}`;
  const ipOf = (req) => (env.TRUST_PROXY === '1' && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',').pop().trim() : req.socket.remoteAddress) || '?';
  const limits = new Map();
  const limited = (key, max, perMs) => {   // true once `key` has been used `max` times in the window
    const t = now(), w = limits.get(key);
    if (!w || t - w.t > perMs) { limits.set(key, { t, n: 1 }); return false; }
    return ++w.n > max;
  };
  setInterval(() => { const t = now(); for (const [k, w] of limits) if (t - w.t > 864e5) limits.delete(k); }, 3600e3).unref();
  const headers = (extra = {}) => ({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', ...(https ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}), ...extra });
  const json = (res, code, obj, extra = {}) => { res.writeHead(code, headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra })); res.end(JSON.stringify(obj)); };
  const redirect = (res, to, extra = {}) => { res.writeHead(302, headers({ Location: to, 'Cache-Control': 'no-store', ...extra })); res.end(); };
  const body = (req, max = 16384) => new Promise((resolve, reject) => {
    let n = 0; const parts = [];
    req.on('data', (c) => { n += c.length; if (n > max) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { resolve(n ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('not JSON'), { code: 400 })); } });
    req.on('error', reject);
  });
  const rawBody = (req, max = 262144) => new Promise((resolve, reject) => { let n = 0; const parts = []; req.on('data', (c) => { n += c.length; if (n > max) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else parts.push(c); }); req.on('end', () => resolve(Buffer.concat(parts).toString('utf8'))); req.on('error', reject); });
  const signIn = (res, user, extra = {}) => { const v = auth.newSession(db, user.id, now()); return { 'Set-Cookie': cookie(auth.SESSION.cookie, v, auth.SESSION.days * 86400), ...extra }; };

  async function api(req, res, url) {
    const path = url.pathname, method = req.method, c = cookies(req), user = auth.sessionUser(db, c[auth.SESSION.cookie], now()), ip = ipOf(req);
    // a change from a page that is not ours is refused (cross-site request forgery): our pages send this header and our origin
    if (method === 'POST' && path.startsWith('/api/')) {
      if (req.headers['x-auld'] !== '1') return json(res, 403, { error: 'Missing request header.' });
      if (req.headers.origin && req.headers.origin !== origin) return json(res, 403, { error: 'Wrong origin.' });
    }
    const need = () => { if (!user) { json(res, 401, { error: 'Sign in first.' }); return false; } return true; };

    if (method === 'GET' && path === '/api/config') return json(res, 200, { version: env.AULD_VERSION || 'dev', signIns: ['email', ...Object.keys(providers)], dev: env.AUTH_DEV === '1', everyMin: +env.EVERY_MIN || 60, capS: +env.MATCH_CAP_S || MATCH.capS, mail: mailer.mode });
    if (method === 'GET' && path === '/api/me') return json(res, 200, { user: auth.userView(user) });

    if (method === 'POST' && path === '/api/auth/email/start') {
      const b = await body(req), email = auth.normEmail(b.email);
      if (!auth.validEmail(email)) return json(res, 400, { error: 'That does not look like an email address.' });
      if (limited(`code-ip:${ip}`, 10, 3600e3)) return json(res, 429, { error: 'Too many codes asked for from here. Try again in an hour.' });
      const r = auth.makeCode(db, email, sessionSecret, now());
      if (r.wait) return json(res, 429, { error: `A code was sent a few times already. Try again in ${r.wait} minute${r.wait > 1 ? 's' : ''}.` });
      const m = codeMail(r.code, auth.CODE.minutes);
      try { await mailer.send(email, m.subject, m.text); } catch (e) { log(`[mail] could not send: ${e.message}`); return json(res, 502, { error: 'The code could not be sent just now. Try again shortly.' }); }
      return json(res, 200, { ok: true });   // (the same answer whether or not the address has an account)
    }
    if (method === 'POST' && path === '/api/auth/email/verify') {
      const b = await body(req), email = auth.normEmail(b.email);
      if (limited(`verify-ip:${ip}`, 30, 3600e3)) return json(res, 429, { error: 'Too many tries. Try again in an hour.' });
      if (!auth.checkCode(db, email, String(b.code || ''), sessionSecret, now())) return json(res, 400, { error: 'That code is wrong or has run out. Ask for a new one.' });
      const u = auth.signInWith(db, 'email', email, email, now());
      return json(res, 200, { user: auth.userView(u) }, signIn(res, u));
    }
    const op = path.match(/^\/api\/auth\/(google|discord|github)\/(start|callback)$/);
    if (op && method === 'GET') {
      const [, p, step] = op, cfg = providers[p];
      if (!cfg) return redirect(res, `/?online=1&err=${encodeURIComponent('That sign-in is not set up yet.')}`);
      if (step === 'start') { const s = auth.oauthStart(p, cfg, sessionSecret); return redirect(res, s.url, { 'Set-Cookie': cookie('aw_oauth', s.cookie, 600) }); }
      const clear = cookie('aw_oauth', '', 0);
      try {
        const who = await auth.oauthFinish(p, cfg, sessionSecret, c.aw_oauth, Object.fromEntries(url.searchParams), fetchFn);
        const u = auth.signInWith(db, p, who.id, who.email, now());
        return redirect(res, '/?online=1', { 'Set-Cookie': [clear, signIn(res, u)['Set-Cookie']] });
      } catch (e) { log(`[auth] ${p}: ${e.message}`); return redirect(res, `/?online=1&err=${encodeURIComponent(e.message)}`, { 'Set-Cookie': clear }); }
    }
    if (method === 'POST' && path === '/api/auth/dev') {   // testing only (AUTH_DEV=1, never in production): sign in as a named test player
      if (env.AUTH_DEV !== '1') return json(res, 404, { error: 'Not here.' });
      const b = await body(req), name = String(b.name || '');
      const u = auth.signInWith(db, 'dev', name.toLowerCase(), null, now());
      if (!u.username) auth.setUsername(db, u.id, name);
      return json(res, 200, { user: auth.userView(auth.getUser(db, u.id)) }, signIn(res, u));
    }
    if (method === 'POST' && path === '/api/auth/logout') { auth.endSession(db, c[auth.SESSION.cookie]); return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(auth.SESSION.cookie, '', 0) }); }
    if (method === 'POST' && path === '/api/me/username') {
      if (!need()) return;
      if (limited(`name:${user.id}`, 20, 3600e3)) return json(res, 429, { error: 'Too many tries. Try again later.' });
      const r = auth.setUsername(db, user.id, (await body(req)).username);
      return r.ok ? json(res, 200, { user: r.user }) : json(res, 400, { error: r.why });
    }
    if (method === 'POST' && path === '/api/me/delete') {
      if (!need()) return;
      if ((await body(req)).confirm !== 'DELETE') return json(res, 400, { error: 'Type DELETE to confirm.' });
      auth.deleteUser(db, user.id);
      return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(auth.SESSION.cookie, '', 0) });
    }
    if (method === 'GET' && path === '/api/schedule') return json(res, 200, service.schedule(user, now()));
    if (method === 'POST' && (path === '/api/join' || path === '/api/leave')) {
      if (!need()) return;
      if (limited(`join:${user.id}`, 60, 3600e3)) return json(res, 429, { error: 'Too many tries. Try again later.' });
      const r = path === '/api/join' ? service.join(user, now()) : service.leave(user, now());
      return r.ok ? json(res, 200, { ...r, schedule: service.schedule(user, now()) }) : json(res, 400, { error: r.why });
    }
    if (method === 'GET' && path === '/api/play') { if (!need()) return; const t = service.ticketFor(user, now()); return t ? json(res, 200, t) : json(res, 404, { error: 'You are not in a match that is on.' }); }
    if (method === 'GET' && path === '/api/league') return json(res, 200, { season: url.searchParams.get('season') || 'all', rows: service.league(url.searchParams.get('season') || 'all') });
    if (method === 'GET' && path === '/api/recent') return json(res, 200, { matches: service.recent() });
    if (method === 'POST' && path === '/api/report') {   // report a username as offensive: the owner looks at the list and renames
      if (!need()) return;
      const b = await body(req), target = db.prepare('SELECT id FROM users WHERE username = ? AND deleted IS NULL').get(String(b.username || ''));
      if (!target || target.id === user.id) return json(res, 400, { error: 'No such player.' });
      if (limited(`report:${user.id}`, 20, 864e5)) return json(res, 429, { error: 'Thank you: you have sent a lot of reports today.' });
      db.prepare('INSERT INTO name_reports (reporter, user_id, at) VALUES (?, ?, ?)').run(user.id, target.id, now());
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'Not found.' });
  }

  async function files(req, res, url) {
    let p; try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
    if (p === '/') p = '/index.html';
    const rel = normalize(p).replace(/^[\\/]+/, '').split(sep).join('/');
    if (rel.includes('..') || !PUBLIC.some((x) => (x.endsWith('/') ? rel.startsWith(x) : rel === x))) { res.writeHead(404, headers({ 'Content-Type': 'text/plain' })).end('not found'); return; }
    const f = join(ROOT, rel);
    let st; try { st = await stat(f); if (!st.isFile()) throw new Error('not a file'); } catch { res.writeHead(404, headers({ 'Content-Type': 'text/plain' })).end('not found'); return; }
    // Cached by the browser: code with the build's ?v= stamp for a year (a new build has a new stamp), the art for a day, the page itself
    // always asked again. Every answer carries a fingerprint (ETag), so a browser that has a file gets "not modified" instead of the file.
    // Files are streamed, never read whole: at the top of the hour everyone loads the painted art at once.
    const type = TYPES[extname(f).toLowerCase()] || 'application/octet-stream', etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const cache = rel === 'index.html' ? 'no-cache' : url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400';
    const h = headers({ 'Content-Type': type, 'Cache-Control': cache, ETag: etag, 'Last-Modified': st.mtime.toUTCString(), ...(type.startsWith('text/html') ? { 'Content-Security-Policy': CSP } : {}) });
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); res.end(); return; }
    res.writeHead(200, { ...h, 'Content-Length': st.size });
    if (req.method === 'HEAD') { res.end(); return; }
    const s = createReadStream(f);
    s.on('error', () => res.destroy()); res.on('close', () => s.destroy());
    s.pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end(`ok ${env.AULD_VERSION || 'dev'}`); return; }
      if (url.pathname === '/internal/results' && req.method === 'POST') { const text = await rawBody(req); const code = service.result(text, req.headers['x-auld-sig']); res.writeHead(code).end(); return; }
      if (url.pathname.startsWith('/internal/')) { res.writeHead(404).end(); return; }
      if (url.pathname === '/league') { res.writeHead(200, headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Security-Policy': CSP })).end(leaguePage(service, url.searchParams.get('season') || monthOf(now()))); return; }
      if (url.pathname.startsWith('/api/')) { await api(req, res, url); return; }
      if (req.method === 'GET' || req.method === 'HEAD') { await files(req, res, url); return; }
      res.writeHead(405).end();
    } catch (e) {
      if (!res.headersSent) json(res, e.code === 413 ? 413 : e.code === 400 ? 400 : 500, { error: e.code === 413 ? 'Too large.' : e.code === 400 ? 'Bad request.' : 'Something went wrong.' });
      if (!e.code) log(`[api] ${req.method} ${url.pathname}: ${e.stack || e.message}`);
    }
  });
  // a browser's WebSocket to a match: passed through to that match's server
  server.on('upgrade', (req, socket, head) => {
    const m = new URL(req.url, 'http://x').pathname.match(/^\/m\/([a-z0-9]{8})\/ws$/), t = m && launcher.target(m[1]);
    if (!t) { socket.destroy(); return; }
    const up = net.connect(t.port, t.host, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`]; for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      up.write(lines.join('\r\n') + '\r\n\r\n'); if (head?.length) up.write(head);
      socket.pipe(up); up.pipe(socket);
    });
    const close = () => { socket.destroy(); up.destroy(); };
    up.on('error', close); socket.on('error', close); up.on('close', close); socket.on('close', close);
  });

  const timer = setInterval(() => service.tick(now()).catch((e) => log(`[schedule] ${e.stack || e.message}`)), s.tickMs || 5000);   // (a match is launched within 5 s of its hour)
  return new Promise((resolve) => server.listen(s.port ?? (+env.PORT || 8080), () => resolve({
    port: server.address().port, db, service, launcher,
    close: () => { clearInterval(timer); launcher.stopAll?.(); server.closeAllConnections?.(); server.close(); },
  })));
}

const monthOf = (t) => new Date(t).toISOString().slice(0, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// the league as a plain page (for a link, or Discord): this month, or ?season=all
function leaguePage(service, season) {
  const rows = service.league(season === 'all' ? 'all' : season), title = season === 'all' ? 'All time' : season;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auld World league</title>
<style>:root{--bg:#1b1610;--fg:#ecdcb4;--mute:#a8987a;--line:#3a3022}body{margin:0;background:var(--bg);color:var(--fg);font:16px Georgia,serif}main{max-width:720px;margin:0 auto;padding:24px 16px}
h1{font-weight:normal;margin:0 0 4px}p{color:var(--mute);margin:0 0 16px}table{width:100%;border-collapse:collapse}th,td{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left}
th{color:var(--mute);font-weight:normal}td.n{text-align:right;font-variant-numeric:tabular-nums}a{color:var(--fg)}</style></head><body><main>
<h1>Auld World league</h1><p>${esc(title)} · <a href="/league${season === 'all' ? '' : '?season=all'}">${season === 'all' ? 'this month' : 'all time'}</a> · <a href="/">play</a></p>
<table><thead><tr><th>#</th><th>Player</th><th class="n">Points</th><th class="n">Played</th><th class="n">Wins</th><th class="n">Best</th></tr></thead><tbody>
${rows.map((r) => `<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td class="n">${r.points}</td><td class="n">${r.played}</td><td class="n">${r.wins}</td><td class="n">${r.best}</td></tr>`).join('') || '<tr><td colspan="6">No matches finished yet.</td></tr>'}
</tbody></table></main></body></html>`;
}
// a finished match, posted to a Discord channel (names only, no mentions)
async function postDiscord(url, id, r, service, f) {
  const names = new Map(service.recent(20).find((m) => m.id === id)?.places.filter((p) => p.name).map((p) => [p.team, p.name]) || []);
  const md = (t) => String(t).replace(/[\\_*~`|>#[\]()-]/g, (c) => '\\' + c);   // (a name is shown as written, never as Discord formatting)
  const people = r.places.filter((p) => names.has(p.team)).map((p) => `${p.place}. ${md(names.get(p.team))} (+${p.points})`).join('\n');
  if (!people) return;
  const how = r.reason === 'conquest' ? 'by conquest' : r.reason === 'cap' ? 'at the two-hour mark' : 'when every player had fallen';
  const res = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: `**Match ${id}** ended ${how}.\n${people}`, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Discord answered ${res.status}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  createApi().then((a) => console.log(`Auld World api on port ${a.port}`)).catch((e) => { console.error(`[api] could not start: ${e.message}`); process.exit(2); });
}
