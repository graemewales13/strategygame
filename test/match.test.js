// The hourly match server (server/match.js) with real WebSockets and lockstep clients (js/net.js), all in one process. Small board:
// `AULD_MAP=112 node test/match.test.js` (part of `npm test`). Needs Node 22+ (global WebSocket).
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { LockstepClient, stateHash, NET } from '../js/net.js';
import { matchOpts, checkSay, placings, pointsFor, quickText, POINTS } from '../js/online.js';
import { createMatch } from '../server/match.js';
import { signTicket, verifyTicket, signBody, checkBody } from '../server/ticket.js';

let passed = 0;
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 5).join('\n       ')); process.exitCode = 1; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 15000, what = 'condition') => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what); await sleep(5); } };
if (typeof WebSocket === 'undefined') { console.log('  skip  (this Node has no global WebSocket; use Node 22+)'); process.exit(0); }

const SECRET = 'test-secret-not-for-production';
const ticket = (m, u, s, n, exp = Date.now() + 3600e3) => signTicket(SECRET, { m, u, s, n, exp });
// a player's browser: connects with a ticket, builds the match the server describes, plays every turn that arrives
function player(port, id, t) {
  const c = new LockstepClient({ url: `ws://127.0.0.1:${port}/m/${id}/ws`, ticket: t, room: id });
  c.saidLog = []; c.onSaid = (m) => c.saidLog.push(m);
  c.onStart = (cfg) => { if (!c.game || c.game._match !== cfg.match) { const g = new Game(matchOpts(cfg)); g.playbook = null; g._match = cfg.match; c.attach(g); } };
  c.pump = () => { if (c.game) c.step(400); };
  return c;
}
const pumpAll = (...cs) => { for (const c of cs) c.pump(); };
const playTo = async (n, ...cs) => { await until(() => { pumpAll(...cs); return cs.every((c) => c.next > n); }, 30000, `turn ${n}`); };
const fast = { turnMs: 3, log: () => {}, retryMs: 20, lingerMs: 50 };

// ---- pure pieces --------------------------------------------------------------------------------------------------------------
await test('tickets: a signed ticket checks out; a changed, expired or unsigned one does not; a result signature is not a ticket signature', () => {
  const t = ticket('abcd1234', 7, 2, 'Ann');
  assert.deepEqual({ ...verifyTicket(SECRET, t), exp: 0 }, { m: 'abcd1234', u: 7, s: 2, n: 'Ann', exp: 0 });
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ m: 'abcd1234', u: 7, s: 0, n: 'Ann', exp: Date.now() + 1e6 })).toString('base64url');
  assert.equal(verifyTicket(SECRET, `${forged}.${sig}`), null, 'another seat with the old signature');
  assert.equal(verifyTicket('other-secret', t), null);
  assert.equal(verifyTicket(SECRET, ticket('abcd1234', 7, 2, 'Ann', Date.now() - 1)), null, 'expired');
  assert.equal(verifyTicket(SECRET, body), null); assert.equal(verifyTicket(SECRET, 42), null); assert.equal(verifyTicket(SECRET, 'x.y'), null);
  assert.ok(checkBody(SECRET, '{"a":1}', signBody(SECRET, '{"a":1}'))); assert.ok(!checkBody(SECRET, '{"a":2}', signBody(SECRET, '{"a":1}')));
  assert.ok(!checkBody(SECRET, body, sig), 'a ticket signature does not sign a result');
});

await test('preset messages: known ids only, a house on the board where the message names one, a seat or everyone as recipient', () => {
  assert.deepEqual(checkSay({ id: 'join', house: 3 }, 8), { id: 'join', house: 3, to: -1 });
  assert.deepEqual(checkSay({ id: 'gg', house: 3, to: 2 }, 8), { id: 'gg', house: null, to: 2 });
  for (const bad of [{ id: 'join' }, { id: 'join', house: 8 }, { id: 'join', house: -1 }, { id: 'hello there' }, { id: 'gg', to: 9 }, { id: 'gg', to: '1' }, { text: 'free chat' }, null, { id: 'join', house: 1.5 }])
    assert.equal(checkSay(bad, 8), null, JSON.stringify(bad));
  assert.equal(quickText('join', 'the Romans'), 'Join me in defeating the Romans.');
  assert.equal(quickText('nonsense', 'x'), '');
});

await test('placings and points: the conqueror first; then the living by rank; then the fallen, last to fall highest; people score, beating people counts', () => {
  const g = new Game({ seed: 3, houses: 5, endRule: 'conquest' });
  g.players[3].alive = false; g.players[1].alive = false;
  const p = placings(g, { 3: 50, 1: 90 });
  assert.deepEqual(p.slice(-2).map((x) => x.team), [1, 3], 'seat 1 fell later than seat 3, so it places higher');
  assert.deepEqual(p.map((x) => x.place), [1, 2, 3, 4, 5]); assert.ok(p.slice(0, 3).every((x) => x.alive) && !p[0].conquest);
  const pts = pointsFor(p, [p[0].team, 1]);
  assert.equal(pts[p[0].team], POINTS.place[0] + POINTS.perPersonBeaten); assert.equal(pts[1], POINTS.place[3]);
  assert.equal(Object.keys(pts).length, 2, 'only people score');
  for (const t of [0, 2, 4].filter((x) => x !== 0)) g.players[t].alive = false;   // one house left
  const c = placings(g, { 2: 100, 4: 110, 3: 50, 1: 90 });
  assert.equal(c[0].team, 0); assert.ok(c[0].conquest);
  assert.equal(pointsFor(c, [0])[0], POINTS.place[0] + POINTS.conquest);
});

await test('end rule: in an hourly match a fallen person does not end it for everyone; the last house standing does', () => {
  const g = new Game({ seed: 3, houses: 4, humans: [0, 1], endRule: 'conquest' });
  g.players[0].alive = false; g.checkEnd(0.05); assert.equal(g.outcome, null);
  g.players[1].alive = false; g.checkEnd(0.05); assert.equal(g.outcome, null, 'every person fallen: the match server decides, not each copy');
  g.players[2].alive = false; g.checkEnd(0.05); assert.equal(g.outcome.kind, 'conquest'); assert.equal(g.outcome.winner, 3);
  const h = new Game({ seed: 3, houses: 3 }); h.restore(JSON.parse(JSON.stringify(g.serialize()))); assert.equal(h.endRule, 'conquest', 'saved with the match');
});

// ---- the server --------------------------------------------------------------------------------------------------------------
const reports = [];
const id = 'm0000001';
const M = await createMatch({ id, config: { seed: 4242, houses: 3, diff: 'mid', people: 'classic', fog: true }, seats: [{ seat: 0, user: 10, name: 'Ann' }, { seat: 1, user: 11, name: 'Bob' }],
  secret: SECRET, port: 0, startAt: Date.now(), graceS: 30, capS: 60, awayMs: 150, report: async (r) => { reports.push(r); }, ...fast });
let A, B;

await test('joining: only a ticket signed for this match, this seat and this user gets in; nobody can name their own seat', async () => {
  const bad = [ticket('zzzz9999', 10, 0, 'Ann'), ticket(id, 99, 0, 'Mallory'), ticket(id, 10, 2, 'Ann'), 'not-a-ticket', signTicket('wrong', { m: id, u: 10, s: 0, exp: Date.now() + 1e6 })];
  for (const t of bad) { const c = player(M.port, id, t); await assert.rejects(c.connect(), /ticket/, t.slice(0, 20)); c.close(); }
  A = player(M.port, id, ticket(id, 10, 0, 'Ann'));
  await A.connect(); assert.equal(A.seat, 0); assert.equal(M.state().phase, 'waiting', 'waits for Bob');
});

await test('start: when every signed-up player is in; the third house is the AI; both copies match the referee', async () => {
  B = player(M.port, id, ticket(id, 11, 1, 'Bob'));
  await B.connect(); assert.equal(B.seat, 1);
  await until(() => A.started && B.started && M.state().phase === 'live', 5000, 'start');
  assert.deepEqual(A.config.humans, [0, 1]); assert.equal(A.config.endRule, 'conquest');
  await playTo(30, A, B);
  assert.equal(A.game.players[2].ai, true); assert.equal(A.game.players[0].ai, false);
  assert.equal(stateHash(A.game), stateHash(B.game));
  const ref = M.referee(), n = A.next - 1;
  await until(() => M.state().turn > n + 1, 5000);
  assert.equal(A.resyncs + B.resyncs, 0, 'honest copies are never corrected');
});

await test('orders: carried out on every copy and by the referee; a player cannot order another seat\'s people', async () => {
  const s0 = A.game.seatOf(0), annSerfs = A.game.units.filter((u) => u.team === 0 && u.kind === 'serf').map((u) => u.id);
  A.send({ type: 'move', ids: annSerfs, x: s0.x + 8, y: s0.y + 8 });
  B.send({ type: 'stop', team: 0, ids: annSerfs });   // Bob claims Ann's seat: the server stamps his own
  const n = Math.max(A.next, B.next) + 150; await playTo(n, A, B);
  assert.equal(stateHash(A.game), stateHash(B.game));
  const moved = A.game.units.filter((u) => annSerfs.includes(u.id)).some((u) => Math.hypot(u.x - s0.x, u.y - s0.y) > 4);
  assert.ok(moved, 'Ann\'s order was carried out');
});

await test('referee: a copy that drifts (here: coin from nowhere) is sent the referee\'s state and is back in step', async () => {
  B.game.players[1].gold += 500;
  const before = B.resyncs;
  await until(() => { pumpAll(A, B); return B.resyncs > before; }, 15000, 'a resync');
  const n = Math.max(A.next, B.next) + NET.hashEvery * 3; await playTo(n, A, B);
  assert.equal(stateHash(A.game), stateHash(B.game), 'Bob\'s copy matches again');
  assert.equal(A.resyncs, 0, 'Ann was never out of step');
});

await test('preset messages: delivered by id to everyone or one seat; free text and floods go nowhere', async () => {
  A.say('join', 2); await until(() => A.saidLog.length && B.saidLog.length, 3000, 'a message');
  assert.deepEqual(B.saidLog[0], { t: 'said', from: 0, id: 'join', house: 2, to: -1 });
  A.say('gg'); A.raw({ t: 'say', text: 'free chat' }); await sleep(150);
  assert.equal(B.saidLog.length, 1, 'a second message within two seconds and a free-text one are dropped');
  await sleep(2100); B.say('thanks', null, 0); await until(() => A.saidLog.length >= 2, 3000);
  assert.equal(A.saidLog[1].id, 'thanks'); assert.equal(A.saidLog[1].to, 0);
});

await test('rejoin: a player who drops is held by the AI, comes back with the same ticket to the referee\'s state, and plays on in step', async () => {
  B.close(); await until(() => M.referee().players[1].ai === true, 5000, 'the AI to hold Bob\'s house');
  const B2 = player(M.port, id, ticket(id, 11, 1, 'Bob'));
  await B2.connect(); await until(() => B2.started && B2.game, 5000, 'the catch-up');
  const n = Math.max(A.next, B2.next) + 60; await playTo(n, A, B2);
  assert.equal(stateHash(A.game), stateHash(B2.game)); assert.equal(B2.game.players[1].ai, false, 'his house is his again');
  B = B2;
});

await test('the end: at the cap the referee\'s placings and points go to every player and, signed, to the api; the server closes', async () => {
  await until(() => { pumpAll(A, B); return A.result && B.result; }, 60000, 'the end of the match');
  const r = A.result;
  assert.equal(r.reason, 'cap'); assert.equal(r.match, id); assert.equal(r.places.length, 3);
  assert.deepEqual(r.places.map((p) => p.place), [1, 2, 3]);
  for (const p of r.places) if (p.team === 0 || p.team === 1) { assert.ok(p.joined); assert.ok(p.points > 0); assert.ok(p.user === 10 || p.user === 11); } else { assert.equal(p.user, null); assert.equal(p.points, 0); }
  assert.deepEqual(B.result, r);
  await until(() => reports.length === 1, 3000, 'the report'); assert.deepEqual(reports[0], r);
  await M.done; A.close(); B.close();
});

await test('a late player: the match starts without them after the grace time and hands them their house when they come', async () => {
  const id2 = 'm0000002';
  const M2 = await createMatch({ id: id2, config: { seed: 77, houses: 3, diff: 'mid', people: 'classic', fog: true }, seats: [{ seat: 0, user: 1, name: 'Ann' }, { seat: 2, user: 3, name: 'Cid' }],
    secret: SECRET, port: 0, startAt: Date.now(), graceS: 0.3, capS: 9999, ...fast });
  const a = player(M2.port, id2, ticket(id2, 1, 0, 'Ann')); await a.connect();
  await until(() => a.started, 5000, 'the start'); assert.deepEqual(a.config.humans, [0]);
  await playTo(40, a); assert.equal(a.game.players[2].ai, true, 'Cid\'s house starts under the AI');
  const c = player(M2.port, id2, ticket(id2, 3, 2, 'Cid')); await c.connect();
  await until(() => c.started && c.game, 5000);
  const n = Math.max(a.next, c.next) + 60; await playTo(n, a, c);
  assert.equal(stateHash(a.game), stateHash(c.game)); assert.equal(a.game.players[2].ai, false);
  M2.close(); a.close(); c.close();
});

await test('abandoned: nobody comes, the match is called off and reported with no places', async () => {
  const got = [];
  const M3 = await createMatch({ id: 'm0000003', config: { seed: 5, houses: 3, diff: 'mid', people: 'classic', fog: true }, seats: [{ seat: 0, user: 1, name: 'Ann' }],
    secret: SECRET, port: 0, startAt: Date.now(), graceS: 0.2, report: async (r) => { got.push(r); }, ...fast });
  const r = await M3.done;
  assert.equal(r.reason, 'abandoned'); assert.deepEqual(r.places, []); assert.equal(r.noShows.length, 1); assert.equal(got.length, 1);
});

await test('reporting: if the api is down the result is sent again until it answers', async () => {
  let calls = 0;
  const M4 = await createMatch({ id: 'm0000004', config: { seed: 5, houses: 3, diff: 'mid', people: 'classic', fog: true }, seats: [{ seat: 0, user: 1, name: 'Ann' }],
    secret: SECRET, port: 0, startAt: Date.now(), graceS: 0.2, report: async () => { if (++calls < 3) throw new Error('api down'); }, ...fast });
  await M4.done; assert.equal(calls, 3);
});

console.log(`${passed} passed`);
process.exit(process.exitCode || 0);
