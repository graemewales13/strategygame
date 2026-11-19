// The battle afterwards, click-through (T67): serve the repo on :8123, then `node tools/aftermath-smoke.cjs [field.png] [minimap.png]`.
// Sets the player's footmen on a rival's bowmen beside the seat, lets the fight play out and go quiet, then checks that the minimap
// carries a battle mark coloured by the trade and that the field keeps what the fallen left (drawn, no page errors), and that both are
// gone once their time is up. At 1366x768.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e)); p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  const spot = await p.evaluate(() => { const { game: g, renderer } = window.__seven, h = g.seatOf(0);
    g.rel[0][1] = g.rel[1][0] = 'war'; g.known[0][1] = g.known[1][0] = true;
    [...Array(8)].forEach((_, i) => g.addUnit('footman', 0, h.x + 6 + (i % 4), h.y + 6 + Math.floor(i / 4)));
    [...Array(5)].forEach((_, i) => g.addUnit('bowman', 1, h.x + 9 + (i % 3), h.y + 8 + Math.floor(i / 3)));
    g.updateVisibility(true);
    for (let t = 0; t < 70; t += 0.1) g.tick(0.1);   // the fight, then quiet
    const r = g.battleLog[g.battleLog.length - 1]; renderer.cam.zoom = 1.6; renderer.centerOn(r.x, r.y); return { x: r.x, y: r.y, falls: r.falls.length };
  });
  await p.evaluate(() => document.querySelector('#bcard button[data-act="bclose"]')?.click());
  await p.waitForTimeout(900);
  const now = await p.evaluate(async () => { const m = await import('./js/battle.js'), g = window.__seven.game; return { marks: m.battleMarks(g).map((x) => x.trade), litter: m.battleLitter(g).length }; });
  console.log('battle ->', JSON.stringify(spot), 'now ->', JSON.stringify(now));
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  if (process.argv[3]) { const mm = await p.locator('#minimap').boundingBox(); await p.screenshot({ path: process.argv[3], clip: mm }); }
  const tip = await p.evaluate(() => { window.__seven.ui.toggleCouncil(); const t = [...document.querySelectorAll('.ctitle')].find((e) => e.textContent === 'Battles'); window.__seven.ui.toggleCouncil(); return t ? decodeURIComponent(t.dataset.tip || '') : ''; });
  // their time up: both gone
  const later = await p.evaluate(async () => { const m = await import('./js/battle.js'), g = window.__seven.game, { AFTERMATH } = await import('./js/config.js'); g.time += AFTERMATH.field + 5; return { marks: m.battleMarks(g).length, litter: m.battleLitter(g).length }; });
  await p.waitForTimeout(500);
  console.log('later ->', JSON.stringify(later), 'tip ->', JSON.stringify(tip.slice(0, 60)));
  const ok = spot.falls > 0 && now.marks.length === 1 && now.litter === spot.falls && !later.marks && !later.litter && /minimap/.test(tip);
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || !ok ? 1 : 0);
})();
