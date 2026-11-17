// Peace terms, click-through (T72): serve the repo on :8123, then `node tools/cede-smoke.cjs [card.png]`.
// At 1366x768: war on a rival that holds a village besides its seat, a battle booked in which it lost far more than the player, the parley
// wait passed; opens the Council, reads the two cede buttons (theirs enabled and named, the tooltip's losses), clicks Peace, they cede X,
// lets the envoy ride, and checks the peace and the village changing hands; no errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e)); p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  const want = await p.evaluate(() => { const { game: g } = window.__seven, k = g.seatOf(1);
    const v = g.villages.filter((x) => x.owner < 0).sort((a, c) => Math.hypot(a.x - k.x, a.y - k.y) - Math.hypot(c.x - k.x, c.y - k.y))[0];
    v.owner = 1; v.lean = 1; g._vOwn = null; g.meet(0, 1); g.setRelation(0, 1, 'war'); g.relSince[0][1] = g.relSince[1][0] = g.time - 999;
    g.warOf(0, 1).bat.push({ id: 1, t: g.time, x: k.x, y: k.y, d: {}, w: { 0: 80, 1: 800 }, r: {} });
    window.__seven.ui.councilFocus = 1; window.__seven.ui.toggleCouncil(); return v.name; });
  await p.waitForTimeout(700);
  const btns = await p.evaluate(() => [...document.querySelectorAll('button[data-cede]')].filter((e) => e.offsetParent).map((e) => ({ text: e.innerText.trim(), off: e.disabled, cede: e.dataset.cede, tip: decodeURIComponent(e.dataset.tip || '') })));
  console.log('buttons ->', JSON.stringify(btns.map((x) => [x.text, x.off])));
  const theirs = await p.locator('button[data-cede="1"]:visible').first();
  await theirs.scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  await theirs.click(); await p.waitForTimeout(200);
  await p.evaluate(() => { const g = window.__seven.game; for (let t = 0; t < 12; t += 0.1) g.tick(0.1); }); await p.waitForTimeout(300);
  const end = await p.evaluate((n) => { const g = window.__seven.game, v = g.villages.find((x) => x.name === n); return { rel: g.rel[0][1], owner: v.owner, letter: g.letters[0]?.text }; }, want);
  console.log('after ->', JSON.stringify(end));
  const t = btns.find((x) => x.cede === '1');
  const ok = !!t && !t.off && t.text.includes(want) && /they have lost 800 and you 80/.test(t.tip) && end.rel === 'peace' && end.owner === 0;
  console.log('errors', JSON.stringify(errs), 'ok', ok); await b.close(); process.exit(errs.length || !ok ? 1 : 0);
})();
