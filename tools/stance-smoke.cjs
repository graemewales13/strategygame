// Stance and attack-move click-through: serve the repo on :8123, then `node tools/stance-smoke.cjs`. Selects a soldier, clicks each stance
// button and the Attack-move button, then clicks the ground; must print no errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e));
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500);
  await p.mouse.click(700, 425); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  const id = await p.evaluate(() => { const { game, ui, renderer } = window.__seven; const s = game.seatOf(0); const u = game.addUnit('footman', 0, s.x, s.y + 4); ui.setUnits([u]); renderer.centerOn(u.x, u.y); return u.id; });
  await p.waitForTimeout(500);
  const unit = () => p.evaluate((i) => { const u = window.__seven.game.byId.get(i); return { stance: u.stance || 'aggressive', task: u.task.type }; }, id);
  for (const st of ['defensive', 'hold', 'passive', 'aggressive']) {
    await p.locator(`button[data-act="stance"][data-stance="${st}"]`).first().click(); await p.waitForTimeout(250);
    const on = await p.locator(`button[data-act="stance"][data-stance="${st}"].on`).count();
    console.log('stance', st.padEnd(11), '->', (await unit()).stance, '| lit', on > 0);
  }
  await p.locator('button[data-act="amove"]').first().click(); await p.waitForTimeout(200);
  console.log('attack-move armed', await p.evaluate(() => window.__seven.ui.amove));
  await p.mouse.click(900, 300); await p.waitForTimeout(300);
  console.log('after ground click', JSON.stringify(await unit()), '| armed', await p.evaluate(() => window.__seven.ui.amove));
  await p.keyboard.press('f'); console.log('F arms', await p.evaluate(() => window.__seven.ui.amove)); await p.keyboard.press('Escape'); console.log('Esc disarms', !(await p.evaluate(() => window.__seven.ui.amove)));
  const mm = await p.locator('#minimap').boundingBox(); await p.mouse.click(mm.x + mm.width * 0.5, mm.y + mm.height * 0.5, { button: 'right' }); await p.waitForTimeout(300);
  console.log('minimap right-click', JSON.stringify(await unit()));
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length ? 1 : 0);
})();
