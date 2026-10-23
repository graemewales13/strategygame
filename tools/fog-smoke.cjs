// Fog memory click-through (T44): serve the repo on :8123, then `node tools/fog-smoke.cjs [shot.png]`. A rival keep is seen once by a scout who
// then leaves; the keep is damaged and a tower raised beside it out of sight. The field must draw the keep as last seen (greyed) and not the
// tower, a click on the keep must open the remembered panel (old health, "Out of sight"), and there must be no errors.
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
    for (let d = 26; d < 90 && !spot; d += 3) for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]]) {
      const x = Math.round(s.x + dx * d), y = Math.round(s.y + dy * d);
      if (x < 10 || y < 10 || x > g.W - 14 || y > g.H - 14 || g.vis.some((v) => v[y * g.W + x])) continue;
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
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  const ok = setup.spot && !setup.visible && setup.remembered && !setup.towerKnown && drawn.keepHit && !drawn.towerHit && panel.outOfSight && panel.oldHp && !panel.liveHp;
  console.log('fog memory ok', !!ok);
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || !ok ? 1 : 0);
})();
