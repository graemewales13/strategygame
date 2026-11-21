// Villages that ask, click-through (T56): serve the repo on :8123, then `node tools/need-smoke.cjs [shot.png]`. Empties the home village's
// store until it asks for grain, selects it and checks its card (the Asks line inside the window at 1366x768, the mark drawn over it), clicks
// Send grain (met: loyalty up, the line gone), then sets a clear victory beside it with a keep near and checks the card's Feast button holds
// the feast (met again); no page errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e)); p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  const ok = [];
  const asked = await p.evaluate(async () => { const { game: g, ui, renderer } = window.__seven, { NEED } = await import('./js/config.js'), v = g.seatOf(0);
    v.pop = 20; v.stores.food = 1; v.loyalty = 50; g.players[0].food = 2000;
    for (let i = 0; i < NEED.look; i++) { g._needT = 0; g.updateNeeds(1); }
    ui.sel = { type: 'village', ids: [], id: v.id }; ui.sigCmd = ui.sigSel = ''; renderer.cam.zoom = 1.4; renderer.centerOn(v.x, v.y); window.__v = v.id;
    return v.need?.kind || ''; });
  await p.waitForTimeout(800);
  ok.push(['the home village asks for grain', asked === 'grain']);
  const row = async () => p.evaluate(() => { const e = [...document.querySelectorAll('.stat')].find((x) => /^.?\s*Asks/.test(x.querySelector('label')?.textContent.trim() || '')); if (!e) return null; const b = e.getBoundingClientRect(); return { text: e.textContent.replace(/\s+/g, ' ').trim(), inside: b.bottom <= innerHeight && b.right <= innerWidth && b.top >= 0 }; });
  let a = await row(); ok.push(['its card has the Asks line, in the window', !!a && /asks for grain/.test(a.text) && /s left/.test(a.text) && a.inside]);
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  const l0 = await p.evaluate(() => window.__seven.game.byId.get(window.__v).loyalty);
  await p.locator('button[data-act="feed"]').first().click(); await p.waitForTimeout(600);
  const st = await p.evaluate(() => { const v = window.__seven.game.byId.get(window.__v); return { need: v.need, loy: v.loyalty }; });
  ok.push(['Send grain meets it: loyalty up', st.need === null && st.loy > l0]);
  a = await row(); ok.push(['the line is gone', a === null]);
  // a feast after a victory: the card's Feast button holds it at the nearest keep
  await p.evaluate(async () => { const { game: g, ui } = window.__seven, { NEED } = await import('./js/config.js'), v = g.byId.get(window.__v);
    g.addBuilding('keep', 0, Math.round(v.x + 7), Math.round(v.y - 2), true); g.recomputeWalk(); v.needEnd = -1e9; g.players[0].feastT = -1e9; g.rel[0][1] = g.rel[1][0] = "war";
    g.victoryNeeds({ x: v.x + 3, y: v.y + 3, sides: [{ team: 0, worth: 0 }, { team: 1, worth: NEED.feast.worth }] }); ui.sigSel = ui.sigCmd = ''; });
  await p.waitForTimeout(700);
  a = await row(); ok.push(['a victory asks for a feast', !!a && /feast/.test(a.text)]);
  const fb = p.locator('button[data-act="vfeast"]').first();
  ok.push(['the card has a ready Feast button', (await fb.count()) > 0 && !(await fb.evaluate((e) => e.classList.contains('off')))]);
  if (await fb.count()) await fb.click(); await p.waitForTimeout(600);
  const f = await p.evaluate(() => { const v = window.__seven.game.byId.get(window.__v); return { need: v.need, joy: v.joyT }; });
  ok.push(['the feast meets it', f.need === null && f.joy > 0]);
  for (const [k, v] of ok) console.log(v ? 'ok  ' : 'FAIL', k);
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || ok.some(([, v]) => !v) ? 1 : 0);
})();
