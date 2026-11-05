// Tips on first sight click-through (T58): serve the repo on :8123, then `node tools/tips-smoke.cjs [shot.png]`. Starts a skirmish with
// the tips' memory cleared, checks no tip shows at the start, makes a rival declare war (the war tip shows once, names the keys, sits at
// the bottom left inside the field at 1366x768), Got it takes it down and it does not come back; a tribute letter brings the next tip
// only after the gap; No more tips switches them off (Options box unticked, remembered); Show tips again clears the memory; no errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e));
  await p.addInitScript(() => { try { if (!sessionStorage.getItem('tipsmoke')) { localStorage.removeItem('auld-world.tips'); localStorage.removeItem('auld-world.tipson'); sessionStorage.setItem('tipsmoke', '1'); } } catch {} });
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(2500);
  const ok = [];
  const shown = () => p.evaluate(() => { const e = document.getElementById('ftip'); const r = e.getBoundingClientRect(); return { on: !e.classList.contains('hidden'), id: e.dataset.id || '', text: e.textContent, r: { l: r.left, t: r.top, b: r.bottom, rt: r.right } }; });
  ok.push(['no tip at the start', !(await shown()).on]);
  await p.evaluate(() => { const g = window.__seven.game; g.setRelation(1, 0, 'war'); });
  await p.waitForTimeout(2200);
  let s = await shown(); ok.push(['war tip shows', s.on && s.id === 'war']);
  ok.push(['keys filled in', !/\{key:/.test(s.text) && /Space/.test(s.text) && await p.evaluate(() => document.querySelectorAll('#ftip kbd').length >= 3)]);
  const field = await p.evaluate(() => { const h = document.getElementById('hud').getBoundingClientRect(); return { hudTop: h.top }; });
  ok.push(['bottom left, above the HUD, on screen', s.r.l >= 0 && s.r.l < 40 && s.r.b <= field.hudTop + 1 && s.r.t > 300 && s.r.rt < 1366]);
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  await p.click('#ftip button[data-act="tipok"]'); await p.waitForTimeout(400);
  ok.push(['Got it takes it down', !(await shown()).on]);
  ok.push(['remembered as seen', await p.evaluate(() => JSON.parse(localStorage.getItem('auld-world.tips') || '[]').includes('war'))]);
  await p.evaluate(() => { const g = window.__seven.game; g.offers.push({ id: 9999, from: 2, to: 0, kind: 'tribute', amount: 40, text: 'Pay.', t: g.time, expires: g.time + 600 }); });
  await p.waitForTimeout(1500);
  ok.push(['the next tip waits for the gap', !(await shown()).on]);
  await p.evaluate(() => { window.__seven.ui.tipAt = -1e9; });
  await p.waitForTimeout(1500);
  s = await shown(); ok.push(['demand tip after the gap', s.on && s.id === 'demand']);
  await p.click('#ftip button[data-act="tipoff"]'); await p.waitForTimeout(400);
  ok.push(['No more tips switches them off', !(await shown()).on && await p.evaluate(() => localStorage.getItem('auld-world.tipson') === 'off' && !document.getElementById('sTips').checked)]);
  await p.evaluate(() => { document.getElementById('sTipsAgain').click(); });
  ok.push(['Show tips again clears the memory and turns them on', await p.evaluate(() => localStorage.getItem('auld-world.tips') === '[]' && document.getElementById('sTips').checked)]);
  ok.push(['no page errors', !errs.length]);
  let bad = 0; for (const [n, v] of ok) { console.log((v ? 'ok   ' : 'FAIL ') + n); if (!v) bad++; }
  if (errs.length) console.log(errs.join('\n'));
  await b.close(); process.exit(bad ? 1 : 0);
})();
