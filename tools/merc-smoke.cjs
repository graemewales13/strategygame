// Mercenary companies click-through (T78): serve the repo on :8123, then `node tools/merc-smoke.cjs [shot.png]`. At 1366x768 raises a tavern by
// the home village, checks its three company buttons are greyed with what is lacking, gives coin, clicks the Free Lances (coin spent, five men
// beside the tavern, the button says serving you, the others say one company at a time), selects a hired man (his card names his company and
// wage), checks the buttons are on screen and nothing threw. A screenshot of the company by the tavern (their purse marks) if a path is given.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e));
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const { game: g, ui, renderer } = window.__seven; const s = g.seatOf(0);
    const t = g.addBuilding('tavern', 0, Math.round(s.x + 7), Math.round(s.y - 3), true); g.recomputeWalk(); g.players[0].gold = 10; window.__tav = t.id;
    ui.sel = { type: 'building', ids: [], id: t.id }; ui.sigCmd = ui.sigSel = ''; renderer.centerOn(t.x, t.y); });
  await p.waitForTimeout(700);
  const card = (k) => p.locator(`button[data-act="company"][data-company="${k}"]`).first().evaluate((e) => ({ off: e.classList.contains('off'), on: e.classList.contains('on'), text: e.textContent.trim(), tip: decodeURIComponent(e.dataset.tip) }));
  const ok = [];
  let c = await card('lances'); ok.push(['tavern card has the Free Lances, greyed, says what is lacking', c.off && /Not enough goods for the Free Lances/.test(c.tip)]);
  ok.push(['and the Marcher Bows and Black Band', !!(await card('bows')).text && !!(await card('black')).text]);
  await p.evaluate(() => { const { game: g, ui } = window.__seven; g.players[0].gold = 3000; ui.sigCmd = ''; });
  await p.waitForTimeout(600);
  c = await card('lances'); ok.push(['ready with coin', !c.off]);
  await p.locator('button[data-act="company"][data-company="lances"]').first().click(); await p.waitForTimeout(700);
  const st = await p.evaluate(() => { const g = window.__seven.game; return { gold: g.players[0].gold, men: g.mercsOf(0).length }; });
  ok.push(['coin spent, five men signed on', st.gold < 3000 - 600 && st.men === 5, JSON.stringify(st)]);
  c = await card('lances'); ok.push(['the Lances say serving you', c.on && /serving you/.test(c.text)]);
  c = await card('bows'); ok.push(['the Bows wait: one company at a time', c.off && /one company at a time/.test(c.tip)]);
  const box = await p.evaluate(() => { const a = document.querySelector('button[data-act="company"][data-company="black"]')?.getBoundingClientRect(); return { bottom: a?.bottom, vh: innerHeight }; });
  ok.push(['the company buttons are on screen at 1366x768', box.bottom <= box.vh]);
  await p.evaluate(() => { const { game: g, ui } = window.__seven; const u = g.mercsOf(0)[0]; ui.sel = { type: 'units', ids: [u.id] }; ui.sigCmd = ui.sigSel = ''; });
  await p.waitForTimeout(700);
  ok.push(['a hired man\'s card names his company and wage', await p.evaluate(() => [...document.querySelectorAll('.stat')].some((e) => /Company/.test(e.textContent) && /Free Lances/.test(e.textContent) && /coin a minute/.test(e.textContent)))]);
  if (process.argv[2]) { await p.evaluate(() => { const { renderer, ui } = window.__seven; ui.sel = { type: 'none', ids: [] }; const t = window.__seven.game.byId.get(window.__tav); renderer.cam.zoom = 2; renderer.centerOn(t.x, t.y + 1.5); }); await p.waitForTimeout(700); await p.screenshot({ path: process.argv[2] }); }
  for (const [k, v, why] of ok) console.log(v ? 'ok  ' : 'FAIL', k, v ? '' : why || '');
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || ok.some(([, v]) => !v) ? 1 : 0);
})();
