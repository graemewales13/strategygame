// Online smoke test: two browsers join one room on the relay, the host starts, one player's order shows on the other's screen,
// and neither falls out of step. Run `node relay.js 8124 &` first, then `node tools/mp-smoke.cjs [screenshot-dir]`.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const open = async (name) => { const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); p.on('pageerror', (e) => errs.push(name + ': ' + e.message)); await p.goto(`http://localhost:8124/?mp=smoke&name=${name}`); return p; };
  const A = await open('Ann'); await A.waitForSelector('#mpLobby', { timeout: 20000 });
  const B = await open('Bob'); await B.waitForTimeout(1500);
  console.log('A lobby:', (await A.locator('#mpLobby').innerText()).replace(/\s+/g, ' ').slice(0, 160));
  console.log('B lobby:', (await B.locator('#mpLobby').innerText()).replace(/\s+/g, ' ').slice(0, 160));
  await A.click('[data-mp="houses"][data-v="3"]'); await A.waitForTimeout(300);
  await A.click('[data-mp="start"]');
  const started = (p) => p.waitForFunction(() => window.__seven?.net?.started && window.__seven.net.next > 40, null, { timeout: 30000 });
  await Promise.all([started(A), started(B)]);
  const info = (p) => p.evaluate(() => { const s = window.__seven, g = s.game; return { seat: s.net.seat, humans: g.humans, next: s.net.next, me: g.players[s.net.seat]?.name, desync: !!s.net.desynced }; });
  console.log('A:', JSON.stringify(await info(A))); console.log('B:', JSON.stringify(await info(B)));
  // Bob orders his serfs through the real UI host; Ann's copy must show them moving
  const target = await B.evaluate(() => { const s = window.__seven, g = s.game, me = s.net.seat, serfs = g.units.filter((u) => u.team === me && u.kind === 'serf'), h = g.seatOf(me); s.host.send({ type: 'move', ids: serfs.map((u) => u.id), x: h.x - 7, y: h.y + 7 }); return { ids: serfs.map((u) => u.id), x: h.x - 7, y: h.y + 7 }; });
  await A.waitForTimeout(6000);
  const dist = await A.evaluate((t) => { const g = window.__seven.game; return t.ids.map((id) => g.byId.get(id)).filter(Boolean).map((u) => Math.hypot(u.x - t.x, u.y - t.y).toFixed(1)); }, target);
  console.log('Bob\'s serfs as seen on Ann\'s screen, distance to his target:', dist.join(', '));
  await A.waitForTimeout(4000);
  console.log('after 10 s: A', JSON.stringify(await info(A)), '| B', JSON.stringify(await info(B)));
  console.log('status A:', await A.locator('#mpStatus').innerText().catch(() => '-'));
  if (process.argv[2]) { await A.screenshot({ path: process.argv[2] + '/mp-ann.png' }); await B.screenshot({ path: process.argv[2] + '/mp-bob.png' }); }
  console.log('page errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
