// Explore click-through (T45): serve the repo on :8123, then `node tools/explore-smoke.cjs [shot.png]`. Puts a scout by the home village,
// selects him, presses the Explore button (he sets out for unseen ground), stops him and sends him again with the O key; a scout with
// nothing to do is found by the Idle button. Then arms patrol and starts the match again: the new field must not stay armed (T-091). No errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e));
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const { game: g, ui, renderer } = window.__seven; const s = g.seatOf(0);
    const u = g.addUnit('scout', 0, s.x + 2, s.y + 5); ui.setUnits([u]); renderer.centerOn(s.x + 4, s.y + 5); window.__id = u.id; });
  await p.waitForTimeout(600);
  const task = () => p.evaluate(() => window.__seven.game.byId.get(window.__id).task.type);
  const btn = p.locator('button[data-act="explore"]').first();
  console.log('card has Explore', await btn.count() > 0);
  await btn.click(); await p.waitForTimeout(800);
  console.log('after click', await task(), await p.evaluate(() => window.__seven.ui.taskText(window.__seven.game.byId.get(window.__id))));
  await p.keyboard.press('x'); await p.waitForTimeout(300); const stopped = await task();
  await p.keyboard.press('o'); await p.waitForTimeout(1500); console.log('X stops', stopped === 'idle', 'O sends again', await task() === 'explore');
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  await p.keyboard.press('x'); await p.waitForTimeout(300); await p.evaluate(() => window.__seven.ui.clearSel());
  let found = false;   // (the Idle button walks the idle serfs first, then the idle scouts)
  for (let i = 0; i < 12 && !found; i++) { await p.click('#btnIdle'); await p.waitForTimeout(120); found = await p.evaluate(() => { const s = window.__seven.ui.sel; return s.type === 'units' && s.ids.includes(window.__id); }); }
  console.log('Idle finds the scout', found);
  // T-091: an armed order does not outlive the match
  await p.evaluate(() => { const { game: g, ui } = window.__seven; ui.setUnits(g.units.filter((u) => u.team === 0 && u.kind === 'scout')); });
  await p.keyboard.press('z'); const armed = await p.evaluate(() => window.__seven.ui.patrolArm);
  await p.evaluate(() => { const { game: g, ui } = window.__seven; ui.setGame(g); });
  const after = await p.evaluate(() => [window.__seven.ui.patrolArm, window.__seven.ui.amove, document.getElementById('game').classList.contains('placing')]);
  console.log('patrol armed', armed, 'cleared by a new match', after.every((x) => !x));
  const ok = found && after.every((x) => !x) && armed && stopped === 'idle';
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || !ok ? 1 : 0);
})();
