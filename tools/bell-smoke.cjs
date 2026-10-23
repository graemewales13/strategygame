// Town bell click-through (T38): serve the repo on :8123, then `node tools/bell-smoke.cjs [shot.png]`. Raises a keep by the home village with
// two serfs at work, presses the keep's Bell button (serfs go inside), then the B key (the all-clear), then the minimap row's Bell; no errors. Also reads the keep's Arrows row (T43).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e));
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const { game: g, ui, renderer } = window.__seven; const s = g.seatOf(0);
    const k = g.addBuilding('keep', 0, Math.round(s.x + 7), Math.round(s.y - 2), true); g.recomputeWalk(); ui.sel = { type: 'building', ids: [], id: k.id }; ui.sigCmd = ui.sigSel = ''; renderer.centerOn(k.x, k.y); window.__keep = k.id; });
  await p.waitForTimeout(600);
  const state = () => p.evaluate(() => { const g = window.__seven.game; return { bell: g.players[0].bell != null, inside: g.units.filter((u) => u.team === 0 && u.kind === 'serf' && u.inside != null).length, going: g.units.filter((u) => u.team === 0 && u.kind === 'serf' && u.task.type === 'enter').length }; });
  const btn = p.locator('#cmd button[data-act="bell"], button[data-act="bell"]').first();
  console.log('keep card has Bell', await btn.count() > 0);
  await btn.click(); await p.waitForTimeout(3000);
  console.log('after Bell', JSON.stringify(await state()));
  // keep arrows (T43): the keep's panel shows its volley once folk are inside
  console.log('keep panel arrows', JSON.stringify(await p.evaluate(() => { const row = [...document.querySelectorAll('.stat')].find((e) => /Arrows/.test(e.textContent)); const g = window.__seven.game, k = g.byId.get(window.__seven.ui.sel.id); return { row: row ? row.textContent.replace(/\s+/g, ' ').trim() : null, inKeep: k.garrison.length, arrows: g.keepArrows(k) }; })));
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  await p.evaluate(() => { const { game: g, ui } = window.__seven, k = g.byId.get(ui.sel.id); for (let i = 0; i < 4; i++) { const u = g.addUnit('serf', 0, k.x, k.y); u.inside = k.id; k.garrison.push(u.id); } ui.sigSel = ''; });
  await p.waitForTimeout(700);
  console.log('keep panel arrows, 4 more inside', JSON.stringify(await p.evaluate(() => { const row = [...document.querySelectorAll('.stat')].find((e) => /Arrows/.test(e.textContent)); return row ? row.textContent.replace(/\s+/g, ' ').trim() : null; })));
  await p.keyboard.press('b'); await p.waitForTimeout(400);
  console.log('after B', JSON.stringify(await state()));
  await p.click('#btnBell'); await p.waitForTimeout(400);
  console.log('after minimap Bell', JSON.stringify(await state()));
  const box = await p.locator('#btnBell').boundingBox(); console.log('minimap Bell fits', !!box && box.x + box.width <= 1366 && box.y + box.height <= 768);
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length ? 1 : 0);
})();
