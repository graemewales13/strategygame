// Signal-your-allies click-through (T54): serve the repo on :8123, then `node tools/flare-smoke.cjs [shot.png]`. Allies house 1 and puts both at
// war with house 2, gives the ally nine idle footmen, Alt-clicks the foe's seat on the field (the ally answers and marches), then presses N and
// clicks the minimap (too soon: refused with the reason), waits out the cool-down and signals from the minimap; no errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e)); p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const { game: g, renderer } = window.__seven, n = g.houses;
    for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) g.known[a][c] = 1;
    g.setRelation(0, 1, 'alliance'); g.setRelation(0, 2, 'war'); g.setRelation(1, 2, 'war'); g.fogOn = false; g.players[1].think = 1e9;   // (the ally's own war host stays home, so the answer is the signal's)
    const a = g.seatOf(1); for (let i = 0; i < 9; i++) g.addUnit('footman', 1, a.x + (i % 3) * 1.2, a.y + 5 + Math.floor(i / 3) * 1.2);
    const f = g.seatOf(2); renderer.centerOn(f.x, f.y); });
  await p.waitForTimeout(500);
  const state = () => p.evaluate(() => { const g = window.__seven.game, f = g.players[0].flare; return { flares: g.players[0].flares || 0, answers: f ? f.answers.map((a) => a.ids.length) : null, marching: g.units.filter((u) => u.team === 1 && u.task.type === 'amove').length, letter: g.letters.filter((l) => l.kind === 'flare' && l.to === 0).map((l) => l.text)[0], shown: g.shownFlares(0).length }; });
  // the foe's seat sits at the middle of the view after centerOn
  const cv = await p.locator('#game').boundingBox();
  await p.keyboard.down('Alt'); await p.mouse.click(cv.x + cv.width / 2, cv.y + cv.height / 2); await p.keyboard.up('Alt'); await p.waitForTimeout(600);
  console.log('after Alt-click', JSON.stringify(await state()));
  if (process.argv[2]) { await p.waitForTimeout(400); await p.screenshot({ path: process.argv[2] }); await p.screenshot({ path: process.argv[2].replace(/\.png$/, '-mark.png'), clip: { x: cv.x + cv.width / 2 - 140, y: cv.y + cv.height / 2 - 110, width: 280, height: 180 } }); }
  await p.waitForTimeout(1100);
  const mm = await p.locator('#minimap').boundingBox();
  await p.keyboard.press('n'); await p.waitForTimeout(200);
  const armed = await p.evaluate(() => window.__seven.ui.flareArm);
  await p.mouse.click(mm.x + mm.width * 0.5, mm.y + mm.height * 0.5); await p.waitForTimeout(400);
  console.log('N armed', armed, 'then minimap click (too soon):', JSON.stringify(await p.evaluate(() => window.__seven.game.diploNote)), 'disarmed', !(await p.evaluate(() => window.__seven.ui.flareArm)));
  await p.evaluate(() => { window.__seven.game.players[0].flareT -= 30; });
  await p.keyboard.down('Alt'); await p.mouse.click(mm.x + mm.width * 0.5, mm.y + mm.height * 0.5); await p.keyboard.up('Alt'); await p.waitForTimeout(400);
  console.log('after minimap Alt-click', JSON.stringify(await state()));
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length ? 1 : 0);
})();
