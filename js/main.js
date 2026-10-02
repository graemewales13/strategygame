// Seven Holds - entry point. Single-player: the host (Game) lives in this tab; the client talks to it through net.js.
import { DEFAULT_HOUSES } from './config.js';
import { Game } from './game.js';
import { LocalHost } from './net.js';
import { Renderer, Minimap, drawCrest } from './render.js';
import { UI } from './ui.js';
import { loadArt } from './art.js';

const cfg = { houses: DEFAULT_HOUSES, fog: true, diff: 'mid' };
const params = new URLSearchParams(location.search);
if (params.get('houses')) cfg.houses = Math.max(3, Math.min(5, +params.get('houses')));
if (params.get('fog') === '0') cfg.fog = false;
if (['easy', 'mid', 'hard'].includes(params.get('diff'))) cfg.diff = params.get('diff');

await loadArt();
const game = new Game({ seed: params.get('seed') ? +params.get('seed') : undefined, houses: cfg.houses, fog: cfg.fog, diff: cfg.diff });
const host = new LocalHost(game);
const renderer = new Renderer(document.getElementById('game'), game);
const minimap = new Minimap(document.getElementById('minimap'), game, renderer);
const ui = new UI({ game, host, renderer, minimap, cfg });

ui.onReroll = (opts) => {
  game.reset({ seed: opts.seed, houses: opts.houses, fog: cfg.fog, diff: cfg.diff });
  ui.setGame(game);
  ui.firstFocus = false;
  centerOnHall();
};
function centerOnHall() {
  const s = game.seatOf(0);
  renderer.cam.zoom = 1;
  renderer.centerOn(s.x, s.y);
}
centerOnHall();
ui.refreshMenu();
drawCrest(document.getElementById('brandCrest').getContext('2d'), 18, 20, 34, 0);
if (params.get('start') === '1') ui.closeMenu();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!ui.menuOpen && !ui.paused) {
    let sim = dt * ui.speed;
    while (sim > 1e-6) { const s = Math.min(0.05, sim); game.tick(s); sim -= s; }
  }
  ui.update(dt);
  renderer.draw(ui);
  minimap.draw(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__seven = { game, host, renderer, ui }; // debugging hook
