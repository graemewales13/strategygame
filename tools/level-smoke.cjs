// Per-house difficulty, click-through (T60): serve the repo on :8123, then `node tools/level-smoke.cjs [setup.png] [council.png]`.
// At 1366x768: opens Skirmish setup, clicks seat 1's level button once (Easy) and seat 2's three times (Hard), and the player's handicap
// once (Rich start); checks every button sits inside the window, the match is re-dealt with those tiers, begins, and the Council card of
// seat 2 names Hard; no errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e)); p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  const click = async (seat) => { await p.locator(`#crests button.lvlb[data-seat="${seat}"]`).click(); await p.waitForTimeout(250); };
  await click(1); await click(2); await click(2); await click(2); await click(0);
  const setup = await p.evaluate(() => [...document.querySelectorAll('#crests button.lvlb')].map((e) => { const r = e.getBoundingClientRect(); return { t: e.innerText.trim(), inside: r.right <= innerWidth && r.bottom <= innerHeight && r.width > 20 }; }));
  console.log('setup ->', JSON.stringify(setup));
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  const st = await p.evaluate(() => { const g = window.__seven.game; g.meet(0, 2); return { l1: g.levelOf(1), l2: g.levelOf(2), l3: g.levelOf(3), h: g.players[0].handicap }; });
  await p.evaluate(() => { window.__seven.ui.councilFocus = 2; window.__seven.ui.toggleCouncil(); }); await p.waitForTimeout(700);
  const tag = await p.evaluate(() => [...document.querySelectorAll('small.lvl')].filter((e) => e.offsetParent).map((e) => e.innerText.trim()));
  console.log('game ->', JSON.stringify(st), 'council tags ->', JSON.stringify(tag));
  if (process.argv[3]) await p.screenshot({ path: process.argv[3] });
  const ok = setup.length >= 3 && setup.every((x) => x.inside) && setup[0].t === 'Rich start' && setup[1].t === 'Easy' && setup[2].t === 'Hard'
    && st.l1 === 'easy' && st.l2 === 'hard' && st.l3 === 'mid' && st.h === 'rich' && tag.some((x) => /Hard/.test(x));
  console.log('errors', JSON.stringify(errs), 'ok', ok); await b.close(); process.exit(errs.length || !ok ? 1 : 0);
})();
