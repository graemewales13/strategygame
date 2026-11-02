// Tutorial click-through (T04): serve the repo on :8123, then `node tools/tutor-smoke.cjs [shot.png]`. Opens Skirmish, clicks Learn to play,
// checks the match is the tutorial's (three houses, Easy, the truce on), the coach shows lesson 1, panning the view passes it, Show me centres
// on the serfs, selecting a serf passes lesson 2, Skip moves on (and is saved in the game), Leave tutorial ends the truce and the objectives
// take over; no errors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGE ' + e));
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(2500); await p.waitForFunction(() => window.__seven, null, { timeout: 30000 });
  await p.mouse.click(683, 384); await p.waitForTimeout(900);
  const r = await p.locator('#hSkirmish').boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(700);
  await p.click('#mTutor'); await p.waitForTimeout(1500);
  const ok = [];
  const st = () => p.evaluate(() => { const { game: g } = window.__seven, el = document.getElementById('objectives'); return { houses: g.houses, diff: g.diffKey, tut: g.tutorial && { ...g.tutorial }, truce: g.truce(1, 0), head: el.querySelector('.ohead b')?.textContent || '', title: el.querySelector('.otitle')?.textContent || '', shown: !el.classList.contains('hidden') }; });
  let s = await st();
  ok.push(['tutorial match: 3 houses, Easy, truce', s.houses === 3 && s.diff === 'easy' && s.tut && !s.tut.done && s.truce]);
  ok.push(['coach shows lesson 1', s.shown && /Lesson 1\/10/.test(s.head) && /Look around/.test(s.title)]);
  await p.mouse.move(683, 300); await p.keyboard.down('ArrowRight'); await p.waitForTimeout(1500); await p.keyboard.up('ArrowRight'); await p.waitForTimeout(800);
  s = await st(); ok.push(['panning passes lesson 1', /Lesson 2\//.test(s.head) && s.tut.step >= 1]);
  const cam0 = await p.evaluate(() => ({ ...window.__seven.renderer.cam }));
  await p.click('#objectives button[data-act="tutshow"]'); await p.waitForTimeout(400);
  const cam1 = await p.evaluate(() => ({ ...window.__seven.renderer.cam }));
  ok.push(['Show me moves the view', Math.hypot(cam1.x - cam0.x, cam1.y - cam0.y) > 1]);
  await p.evaluate(() => { const { game: g, ui } = window.__seven; const u = g.units.find((x) => x.team === 0 && x.kind === 'serf'); ui.sel = { type: 'units', ids: [u.id], id: null }; ui.sigSel = ui.sigCmd = ''; });
  await p.waitForTimeout(800);
  s = await st(); ok.push(['selecting a serf passes lesson 2', /Lesson 3\//.test(s.head) && /Cut timber/.test(s.title)]);
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  await p.click('#objectives button[data-act="tutskip"]'); await p.waitForTimeout(800);
  s = await st(); ok.push(['Skip moves on and is saved', /Lesson 4\//.test(s.head) && s.tut.step >= 3]);
  await p.click('#objectives button[data-act="tutleave"]'); await p.waitForTimeout(900);
  s = await st(); ok.push(['Leave tutorial ends the truce', s.tut.done && !s.truce]);
  ok.push(['objectives take over', /Objective \d+\//.test(s.head)]);
  for (const [k, v] of ok) console.log(v ? 'ok  ' : 'FAIL', k);
  console.log('errors', JSON.stringify(errs)); await b.close(); process.exit(errs.length || ok.some(([, v]) => !v) ? 1 : 0);
})();
