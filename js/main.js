// Auld World - entry point. Single-player: the host (Game) lives in this tab; the client talks to it through net.js.
import { DEFAULT_HOUSES } from './config.js';
import { Game } from './game.js';
import { LocalHost } from './net.js';
import { Renderer, Minimap, drawCrest } from './render.js';
import { UI } from './ui.js';
import { loadArt } from './art.js';
import { Recorder } from './recorder.js';
import { learnPlaybook } from './learn.js';
import { initTrainPanel } from './trainui.js';

const cfg = { houses: DEFAULT_HOUSES, fog: true, diff: 'mid', people: 'random' };
try { const p = localStorage.getItem('auld.people'); if (p) cfg.people = p; } catch {}
const params = new URLSearchParams(location.search);
if (params.get('houses')) cfg.houses = Math.max(3, Math.min(5, +params.get('houses')));
if (params.get('fog') === '0') cfg.fog = false;
if (['easy', 'mid', 'hard'].includes(params.get('diff'))) cfg.diff = params.get('diff');

const pendingClick = () => window.__boot && window.__boot.pending;
await Promise.race([loadArt(), new Promise((r) => setTimeout(r, 10000))]);   // a slow image must not hold the game hostage
const game = new Game({ seed: params.get('seed') ? +params.get('seed') : undefined, houses: cfg.houses, fog: cfg.fog, diff: cfg.diff, people: cfg.people });
const host = new LocalHost(game);
const renderer = new Renderer(document.getElementById('game'), game);
// the rivals learn from the player: every match is recorded, and the playbook is re-learned between matches (never mid-match)
let store = null; try { store = localStorage; } catch {}
const recorder = new Recorder(store);
let shipped = [];
try { const r = await Promise.race([fetch('data/features.json'), new Promise((_, no) => setTimeout(no, 3000))]); if (r.ok) shipped = (await r.json()).records || []; } catch {}
let trainPanel = { refresh() {} };
const retrain = () => { try { game.playbook = learnPlaybook([...shipped, ...recorder.records().filter((r) => r.result !== 'live')]); } catch (e) { console.error('[auld-world] learning failed', e); game.playbook = null; } };
recorder.onChange = () => { if (!recorder.cur) retrain(); trainPanel.refresh(); };
retrain(); recorder.start(game);
window.addEventListener('pagehide', () => recorder.finish('quit'));
const minimap = new Minimap(document.getElementById('minimap'), game, renderer);
const ui = new UI({ game, host, renderer, minimap, cfg });
trainPanel = initTrainPanel({ recorder, getPlaybook: () => game.playbook, getSeedCount: () => shipped.length });

ui.onReroll = (opts) => {
  recorder.finish('quit');
  game.reset({ seed: opts.seed, houses: opts.houses, fog: cfg.fog, diff: cfg.diff, people: cfg.people });
  ui.setGame(game);
  recorder.start(game);
  ui.firstFocus = false;
  centerOnHall();
};
ui.onLoad = (data) => {
  recorder.finish('quit');
  game.restore(data);
  ui.setGame(game);
  recorder.start(game, { record: false });
  renderer.resetWorld?.();
  centerOnHall();
};
function centerOnHall() {
  const s = game.seatOf(0) || game.kingOf(0) || game.thronePlace(0);
  renderer.cam.zoom = 1;
  if (s) renderer.centerOn(s.x, s.y);
}
centerOnHall();
ui.refreshMenu();
drawCrest(document.getElementById('brandCrest').getContext('2d'), 18, 20, 34, 0);
const wasPending = pendingClick();
window.__boot = { ready: true, pending: false };
if (params.get('start') === '1') ui.closeMenu();
else if (wasPending) document.getElementById('splash').click();   // they clicked while it loaded: open the menu now

const seenErr = new Set();
function reportError(where, e) {
  const key = where + ':' + (e && e.message);
  if (seenErr.has(key)) return;
  seenErr.add(key);
  console.error('[auld-world]', where, e, e && e.stack);
  let box = document.getElementById('errbox');
  if (!box) { box = document.createElement('div'); box.id = 'errbox'; document.body.appendChild(box); }
  lastReport = [`Auld World problem report`, `where: ${where}`, `message: ${e && e.message}`, `build: ${window.__BUILD || '?'}`, `seed: ${game.seed} houses: ${game.houses} time: ${Math.round(game.time)}s`, `browser: ${navigator.userAgent}`, `screen: ${innerWidth}x${innerHeight} @${devicePixelRatio}`, `stack: ${e && e.stack}`].join('\n');
  box.textContent = '';
  const msg = document.createElement('span'); msg.textContent = `Problem (${where}): ${e && e.message}. The game keeps running. `; box.appendChild(msg);
  const btn = document.createElement('button'); btn.textContent = 'Copy report';
  btn.onclick = async () => { try { await navigator.clipboard.writeText(lastReport); btn.textContent = 'Copied - send it to the developer'; } catch { prompt('Copy this report:', lastReport); } };
  box.appendChild(btn);
}
let lastReport = '';
window.addEventListener('error', (ev) => reportError('script', ev.error || new Error(ev.message)));
window.addEventListener('unhandledrejection', (ev) => reportError('promise', ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason))));

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!ui.menuOpen && !ui.paused) {
    let sim = dt * ui.speed;
    try { while (sim > 1e-6) { const s = Math.min(0.05, sim); game.tick(s); sim -= s; } } catch (e) { reportError('simulation', e); }
    try { recorder.tick(); } catch (e) { console.error('[auld-world] recorder', e); recorder.cur = null; game.tap = null; }
  }
  // one bad frame must not freeze the whole game: report it and keep going
  try { ui.update(dt); } catch (e) { reportError('update', e); }
  try { renderer.draw(ui); } catch (e) { reportError('draw', e); }
  try { minimap.draw(dt); } catch (e) { reportError('minimap', e); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__seven = { game, host, renderer, ui, recorder }; // debugging hook
