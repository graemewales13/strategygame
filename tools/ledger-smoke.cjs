// Economy ledger click-through (T51): serve the repo on :8123, then `node tools/ledger-smoke.cjs [shot.png]`. Raises a market by the seat with
// goods on its shelf, opens the ledger with the L key (the serf rows, the goods, the market row), clicks the idle serfs' row (they are
// selected), clicks the market row (it is selected), opens Prod (the ledger closes), L again, Esc closes it without opening the menu; no
// page errors and the panel and the Ledger button fit a 1366x768 screen. Also (T52): the red count on the Idle button matches the idle serfs,
// hides when none stand idle, a serf going idle sounds the chime once (counted by stubbing it), and Options has the chime's switch.
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
  const badge = () => p.evaluate(() => { const el = document.getElementById('serfIdle'), g = window.__seven.game;
    return { shown: !el.classList.contains('hidden'), n: el.textContent, want: String(g.units.filter((u) => u.team === 0 && u.kind === 'serf' && u.hp > 0 && !u.inside && u.task.type === 'idle').length), title: document.getElementById('btnIdle').title }; });
  let bd = await badge(); console.log('badge', JSON.stringify(bd));
  want(bd.shown && bd.n === bd.want && bd.n !== '0' && /idle serf/.test(bd.title), 'the Idle button shows the idle serf count (T52)');
  const ib = await p.locator('#serfIdle').boundingBox(); want(!!ib && ib.width > 0 && ib.y >= 0, 'the count is drawn on screen');
  await p.evaluate(() => { const { game: g, ui } = window.__seven; ui.clearSel(); ui.idleSound = true; window.__chimes = 0; 
    for (const u of g.units) if (u.team === 0 && u.kind === 'serf') { const t = g.resources.find((n) => n.kind === 'tree' && n.amount > 0); g.cmdGather([u], t); } });
  await p.waitForTimeout(500);
  bd = await badge(); want(!bd.shown, 'the count hides when no serf stands idle');
  await p.evaluate(() => { const { game: g, ui } = window.__seven; ui.idleChimeT = -1e9; const s = g.units.find((u) => u.team === 0 && u.kind === 'serf' && u.hp > 0); s.task = { type: 'idle' }; s.path = []; });
  await p.waitForTimeout(500);
  want(await p.evaluate(() => window.__seven.ui.idleChimeT > -1e9), 'a serf going idle sounds the chime');
  bd = await badge(); want(bd.shown && bd.n === '1', 'and the count is 1');
  want(await p.evaluate(() => { const c = document.getElementById('sIdle'); return !!c && c.checked; }), 'Options has the idle chime switch, on by default');
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
