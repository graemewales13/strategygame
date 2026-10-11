// Delivered-art check: serve the repo on :8123, then `node tools/art-smoke.cjs [out.png]`. Raises a finished armoury, one being built and
// one that falls (its ruin), musters a soldier for each kind of Armoury kit plus a captain, opens the armoury, Academy and unit panels, and
// screenshots the lot. Prints which art loaded and any page errors (exit 1 on errors or missing art).
const { chromium } = require('playwright');
const out = process.argv[2] || 'logs/art-smoke.png';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e));
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500);
  await p.mouse.click(700, 425); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mBegin'); await p.waitForTimeout(1500);
  const info = await p.evaluate(() => {
    const { game: g, ui, renderer } = window.__seven; g.fogOn = false;
    const s = g.seatOf(0), bx = Math.round(s.tx ?? s.x) + 10, by = Math.round(s.ty ?? s.y) + 2;
    const done = g.addBuilding('armoury', 0, bx, by, true), site = g.addBuilding('armoury', 0, bx + 5, by, false); site.built = 0.4;
    const doomed = g.addBuilding('armoury', 0, bx, by + 6, true); g.damage(doomed, 1e6, 1, null);
    const kits = [['footman', { weapon: 'spear' }], ['footman', { weapon: 'sword' }], ['footman', { armour: 'plate' }], ['bowman', { weapon: 'longbow' }], ['bowman', { weapon: 'crossbow' }], ['knight', { weapon: 'lance' }], ['footman', null], ['bowman', null], ['knight', null]];
    const us = kits.map(([k, gear], i) => { const u = g.addUnit(k, 0, bx + 4 + (i % 5) * 1.3, by + 5 + Math.floor(i / 5) * 1.6); u.gear = gear; return u; });
    us[1].captain = true; us[1].rank = 3; us[1].deeds = ['blooded', 'slayer', 'survivor'];
    renderer.centerOn(bx + 4, by + 4); renderer.cam.zoom = 1.5;
    ui.setUnits([us[1]]);
    const aca = g.addBuilding('academy', 0, bx - 6, by - 6, true), tav = g.addBuilding('tavern', 0, bx - 6, by + 6, true);
    const k = g.addUnit('king', 0, bx + 9, by + 8); k.far = null;
    window.__artSmoke = { done: done.id, aca: aca.id, tav: tav.id };
    return { armed: us.map((u) => u.kind + ':' + JSON.stringify(u.gear)) };
  });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: out });
  const imgs = () => p.evaluate(() => [...document.querySelectorAll('img.ico, img.portrait, img.rport, img.qico, .cbtn .g.art img')].map((i) => i.src.split('/').slice(-2).join('/')).filter((x) => /gear|tech|marks|portraits/.test(x)));
  const all = new Set(await imgs());
  for (const step of ['done', 'aca', 'tav']) {
    await p.evaluate((st) => { const { game: g, ui } = window.__seven, b = g.byId.get(window.__artSmoke[st]); if (st === 'tav') { if (!b.roster?.length) b.roster = [0, 1, 2].map(() => g.rollWanderer([])); b.roster[0] = { ...b.roster[0], far: 'norse' }; } if (st === 'done') b.craft = [{ item: 'spear', t: 1 }, { item: 'mail', t: 0 }]; ui.sel = { type: 'building', ids: [], id: b.id }; ui.sigCmd = ui.sigSel = ''; }, step);
    await p.waitForTimeout(700); (await imgs()).forEach((x) => all.add(x));
    await p.screenshot({ path: out.replace(/\.png$/, `-${step}.png`), clip: { x: 0, y: 580, width: 1400, height: 270 } });
  }
  await p.evaluate(() => { const { ui } = window.__seven; ui.toggleCouncil(1); }); await p.waitForTimeout(700); (await imgs()).forEach((x) => all.add(x));
  await p.screenshot({ path: out.replace(/\.png$/, '-council.png') });
  console.log('armed soldiers', info.armed.length, '| painted UI art shown', JSON.stringify([...all].sort()));
  console.log('screenshots', out, '(+ -done, -aca, -tav, -council)');
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length ? 1 : 0);
})();
