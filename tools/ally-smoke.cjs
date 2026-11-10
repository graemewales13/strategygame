// Coalitions, click-through (T62, T-124): serve the repo on :8123, then `node tools/ally-smoke.cjs [shot.png]`.
// Meets every house, makes house 3 far stronger than houses 1 and 2, lets house 1 deliberate (it swears an alliance with house 2 for fear
// of house 3), then opens the Council: house 1's card says "Allied with ... (for fear of ...)", and a house at peace with the player shows
// the goodwill an alliance needs; the quiet news line carries the reason; no errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e)); p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  const news = await p.evaluate(() => {
    const { game: g } = window.__seven;
    const n = g.players.length; for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) { g.known[a][c] = 1; if (a !== c) { g.rel[a][c] = 'peace'; g.relSince[a][c] = 0; } }
    g.time = Math.max(g.time, 600); const s3 = g.seatOf(3);
    for (let i = 0; i < 40; i++) g.addUnit('knight', 3, s3.x + 2 + (i % 6), s3.y + 2 + Math.floor(i / 6));
    g.opinion[1][2] = g.opinion[2][1] = 40; g.cool = {};
    for (let i = 0; i < 400 && g.rel[1][2] !== 'alliance'; i++) g.tick(0.1);   // the house deliberates in the game's own tick
    return { rel: g.rel[1][2], line: g.letters.find((l) => /swear an alliance/.test(l.text))?.text || null };
  });
  console.log('news ->', JSON.stringify(news));
  await p.evaluate(() => window.__seven.ui.toggleCouncil(1)); await p.waitForTimeout(700);
  const lines = await p.evaluate(() => [...document.querySelectorAll('.dline, .allyneed')].map((e) => e.textContent).filter((t) => /Allied with|alliance needs/.test(t)));
  console.log('council ->', JSON.stringify(lines));
  const ok = news.rel === 'alliance' && /swear an alliance/.test(news.line || '') && lines.some((t) => /Allied with .*\((for fear of|against)/.test(t)) && lines.some((t) => /An alliance needs their goodwill at \+\d+ \(now [+-]\d+\)/.test(t));
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || !ok ? 1 : 0);
})();
