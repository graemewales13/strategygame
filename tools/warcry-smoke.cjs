// The king's war cry click-through (T61): serve the repo on :8123, then `node tools/warcry-smoke.cjs [shot.png]`. Puts six footmen and a foe
// band beside the player's king, presses K then V (the cry), checks the button on the king's card, the steadied men and the rings, presses V
// again (refused: the voice is spent, said in a toast), and clicks the card's War cry button once the cool-down is waited out; no errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e)); p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const { game: g, renderer } = window.__seven, k = g.kingOf(0);
    k.inside = null; k.x = g.seatOf(0).x + 6; k.y = g.seatOf(0).y + 6; k.task = { type: 'idle' }; k.path = [];
    for (let i = 0; i < 6; i++) g.addUnit('footman', 0, k.x - 2 + (i % 3) * 1.4, k.y + 1.5 + Math.floor(i / 3) * 1.4);
    renderer.centerOn(k.x, k.y); });
  await p.waitForTimeout(400);
  await p.keyboard.press('k'); await p.waitForTimeout(300);
  const btn = await p.evaluate(() => { const e = document.querySelector('[data-act="warcry"]'); return e ? { shown: true, off: e.classList.contains('off') || e.disabled === true } : { shown: false }; });
  console.log('king card War cry button', JSON.stringify(btn));
  await p.keyboard.press('v'); await p.waitForTimeout(500);
  const st = () => p.evaluate(() => { const g = window.__seven.game; return { cries: g.players[0].cries || 0, steadied: g.units.filter((u) => u.team === 0 && g.steadied(u)).length, note: g.diploNote || '' }; });
  console.log('after V', JSON.stringify(await st()));
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  await p.keyboard.press('v'); await p.waitForTimeout(300);
  console.log('V again (spent)', JSON.stringify(await st()));
  await p.evaluate(() => { const g = window.__seven.game; g.players[0].cryT -= 1000; for (const u of g.units) if (u.cryT) u.cryT = 0; });
  await p.waitForTimeout(1200);
  const el = p.locator('[data-act="warcry"]').first(); if (await el.count()) await el.click(); await p.waitForTimeout(400);
  console.log('card button click after cool-down', JSON.stringify(await st()));
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length ? 1 : 0);
})();
