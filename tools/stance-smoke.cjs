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
  // T02: Shift+right-click queues waypoints; Shift with attack-move adds an attack-move leg and keeps attack-move armed
  const legs = () => p.evaluate((i) => { const u = window.__seven.game.byId.get(i); return { task: u.task.type, legs: (u.task.next || []).map((w) => (w.a ? 'amove' : 'move')) }; }, id);
  // open ground the footman can reach, 6-12 tiles away, in three directions, as page coordinates
  const spots = await p.evaluate((i) => {
    const { game: g, renderer: r } = window.__seven, u = g.byId.get(i), cv = document.getElementById('game').getBoundingClientRect(), out = [];
    r.centerOn(u.x, u.y);
    for (let k = 0; k < 16 && out.length < 3; k++) for (let d = 5, dx = Math.cos(k * Math.PI / 8), dy = Math.sin(k * Math.PI / 8); d <= 12; d++) {
      const x = Math.floor(u.x + dx * d) + 0.5, y = Math.floor(u.y + dy * d) + 0.5;
      if (!g.walk[Math.floor(y) * g.W + Math.floor(x)] || g.nodeAt(x, y) || g.buildingAt(x, y) || g.villageAt(x, y) || !g.setPath({ ...u, path: [] }, x, y)) continue;
      const [sx, sy] = r.toScreen(x, y); if (sx < 60 || sy < 60 || sx > cv.width - 300 || sy > cv.height - 200) continue;
      out.push([cv.left + sx, cv.top + sy]); break;
    }
    return out;
  }, id);
  if (spots.length < 3) errs.push('no open ground for the waypoint check');
  const [s1, s2, s3] = spots.length >= 3 ? spots : [[760, 330], [1000, 420], [820, 560]];
  await p.mouse.click(s1[0], s1[1], { button: 'right' }); await p.waitForTimeout(150); console.log(' march', JSON.stringify(await legs()));
  await p.keyboard.down('Shift');
  await p.mouse.click(s2[0], s2[1], { button: 'right' }); await p.waitForTimeout(150); console.log(' +leg', JSON.stringify(await legs()));
  await p.keyboard.press('f'); await p.mouse.click(s3[0], s3[1]); await p.waitForTimeout(150);
  const armed = await p.evaluate(() => window.__seven.ui.amove);
  await p.keyboard.up('Shift'); await p.keyboard.press('Escape');
  const q = await legs(); console.log('waypoints', JSON.stringify(q), '| attack-move still armed under Shift', armed);
  if (q.legs.join() !== 'move,amove' || !armed) errs.push('waypoints not queued: ' + JSON.stringify(q));
  await p.waitForTimeout(600); await p.screenshot({ path: 'logs/waypoints.png' });
  console.log(' lines', await p.evaluate((i) => { const u = window.__seven.game.byId.get(i); return JSON.stringify({ x: u.x, y: u.y, path: u.path.length, goal: u.pathGoal, next: u.task.next }); }, id));
  const mm = await p.locator('#minimap').boundingBox(); await p.mouse.click(mm.x + mm.width * 0.5, mm.y + mm.height * 0.5, { button: 'right' }); await p.waitForTimeout(300);
  console.log('minimap right-click', JSON.stringify(await unit()));
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length ? 1 : 0);
})();
