// Patrol click-through (T39): serve the repo on :8123, then `node tools/patrol-smoke.cjs [shot.png]`. Puts three footmen by the home village,
// selects them, presses the Patrol button and clicks the ground (they set out), Shift-clicks a third post, then arms patrol with the Z key
// and cancels it with Esc; the order loop is drawn while they walk. No errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e));
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const { game: g, ui, renderer } = window.__seven; const s = g.seatOf(0);
    const us = [0, 1, 2].map((i) => g.addUnit('footman', 0, s.x + 1 + i, s.y + 5)); ui.setUnits(us); renderer.centerOn(s.x + 4, s.y + 5); window.__ids = us.map((u) => u.id); });
  await p.waitForTimeout(600);
  const state = () => p.evaluate(() => { const g = window.__seven.game; return window.__ids.map((id) => { const u = g.byId.get(id); const pt = g.patrolOf(u); return pt ? pt.pts.length : 0; }); });
  const btn = p.locator('button[data-act="patrol"]').first();
  console.log('card has Patrol', await btn.count() > 0);
  await btn.click(); await p.waitForTimeout(200);
  const at = await p.evaluate(() => { const { game: g, renderer } = window.__seven; const s = g.seatOf(0); const [x, y] = g.nearestWalkable(Math.floor(s.x + 10), Math.floor(s.y + 7)); return renderer.toScreen(x + 0.5, y + 0.5); });
  const cb = await p.locator('#game').boundingBox();
  await p.mouse.click(cb.x + at[0], cb.y + at[1]); await p.waitForTimeout(400);
  console.log('after click, posts', JSON.stringify(await state()));
  await btn.click(); await p.waitForTimeout(200);
  await p.keyboard.down('Shift'); await p.mouse.click(cb.x + at[0] - 60, cb.y + at[1] + 40); await p.keyboard.up('Shift'); await p.waitForTimeout(300);
  console.log('after Shift-click, posts', JSON.stringify(await state()));
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  await p.keyboard.press('z'); const armed = await p.evaluate(() => window.__seven.ui.patrolArm);
  await p.keyboard.press('Escape'); const off = await p.evaluate(() => window.__seven.ui.patrolArm);
  console.log('Z arms', armed, 'Esc cancels', !off);
  await p.waitForTimeout(1500);
  console.log('task', await p.evaluate(() => window.__seven.ui.taskText(window.__seven.game.byId.get(window.__ids[0]))));
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length ? 1 : 0);
})();
