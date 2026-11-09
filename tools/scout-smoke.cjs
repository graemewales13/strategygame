// What your scouts saw of a rival's army, click-through (T64): serve the repo on :8123, then `node tools/scout-smoke.cjs [shot.png]`.
// Puts a rival band in sight beside the player's seat, clicks one of its soldiers and reads the "Seen of their army" line on its card,
// then opens that house's Council card and reads the same line there; no errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e)); p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const { game: g, renderer, ui } = window.__seven, h = g.seatOf(0);
    const band = [...Array(5)].map((_, i) => g.addUnit('footman', 1, h.x + 5 + (i % 3), h.y + 5 + Math.floor(i / 3)));
    band.push(g.addUnit('knight', 1, h.x + 8, h.y + 6)); band.forEach((u) => { u.stance = 'passive'; });
    g.updateVisibility(true); renderer.centerOn(band[0].x, band[0].y); ui.setUnits([band[0]]); ui.refresh?.(true); });
  await p.waitForTimeout(600);
  const card = await p.evaluate(() => document.querySelector('.seenarmy')?.textContent || null);
  console.log('rival soldier card ->', card);
  await p.evaluate(() => window.__seven.ui.toggleCouncil(1)); await p.waitForTimeout(600);
  const council = await p.evaluate(() => [...document.querySelectorAll('.seenarmy')].map((e) => e.textContent));
  console.log('council ->', JSON.stringify(council));
  const ok = /5 foot/.test(card || '') && /1 horse/.test(card || '') && /answer with bowmen/.test(card || '') && council.some((t) => /5 foot/.test(t));
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || !ok ? 1 : 0);
})();
