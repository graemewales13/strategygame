// Online groundwork: a real relay (relay.js) and two lockstep clients (js/net.js) in one process, over real WebSockets.
// `node test/net.test.js` (part of `npm test`). Needs Node 22+ (global WebSocket).
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { LockstepClient, stateHash } from '../js/net.js';
import { createRelay } from '../relay.js';

let passed = 0;
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 8000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await sleep(5); } };
// what every client does when the match starts: build the same Game from the relay's config
const gameFor = (c) => { const g = new Game({ seed: c.seed, houses: c.houses, fog: c.fog, diff: c.diff, people: c.people, humans: c.humans, ai: true }); g.playbook = null; return g; };
const stepTo = (client, n) => { while (client.next < n && client.turns.has(client.next)) client.step(1); };

if (typeof WebSocket === 'undefined') { console.log('  skip  (this Node has no global WebSocket; use Node 22+)'); process.exit(0); }

const relay = await createRelay({ port: 0, turnMs: 4, serveFiles: false, log: () => {} });
const url = `ws://127.0.0.1:${relay.port}/ws`;
const client = (name, token = null, room = 'valley') => new LockstepClient({ url, room, name, build: 'test-build', token });
let A, B, C, gA, gB, gC, cfg;

await test('lobby: the first to join hosts seat 0, the next takes seat 1, and a different build is turned away', async () => {
  A = client('Ann'); B = client('Bob');
  await A.connect(); await B.connect();
  assert.equal(A.seat, 0); assert.equal(B.seat, 1); assert.ok(A.isHost); assert.ok(!B.isHost);
  const odd = new LockstepClient({ url, room: 'valley', name: 'Old', build: 'other-build' });
  await assert.rejects(odd.connect(), /build/);
});

await test('start: both players build the same match from the relay\'s config; the empty seat is played by the AI', async () => {
  A.configure({ houses: 3, seed: 4242, diff: 'mid', people: 'classic', fog: true });
  const both = Promise.all([new Promise((r) => { A.onStart = r; }), new Promise((r) => { B.onStart = r; })]);
  await sleep(30); A.start(); [cfg] = await both;
  assert.deepEqual(cfg.humans, [0, 1]); assert.equal(cfg.seed, 4242);
  gA = gameFor(cfg); gB = gameFor(cfg); A.attach(gA); B.attach(gB);
  assert.equal(gA.players[0].ai, false); assert.equal(gA.players[1].ai, false); assert.equal(gA.players[2].ai, true);
  assert.equal(stateHash(gA), stateHash(gB));
});

await test('lockstep: orders from both players arrive on the same turn everywhere, and the two copies stay identical', async () => {
  await until(() => A.latest >= 5 && B.latest >= 5);
  stepTo(A, 5); stepTo(B, 5);
  const annSerfs = gA.units.filter((u) => u.team === 0 && u.kind === 'serf').map((u) => u.id), s0 = gA.seatOf(0);
  A.send({ type: 'move', ids: annSerfs, x: s0.x + 9, y: s0.y + 9 });
  const bobSeat = gB.seatOf(1); B.send({ type: 'move', ids: gB.units.filter((u) => u.team === 1 && u.kind === 'serf').map((u) => u.id), x: bobSeat.x - 6, y: bobSeat.y + 6 });
  B.send({ type: 'stop', team: 0, ids: annSerfs });   // Bob tries to order Ann's serfs (claiming her seat): the relay stamps his own
  await until(() => A.latest >= 300 && B.latest >= 300, 15000);
  stepTo(A, 300); stepTo(B, 300);
  assert.equal(A.next, 300); assert.equal(B.next, 300);
  assert.equal(stateHash(gA), stateHash(gB), 'the copies drifted apart');
  const moved = gA.units.filter((u) => annSerfs.includes(u.id)).some((u) => Math.hypot(u.x - s0.x, u.y - s0.y) > 4);
  assert.ok(moved, 'Ann\'s order was carried out'); assert.equal(A.desynced, null); assert.equal(B.desynced, null);
});

await test('rejoin: a player who drops comes back to the same seat and replays the match to the same state', async () => {
  const T = 400; await until(() => A.latest >= T); stepTo(A, T); const hA = stateHash(gA);
  B.close(); await sleep(20);
  C = client('Bob', B.token);
  const started = new Promise((r) => { C.onStart = (c) => r(c); });
  await C.connect(); const c2 = await started;
  assert.equal(C.seat, 1, 'same seat');
  gC = gameFor(c2); C.attach(gC); stepTo(C, T);
  assert.equal(C.next, T); assert.equal(stateHash(gC), hA, 'the replayed match matches');
});

await test('desync: a copy that differs is reported to everyone', async () => {
  const T = 420; await until(() => A.latest >= T && C.latest >= T); stepTo(A, T); stepTo(C, T);
  gC.players[1].gold += 7;   // a corrupted copy
  await until(() => A.latest >= T + 30 && C.latest >= T + 30); stepTo(A, T + 30); stepTo(C, T + 30);
  await until(() => A.desynced && C.desynced, 4000);
  assert.ok(A.desynced.n >= T);
});

await test('rules: with two people at the table the match goes on when one of them falls, and each screen judges by its own seat', async () => {
  const g = new Game({ seed: 9, houses: 3, ai: true, humans: [0, 1] });
  g.players[0].heirs = 0; g.damage(g.kingOf(0), 1e6, 2, null); g.tick(0.1);
  assert.equal(g.players[0].alive, false); assert.equal(g.outcome, null, 'still a match for seat 1');
  g.players[1].heirs = 0; g.damage(g.kingOf(1), 1e6, 2, null); g.tick(0.1);
  assert.ok(g.outcome && g.outcome.winner === 2 && g.outcome.result === 'defeat');
});

A?.close(); C?.close(); relay.close();
console.log(`${passed} passed`);
process.exit(process.exitCode || 0);
