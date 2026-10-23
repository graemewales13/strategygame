// The api (server/api.js) end to end in one process: files, sign-in (email code, OAuth against a fake provider), usernames, the hourly
// sign-up, launching a match and playing it through the api's WebSocket pass-through, results, the league, deleting an account.
// `AULD_MAP=112 node --disable-warning=ExperimentalWarning test/api.test.js` (part of `npm test`). Needs Node 22+.
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApi } from '../server/api.js';
import { matchManifests, k8sLauncher } from '../server/launch.js';
import { nameProblem } from '../server/names.js';
import { signBody } from '../server/ticket.js';
import { Game } from '../js/game.js';
import { LockstepClient, stateHash } from '../js/net.js';
import { matchOpts } from '../js/online.js';

let passed = 0;
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 5).join('\n       ')); process.exitCode = 1; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 20000, what = 'condition') => { const t0 = Date.now(); while (!(await cond())) { if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what); await sleep(10); } };
if (typeof WebSocket === 'undefined') { console.log('  skip  (needs Node 22+)'); process.exit(0); }

// ---- a fake OAuth provider (stands in for Google, Discord and GitHub) ------------------------------------------------------------
const people = { 'code-gh-1': { id: 501, email: 'ann@example.com', verified: true }, 'code-gh-2': { id: 502, email: 'mallory@example.com', verified: false } };
const fake = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let b = '';
  req.on('data', (c) => { b += c; }); req.on('end', () => {
    if (u.pathname === '/token') { const q = new URLSearchParams(b); const who = people[q.get('code')]; if (!who || !q.get('code_verifier')) { res.writeHead(400).end('{}'); return; } res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ access_token: `tok-${q.get('code')}` })); return; }
    const who = people[(req.headers.authorization || '').replace('Bearer tok-', '')];
    if (!who) { res.writeHead(401).end('{}'); return; }
    if (u.pathname === '/user') { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: who.id })); return; }
    if (u.pathname === '/emails') { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify([{ email: who.email, primary: true, verified: who.verified }])); return; }
    res.writeHead(404).end();
  });
});
await new Promise((r) => fake.listen(0, r));
const F = `http://127.0.0.1:${fake.address().port}`;

// ---- the api, with a clock the test moves, mail caught, matches run here --------------------------------------------------------
let clock = Date.UTC(2026, 9, 23, 13, 40);   // 13:40, twenty minutes before the 14:00 match (sign-up opens at 13:30)
const mail = [];
const reported = [];
const api = await createApi({
  port: 0, log: () => {}, now: () => clock, tickMs: 100000,
  env: { NODE_ENV: 'test', PUBLIC_URL: 'http://localhost:8080', AUTH_DEV: '0', EVERY_MIN: '60', OPENS_MIN: '30', MATCH_HOUSES: '3', GITHUB_CLIENT_ID: 'gh-id', GITHUB_CLIENT_SECRET: 'gh-secret' },
  mailer: { mode: 'test', async send(to, subject, text) { mail.push({ to, subject, text }); } },
  endpoints: { github: { auth: `${F}/authorize`, token: `${F}/token`, userinfo: `${F}/user`, emails: `${F}/emails` } },
  matchOpts: { turnMs: 3, graceS: 30, capS: 40, lingerMs: 50, retryMs: 20 },
  matchConfig: { people: 'classic' },
});
const base = `http://127.0.0.1:${api.port}`;
// a browser: keeps its cookies, sends the header and origin our pages send
function browser() {
  const jar = new Map();
  const call = async (path, { method = 'GET', body, headers = {}, raw = false } = {}) => {
    const h = { Origin: 'http://localhost:8080', 'X-Auld': '1', Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...headers };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (/Max-Age=0/.test(sc)) jar.delete(k); else jar.set(k, v); }
    return raw ? r : { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
  };
  return { call, jar };
}
const codeIn = (to) => { const m = [...mail].reverse().find((x) => x.to === to); return m && m.text.match(/\b(\d{6})\b/)[1]; };

await test('files: the game is served with a content security policy; the server\'s code, tests, notes and anything outside are not', async () => {
  const r = await fetch(`${base}/`); assert.equal(r.status, 200); assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(await r.text(), /<html/i);
  assert.equal((await fetch(`${base}/js/game.js`)).status, 200);
  for (const p of ['/server/api.js', '/test/api.test.js', '/DEPLOY.md', '/package.json', '/.git/config', '/js/../server/db.js', '/%2e%2e/server/db.js', '/relay.js', '/deploy/terraform/main.tf'])
    assert.equal((await fetch(base + p)).status, 404, p);
});

await test('cross-site requests: a change without our header, or from another site, is refused', async () => {
  const r1 = await fetch(`${base}/api/auth/email/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":"a@b.cd"}' });
  assert.equal(r1.status, 403);
  const r2 = await fetch(`${base}/api/auth/email/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auld': '1', Origin: 'https://evil.example' }, body: '{"email":"a@b.cd"}' });
  assert.equal(r2.status, 403);
  assert.equal(mail.length, 0);
});

const ann = browser(), bob = browser();
await test('email sign-in: a 6-digit code is sent; a wrong one fails; the right one signs in once; then a username is chosen', async () => {
  assert.equal((await ann.call('/api/auth/email/start', { method: 'POST', body: { email: 'not an email' } })).status, 400);
  assert.equal((await ann.call('/api/auth/email/start', { method: 'POST', body: { email: 'Ann@Example.com ' } })).status, 200);
  const code = codeIn('ann@example.com'); assert.match(code, /^\d{6}$/);
  assert.equal((await ann.call('/api/auth/email/verify', { method: 'POST', body: { email: 'ann@example.com', code: code === '000000' ? '000001' : '000000' } })).status, 400);
  const ok = await ann.call('/api/auth/email/verify', { method: 'POST', body: { email: 'ann@example.com', code } });
  assert.equal(ok.status, 200); assert.equal(ok.body.user.needsName, true); assert.ok(ann.jar.has('aw_sid'));
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/); assert.match(ok.headers.get('set-cookie'), /SameSite=Lax/);
  assert.equal((await browser().call('/api/auth/email/verify', { method: 'POST', body: { email: 'ann@example.com', code } })).status, 400, 'a code works once');
  assert.equal((await ann.call('/api/me/username', { method: 'POST', body: { username: 'Admin' } })).status, 400);
  const named = await ann.call('/api/me/username', { method: 'POST', body: { username: 'Ann_of_Ayr' } });
  assert.equal(named.status, 200); assert.equal(named.body.user.username, 'Ann_of_Ayr');
  assert.equal((await ann.call('/api/me')).body.user.username, 'Ann_of_Ayr');
});

await test('email sign-in limits: three codes per address in fifteen minutes; five wrong tries spend a code', async () => {
  const x = browser();
  for (let i = 0; i < 3; i++) assert.equal((await x.call('/api/auth/email/start', { method: 'POST', body: { email: 'bob@example.com' } })).status, 200);
  assert.equal((await x.call('/api/auth/email/start', { method: 'POST', body: { email: 'bob@example.com' } })).status, 429);
  const code = codeIn('bob@example.com'), wrong = code === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i++) await x.call('/api/auth/email/verify', { method: 'POST', body: { email: 'bob@example.com', code: wrong } });
  assert.equal((await x.call('/api/auth/email/verify', { method: 'POST', body: { email: 'bob@example.com', code } })).status, 400, 'too many tries: even the right code is spent');
  clock += 16 * 60e3;
  assert.equal((await bob.call('/api/auth/email/start', { method: 'POST', body: { email: 'bob@example.com' } })).status, 200);
  const r = await bob.call('/api/auth/email/verify', { method: 'POST', body: { email: 'bob@example.com', code: codeIn('bob@example.com') } });
  assert.equal(r.status, 200);
  assert.equal((await bob.call('/api/me/username', { method: 'POST', body: { username: 'ann_of_ayr' } })).body.error, 'That name is taken.', 'names are unique whatever the capitals');
  assert.equal((await bob.call('/api/me/username', { method: 'POST', body: { username: 'Bob' } })).status, 200);
  clock -= 16 * 60e3;
});

await test('GitHub sign-in: state and PKCE checked; a verified address joins the account it belongs to; an unverified one does not', async () => {
  const g = browser();
  const start = await g.call('/api/auth/github/start', { raw: true });
  assert.equal(start.status, 302);
  const to = new URL(start.headers.get('location'));
  assert.equal(to.searchParams.get('code_challenge_method'), 'S256'); assert.ok(to.searchParams.get('state')); assert.equal(to.searchParams.get('client_id'), 'gh-id');
  const bad = await g.call(`/api/auth/github/callback?code=code-gh-1&state=wrong`, { raw: true });
  assert.match(bad.headers.get('location'), /err=/); assert.ok(!g.jar.has('aw_sid'));
  await g.call('/api/auth/github/start', { raw: true });   // (a fresh trip: the failed one cleared its cookie)
  const st2 = new URL((await g.call('/api/auth/github/start', { raw: true })).headers.get('location')).searchParams.get('state');
  const ok = await g.call(`/api/auth/github/callback?code=code-gh-1&state=${st2}`, { raw: true });
  assert.equal(ok.headers.get('location'), '/?online=1');
  assert.equal((await g.call('/api/me')).body.user.username, 'Ann_of_Ayr', 'the same person as the email sign-in (verified address)');
  const m = browser(); const s3 = new URL((await m.call('/api/auth/github/start', { raw: true })).headers.get('location')).searchParams.get('state');
  await m.call(`/api/auth/github/callback?code=code-gh-2&state=${s3}`, { raw: true });
  const mu = (await m.call('/api/me')).body.user; assert.ok(mu && mu.needsName, 'an unverified address makes a new account');
});

await test('test sign-in is off unless switched on, and can never be switched on in production', async () => {
  assert.equal((await browser().call('/api/auth/dev', { method: 'POST', body: { name: 'Eve' } })).status, 404);
  await assert.rejects(createApi({ port: 0, log: () => {}, env: { NODE_ENV: 'production', AUTH_DEV: '1', SESSION_SECRET: 'x', MATCH_SECRET: 'y' } }), /never be on in production/);
  await assert.rejects(createApi({ port: 0, log: () => {}, env: { NODE_ENV: 'production' } }), /must be set in production/);
});

let matchId;
await test('sign-up: opens thirty minutes before; first come first seated; a player can leave; the next match is made on its own', async () => {
  const s = (await ann.call('/api/schedule')).body;
  assert.equal(s.next.startsAt, Date.UTC(2026, 9, 23, 14, 0)); assert.equal(s.next.open, true); assert.equal(s.next.houses, 3);
  matchId = s.next.id;
  assert.equal((await browser().call('/api/join', { method: 'POST', body: {} })).status, 401);
  const a = await ann.call('/api/join', { method: 'POST', body: {} }); assert.equal(a.status, 200); assert.equal(a.body.seat, 0);
  const b = await bob.call('/api/join', { method: 'POST', body: {} }); assert.equal(b.body.seat, 1);
  await bob.call('/api/leave', { method: 'POST', body: {} });
  assert.deepEqual((await ann.call('/api/schedule')).body.next.seats.map((x) => x.name), ['Ann_of_Ayr']);
  assert.equal((await bob.call('/api/join', { method: 'POST', body: {} })).body.seat, 1);
  clock = Date.UTC(2026, 9, 23, 13, 10);
  assert.match((await browser().call('/api/schedule')).body.next.open ? 'open' : 'closed', /closed/);
  clock = Date.UTC(2026, 9, 23, 13, 59, 50);
});

let A, B;
await test('the hour: the match is launched for its players; each gets a ticket and plays it through the api; the copies agree', async () => {
  clock = Date.UTC(2026, 9, 23, 14, 0, 2);
  await api.service.tick(clock);
  assert.equal(api.db.prepare('SELECT status FROM matches WHERE id = ?').get(matchId).status, 'live');
  assert.equal((await browser().call('/api/play')).status, 401);
  const ta = (await ann.call('/api/play')).body, tb = (await bob.call('/api/play')).body;
  assert.equal(ta.match, matchId); assert.equal(ta.seat, 0); assert.equal(tb.seat, 1); assert.equal(ta.ws, `/m/${matchId}/ws`);
  const join = (t) => { const c = new LockstepClient({ url: `ws://127.0.0.1:${api.port}${t.ws}`, ticket: t.ticket, room: t.match }); c.onStart = (cfg) => { const g = new Game(matchOpts(cfg)); g.playbook = null; c.attach(g); }; return c; };
  A = join(ta); B = join(tb); await A.connect(); await B.connect();
  await until(() => { A.step(400); B.step(400); return A.next > 60 && B.next > 60; }, 30000, 'play');
  const n = Math.min(A.next, B.next) - 1; while (A.next <= n) A.step(1); while (B.next <= n) B.step(1);
  assert.equal(A.next, B.next); assert.equal(stateHash(A.game), stateHash(B.game), 'both copies are the same after the same turns');
  assert.equal(A.seat, 0); assert.deepEqual(A.config.humans, [0, 1]);
  assert.equal((await browser().call('/api/schedule')).body.next.startsAt, Date.UTC(2026, 9, 23, 15, 0), 'the next hour is on the board');
});

await test('the end: the result is recorded once; points reach the league, this month and all time; recent matches name the players', async () => {
  await until(() => { A.step(400); B.step(400); return A.result && B.result; }, 60000, 'the end');
  await until(() => api.db.prepare('SELECT status FROM matches WHERE id = ?').get(matchId).status === 'finished', 5000, 'the result');
  const rows = (await browser().call('/api/league?season=2026-10')).body.rows;
  assert.equal(rows.length, 2); assert.deepEqual(rows.map((r) => r.name).sort(), ['Ann_of_Ayr', 'Bob']);
  assert.ok(rows.every((r) => r.played === 1 && r.points > 0));
  assert.deepEqual((await browser().call('/api/league?season=2026-09')).body.rows, []);
  assert.equal((await browser().call('/api/league')).body.rows.length, 2);
  const recent = (await browser().call('/api/recent')).body.matches[0];
  assert.equal(recent.id, matchId); assert.equal(recent.places.filter((p) => p.name).length, 2);
  const page = await (await fetch(`${base}/league?season=2026-10`)).text(); assert.match(page, /Ann_of_Ayr/);
  // a replayed or forged result changes nothing
  const text = api.db.prepare('SELECT result FROM matches WHERE id = ?').get(matchId).result;
  const again = await fetch(`${base}/internal/results`, { method: 'POST', body: text, headers: { 'X-Auld-Sig': signBody('dev-match-secret', text) } });
  assert.equal(again.status, 200);
  const forged = await fetch(`${base}/internal/results`, { method: 'POST', body: text.replace('"points":', '"points":9'), headers: { 'X-Auld-Sig': 'nope' } });
  assert.equal(forged.status, 403);
  assert.deepEqual((await browser().call('/api/league?season=2026-10')).body.rows.map((r) => r.points), rows.map((r) => r.points));
  A.close(); B.close();
});

await test('names in the league are written safely on the page', async () => {
  const id = api.db.prepare("SELECT id FROM users WHERE username = 'Bob'").get().id;
  api.db.prepare("UPDATE users SET username = '<b>x</b>' WHERE id = ?").run(id);   // (cannot be chosen; written here to prove the page escapes)
  const page = await (await fetch(`${base}/league?season=2026-10`)).text();
  assert.ok(!page.includes('<b>x</b>') && page.includes('&lt;b&gt;x&lt;/b&gt;'));
  api.db.prepare("UPDATE users SET username = 'Bob' WHERE id = ?").run(id);
});

await test('deleting an account: signed out, the address and sign-ins gone, the matches kept under a fallen house', async () => {
  assert.equal((await bob.call('/api/me/delete', { method: 'POST', body: {} })).status, 400, 'asks for confirmation');
  assert.equal((await bob.call('/api/me/delete', { method: 'POST', body: { confirm: 'DELETE' } })).status, 200);
  assert.equal((await bob.call('/api/me')).body.user, null);
  const rows = (await browser().call('/api/league?season=2026-10')).body.rows;
  assert.ok(rows.some((r) => /^Fallen house #\d+$/.test(r.name))); assert.ok(!rows.some((r) => r.name === 'Bob'));
  assert.equal(api.db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'bob@example.com'").get().n, 0);
});

await test('Kubernetes: a match is a locked-down Job and a Service the Job owns', async () => {
  const { job, service } = matchManifests({ id: 'abcd1234', startsAt: 1, config: { seed: 5, houses: 8 }, seats: [{ seat: 0, user: 1, name: 'Ann' }] }, { image: 'ghcr.io/x/auld-world:1.0.0', apiUrl: 'http://api:8080', namespace: 'auld' });
  const c = job.spec.template.spec.containers[0];
  assert.equal(job.metadata.name, 'match-abcd1234'); assert.equal(job.spec.backoffLimit, 0); assert.ok(job.spec.ttlSecondsAfterFinished > 0);
  assert.equal(job.spec.template.spec.automountServiceAccountToken, false); assert.equal(c.securityContext.readOnlyRootFilesystem, true); assert.deepEqual(c.securityContext.capabilities.drop, ['ALL']);
  assert.ok(c.resources.limits.memory && c.resources.limits.cpu);
  assert.ok(c.env.find((e) => e.name === 'MATCH_SECRET').valueFrom.secretKeyRef, 'the secret comes from a Kubernetes Secret, not the manifest');
  assert.equal(JSON.parse(c.env.find((e) => e.name === 'MATCH_CONFIG').value).seats[0].name, 'Ann');
  assert.deepEqual(service.spec.selector, { app: 'auld-match', match: 'abcd1234' });
  const calls = [];
  const L = k8sLauncher({ namespace: 'auld', image: 'img', apiUrl: 'http://api:8080', log: () => {}, request: async (method, path, body) => { calls.push({ method, path, body }); return { status: 201, body: { metadata: { uid: 'uid-1' } } }; } });
  const w = await L.start({ id: 'abcd1234', startsAt: 1, config: { seed: 5, houses: 8 }, seats: [] });
  assert.deepEqual(calls.map((x) => x.path), ['/apis/batch/v1/namespaces/auld/jobs', '/api/v1/namespaces/auld/services']);
  assert.equal(calls[1].body.metadata.ownerReferences[0].uid, 'uid-1'); assert.equal(w.where, 'match-abcd1234.auld.svc.cluster.local:8080');
  assert.equal(L.target('abcd1234').host, 'match-abcd1234.auld.svc.cluster.local'); assert.equal(L.target('../etc'), null);
});

await test('usernames: letters, digits, _ and -; no slurs or staff names, even disguised; innocent places pass', () => {
  for (const ok of ['Ann', 'Scunthorpe', 'Cockburn', 'Assassin', 'Graeme_W', 'Hancock-7']) assert.equal(nameProblem(ok), null, ok);
  for (const bad of ['ab', 'a b c', 'Admin', 'sh1tlord', 'f_u_c_k', 'M0D', 'the-admin', '1234', '_ann', 'a__b', 'x'.repeat(17)]) assert.ok(nameProblem(bad), bad);
});

api.close(); fake.close();
console.log(`${passed} passed`);
process.exit(process.exitCode || 0);
