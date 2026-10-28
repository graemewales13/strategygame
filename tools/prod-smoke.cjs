// Production overview click-through (T40, T50): serve the repo on :8123, then `node tools/prod-smoke.cjs [shot.png]`. Raises two barracks by
// the seat (one training), checks the idle badge on the Prod button, opens the panel with the U key (rows for both, the idle one marked,
// the research row), clicks a row (that barracks selected), presses Y (the next idle training building selected), Esc closes the panel;
// no page errors and the panel and the Prod button fit a 1366x768 screen.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e));
  const want = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) errs.push(what); };
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  const ids = await p.evaluate(() => { const { game: g } = window.__seven; const s = g.seatOf(0);
    Object.assign(g.players[0], { food: 2000, wood: 2000, gold: 2000, stone: 2000 });
    const k1 = g.addBuilding('barracks', 0, Math.round(s.x + 7), Math.round(s.y - 2), true), k2 = g.addBuilding('barracks', 0, Math.round(s.x + 12), Math.round(s.y - 2), true);
    g.recomputeWalk(); k1.queue.push({ kind: 'footman', t: 0 }); return { k1: k1.id, k2: k2.id }; });
  await p.waitForTimeout(600);
  const badge = await p.evaluate(() => { const e = document.getElementById('prodIdle'); return { n: +e.textContent, shown: !e.classList.contains('hidden') }; });
  want(badge.shown && badge.n >= 1, `idle badge on Prod shows ${badge.n}`);
  const pb = await p.locator('#btnProd').boundingBox(); want(!!pb && pb.x + pb.width <= 1366 && pb.y + pb.height <= 768, 'Prod button fits 1366x768');
  await p.mouse.move(683, 300); await p.keyboard.press('u'); await p.waitForTimeout(500);
  const panel = await p.evaluate((t) => { const el = document.getElementById('prodPanel'), row = (id) => el.querySelector(`.prow[data-id="${id}"]`);
    return { open: !el.classList.contains('hidden'), k1: !!row(t.k1), k2idle: !!row(t.k2)?.classList.contains('idle'), k1idle: !!row(t.k1)?.classList.contains('idle'), research: /Research/.test(el.textContent), text: el.textContent.replace(/\s+/g, ' ').slice(0, 160) }; }, ids);
  console.log('panel', JSON.stringify(panel));
  want(panel.open && panel.k1 && panel.k2idle && !panel.k1idle && panel.research, 'U opens the panel: both barracks, the idle one marked, research row');
  const box = await p.locator('#prodPanel').boundingBox(); want(!!box && box.x + box.width <= 1366 && box.y + box.height <= 768, 'panel fits 1366x768');
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  await p.locator(`#prodPanel .prow[data-id="${ids.k1}"]`).click(); await p.waitForTimeout(400);
  want(await p.evaluate((t) => window.__seven.ui.sel.id === t.k1, ids), 'a click on a row selects that barracks');
  await p.mouse.move(683, 300); await p.keyboard.press('y'); await p.waitForTimeout(400);
  const idleSel = await p.evaluate(() => { const { game: g, ui } = window.__seven, b = g.byId.get(ui.sel.id); return b ? { kind: b.kind, q: b.queue.length, rep: !!b.repeat } : null; });
  want(!!idleSel && idleSel.q === 0 && !idleSel.rep && ['keep', 'barracks', 'archery', 'stable', 'workshop'].includes(idleSel.kind), `Y selects an idle training building (${JSON.stringify(idleSel)})`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  want(await p.evaluate(() => document.getElementById('prodPanel').classList.contains('hidden')), 'Esc closes the panel');
  want(await p.evaluate(() => document.getElementById('mainmenu').classList.contains('hidden')), 'that Esc did not open the menu');
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length ? 1 : 0);
})();
