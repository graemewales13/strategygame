// Combat feedback check (T06): serve the repo on :8123, then `node tools/combat-smoke.cjs [out.png]`. Turns Damage numbers on in Options,
// starts a match, sets armed soldiers of ours against a rival war band, attack-moves ours, and screenshots the fight: order lines, damage
// numbers, the red alert ring on the minimap. Then presses Space and checks the camera jumped to the fight. Exit 1 on page errors or a miss.
const { chromium } = require('playwright');
const out = process.argv[2] || 'logs/combat-smoke.png';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e));
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500);
  await p.mouse.click(700, 425); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#sDmg'); const dmgOn = await p.evaluate(() => localStorage.getItem('auld-world.dmgnums'));
  await p.click('#mBegin'); await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const { game: g, ui, renderer } = window.__seven; g.fogOn = false;
    const s = g.seatOf(0), x = Math.round(s.x) + 14, y = Math.round(s.y) + 6;
    g.rel[0][1] = g.rel[1][0] = 'war'; g.known[0][1] = g.known[1][0] = true;
    const kits = [{ weapon: 'spear' }, { weapon: 'sword' }, { armour: 'plate' }, null];
    const ours = kits.map((k, i) => { const u = g.addUnit(i === 3 ? 'bowman' : 'footman', 0, x + i * 1.2, y); u.gear = i === 3 ? { weapon: 'longbow' } : k; return u; });
    for (let i = 0; i < 4; i++) { const e = g.addUnit('footman', 1, x + 3 + i * 1.2, y + 5); e.hp = e.maxHp = 400; }
    ui.setUnits(ours); window.__cs = { x, y, ours: ours.map((u) => u.id) };
    window.__seven.host.send({ type: 'amove', ids: ours.map((u) => u.id), x: x + 4, y: y + 8 });
    renderer.centerOn(x + 2, y + 3); renderer.cam.zoom = 1.4;
  });
  await p.waitForTimeout(2600);
  const st = await p.evaluate(() => { const { game: g } = window.__seven; return { alerts: g.alerts.length, hurt: g.floaters.filter((f) => f.res === 'hurt').length, hit: g.floaters.filter((f) => f.res === 'hit').length, nums: g.dmgNums }; });
  await p.screenshot({ path: out });
  await p.evaluate(() => { const { renderer, game: g } = window.__seven; const s = g.seatOf(0); renderer.centerOn(s.x - 30, s.y - 30); });
  const before = await p.evaluate(() => ({ ...window.__seven.renderer.cam }));
  await p.mouse.click(700, 300); await p.keyboard.press('Space'); await p.waitForTimeout(300);
  const after = await p.evaluate(() => ({ ...window.__seven.renderer.cam }));
  const jumped = Math.hypot((after.x ?? 0) - (before.x ?? 0), (after.y ?? 0) - (before.y ?? 0)) > 5;
  const ok = dmgOn === 'on' && st.nums && st.alerts > 0 && st.hurt + st.hit > 0 && jumped;
  console.log('damage numbers option', dmgOn, '| state', JSON.stringify(st), '| Space jumped', jumped);
  console.log('screenshot', out); console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || !ok ? 1 : 0);
})();
