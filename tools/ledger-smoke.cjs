// Economy ledger click-through (T51): serve the repo on :8123, then `node tools/ledger-smoke.cjs [shot.png]`. Raises a market by the seat with
// goods on its shelf, opens the ledger with the L key (the serf rows, the goods, the market row), clicks the idle serfs' row (they are
// selected), clicks the market row (it is selected), opens Prod (the ledger closes), L again, Esc closes it without opening the menu; no
// page errors and the panel and the Ledger button fit a 1366x768 screen.
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
    const m = g.addBuilding('market', 0, Math.round(s.x + 8), Math.round(s.y + 6), true); m.stock = { food: 20, iron: 7 }; g.recomputeWalk();
    for (const u of g.units) if (u.team === 0 && u.kind === 'serf') { u.task = { type: 'idle' }; u.path = []; }
    return { m: m.id }; });
  await p.waitForTimeout(600);
  const lb = await p.locator('#btnLedger').boundingBox(); want(!!lb && lb.x + lb.width <= 1366 && lb.y + lb.height <= 768, 'Ledger button fits 1366x768');
  const clipped = await p.evaluate(() => [...document.querySelectorAll('#miniBtns button')].filter((x) => x.scrollWidth > x.clientWidth).map((x) => x.id));
  want(!clipped.length, `no button under the minimap is cut short (${clipped.join(', ')})`);
  await p.mouse.move(683, 300); await p.keyboard.press('l'); await p.waitForTimeout(500);
  const panel = await p.evaluate((t) => { const el = document.getElementById('ledgerPanel');
    return { open: !el.classList.contains('hidden'), idle: !!el.querySelector('.prow[data-job="idle"]'), grain: /Grain/.test(el.textContent), market: !!el.querySelector(`.prow[data-id="${t.m}"]`), text: el.textContent.replace(/\s+/g, ' ').slice(0, 200) }; }, ids);
  console.log('panel', JSON.stringify(panel));
  want(panel.open && panel.idle && panel.grain && panel.market, 'L opens the ledger: idle serfs, goods, the market');
  const box = await p.locator('#ledgerPanel').boundingBox(); want(!!box && box.x + box.width <= 1366 && box.y + box.height <= 768, 'panel fits 1366x768');
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  await p.locator('#ledgerPanel .prow[data-job="idle"]').click(); await p.waitForTimeout(400);
  want(await p.evaluate(() => { const { game: g, ui } = window.__seven; const us = ui.selUnits(); return us.length > 0 && us.every((u) => u.kind === 'serf' && u.task.type === 'idle'); }), 'a click on Idle selects the idle serfs');
  await p.locator(`#ledgerPanel .prow[data-id="${ids.m}"]`).click(); await p.waitForTimeout(400);
  want(await p.evaluate((t) => window.__seven.ui.sel.id === t.m, ids), 'a click on the market row selects it');
  await p.mouse.move(683, 300); await p.keyboard.press('u'); await p.waitForTimeout(300);
  want(await p.evaluate(() => document.getElementById('ledgerPanel').classList.contains('hidden') && !document.getElementById('prodPanel').classList.contains('hidden')), 'opening Prod closes the ledger');
  await p.keyboard.press('l'); await p.waitForTimeout(300);
  want(await p.evaluate(() => !document.getElementById('ledgerPanel').classList.contains('hidden') && document.getElementById('prodPanel').classList.contains('hidden')), 'and the ledger closes Prod');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  want(await p.evaluate(() => document.getElementById('ledgerPanel').classList.contains('hidden')), 'Esc closes the ledger');
  want(await p.evaluate(() => document.getElementById('mainmenu').classList.contains('hidden')), 'that Esc did not open the menu');
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length ? 1 : 0);
})();
