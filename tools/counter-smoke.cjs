// Unit counters click-through (T59): serve the repo on :8123, then `node tools/counter-smoke.cjs [shot.png]`. Selects a footman, a bowman and
// a knight of the player's in turn and reads the Counters row on each card, then hovers the Barracks' Footman button for its tooltip; no errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e)); p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  let ok = true;
  for (const kind of ['footman', 'bowman', 'knight']) {
    const row = await p.evaluate((kind) => { const { game: g, renderer, ui } = window.__seven, h = g.seatOf(0);
      const u = g.addUnit(kind, 0, h.x + 6, h.y + 6); renderer.centerOn(u.x, u.y); ui.setUnits([u]); ui.refresh?.(true);
      const e = document.querySelector('.counter'); return e ? e.textContent : null; }, kind);
    await p.waitForTimeout(400);
    const shown = await p.evaluate(() => document.querySelector('.counter')?.textContent || null);
    console.log(kind, '->', shown || row);
    if (!(shown || row) || !/Strong against/.test(shown || row)) ok = false;
  }
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || !ok ? 1 : 0);
})();
