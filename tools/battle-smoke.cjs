// Battle reports, click-through (T63): serve the repo on :8123, then `node tools/battle-smoke.cjs [shot.png] [council.png]`.
// Sets a band of the player's footmen on a rival's bowmen beside the seat, lets the fight play out and go quiet, reads the report card at
// the bottom right (who fought, losses, the verdict), presses Show me, then opens the Council and reads its Battles list; no errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e)); p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const { game: g, renderer } = window.__seven, h = g.seatOf(0);
    g.rel[0][1] = g.rel[1][0] = 'war'; g.known[0][1] = g.known[1][0] = true;
    [...Array(6)].forEach((_, i) => g.addUnit('footman', 0, h.x + 6 + (i % 3), h.y + 6 + Math.floor(i / 3)));
    [...Array(4)].forEach((_, i) => g.addUnit('bowman', 1, h.x + 9 + (i % 2), h.y + 7 + Math.floor(i / 2)));
    g.updateVisibility(true); renderer.centerOn(h.x + 8, h.y + 7);
    for (let t = 0; t < 70; t += 0.1) g.tick(0.1); });   // the fight, then quiet
  await p.waitForTimeout(1500);
  const card = await p.evaluate(() => { const el = document.querySelector('#bcard'); return el && !el.classList.contains('hidden') ? el.innerText : null; });
  console.log('card ->', JSON.stringify(card));
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  await p.click('#bcard button[data-act="bgo"]'); await p.click('#bcard button[data-act="bclose"]');
  const closed = await p.evaluate(() => document.querySelector('#bcard').classList.contains('hidden'));
  await p.evaluate(() => window.__seven.ui.toggleCouncil()); await p.waitForTimeout(600);
  const rows = await p.evaluate(() => [...document.querySelectorAll('.battles .brow')].map((e) => e.textContent));
  console.log('council battles ->', JSON.stringify(rows));
  await p.evaluate(() => document.querySelector('.battles')?.scrollIntoView()); await p.waitForTimeout(200);
  if (process.argv[3]) await p.screenshot({ path: process.argv[3] });
  const ok = /Battle (at|near|in) /.test(card || '') && /You \(\d+: \d+ foot\)/.test(card || '') && /4 bowmen/.test(card || '') && /trade|skirmish/i.test(card || '') && closed && rows.length >= 1;
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || !ok ? 1 : 0);
})();
