// Train five and repeat training click-through (T47): serve the repo on :8123, then `node tools/train-smoke.cjs [shot.png]`. Raises a barracks by
// the seat, Shift-clicks the Footman button (five queued, or as many as the purse allows), then presses Repeat (on, the panel's Repeat row shows)
// and Repeat again (off); no errors, and the Repeat button fits a 1366x768 screen.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e));
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const { game: g, ui, renderer } = window.__seven; const s = g.seatOf(0);
    Object.assign(g.players[0], { food: 2000, wood: 2000, gold: 2000, stone: 2000 });
    for (let i = 0; i < 4; i++) g.addBuilding('cottage', 0, Math.round(s.x - 12 + i * 3), Math.round(s.y + 9), true);
    const k = g.addBuilding('barracks', 0, Math.round(s.x + 7), Math.round(s.y - 2), true); g.recomputeWalk(); ui.sel = { type: 'building', ids: [], id: k.id }; ui.sigCmd = ui.sigSel = ''; renderer.centerOn(k.x, k.y); });
  await p.waitForTimeout(600);
  const q = () => p.evaluate(() => { const g = window.__seven.game, k = g.byId.get(window.__seven.ui.sel.id); return { queue: k.queue.length, repeat: k.repeat || null, row: ([...document.querySelectorAll('.stat')].find((e) => /Repeat/.test(e.textContent))?.textContent || '').replace(/\s+/g, ' ').trim() }; });
  await p.locator('button[data-act="train"][data-kind="footman"]').first().click({ modifiers: ['Shift'] }); await p.waitForTimeout(400);
  console.log('after Shift-click Footman', JSON.stringify(await q()));
  const rep = p.locator('button[data-act="repeat"]').first();
  console.log('barracks card has Repeat', await rep.count() > 0);
  const box = await rep.boundingBox(); console.log('Repeat fits', !!box && box.x + box.width <= 1366 && box.y + box.height <= 768);
  await rep.click(); await p.waitForTimeout(600);
  console.log('after Repeat', JSON.stringify(await q()));
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  await p.locator('button[data-act="repeat"]').first().click(); await p.waitForTimeout(400);
  console.log('after Repeat again', JSON.stringify(await q()));
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length ? 1 : 0);
})();
