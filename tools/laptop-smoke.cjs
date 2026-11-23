// Laptop screens, click-through (T34): serve the repo on :8123, then `node tools/laptop-smoke.cjs [shot.png]`. At 1366x768 with eight houses:
// every rival's chip shows in the top bar; a serf's orders (the jobs and Stop) and an army's orders and stances show without scrolling the
// command card; a king's card scrolls down to its Name heir buttons; four letters stack as one open card and three one-line rows inside the
// field, a click on a row opens it and folds the other, and its buttons answer; no page errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e)); p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mHouses button[data-n="8"]'); await p.click('#mBegin'); await p.waitForTimeout(1500);
  const ok = [];
  const chips = await p.evaluate(() => { const hs = document.getElementById('houses'), hb = hs.getBoundingClientRect(); return [...hs.children].filter((c) => { const q = c.getBoundingClientRect(); return q.width > 0 && q.left >= hb.left - 0.5 && q.right <= hb.right + 0.5; }).length; });
  ok.push(['all seven rivals show in the top bar', chips === 7]);
  // which order buttons sit below the command card's fold
  const pick = async (sel) => { await p.evaluate((s) => { const { ui } = window.__seven; ui.sel = s; ui.sigCmd = ui.sigSel = ''; ui.hudT = 0; }, sel); await p.waitForTimeout(500);
    return p.evaluate(() => { const c = document.getElementById('cmdPanel'), cb = c.getBoundingClientRect();
      return { over: c.scrollHeight - c.clientHeight, below: [...c.querySelectorAll('button[data-act]')].filter((e) => e.getBoundingClientRect().bottom > cb.bottom + 1).map((e) => e.dataset.act) }; }); };
  const ids = await p.evaluate(() => { const { game: g } = window.__seven, v = g.seatOf(0), sol = [];
    for (let i = 0; i < 6; i++) sol.push(g.addUnit(i % 2 ? 'footman' : 'bowman', 0, v.x + 3 + i, v.y - 4).id);
    return { serf: g.units.find((u) => u.team === 0 && u.kind === 'serf').id, army: sol, king: g.units.find((u) => u.team === 0 && u.kind === 'king').id }; });
  let c = await pick({ type: 'units', ids: [ids.serf] });
  ok.push(['a serf\'s card fits without scrolling', c.over <= 0 && c.below.length === 0]);
  ok.push(['a serf\'s card has Stop beside the jobs', await p.evaluate(() => !!document.querySelector('#cmdPanel .serfjobs button[data-act="stop"]'))]);
  ok.push(['the locked buildings take one line, the list in its tooltip', await p.evaluate(() => { const e = document.querySelector('#cmdPanel .lockline'); return !!e && e.getBoundingClientRect().height < 26 && /Unlocks as you build/.test(decodeURIComponent(e.dataset.tip || '')); })]);
  c = await pick({ type: 'units', ids: ids.army });
  ok.push(['an army\'s orders and stances show before its build grid', ['stop', 'amove', 'patrol', 'charge', 'retreat', 'stance', 'formation'].every((a) => !c.below.includes(a))]);
  await pick({ type: 'units', ids: [ids.king] });
  const king = await p.evaluate(() => { const s = document.getElementById('selPanel'), h = s.querySelector('button[data-act="heir"]'); if (!h) return null; s.scrollTop = s.scrollHeight; const sb = s.getBoundingClientRect(), hb = h.getBoundingClientRect(); return getComputedStyle(s).overflowY !== 'hidden' && hb.bottom <= sb.bottom + 1 && hb.top >= sb.top - 1; });
  ok.push(['the king\'s card scrolls down to Name heir', king === true]);
  await p.evaluate(() => { const { game: g, ui } = window.__seven; let id = 90000; ui.sel = { type: 'none', ids: [] };
    for (const [k, f] of [['tribute', 1], ['treaty', 2], ['joinwar', 3], ['aid', 4]]) g.offers.push({ id: id++, from: f, to: 0, kind: k, state: 'peace', amount: 50, target: 5, expires: g.time + 90, text: 'A long letter about matters of great weight between your two lines, and it asks an answer before the moon is out.' }); });
  await p.waitForTimeout(700);
  const stack = async () => p.evaluate(() => { const o = document.getElementById('offers'), f = document.getElementById('field').getBoundingClientRect(), ob = o.getBoundingClientRect();
    const open = [...o.querySelectorAll('.offer:not(.mini)')].map((e) => +e.querySelector('[data-act="respond"]').dataset.id), mini = [...o.querySelectorAll('.offer.mini')].map((e) => +e.dataset.id);
    return { open, mini, inside: ob.bottom <= f.bottom && ob.top >= f.top, share: (ob.width * ob.height) / (f.width * f.height) }; });
  let s = await stack();
  ok.push(['four letters: the newest open, three one-line rows', s.open.length === 1 && s.open[0] === 90003 && s.mini.length === 3]);
  ok.push(['the letters stay inside the field, under a sixth of it', s.inside && s.share < 1 / 6]);
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  await p.locator('#offers .offer.mini[data-id="90000"]').click(); await p.waitForTimeout(400);
  s = await stack(); ok.push(['a click on a row opens it and folds the other', s.open[0] === 90000 && s.mini.length === 3 && s.mini.includes(90003)]);
  const g0 = await p.evaluate(() => window.__seven.game.players[0].gold);
  await p.locator('#offers button[data-act="respond"][data-accept="1"]').first().click(); await p.waitForTimeout(500);
  const after = await p.evaluate(() => ({ gold: window.__seven.game.players[0].gold, left: window.__seven.game.offers.filter((o) => o.to === 0).map((o) => o.id) }));
  s = await stack(); ok.push(['its Pay button pays the demand, and the newest opens again', after.gold <= g0 - 50 + 1 && !after.left.includes(90000) && s.open[0] === 90003 && s.mini.length === 2]);
  for (const [k, v] of ok) console.log(v ? 'ok  ' : 'FAIL', k);
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || ok.some(([, v]) => !v) ? 1 : 0);
})();
