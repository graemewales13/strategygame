// Fog memory click-through (T44): serve the repo on :8123, then `node tools/fog-smoke.cjs [shot.png]`. A rival keep is seen once by a scout who
// then leaves; the keep is damaged and a tower raised beside it out of sight. The field must draw the keep as last seen (greyed) and not the
// tower, a click on the keep must open the remembered panel (old health, "Out of sight"), and there must be no errors. Then (T46) a village seen
// once and taken by a rival out of sight must still open as Independent, "Out of sight".
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e));
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1200);
  const setup = await p.evaluate(() => {
    const { game: g, ui, renderer } = window.__seven; ui.speed = 0; g.paused = true;
    const s = g.seatOf(0); let spot = null;
    // the whole keep-and-tower patch (with a margin) out of everyone's sight, not just its corner: the tower used to land in view (flaky)
    const unseen = (x, y) => { for (let j = y - 3; j < y + 8; j++) for (let i = x - 3; i < x + 12; i++) if (g.vis.some((v) => v[j * g.W + i])) return false; return true; };
    const cands = []; for (let y = 10; y < g.H - 14; y += 4) for (let x = 10; x < g.W - 14; x += 4) cands.push([x, y, Math.hypot(x - s.x, y - s.y)]);
    cands.sort((a, b) => a[2] - b[2]);   // (the nearest such patch to the seat, anywhere on the board)
    for (const [x, y] of cands) {
      if (!unseen(x, y)) continue;
      if (g.buildings.some((o) => Math.abs(o.x - x) < 12 && Math.abs(o.y - y) < 12) || g.villages.some((v) => Math.abs(v.x - x) < 12 && Math.abs(v.y - y) < 12)) continue;
      let open = true; for (let j = y; j < y + 4; j++) for (let i = x; i < x + 9; i++) if (!g.walk[j * g.W + i]) open = false;
      if (open) { spot = [x, y]; break; }
    }
    if (!spot) return { spot: null };
    const [x, y] = spot, keep = g.addBuilding('keep', 1, x, y, true); g.recomputeWalk();
    const sc = g.addUnit('scout', 0, x + 1.5, y + 4); g.updateVisibility(true); sc.hp = 0; g.cleanup(); g.updateVisibility(true);
    const hp0 = keep.hp; keep.hp = Math.round(keep.maxHp / 3);
    const tower = g.addBuilding('tower', 1, x + 5, y, true); g.recomputeWalk(); g.updateVisibility(true);
    renderer.centerOn(keep.x, keep.y); window.__fog = { keep: keep.id, tower: tower.id, hp0 };
    return { spot, visible: g.seesFoot(0, keep), remembered: !!g.mem[0][keep.id], towerKnown: !!g.mem[0][tower.id] };
  });
  console.log('setup', JSON.stringify(setup));
  await p.waitForTimeout(700);
  const drawn = await p.evaluate(() => { const { renderer } = window.__seven, f = window.__fog; const hs = renderer.hits.filter((h) => h.type === 'building'); return { keepHit: hs.some((h) => h.o.id === f.keep), towerHit: hs.some((h) => h.o.id === f.tower) }; });
  console.log('drawn', JSON.stringify(drawn));
  const pt = await p.evaluate(() => { const { renderer } = window.__seven, f = window.__fog, h = renderer.hits.find((h) => h.type === 'building' && h.o.id === f.keep); const c = document.getElementById('game').getBoundingClientRect(); return h ? [c.left + (h.x0 + h.x1) / 2, c.top + (h.y0 + h.y1) / 2] : null; });
  if (pt) { await p.mouse.click(pt[0], pt[1]); await p.waitForTimeout(600); }
  const panel = await p.evaluate(() => { const t = document.getElementById('selPanel')?.textContent || ''; const g = window.__seven.game, f = window.__fog; return { outOfSight: /Out of sight/.test(t), oldHp: t.includes(`${Math.ceil(f.hp0)}/`), liveHp: t.includes(`${Math.ceil(g.byId.get(f.keep).hp)}/`) }; });
  console.log('panel', JSON.stringify(panel));
  // villages too (T46): an independent village seen once, then taken by a rival out of sight, still shows as independent with "Out of sight"
  const vset = await p.evaluate(() => {
    const { game: g, ui, renderer } = window.__seven, s = g.seatOf(0);
    const vs = g.villages.filter((v) => v.owner < 0 && !g.seesFoot(0, v)).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
    const v = vs[0]; if (!v) return { v: null };
    const sc = g.addUnit('scout', 0, v.x + 1.5, v.y + 1.5); g.updateVisibility(true); sc.hp = 0; g.cleanup(); g.updateVisibility(true);
    if (g.seesFoot(0, v)) return { v: v.id, inSight: true };
    v.owner = 1; g._vOwn = null; v.loyalty = 3; g.updateVisibility(true);
    ui.clearSel(); renderer.centerOn(v.x, v.y); window.__fogV = v.id;
    return { v: v.id, inSight: false };
  });
  await p.waitForTimeout(700);
  const vpt = await p.evaluate(() => { const { renderer } = window.__seven, h = renderer.hits.find((h) => h.type === 'village' && h.o.id === window.__fogV); const c = document.getElementById('game').getBoundingClientRect(); return h ? [c.left + (h.x0 + h.x1) / 2, c.top + (h.y0 + h.y1) / 2] : null; });
  if (vpt) { await p.mouse.click(vpt[0], vpt[1]); await p.waitForTimeout(600); }
  const vpanel = await p.evaluate(() => { const t = document.getElementById('selPanel')?.textContent || ''; return { outOfSight: /Out of sight/.test(t), independent: /LordIndependent/.test(t.replace(/\s+/g, '')) }; });
  console.log('village', JSON.stringify({ ...vset, clicked: !!vpt, ...vpanel }));
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  const vok = vset.v && !vset.inSight && vpt && vpanel.outOfSight && vpanel.independent;
  const ok = setup.spot && !setup.visible && setup.remembered && !setup.towerKnown && drawn.keepHit && !drawn.towerHit && panel.outOfSight && panel.oldHp && !panel.liveHp && vok;
  console.log('fog memory ok', !!ok);
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || !ok ? 1 : 0);
})();
