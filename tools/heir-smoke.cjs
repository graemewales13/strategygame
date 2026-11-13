// Heirs as characters, click-through (T65): serve the repo on :8123, then `node tools/heir-smoke.cjs [king.png] [council.png]`.
// Selects the player's king: the card lists the heirs (heir-apparent first) with a Name heir button; a real click on it names the other heir;
// the king falls and the named heir is crowned with a Reign row; the Council's house card has the heir line; no errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e)); p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  const second = await p.evaluate(() => { const { game: g, ui } = window.__seven; g.tick(0.1); const k = g.kingOf(0); ui.setUnits ? ui.setUnits([k]) : (ui.sel = { type: 'unit', ids: [k.id] }); return g.lineOf(0)[1].name; });
  await p.waitForTimeout(900);
  const card = await p.evaluate(() => document.querySelector('.stat.heirs')?.textContent || '');
  console.log('card ->', card);
  await p.locator('.stat.heirs button[data-act="heir"]').first().click(); await p.waitForTimeout(400);
  const first = await p.evaluate(() => window.__seven.game.lineOf(0)[0].name);
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  const crowned = await p.evaluate(async () => {
    const { game: g, ui } = window.__seven, KING = (await import('./js/config.js')).KING;
    g.damage(g.kingOf(0), 1e6, -1, null); for (let i = 0; i < (KING.heir + 1) * 10; i++) g.tick(0.1);
    const k = g.kingOf(0); ui.setUnits ? ui.setUnits([k]) : (ui.sel = { type: 'unit', ids: [k.id] }); return { name: k.name, reign: k.reign };
  });
  await p.waitForTimeout(900);
  const reign = await p.evaluate(() => [...document.querySelectorAll('.stat')].find((e) => /Reign/.test(e.textContent))?.textContent || '');
  console.log('crowned ->', JSON.stringify(crowned), '|', reign);
  await p.evaluate(() => window.__seven.ui.toggleCouncil(0)); await p.waitForTimeout(700);
  const line = await p.evaluate(() => document.querySelector('.dline.heirline')?.textContent || '');
  console.log('council ->', line);
  if (process.argv[3]) await p.screenshot({ path: process.argv[3] });
  const ok = /heir-apparent/.test(card) && /Name heir/.test(card) && first === second && crowned.name === second && !!crowned.reign && /Reign/.test(reign) && /Reigns as a/.test(line) && /Heirs: ♛/.test(line);
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || !ok ? 1 : 0);
})();
