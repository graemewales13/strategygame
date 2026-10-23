// Two browsers through a whole hourly match, the real api and match server on this machine (ONLINE.md step 4).
//   node tools/online-smoke.cjs          (needs Playwright's Chromium; starts and stops the api itself)
// A match every minute, sign-up always open, three houses, a 90-second cap: sign in (test sign-in), join, the match pulls both in,
// a Herald message crosses, the cap ends it, both see the placings, and the league has them.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = +process.env.SMOKE_PORT || 8131, BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const api = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server', 'api.js')], {
    env: { ...process.env, PORT: String(PORT), PUBLIC_URL: BASE, AUTH_DEV: '1', NODE_ENV: 'test', EVERY_MIN: '1', OPENS_MIN: '1', MATCH_HOUSES: '3', MATCH_CAP_S: '90', MATCH_GRACE_S: '60' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const errors = [];
  let apiLog = ''; api.stdout.on('data', (d) => { apiLog += d; }); api.stderr.on('data', (d) => { apiLog += d; });
  const fail = async (msg) => { console.log('FAIL:', msg); console.log('page errors:', JSON.stringify(errors)); console.log('--- api log ---\n' + apiLog.slice(-3000)); api.kill(); process.exit(1); };
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`${BASE}/healthz`); if (r.ok) break; } catch {} await sleep(200); }

  const b = await chromium.launch();
  const open = async (name) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }), p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
    await p.goto(`${BASE}/?online=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });   // (not every picture: the screen needs only the page)
    await p.waitForSelector('#online:not(.hidden) #olDev', { timeout: 60000 });
    await p.fill('#olDev', name); await p.click('button[data-ol="dev"]');
    await p.waitForSelector('button[data-ol="join"], button[data-ol="leave"]', { timeout: 20000 });
    return p;
  };
  const ann = await open('Ann'), bob = await open('Bob');
  // both must sign up for the same match: not across the minute's boundary (a sign-up is always for the next match)
  for (;;) { const s = await (await fetch(`${BASE}/api/schedule`)).json(); const left = s.next.startsAt - Date.now(); if (left > 25000) break; await sleep(left + 1500); }
  for (const p of [ann, bob]) { await p.waitForSelector('button[data-ol="join"]', { timeout: 20000 }); await p.click('button[data-ol="join"]'); await p.waitForSelector('button[data-ol="leave"]', { timeout: 20000 }); }
  const seated = (await (await fetch(`${BASE}/api/schedule`)).json()).next.seats.map((x) => x.name).sort().join(',');
  if (seated !== 'Ann,Bob') return fail(`not both in the next match: ${seated}`);
  console.log('both signed in and signed up for the same match');
  const started = (p) => p.evaluate(() => !!window.__seven?.net?.started && !!window.__seven?.net?.ticket);
  const t0 = Date.now();
  while (!(await started(ann)) || !(await started(bob))) { if (Date.now() - t0 > 150000) return fail('the match did not pull both players in'); await sleep(1000); }
  console.log(`the match began for both after ${Math.round((Date.now() - t0) / 1000)} s`);
  const seats = await Promise.all([ann, bob].map((p) => p.evaluate(() => window.__seven.net.seat)));
  console.log('seats', seats.join(','));
  console.log('herald button:', JSON.stringify(await ann.evaluate(() => { const b = document.getElementById('btnHerald'), r = b.getBoundingClientRect(); return { cls: b.className, w: r.width, h: r.height, x: r.x, y: r.y, disp: getComputedStyle(b).display, parent: getComputedStyle(b.parentElement).display, hourly: !!window.__seven?.net?.ticket }; })));
  await ann.waitForSelector('#btnHerald:not(.hidden)', { timeout: 15000 }).catch(async () => { console.log('HL', JSON.stringify(await ann.evaluate(() => ({ hl: window.__hl, started: window.__seven.net.started, next: window.__seven.net.next, ended: !!window.__seven.net.result })))); await fail('the Herald button never showed'); }); await ann.click('#btnHerald');
  await ann.waitForSelector('#herald:not(.hidden) button[data-hd="msg"][data-v="peace"]', { timeout: 10000 }); await ann.click('#herald button[data-hd="msg"][data-v="peace"]');
  const state = (p) => p.evaluate(() => { const n = window.__seven.net; n.__id ||= Math.random().toString(36).slice(2, 7); return { id: n.__id, started: n.started, next: n.next, ended: !!n.result, open: n.ws?.readyState, feed: document.getElementById('heraldFeed').textContent.slice(0, 120) }; });
  const before = [await state(ann), await state(bob)];
  await bob.waitForFunction(() => document.getElementById('heraldFeed').textContent.includes('Will you make peace?'), null, { timeout: 15000 }).catch(async () => { console.log('before', JSON.stringify(before), 'after', JSON.stringify([await state(ann), await state(bob)])); await fail('the message did not reach Bob'); });
  console.log('a Herald message crossed');
  const hashes = await Promise.all([ann, bob].map((p) => p.evaluate(() => ({ n: window.__seven.net.next, resyncs: window.__seven.net.resyncs }))));
  console.log('turns', JSON.stringify(hashes));
  await ann.waitForSelector('#end:not(.hidden) .olplaces', { timeout: 120000 }).catch(() => fail('Ann never saw the result'));
  await bob.waitForSelector('#end:not(.hidden) .olplaces', { timeout: 30000 }).catch(() => fail('Bob never saw the result'));
  console.log('result:', (await ann.textContent('#endTitle')), '|', (await ann.textContent('#endText')));
  let rows = [];
  for (let i = 0; i < 20 && rows.length < 2; i++) { rows = (await (await fetch(`${BASE}/api/league`)).json()).rows; await sleep(500); }
  console.log('league:', rows.map((r) => `${r.rank}. ${r.name} ${r.points}`).join(', '));
  if (rows.length !== 2) return fail('the league does not have both players');
  console.log('page errors:', JSON.stringify(errors));
  await b.close(); api.kill();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.log('FAIL:', e.message); process.exit(1); });
