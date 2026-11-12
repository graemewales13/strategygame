// Coalition wars, click-through (T66): serve the repo on :8123, then `node tools/coalition-smoke.cjs [shot.png]`.
// Meets every house, makes the player far stronger than houses 1, 2 and 3, has the player sack-wrong house 2, lets the game's own tick form the
// coalition: the leader's ultimatum waits on the letter list; ignoring it brings war from all three; the Council shows the Coalition line on the
// members' cards and the Coalitions list, and a member refuses a peace of its own with the leader's name; no errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e)); p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  const st = await p.evaluate(async () => {
    const { game: g } = window.__seven, dip = await import('./js/diplomacy.js');
    const n = g.players.length; for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) { g.known[a][c] = 1; if (a !== c) { g.rel[a][c] = 'peace'; g.relSince[a][c] = 0; } }
    g.time = Math.max(g.time, 600); const s = g.seatOf(0);
    for (let i = 0; i < 60; i++) g.addUnit('knight', 0, s.x + 2 + (i % 8), s.y + 3 + Math.floor(i / 8));
    g.players[0].gold = 600; dip.wronged(g, 2, 0, 'sacked Kilbride'); g._coalT = 0;
    for (let i = 0; i < 20 && !g.coalitions.length; i++) g.tick(0.1);
    const c = g.coalitions[0], letter = c && g.offers.find((o) => o.id === c.letter);
    const before = { state: c?.state, leader: c?.leader, members: c?.members, letter: letter?.text || null };
    g.time += 50; g._coalT = 0; g.tick(0.1);
    const war = c ? c.members.every((m) => g.rel[m][0] === 'war') : false;
    const other = c ? c.members.find((m) => m !== c.leader) : -1, j = dip.judge(g, 'peace', 0, other, { coin: 0 });
    return { before, state: c?.state, war, refuse: j.why || null };
  });
  console.log('coalition ->', JSON.stringify(st));
  await p.evaluate(() => window.__seven.ui.toggleCouncil(2)); await p.waitForTimeout(700);
  const lines = await p.evaluate(() => [...document.querySelectorAll('.dline.coal, .coals .lrow')].map((e) => e.textContent));
  console.log('council ->', JSON.stringify(lines));
  const ok = st.before.state === 'ultimatum' && /stand together against you/.test(st.before.letter || '') && st.state === 'war' && st.war && /sworn to the coalition/.test(st.refuse || '')
    && lines.some((t) => /Coalition: .*\(leading\).*against you/.test(t)) && lines.some((t) => /against you/.test(t));
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || !ok ? 1 : 0);
})();
