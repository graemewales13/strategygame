// Feast click-through (T33): serve the repo on :8123, then `node tools/feast-smoke.cjs [shot.png]`. Raises a keep by the home village, checks the
// Feast button is greyed with the reason when grain is short, then gives grain, clicks it (grain spent, the village rejoices, its panel names the
// rejoicing in the tribute row: T-102), and checks the button then shows the cooldown; no errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e));
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const { game: g, ui, renderer } = window.__seven; const s = g.seatOf(0);
    const k = g.addBuilding('keep', 0, Math.round(s.x + 7), Math.round(s.y - 2), true); g.recomputeWalk(); g.players[0].food = 100; window.__keep = k.id;
    ui.sel = { type: 'building', ids: [], id: k.id }; ui.sigCmd = ui.sigSel = ''; renderer.centerOn(k.x, k.y); });
  await p.waitForTimeout(700);
  const btn = p.locator('button[data-act="feast"]').first();
  const card = () => btn.evaluate((e) => ({ off: e.classList.contains('off'), text: e.textContent.trim(), tip: decodeURIComponent(e.dataset.tip) }));
  let c = await card(); const ok = [];
  ok.push(['keep card has Feast', true]);
  ok.push(['greyed without grain, says why', c.off && /needs \d+ grain/.test(c.tip)]);
  await p.evaluate(() => { const { game: g, ui } = window.__seven; g.players[0].food = 2000; ui.sigCmd = ''; });
  await p.waitForTimeout(600);
  c = await card(); ok.push(['ready with grain', !c.off && /grain/.test(c.text)]);
  const food0 = await p.evaluate(() => window.__seven.game.players[0].food);
  await btn.click(); await p.waitForTimeout(500);
  const st = await p.evaluate(() => { const g = window.__seven.game, k = g.byId.get(window.__keep), v = g.feastHeld(0, k)[0]; return { food: g.players[0].food, joy: v.joyT, vid: v.id }; });
  ok.push(['grain spent', st.food < food0]); ok.push(['village rejoices', st.joy > 0]);
  await p.waitForTimeout(600);
  c = await card(); ok.push(['cooldown shown', c.off && /\d+s/.test(c.text) && /sweeping up/.test(c.tip)]);
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  await p.evaluate((id) => { const { ui } = window.__seven; ui.sel = { type: 'village', ids: [], id }; ui.sigSel = ''; }, st.vid);
  await p.waitForTimeout(700);
  const row = await p.evaluate(() => [...document.querySelectorAll('.stat')].map((e) => e.textContent).find((t) => /tribute/.test(t)) || '');
  ok.push(['village panel names the rejoicing (T-102)', /rejoicing x1\.3/.test(row) && /loyalty \d+%/.test(row)]);
  for (const [k, v] of ok) console.log(v ? 'ok  ' : 'FAIL', k);
  console.log('tribute row:', row.replace(/\s+/g, ' ').trim());
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || ok.some(([, v]) => !v) ? 1 : 0);
})();
