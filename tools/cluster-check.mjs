// A whole hourly match against a running deployment, without browsers (the check CI runs on staging after each deploy).
//   node tools/cluster-check.mjs <base url> [--expect-version 1.2.3]
// Needs the test sign-in (staging) and short matches (staging: a match every few minutes, a short cap). Two test players sign in, sign up for
// the same match, get tickets when it starts (the api launched it: a Kubernetes Job), connect through the front door (Caddy to the
// match's Service), see turns arrive, pass a Herald message, and see the result; then the result is in the league (the match reached the
// api past the network policy). Exits 0 when all of that happened.
import { LockstepClient } from '../js/net.js';

const base = (process.argv[2] || '').replace(/\/$/, ''), want = process.argv.includes('--expect-version') ? process.argv[process.argv.indexOf('--expect-version') + 1] : null;
if (!/^https?:\/\//.test(base)) { console.error('usage: node tools/cluster-check.mjs <base url> [--expect-version v]'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (m) => console.log(`[check] ${m}`);
const fail = (m) => { console.error(`[check] FAILED: ${m}`); process.exit(1); };

function player() {
  let cookie = '';
  const call = async (path, { method = 'GET', body } = {}) => {
    const r = await fetch(base + path, { method, headers: { 'X-Auld': '1', Origin: new URL(base).origin, Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    const sc = r.headers.getSetCookie().find((c) => c.startsWith('aw_sid=')); if (sc) cookie = sc.split(';')[0];
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, body: j };
  };
  return { call };
}

const health = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(20000) }).then((r) => r.text()).catch((e) => fail(`no answer from ${base}/healthz (${e.message})`));
step(`healthz: ${health}`);
if (want && health.trim() !== `ok ${want}`) fail(`expected version ${want}`);
const cfg = (await player().call('/api/config')).body;
if (!cfg?.dev) fail('the test sign-in is off here (it is on in staging only)');

const tag = Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6) || 'zzzzzz', names = [`check_${tag}_a`, `check_${tag}_b`];
const ps = names.map(() => player());
for (let i = 0; i < 2; i++) { const r = await ps[i].call('/api/auth/dev', { method: 'POST', body: { name: names[i] } }); if (r.status !== 200 || r.body.user.username !== names[i]) fail(`sign-in ${names[i]}: ${r.status} ${JSON.stringify(r.body)}`); }
step(`signed in ${names.join(' and ')}`);
// both into the same match: not across its start (a sign-up is always for the next one)
for (;;) {
  const s = (await ps[0].call('/api/schedule')).body, left = s.next.startsAt - Date.now();
  if (s.next.open && left > 25000) break;
  step(`the next match starts in ${Math.round(left / 1000)} s; waiting for the one after to open`); await sleep(Math.max(2000, left + 1500));
}
for (const p of ps) { const r = await p.call('/api/join', { method: 'POST', body: {} }); if (r.status !== 200) fail(`join: ${JSON.stringify(r.body)}`); }
const sched = (await ps[0].call('/api/schedule')).body;
step(`both signed up for the match at ${new Date(sched.next.startsAt).toISOString()} (${sched.next.seats.length} seat(s) taken)`);

const tickets = [];
for (const p of ps) {
  const t0 = Date.now(); let t = null;
  while (!t) { const r = await p.call('/api/play'); if (r.status === 200) t = r.body; else if (Date.now() - t0 > sched.next.startsAt - Date.now() + 120000) fail('no ticket: the match was not launched'); else await sleep(2000); }
  tickets.push(t);
}
step(`the match ${tickets[0].match} is on; tickets for seats ${tickets.map((t) => t.seat).join(' and ')}`);

const wsBase = base.replace(/^http/, 'ws');
let clients = tickets.map((t) => { const c = new LockstepClient({ url: wsBase + t.ws, ticket: t.ticket, room: t.match }); c.heard = []; c.onSaid = (m) => c.heard.push(m); c.turnsSeen = 0; return c; });
// (a match's pod takes a few seconds to start, longer on a cold server: keep trying for two minutes, as the game itself does)
const connect = async (c, i) => { const t0 = Date.now(); for (;;) { try { const x = new LockstepClient({ url: wsBase + tickets[i].ws, ticket: tickets[i].ticket, room: tickets[i].match }); Object.assign(x, { heard: c.heard, turnsSeen: 0 }); x.onSaid = (m) => x.heard.push(m); const orig = x.receive.bind(x); x.receive = (m) => { if (m.t === 'turn') x.turnsSeen++; orig(m); }; await x.connect(); return x; } catch (e) { if (Date.now() - t0 > 120000) fail(`could not connect to the match through the front door: ${e.message}`); await sleep(3000); } } };
for (let i = 0; i < clients.length; i++) clients[i] = await connect(clients[i], i);
step('both connected to the match through the front door');
const t1 = Date.now();
while (!clients.every((c) => c.turnsSeen > 30)) { if (Date.now() - t1 > 150000) fail(`turns are not arriving (${clients.map((c) => c.turnsSeen).join(', ')})`); await sleep(500); }
step(`turns are arriving (${clients.map((c) => c.turnsSeen).join(', ')})`);
clients[0].say('gg');
const t2 = Date.now();
while (!clients[1].heard.some((m) => m.id === 'gg')) { if (Date.now() - t2 > 15000) fail('a Herald message did not cross'); await sleep(200); }
step('a Herald message crossed');
const t3 = Date.now();
while (!clients.every((c) => c.result)) { if (Date.now() - t3 > (cfg.capS + 240) * 1000) fail('the match did not end'); await sleep(1000); }
const r = clients[0].result;
step(`the match ended (${r.reason}) after ${r.gameTime} s: ${r.places.filter((p) => p.name).map((p) => `${p.place}. ${p.name} +${p.points}`).join(', ')}`);
for (const c of clients) c.close();
const t4 = Date.now(); let rows = [];
while (!names.every((n) => rows.some((x) => x.name === n))) { if (Date.now() - t4 > 60000) fail('the result did not reach the league'); await sleep(2000); rows = (await ps[0].call('/api/league')).body.rows; }
step('the result is in the league');
console.log('[check] PASSED');
process.exit(0);
