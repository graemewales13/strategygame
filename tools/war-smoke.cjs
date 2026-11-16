// War overview, click-through (T71): serve the repo on :8123, then `node tools/war-smoke.cjs [council.png]`.
// At 1366x768: declares war on a rival through the rules (so the war is booked), sets a band of the player's footmen on its bowmen beside
// the seat, lets the fight play out and go quiet, opens the Council and reads its Wars section (title, sides, battles won and lost, the dead,
// a verdict), presses the battle's spot button, then makes peace and reads the war among those ended; no errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e)); p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const { game: g, renderer } = window.__seven, h = g.seatOf(0);
    g.meet(0, 1); g.setRelation(0, 1, 'war');
    [...Array(6)].forEach((_, i) => g.addUnit('footman', 0, h.x + 6 + (i % 3), h.y + 6 + Math.floor(i / 3)));
    [...Array(4)].forEach((_, i) => g.addUnit('bowman', 1, h.x + 9 + (i % 2), h.y + 7 + Math.floor(i / 2)));
    g.updateVisibility(true); renderer.centerOn(h.x + 8, h.y + 7);
    for (let t = 0; t < 70; t += 0.1) g.tick(0.1); });
  await p.waitForTimeout(800);
  await p.evaluate(() => { window.__seven.ui.hideBattle?.(); window.__seven.ui.toggleCouncil(); }); await p.waitForTimeout(700);
  const war = await p.evaluate(() => [...document.querySelectorAll('.wars .wrow')].map((e) => e.innerText));
  console.log('wars ->', JSON.stringify(war));
  await p.evaluate(() => document.querySelector('.wars')?.scrollIntoView()); await p.waitForTimeout(200);
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  const spot = await p.locator('.wars .wspots button').count();
  if (spot) await p.click('.wars .wspots button');
  await p.evaluate(() => { const g = window.__seven.game; g.setRelation(0, 1, 'peace'); window.__seven.ui.sigCouncil = ''; window.__seven.ui.renderCouncil(); }); await p.waitForTimeout(300);
  const after = await p.evaluate(() => document.querySelector('.wars')?.innerText || '');
  console.log('after peace ->', JSON.stringify(after));
  const w = war[0] || '';
  const ok = war.length === 1 && /War with /.test(w) && /You against /.test(w) && /1 battle: \d won, \d lost, \d even/.test(w) && /Dead: ours \d+/.test(w) && spot >= 1 && /ended in peace/.test(after) && /at war with nobody/.test(after);
  console.log('errors', JSON.stringify(errs), 'ok', ok); await b.close(); process.exit(errs.length || !ok ? 1 : 0);
})();
