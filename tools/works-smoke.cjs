// Great works click-through (T12): serve the repo on :8123, then `node tools/works-smoke.cjs [shot.png]`. At 1366x768 raises a keep by the home
// village, checks its three work buttons are greyed with what is lacking, gives goods, clicks the Great Hall (goods spent, the button counts down,
// the others say the masons are busy), runs the clock until it stands (the card's Works line names it), raises the Curtain Wall, and checks the
// keep's card fits the HUD's scroll box and nothing threw. A screenshot of the keep with its works marks and wall ring if a path is given.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e));
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const { game: g, ui, renderer } = window.__seven; const s = g.seatOf(0);
    const k = g.addBuilding('keep', 0, Math.round(s.x + 7), Math.round(s.y - 2), true); g.recomputeWalk(); Object.assign(g.players[0], { food: 10, wood: 10, gold: 10, stone: 0 }); window.__keep = k.id;
    ui.sel = { type: 'building', ids: [], id: k.id }; ui.sigCmd = ui.sigSel = ''; renderer.centerOn(k.x, k.y); });
  await p.waitForTimeout(700);
  const card = (w) => p.locator(`button[data-act="work"][data-work="${w}"]`).first().evaluate((e) => ({ off: e.classList.contains('off'), text: e.textContent.trim(), tip: decodeURIComponent(e.dataset.tip) }));
  const ok = [];
  let c = await card('hall'); ok.push(['keep card has the Great Hall, greyed, says what is lacking', c.off && /Not enough goods for the Great Hall/.test(c.tip)]);
  ok.push(['and the Great Temple and Curtain Wall', !!(await card('temple')).text && !!(await card('wall')).text]);
  await p.evaluate(() => { const { game: g, ui } = window.__seven; Object.assign(g.players[0], { food: 5000, wood: 5000, gold: 5000, stone: 800 }); ui.sigCmd = ''; });
  await p.waitForTimeout(600);
  c = await card('hall'); ok.push(['ready with goods', !c.off]);
  await p.locator('button[data-act="work"][data-work="hall"]').first().click(); await p.waitForTimeout(600);
  const st = await p.evaluate(() => { const g = window.__seven.game; return { food: g.players[0].food, r: g.players[0].raising }; });
  ok.push(['goods spent, going up', st.food < 3700 && st.r?.k === 'hall']);
  c = await card('hall'); ok.push(['the hall counts down', c.off && /\d+s/.test(c.text)]);
  c = await card('temple'); ok.push(['the temple waits: masons busy', c.off && /masons are busy/.test(c.tip)]);
  await p.evaluate(() => { const g = window.__seven.game; for (let i = 0; i < 920; i++) g.tick(0.1); window.__seven.ui.sigSel = ''; });
  await p.waitForTimeout(700);
  ok.push(['the hall stands, the card says so', await p.evaluate(() => [...document.querySelectorAll('.stat')].some((e) => /Works/.test(e.textContent) && /Great Hall/.test(e.textContent)))]);
  await p.locator('button[data-act="work"][data-work="wall"]').first().click(); await p.waitForTimeout(300);
  await p.evaluate(() => { const g = window.__seven.game; for (let i = 0; i < 1020; i++) g.tick(0.1); window.__seven.ui.sigSel = ''; });
  await p.waitForTimeout(700);
  ok.push(['the wall stands', await p.evaluate(() => !!window.__seven.game.byId.get(window.__keep).works?.wall)]);
  const box = await p.evaluate(() => { const e = document.querySelector('button[data-act="work"][data-work="wall"]'), sp = e && e.closest('#selPanel, #cmdPanel, .panel'); const a = e?.getBoundingClientRect(); return { bottom: a?.bottom, vh: innerHeight }; });
  ok.push(['the work buttons are on screen at 1366x768', box.bottom <= box.vh]);
  if (process.argv[2]) { await p.evaluate(() => { const { renderer } = window.__seven; const k = window.__seven.game.byId.get(window.__keep); renderer.zoom = 1.6; renderer.centerOn(k.x, k.y); }); await p.waitForTimeout(600); await p.screenshot({ path: process.argv[2] }); }
  for (const [k, v] of ok) console.log(v ? 'ok  ' : 'FAIL', k);
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || ok.some(([, v]) => !v) ? 1 : 0);
})();
